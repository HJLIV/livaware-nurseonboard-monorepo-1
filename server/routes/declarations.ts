// Onboarding declarations routes (task 121).
//
// Portal endpoints (token-gated, onboarding-unlock-gated for writes):
//   GET  /api/portal/:token/declarations
//   GET  /api/portal/:token/declarations/:key
//   PUT  /api/portal/:token/declarations/:key/draft
//   POST /api/portal/:token/declarations/:key/submit
//
// Admin endpoints:
//   GET  /api/nurses/:id/declarations
//   GET  /api/nurses/:id/declarations/:key
//   GET  /api/nurses/:id/declarations/:key/history
//   POST /api/nurses/:id/declarations/:key/reopen   { reason }

import type { Express, Request } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db } from "../db";
import { nurses } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  requireAdmin,
  validatePortalToken,
  requireOnboardingUnlocked,
  uploadsDir,
} from "../middleware";
import { logAction } from "../services/audit";
import { storage } from "../storage";
import {
  getDeclaration,
  listDeclarations,
  validateAnswersForSubmission,
  type DeclarationDefinition,
} from "../declarations/registry";
import {
  attachPdfDocument,
  createDraft,
  getHistory,
  getLatest,
  listLatestPerKey,
  markSubmitted,
  reopen,
  updateDraft,
} from "../declarations/storage";
import { generateDeclarationPDF } from "../declarations/pdf";

function agentFor(req: Request): string {
  return req.session?.username || "system";
}

function clientIp(req: Request): string | null {
  const fwd = (req.headers["x-forwarded-for"] as string | undefined) || "";
  return fwd.split(",")[0]?.trim() || req.ip || null;
}

function publicDeclaration(d: DeclarationDefinition) {
  // Strip any future internal-only flags here. For now everything is safe
  // to send — the registry has no secrets.
  return d;
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
}

async function generateAndStorePdf(
  nurseId: string,
  declaration: DeclarationDefinition,
  recordId: string,
): Promise<string | null> {
  try {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
    if (!nurse) return null;
    const record = await getLatest(nurseId, declaration.key);
    if (!record) return null;

    const pdfBuffer = await generateDeclarationPDF(declaration, record, nurse);
    const datePart = new Date().toISOString().split("T")[0];
    const filename = `${declaration.key}-${safeFilenamePart(nurse.fullName)}-${datePart}-v${record.version}-${crypto
      .randomBytes(4)
      .toString("hex")}.pdf`;
    const absPath = path.join(uploadsDir, filename);
    await fs.promises.writeFile(absPath, pdfBuffer);

    const doc = await storage.createDocument({
      nurseId,
      type: `declaration_${declaration.key}`,
      category: "declaration",
      filename,
      originalFilename: `${declaration.title} - ${nurse.fullName}.pdf`,
      filePath: `/api/uploads/${filename}`,
      fileSize: pdfBuffer.length,
      mimeType: "application/pdf",
      uploadedBy: "system",
    });

    await attachPdfDocument(recordId, doc.id);
    await logAction(nurseId, "portal", "declaration_pdf_generated", "system", {
      declarationKey: declaration.key,
      documentId: doc.id,
      version: record.version,
    });
    return doc.id;
  } catch (err: any) {
    console.error("[declarations] pdf generation failed:", err?.message || err);
    return null;
  }
}

interface DeclarationStatusSummary {
  key: string;
  title: string;
  status: "not_started" | "draft" | "submitted" | "reopened";
  version: number | null;
  submittedAt: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  pdfDocumentId: string | null;
}

function summarize(
  d: DeclarationDefinition,
  latest: { status: string; version: number; submittedAt: Date | null; reopenedAt: Date | null; reopenReason: string | null; pdfDocumentId: string | null } | undefined,
): DeclarationStatusSummary {
  if (!latest) {
    return {
      key: d.key, title: d.title,
      status: "not_started", version: null, submittedAt: null,
      reopenedAt: null, reopenReason: null, pdfDocumentId: null,
    };
  }
  return {
    key: d.key, title: d.title,
    status: latest.status as DeclarationStatusSummary["status"],
    version: latest.version,
    submittedAt: latest.submittedAt?.toISOString() ?? null,
    reopenedAt: latest.reopenedAt?.toISOString() ?? null,
    reopenReason: latest.reopenReason ?? null,
    pdfDocumentId: latest.pdfDocumentId ?? null,
  };
}

export async function buildDeclarationsSummary(nurseId: string) {
  const latest = await listLatestPerKey(nurseId);
  const all = listDeclarations();
  const items = all.map((d) => summarize(d, latest.get(d.key)));
  const total = items.length;
  // Submitted (and not since reopened) count toward complete. A row with
  // status "reopened" means there is a newer draft awaiting submission.
  const completed = items.filter((i) => i.status === "submitted").length;
  return { items, total, completed, outstanding: total - completed };
}

export function registerDeclarationRoutes(app: Express) {
  // ─── Portal: list all declarations + per-nurse status ────────────
  app.get(
    "/api/portal/:token/declarations",
    validatePortalToken,
    async (req, res) => {
      try {
        const nurseId = (req as any).nurseId as string;
        const summary = await buildDeclarationsSummary(nurseId);
        res.json(summary);
      } catch (err: any) {
        console.error("[declarations] portal list failed:", err);
        res.status(500).json({ message: err?.message || "Failed to load declarations" });
      }
    },
  );

  // ─── Portal: fetch a single declaration with question set + draft
  app.get(
    "/api/portal/:token/declarations/:key",
    validatePortalToken,
    async (req, res) => {
      try {
        const nurseId = (req as any).nurseId as string;
        const key = String(req.params.key);
        const def = getDeclaration(key);
        if (!def) return res.status(404).json({ message: "Unknown declaration key" });
        const latest = await getLatest(nurseId, key);
        res.json({
          declaration: publicDeclaration(def),
          latest: latest
            ? {
                id: latest.id,
                version: latest.version,
                status: latest.status,
                answers: latest.answers,
                signatureName: latest.signatureName,
                submittedAt: latest.submittedAt?.toISOString() ?? null,
                reopenedAt: latest.reopenedAt?.toISOString() ?? null,
                reopenReason: latest.reopenReason ?? null,
                pdfDocumentId: latest.pdfDocumentId ?? null,
              }
            : null,
        });
      } catch (err: any) {
        console.error("[declarations] portal fetch failed:", err);
        res.status(500).json({ message: err?.message || "Failed to load declaration" });
      }
    },
  );

  // ─── Portal: save draft ──────────────────────────────────────────
  app.put(
    "/api/portal/:token/declarations/:key/draft",
    validatePortalToken,
    requireOnboardingUnlocked,
    async (req, res) => {
      try {
        const nurseId = (req as any).nurseId as string;
        const key = String(req.params.key);
        const def = getDeclaration(key);
        if (!def) return res.status(404).json({ message: "Unknown declaration key" });
        const body = req.body || {};
        const answers = (body.answers && typeof body.answers === "object") ? body.answers : {};
        const signatureName = typeof body.signatureName === "string" ? body.signatureName : undefined;

        let latest = await getLatest(nurseId, key);
        // If the latest is submitted (not reopened), refuse — admin must
        // re-open before further edits.
        if (latest && latest.status === "submitted") {
          return res.status(409).json({
            message: "This declaration has already been submitted. An admin must re-open it before further edits.",
          });
        }
        if (!latest) {
          latest = await createDraft(nurseId, key, 1, answers);
        } else {
          latest = (await updateDraft(latest.id, {
            answers,
            ...(signatureName !== undefined ? { signatureName } : {}),
          })) ?? latest;
        }
        await logAction(nurseId, "portal", "declaration_saved_draft", "candidate", {
          declarationKey: key,
          version: latest.version,
        });
        res.json({ ok: true, latest });
      } catch (err: any) {
        console.error("[declarations] save draft failed:", err);
        res.status(500).json({ message: err?.message || "Failed to save draft" });
      }
    },
  );

  // ─── Portal: submit ──────────────────────────────────────────────
  app.post(
    "/api/portal/:token/declarations/:key/submit",
    validatePortalToken,
    requireOnboardingUnlocked,
    async (req, res) => {
      try {
        const nurseId = (req as any).nurseId as string;
        const key = String(req.params.key);
        const def = getDeclaration(key);
        if (!def) return res.status(404).json({ message: "Unknown declaration key" });
        const body = req.body || {};
        const answers = (body.answers && typeof body.answers === "object") ? body.answers : {};
        const signatureName = typeof body.signatureName === "string" ? body.signatureName.trim() : "";

        if (!signatureName) {
          return res.status(400).json({
            message: "A typed signature is required to submit.",
            errors: [{ questionId: "__signature__", message: "Please type your full legal name to sign." }],
          });
        }
        const errors = validateAnswersForSubmission(def, answers);
        if (errors.length > 0) {
          return res.status(400).json({ message: "Please fix the highlighted answers.", errors });
        }

        let latest = await getLatest(nurseId, key);
        if (latest && latest.status === "submitted") {
          return res.status(409).json({
            message: "This declaration has already been submitted. An admin must re-open it to re-submit.",
          });
        }
        if (!latest) {
          latest = await createDraft(nurseId, key, 1, answers);
        }
        const submitted = await markSubmitted(latest.id, {
          answers,
          signatureName,
          ipAddress: clientIp(req),
          userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
        });
        if (!submitted) {
          return res.status(500).json({ message: "Failed to submit declaration." });
        }
        await logAction(nurseId, "portal", "declaration_submitted", "candidate", {
          declarationKey: key,
          version: submitted.version,
          ipAddress: submitted.ipAddress,
        });
        // Generate PDF best-effort. Keep it inline so the response carries
        // the documentId — failures don't block the submission.
        const documentId = await generateAndStorePdf(nurseId, def, submitted.id);
        const finalRow = await getLatest(nurseId, key);
        res.json({ ok: true, latest: finalRow, pdfDocumentId: documentId });
      } catch (err: any) {
        console.error("[declarations] submit failed:", err);
        res.status(500).json({ message: err?.message || "Failed to submit declaration" });
      }
    },
  );

  // ─── Admin: list status for all declarations ─────────────────────
  app.get(
    "/api/nurses/:id/declarations",
    requireAdmin,
    async (req, res) => {
      try {
        const nurseId = String(req.params.id);
        const summary = await buildDeclarationsSummary(nurseId);
        res.json(summary);
      } catch (err: any) {
        console.error("[declarations] admin list failed:", err);
        res.status(500).json({ message: err?.message || "Failed to load declarations" });
      }
    },
  );

  // ─── Admin: fetch a single declaration with question set + latest
  app.get(
    "/api/nurses/:id/declarations/:key",
    requireAdmin,
    async (req, res) => {
      try {
        const nurseId = String(req.params.id);
        const key = String(req.params.key);
        const def = getDeclaration(key);
        if (!def) return res.status(404).json({ message: "Unknown declaration key" });
        const latest = await getLatest(nurseId, key);
        const history = await getHistory(nurseId, key);
        res.json({
          declaration: publicDeclaration(def),
          latest: latest ?? null,
          history,
        });
      } catch (err: any) {
        console.error("[declarations] admin fetch failed:", err);
        res.status(500).json({ message: err?.message || "Failed to load declaration" });
      }
    },
  );

  // ─── Admin: history for one key ──────────────────────────────────
  app.get(
    "/api/nurses/:id/declarations/:key/history",
    requireAdmin,
    async (req, res) => {
      try {
        const nurseId = String(req.params.id);
        const key = String(req.params.key);
        const history = await getHistory(nurseId, key);
        res.json(history);
      } catch (err: any) {
        res.status(500).json({ message: err?.message || "Failed to load history" });
      }
    },
  );

  // ─── Admin: re-open a submitted declaration ──────────────────────
  app.post(
    "/api/nurses/:id/declarations/:key/reopen",
    requireAdmin,
    async (req, res) => {
      try {
        const nurseId = String(req.params.id);
        const key = String(req.params.key);
        const def = getDeclaration(key);
        if (!def) return res.status(404).json({ message: "Unknown declaration key" });
        const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
        if (!reason) {
          return res.status(400).json({ message: "A reason is required to re-open a declaration." });
        }
        const latest = await getLatest(nurseId, key);
        if (!latest || latest.status !== "submitted") {
          return res.status(409).json({ message: "Only a submitted declaration can be re-opened." });
        }
        const result = await reopen(nurseId, key, agentFor(req), reason);
        if (!result) return res.status(500).json({ message: "Failed to reopen declaration" });
        await logAction(nurseId, "admin", "declaration_reopened", agentFor(req), {
          declarationKey: key,
          previousVersion: result.previous.version,
          newDraftVersion: result.next.version,
          reason,
        });
        res.json({ ok: true, previous: result.previous, next: result.next });
      } catch (err: any) {
        console.error("[declarations] reopen failed:", err);
        res.status(500).json({ message: err?.message || "Failed to reopen declaration" });
      }
    },
  );
}
