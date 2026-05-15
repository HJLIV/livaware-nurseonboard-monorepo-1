// Nurse invoicing & timesheets (task 134).
//
// Portal endpoints (validatePortalToken + requireCompletedStage):
//   GET    /api/portal/:token/invoices            — list mine
//   POST   /api/portal/:token/invoices            — submit a new invoice
//   GET    /api/portal/:token/invoices/:id        — read own
//   DELETE /api/portal/:token/invoices/:id        — withdraw (only when status=submitted)
//   POST   /api/portal/:token/invoices/:id/attachment — upload attachment
//
// Admin endpoints (requireAdmin):
//   GET    /api/admin/invoices                    — list all w/ filters
//   GET    /api/admin/invoices/stats              — counts + £ totals per status
//   GET    /api/admin/invoices/export.csv         — CSV
//   GET    /api/admin/invoices/:id                — full invoice
//   PATCH  /api/admin/invoices/:id/status         — transition status
//   DELETE /api/admin/invoices/:id                — super-admin only
//   GET    /api/admin/invoices/by-nurse/:nurseId  — per-nurse list
//   POST   /api/admin/invoices/by-nurse/:nurseId  — admin submit-on-behalf

import type { Express, Request, Response, NextFunction } from "express";
import { and, eq, desc, gte, lte, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import path from "path";
import { db } from "../db";
import {
  invoices,
  invoiceTimesheetEntries,
  invoiceAdditionalCosts,
  nurses,
  invoiceSubmissionSchema,
  type InvoiceStatus,
  type InvoiceSubmission,
  type InvoiceRecord,
  INVOICE_STATUSES,
} from "@shared/schema";
import { storage } from "../storage";
import {
  validatePortalToken,
  requireAdmin,
  requireSuperAdmin,
  upload,
  uploadLimiter,
  portalAgent,
} from "../middleware";
import { generateInvoicePdf } from "../invoice-pdf";
import { isOutlookConfigured, sendInvoiceSubmittedEmail } from "../outlook";

// Local gate: invoices are open to nurses who have reached the final
// "Nurse" stage (current_stage = "completed"). Reads return 404 (the
// surface should appear to not exist for a non-completed nurse); writes
// return 403 { error: "stage_locked" }.
async function requireCompletedStageRead(req: Request, res: Response, next: NextFunction) {
  try {
    const nurseId = (req as Request & { nurseId?: string }).nurseId;
    if (!nurseId) return res.status(401).json({ message: "Not authenticated" });
    const nurse = await storage.getCandidate(nurseId);
    if (!nurse || nurse.currentStage !== "completed") {
      return res.status(404).json({ message: "Not found" });
    }
    next();
  } catch (err) {
    console.error("[requireCompletedStageRead]", err);
    return res.status(500).json({ message: "Failed to verify stage" });
  }
}

async function requireCompletedStageWrite(req: Request, res: Response, next: NextFunction) {
  try {
    const nurseId = (req as Request & { nurseId?: string }).nurseId;
    if (!nurseId) return res.status(401).json({ message: "Not authenticated" });
    const nurse = await storage.getCandidate(nurseId);
    if (!nurse) return res.status(404).json({ message: "Not found" });
    if (nurse.currentStage !== "completed") {
      return res.status(403).json({
        error: "stage_locked",
        message: "Invoices are available once you've reached the Nurse stage.",
      });
    }
    next();
  } catch (err) {
    console.error("[requireCompletedStageWrite]", err);
    return res.status(500).json({ message: "Failed to verify stage" });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function agentForReq(req: Request): string {
  const session = (req as Request & { session?: { username?: string; email?: string; role?: string } }).session;
  const u = session?.username || session?.email;
  if (!u) return "system";
  return session?.role ? `${u} (${session.role})` : u;
}

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function computeMinutesAndAmount(entry: { startTime: string; endTime: string }, hourlyRatePence: number): { minutes: number; amountPence: number } {
  let mins = parseHHMM(entry.endTime) - parseHHMM(entry.startTime);
  if (mins < 0) mins += 24 * 60; // overnight shift
  const amountPence = Math.round((mins / 60) * hourlyRatePence);
  return { minutes: mins, amountPence };
}

function calculateTotals(submission: InvoiceSubmission) {
  let totalMinutes = 0;
  let totalAmountPence = 0;
  const entriesPriced = submission.timesheetEntries.map((e) => {
    const { minutes, amountPence } = computeMinutesAndAmount(e, submission.hourlyRatePence);
    totalMinutes += minutes;
    totalAmountPence += amountPence;
    return { ...e, hoursMinutes: minutes, amountPence };
  });
  const additionalCostsTotal = (submission.additionalCosts || []).reduce((s, c) => s + c.amountPence, 0);
  return { entriesPriced, totalMinutes, totalAmountPence, additionalCostsTotal };
}

// Human-readable invoice number derived from the monotonic Postgres
// sequence on `invoices.invoice_number_seq`. Used in the UI, the CSV
// export, and as the suggested payment reference.
export function formatInvoiceNumber(seq: number): string {
  return `INV-${String(seq).padStart(6, "0")}`;
}

function withInvoiceNumber<T extends { invoiceNumberSeq: number }>(row: T): T & { invoiceNumber: string } {
  return { ...row, invoiceNumber: formatInvoiceNumber(row.invoiceNumberSeq) };
}

async function loadFullInvoice(id: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!inv) return null;
  const entries = await db
    .select()
    .from(invoiceTimesheetEntries)
    .where(eq(invoiceTimesheetEntries.invoiceId, id))
    .orderBy(invoiceTimesheetEntries.position, invoiceTimesheetEntries.date);
  const costs = await db
    .select()
    .from(invoiceAdditionalCosts)
    .where(eq(invoiceAdditionalCosts.invoiceId, id))
    .orderBy(invoiceAdditionalCosts.position);
  return { ...withInvoiceNumber(inv), timesheetEntries: entries, additionalCosts: costs };
}

async function createInvoiceFromSubmission(
  nurseId: string,
  submission: InvoiceSubmission,
  source: "portal" | "admin",
  agent: string,
) {
  const { entriesPriced, totalMinutes, totalAmountPence, additionalCostsTotal } = calculateTotals(submission);
  // Wrap header + lines + costs in a single DB transaction so a partial
  // failure cannot leave an invoice header without its lines/costs.
  const createdId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(invoices)
      .values({
        nurseId,
        fullName: submission.personalDetails.fullName,
        ltdCompany: submission.personalDetails.ltdCompany || null,
        utr: submission.personalDetails.utr || null,
        address: submission.personalDetails.address,
        email: submission.personalDetails.email,
        phoneNumber: submission.personalDetails.phoneNumber,
        accountType: submission.bankDetails.accountType,
        accountName: submission.bankDetails.accountName,
        bankName: submission.bankDetails.bankName,
        sortCode: submission.bankDetails.sortCode,
        accountNumber: submission.bankDetails.accountNumber,
        hourlyRate: submission.hourlyRatePence,
        totalHours: totalMinutes,
        totalAmount: totalAmountPence,
        additionalCostsTotal,
        paymentNotes: submission.paymentNotes || null,
        status: "submitted",
      })
      .returning({ id: invoices.id });
    if (entriesPriced.length) {
      await tx.insert(invoiceTimesheetEntries).values(
        entriesPriced.map((e, idx) => ({
          invoiceId: created.id,
          date: e.date,
          startTime: e.startTime,
          endTime: e.endTime,
          patientInitials: e.patientInitials,
          location: e.location,
          hoursMinutes: e.hoursMinutes,
          amountPence: e.amountPence,
          position: idx,
        })),
      );
    }
    if (submission.additionalCosts && submission.additionalCosts.length) {
      await tx.insert(invoiceAdditionalCosts).values(
        submission.additionalCosts.map((c, idx) => ({
          invoiceId: created.id,
          description: c.description,
          amountPence: c.amountPence,
          receiptImageUrl: c.receiptImageUrl || null,
          position: idx,
        })),
      );
    }
    // Persist personal/bank/rate on the nurse so the next invoice
    // wizard can prefill from a single source of truth even if the
    // most recent invoice has been deleted.
    await tx.update(nurses).set({
      invoiceBillingProfile: {
        personalDetails: {
          fullName: submission.personalDetails.fullName,
          ltdCompany: submission.personalDetails.ltdCompany ?? null,
          utr: submission.personalDetails.utr ?? null,
          address: submission.personalDetails.address,
          email: submission.personalDetails.email,
          phoneNumber: submission.personalDetails.phoneNumber,
        },
        bankDetails: {
          accountType: submission.bankDetails.accountType,
          accountName: submission.bankDetails.accountName,
          bankName: submission.bankDetails.bankName,
          sortCode: submission.bankDetails.sortCode,
          accountNumber: submission.bankDetails.accountNumber,
        },
        hourlyRatePence: submission.hourlyRatePence,
        paymentNotes: submission.paymentNotes ?? null,
        updatedAt: new Date().toISOString(),
      },
      updatedAt: new Date(),
    }).where(eq(nurses.id, nurseId));
    return created.id;
  });
  await storage.createAuditLog({
    nurseId,
    module: "invoices",
    action: "invoice_submitted",
    agentName: agent,
    detail: { source, invoiceId: createdId, totalAmountPence, totalMinutes, entries: entriesPriced.length },
  });
  const full = await loadFullInvoice(createdId);
  // Fire-and-forget: render PDF and email it to the invoices mailbox so the
  // submission lands in finance's inbox immediately. Failure must never break
  // the submit response — the invoice is already persisted and visible in-app.
  if (full) {
    void emailInvoicePdfOnSubmit(full, nurseId, source, agent).catch((err) => {
      console.error("[invoices] failed to email submitted invoice PDF", err);
    });
  }
  return full;
}

async function emailInvoicePdfOnSubmit(
  full: NonNullable<Awaited<ReturnType<typeof loadFullInvoice>>>,
  nurseId: string,
  source: "portal" | "admin",
  agent: string,
) {
  if (!isOutlookConfigured()) return;
  const pdfBuffer = await generateInvoicePdf({
    invoice: full as InvoiceRecord,
    invoiceNumber: full.invoiceNumber,
    entries: full.timesheetEntries,
    costs: full.additionalCosts,
  });
  const grandPence = (full.totalAmount ?? 0) + (full.additionalCostsTotal ?? 0);
  await sendInvoiceSubmittedEmail({
    invoiceNumber: full.invoiceNumber,
    nurseName: full.fullName,
    nurseEmail: full.email,
    totalAmountGbp: `£${(grandPence / 100).toFixed(2)}`,
    totalHours: ((full.totalHours ?? 0) / 60).toFixed(2),
    pdfBuffer,
  });
  await storage.createAuditLog({
    nurseId,
    module: "invoices",
    action: "invoice_pdf_emailed",
    agentName: agent,
    detail: { invoiceId: full.id, invoiceNumber: full.invoiceNumber, source, recipient: process.env.INVOICE_RECIPIENT_EMAIL || "invoices@livaware.co.uk" },
  });
}

// ─── Status transition matrix ─────────────────────────────────────────────

const TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  submitted: ["approved", "rejected"],
  approved: ["paid", "rejected"],
  paid: ["reconciled"],
  reconciled: [],
  rejected: [],
};

const statusPatchSchema = z.object({
  status: z.enum(["approved", "paid", "reconciled", "rejected"]),
  paymentReference: z.string().optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rejectedReason: z.string().optional(),
});

const ACTION_FOR_STATUS: Record<string, string> = {
  approved: "invoice_approved",
  paid: "invoice_paid",
  reconciled: "invoice_reconciled",
  rejected: "invoice_rejected",
};

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function pence(n: number): string {
  return (n / 100).toFixed(2);
}

// ─── Route registration ───────────────────────────────────────────────────

export function registerInvoiceRoutes(app: Express) {
  // ── Portal (nurse-facing) ───────────────────────────────────────────────

  // Reads use stage-read gate (404 when not completed)
  app.get("/api/portal/:token/invoices", validatePortalToken, requireCompletedStageRead, async (req, res) => {
    const nurseId = (req as Request & { nurseId: string }).nurseId;
    const list = await db
      .select()
      .from(invoices)
      .where(eq(invoices.nurseId, nurseId))
      .orderBy(desc(invoices.submittedAt));
    // Surface last bank/personal details so the FE can reliably prefill the
    // wizard without having to re-fetch each row.
    const lastFull = list.length ? await loadFullInvoice(list[0].id) : null;
    // Stored billing profile (set after first invoice submission).
    // Lets the wizard prefill even if every prior invoice was deleted.
    const [nurseRow] = await db
      .select({ invoiceBillingProfile: nurses.invoiceBillingProfile })
      .from(nurses)
      .where(eq(nurses.id, nurseId));
    res.json({
      invoices: list.map(withInvoiceNumber),
      lastInvoice: lastFull,
      billingProfile: nurseRow?.invoiceBillingProfile ?? null,
    });
  });

  // Writes use stage-write gate (403 stage_locked)
  app.post("/api/portal/:token/invoices", validatePortalToken, requireCompletedStageWrite, async (req, res) => {
    const nurseId = (req as Request & { nurseId: string }).nurseId;
    const parsed = invoiceSubmissionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    try {
      const inv = await createInvoiceFromSubmission(nurseId, parsed.data, "portal", portalAgent(req));
      res.status(201).json(inv);
    } catch (err) {
      console.error("[invoice submit]", err);
      const message = err instanceof Error ? err.message : "Failed to submit invoice";
      res.status(500).json({ message });
    }
  });

  app.get("/api/portal/:token/invoices/:id", validatePortalToken, requireCompletedStageRead, async (req, res) => {
    const nurseId = (req as Request & { nurseId: string }).nurseId;
    const inv = await loadFullInvoice(String(req.params.id));
    if (!inv || inv.nurseId !== nurseId) return res.status(404).json({ message: "Invoice not found" });
    res.json(inv);
  });

  app.get("/api/portal/:token/invoices/:id/pdf", validatePortalToken, requireCompletedStageRead, async (req, res) => {
    const nurseId = (req as Request & { nurseId: string }).nurseId;
    const inv = await loadFullInvoice(String(req.params.id));
    if (!inv || inv.nurseId !== nurseId) return res.status(404).json({ message: "Invoice not found" });
    const pdf = await generateInvoicePdf({ invoice: inv as InvoiceRecord, invoiceNumber: inv.invoiceNumber, entries: inv.timesheetEntries, costs: inv.additionalCosts });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${inv.invoiceNumber}.pdf"`);
    res.end(pdf);
  });

  app.delete("/api/portal/:token/invoices/:id", validatePortalToken, requireCompletedStageWrite, async (req, res) => {
    const nurseId = (req as Request & { nurseId: string }).nurseId;
    const id = String(req.params.id);
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!inv || inv.nurseId !== nurseId) return res.status(404).json({ message: "Invoice not found" });
    if (inv.status !== "submitted") {
      return res.status(409).json({ message: `Cannot withdraw an invoice in status '${inv.status}'` });
    }
    await db.delete(invoices).where(eq(invoices.id, id));
    await storage.createAuditLog({
      nurseId,
      module: "invoices",
      action: "invoice_withdrawn",
      agentName: portalAgent(req),
      detail: { invoiceId: id },
    });
    res.json({ deleted: true });
  });

  // Per-cost-line receipt image upload (used while building a draft invoice
  // before it is submitted). Returns the public uploads URL the FE then
  // includes in the submission payload as additionalCosts[i].receiptImageUrl.
  app.post(
    "/api/portal/:token/invoices/cost-receipt",
    uploadLimiter,
    validatePortalToken,
    requireCompletedStageWrite,
    upload.single("file"),
    async (req, res) => {
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) return res.status(400).json({ message: "No file uploaded" });
      const url = `/uploads/${path.basename(file.path)}`;
      res.json({ url, filename: file.originalname });
    },
  );

  app.post(
    "/api/portal/:token/invoices/:id/attachment",
    uploadLimiter,
    validatePortalToken,
    requireCompletedStageWrite,
    upload.single("file"),
    async (req, res) => {
      const nurseId = (req as Request & { nurseId: string }).nurseId;
      const id = String(req.params.id);
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) return res.status(400).json({ message: "No file uploaded" });
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
      if (!inv || inv.nurseId !== nurseId) return res.status(404).json({ message: "Invoice not found" });
      const url = `/uploads/${path.basename(file.path)}`;
      await db.update(invoices)
        .set({ attachmentUrl: url, attachmentFilename: file.originalname, updatedAt: new Date() })
        .where(eq(invoices.id, id));
      await storage.createAuditLog({
        nurseId,
        module: "invoices",
        action: "invoice_attachment_added",
        agentName: portalAgent(req),
        detail: { invoiceId: id, filename: file.originalname },
      });
      res.json({ attachmentUrl: url, attachmentFilename: file.originalname });
    },
  );

  // ── Admin ───────────────────────────────────────────────────────────────

  async function listInvoicesWithFilters(req: Request) {
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
    const from = typeof req.query.from === "string" ? req.query.from : "";
    const to = typeof req.query.to === "string" ? req.query.to : "";
    const stageParam = typeof req.query.stage === "string" ? req.query.stage : "completed";

    const where: SQL[] = [];
    if (status && (INVOICE_STATUSES as string[]).includes(status)) {
      where.push(eq(invoices.status, status as InvoiceStatus));
    }
    if (from) where.push(gte(invoices.submittedAt, new Date(from)));
    if (to) where.push(lte(invoices.submittedAt, new Date(to + "T23:59:59")));

    let nurseRows = stageParam === "all"
      ? await db.select({ id: nurses.id, fullName: nurses.fullName, email: nurses.email, currentStage: nurses.currentStage }).from(nurses)
      : await db.select({ id: nurses.id, fullName: nurses.fullName, email: nurses.email, currentStage: nurses.currentStage }).from(nurses).where(eq(nurses.currentStage, "completed"));
    if (search) {
      nurseRows = nurseRows.filter((n) =>
        n.fullName.toLowerCase().includes(search) || (n.email || "").toLowerCase().includes(search),
      );
    }
    const ids = nurseRows.map((n) => n.id);
    if (!ids.length) return { invoices: [], nurses: nurseRows };
    where.push(inArray(invoices.nurseId, ids));

    const list = await db
      .select()
      .from(invoices)
      .where(and(...where))
      .orderBy(desc(invoices.submittedAt));
    return { invoices: list, nurses: nurseRows };
  }

  // Aggregate distinct patient initials + visit locations for the invoice
  // matrix, so admins can scan who/where each invoice covers without
  // opening the side panel.
  async function loadInvoiceSummaries(invoiceIds: string[]) {
    const summaries = new Map<string, { patientInitials: string[]; locations: string[] }>();
    if (!invoiceIds.length) return summaries;
    const rows = await db
      .select({
        invoiceId: invoiceTimesheetEntries.invoiceId,
        patientInitials: invoiceTimesheetEntries.patientInitials,
        location: invoiceTimesheetEntries.location,
      })
      .from(invoiceTimesheetEntries)
      .where(inArray(invoiceTimesheetEntries.invoiceId, invoiceIds));
    for (const r of rows) {
      const s = summaries.get(r.invoiceId) ?? { patientInitials: [], locations: [] };
      if (r.patientInitials && !s.patientInitials.includes(r.patientInitials)) s.patientInitials.push(r.patientInitials);
      if (r.location && !s.locations.includes(r.location)) s.locations.push(r.location);
      summaries.set(r.invoiceId, s);
    }
    return summaries;
  }

  app.get("/api/admin/invoices", requireAdmin, async (req, res) => {
    const { invoices: list, nurses: nurseRows } = await listInvoicesWithFilters(req);
    const summaries = await loadInvoiceSummaries(list.map((i) => i.id));
    res.json({
      invoices: list.map((inv) => ({
        ...withInvoiceNumber(inv),
        patientInitials: summaries.get(inv.id)?.patientInitials ?? [],
        locations: summaries.get(inv.id)?.locations ?? [],
      })),
      nurses: nurseRows,
    });
  });

  app.get("/api/admin/invoices/stats", requireAdmin, async (req, res) => {
    // Stats are aligned with the active filter set so the totals strip
    // matches the visible matrix rows.
    const { invoices: list } = await listInvoicesWithFilters(req);
    const byStatus: Record<string, { count: number; totalPence: number }> = {};
    for (const s of INVOICE_STATUSES) byStatus[s] = { count: 0, totalPence: 0 };
    for (const inv of list) {
      const bucket = byStatus[inv.status as InvoiceStatus];
      bucket.count += 1;
      bucket.totalPence += inv.totalAmount + inv.additionalCostsTotal;
    }
    res.json({ byStatus });
  });

  app.get("/api/admin/invoices/export.csv", requireAdmin, async (req, res) => {
    const { invoices: list, nurses: nurseRows } = await listInvoicesWithFilters(req);
    const nurseById = new Map(nurseRows.map((n) => [n.id, n]));
    const header = [
      "invoice_number", "invoice_id", "nurse_id", "name", "email", "status",
      "submitted_at", "approved_at", "paid_at", "reconciled_at", "rejected_at",
      "total_hours", "total_amount_gbp", "additional_costs_gbp", "payment_reference", "payment_date",
    ];
    const lines = [header.join(",")];
    for (const inv of list) {
      const n = nurseById.get(inv.nurseId);
      lines.push([
        formatInvoiceNumber(inv.invoiceNumberSeq),
        inv.id, inv.nurseId, n?.fullName || "", n?.email || "", inv.status,
        inv.submittedAt?.toISOString() || "",
        inv.approvedAt?.toISOString() || "", inv.paidAt?.toISOString() || "",
        inv.reconciledAt?.toISOString() || "", inv.rejectedAt?.toISOString() || "",
        (inv.totalHours / 60).toFixed(2),
        pence(inv.totalAmount), pence(inv.additionalCostsTotal),
        inv.paymentReference || "", inv.paymentDate || "",
      ].map(csvEscape).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="invoices.csv"`);
    res.send(lines.join("\n"));
  });

  app.get("/api/admin/invoices/by-nurse/:nurseId", requireAdmin, async (req, res) => {
    const nurse = await storage.getCandidate(String(req.params.nurseId));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    const list = await db
      .select()
      .from(invoices)
      .where(eq(invoices.nurseId, nurse.id))
      .orderBy(desc(invoices.submittedAt));
    res.json({ nurse: { id: nurse.id, fullName: nurse.fullName, email: nurse.email, currentStage: nurse.currentStage }, invoices: list.map(withInvoiceNumber) });
  });

  app.post("/api/admin/invoices/by-nurse/:nurseId", requireAdmin, async (req, res) => {
    const nurse = await storage.getCandidate(String(req.params.nurseId));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    const parsed = invoiceSubmissionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    try {
      const inv = await createInvoiceFromSubmission(nurse.id, parsed.data, "admin", agentForReq(req));
      res.status(201).json(inv);
    } catch (err) {
      console.error("[admin invoice submit]", err);
      const message = err instanceof Error ? err.message : "Failed to submit invoice";
      res.status(500).json({ message });
    }
  });

  app.get("/api/admin/invoices/:id", requireAdmin, async (req, res) => {
    const inv = await loadFullInvoice(String(req.params.id));
    if (!inv) return res.status(404).json({ message: "Invoice not found" });
    res.json(inv);
  });

  app.get("/api/admin/invoices/:id/pdf", requireAdmin, async (req, res) => {
    const inv = await loadFullInvoice(String(req.params.id));
    if (!inv) return res.status(404).json({ message: "Invoice not found" });
    const pdf = await generateInvoicePdf({ invoice: inv as InvoiceRecord, invoiceNumber: inv.invoiceNumber, entries: inv.timesheetEntries, costs: inv.additionalCosts });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${inv.invoiceNumber}.pdf"`);
    res.end(pdf);
  });

  app.patch("/api/admin/invoices/:id/status", requireAdmin, async (req, res) => {
    const id = String(req.params.id);
    const parsed = statusPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const target = parsed.data.status;

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!inv) return res.status(404).json({ message: "Invoice not found" });
    const allowed = TRANSITIONS[inv.status as InvoiceStatus] || [];
    if (!allowed.includes(target)) {
      return res.status(400).json({ message: `Cannot transition from '${inv.status}' to '${target}'` });
    }
    if (target === "rejected" && !parsed.data.rejectedReason) {
      return res.status(400).json({ message: "rejectedReason is required" });
    }
    if (target === "reconciled") {
      if (!parsed.data.paymentReference) return res.status(400).json({ message: "paymentReference is required" });
      if (!parsed.data.paymentDate) return res.status(400).json({ message: "paymentDate is required" });
    }
    const agent = agentForReq(req);
    const now = new Date();
    const updates: Partial<InvoiceRecord> = { status: target, updatedAt: now };
    if (target === "approved") {
      updates.approvedAt = now;
      updates.approvedBy = agent;
    } else if (target === "paid") {
      updates.paidAt = now;
      updates.paidBy = agent;
    } else if (target === "reconciled") {
      updates.reconciledAt = now;
      updates.reconciledBy = agent;
      updates.paymentReference = parsed.data.paymentReference ?? null;
      updates.paymentDate = parsed.data.paymentDate ?? null;
    } else if (target === "rejected") {
      updates.rejectedAt = now;
      updates.rejectedBy = agent;
      updates.rejectedReason = parsed.data.rejectedReason ?? null;
    }
    await db.update(invoices).set(updates).where(eq(invoices.id, id));
    await storage.createAuditLog({
      nurseId: inv.nurseId,
      module: "invoices",
      action: ACTION_FOR_STATUS[target],
      agentName: agent,
      detail: {
        invoiceId: id,
        from: inv.status,
        to: target,
        ...(target === "reconciled" ? { paymentReference: parsed.data.paymentReference, paymentDate: parsed.data.paymentDate } : {}),
        ...(target === "rejected" ? { reason: parsed.data.rejectedReason } : {}),
      },
    });
    res.json(await loadFullInvoice(id));
  });

  app.delete("/api/admin/invoices/:id", requireSuperAdmin, async (req, res) => {
    const id = String(req.params.id);
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
    if (!inv) return res.status(404).json({ message: "Invoice not found" });
    await db.delete(invoices).where(eq(invoices.id, id));
    await storage.createAuditLog({
      nurseId: inv.nurseId,
      module: "invoices",
      action: "invoice_deleted",
      agentName: agentForReq(req),
      detail: { invoiceId: id, status: inv.status },
    });
    res.json({ deleted: true });
  });
}
