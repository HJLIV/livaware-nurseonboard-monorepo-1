import type { Express, Request, Response } from "express";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  nurseAvailability,
  nurses,
  SHIFTS,
  type Shift,
  type AvailabilityStatus,
  type NurseAvailability,
} from "@shared/schema";
import { storage } from "../storage";
import { validatePortalToken, requireAdmin } from "../middleware";

// ─── Date helpers ─────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function firstOfMonthIso(month: string): string {
  return `${month}-01`;
}

function lastOfMonthIso(month: string): string {
  const [y, m] = month.split("-").map(Number);
  // Day 0 of next month = last day of given month
  const last = new Date(Date.UTC(y, m, 0));
  return `${last.getUTCFullYear()}-${pad2(last.getUTCMonth() + 1)}-${pad2(last.getUTCDate())}`;
}

function addMonthsIso(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function daysOfMonth(month: string): string[] {
  const start = firstOfMonthIso(month);
  const end = lastOfMonthIso(month);
  const startD = new Date(start);
  const endD = new Date(end);
  const out: string[] = [];
  for (let d = new Date(startD); d <= endD; d = new Date(d.getTime() + 86400000)) {
    out.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
  }
  return out;
}

function currentMonthIso(): string {
  return todayIso().slice(0, 7);
}

// Allowed editing window: current month → +6 months ahead.
function isMonthInWindow(month: string): boolean {
  const min = currentMonthIso();
  const max = addMonthsIso(min, 6);
  return month >= min && month <= max;
}

function isDateInWindow(dateIso: string): boolean {
  const min = `${currentMonthIso()}-01`;
  const max = lastOfMonthIso(addMonthsIso(currentMonthIso(), 6));
  return dateIso >= min && dateIso <= max;
}

// ─── Validation ───────────────────────────────────────────────────────────

const cellSchema = z.object({
  date: z.string().regex(ISO_DATE_RE, "date must be YYYY-MM-DD"),
  shift: z.enum(["am", "pm", "night"]),
  status: z.enum(["available", "preferred", "unavailable", "working_elsewhere", "unset"]),
});

const bulkSchema = z.object({
  cells: z.array(cellSchema).min(1).max(500),
});

// ─── Core upsert / range helpers ──────────────────────────────────────────

async function getRange(nurseId: string, fromIso: string, toIso: string) {
  return db
    .select()
    .from(nurseAvailability)
    .where(
      and(
        eq(nurseAvailability.nurseId, nurseId),
        gte(nurseAvailability.date, fromIso),
        lte(nurseAvailability.date, toIso),
      ),
    );
}

async function applyCell(
  nurseId: string,
  date: string,
  shift: Shift,
  status: AvailabilityStatus | "unset",
  updatedBy: string,
  updatedByRole: string,
) {
  if (status === "unset") {
    await db
      .delete(nurseAvailability)
      .where(
        and(
          eq(nurseAvailability.nurseId, nurseId),
          eq(nurseAvailability.date, date),
          eq(nurseAvailability.shift, shift),
        ),
      );
    return null;
  }
  const [row] = await db
    .insert(nurseAvailability)
    .values({ nurseId, date, shift, status, updatedBy, updatedByRole })
    .onConflictDoUpdate({
      target: [nurseAvailability.nurseId, nurseAvailability.date, nurseAvailability.shift],
      set: { status, updatedBy, updatedByRole, updatedAt: new Date() },
    })
    .returning();
  return row;
}

async function ensureCompletedNurse(nurseId: string): Promise<{ ok: boolean; nurse?: any; status?: number; message?: string }> {
  const nurse = await storage.getCandidate(nurseId);
  if (!nurse) return { ok: false, status: 404, message: "Nurse not found" };
  return { ok: true, nurse };
}

function agentForReq(req: Request): string {
  return (
    (req as any).session?.username
      || (req as any).session?.email
      || "system"
  );
}

// ─── Route registration ───────────────────────────────────────────────────

export function registerAvailabilityRoutes(app: Express) {
  // ── Portal (nurse-facing) ───────────────────────────────────────────────

  // Returns the editable window + any existing entries for the nurse.
  app.get("/api/portal/:token/availability", validatePortalToken, async (req, res) => {
    const nurseId = (req as any).nurseId as string;
    const gate = await ensureCompletedNurse(nurseId);
    if (!gate.ok) return res.status(gate.status!).json({ message: gate.message });

    const monthParam = String(req.query.month || currentMonthIso());
    if (!MONTH_RE.test(monthParam)) {
      return res.status(400).json({ message: "month must be YYYY-MM" });
    }
    if (!isMonthInWindow(monthParam)) {
      return res.status(400).json({ message: "month is outside the current 7-month editable window" });
    }
    const fromIso = firstOfMonthIso(monthParam);
    const toIso = lastOfMonthIso(monthParam);
    const entries = await getRange(nurseId, fromIso, toIso);
    res.json({
      nurseId,
      month: monthParam,
      from: fromIso,
      to: toIso,
      windowMonths: { min: currentMonthIso(), max: addMonthsIso(currentMonthIso(), 6) },
      shifts: SHIFTS,
      entries,
    });
  });

  // Bulk upsert (covers the per-cell case too: just send 1 cell).
  app.put("/api/portal/:token/availability", validatePortalToken, async (req, res) => {
    const nurseId = (req as any).nurseId as string;
    const gate = await ensureCompletedNurse(nurseId);
    if (!gate.ok) return res.status(gate.status!).json({ message: gate.message });

    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    const { cells } = parsed.data;
    for (const c of cells) {
      if (!isDateInWindow(c.date)) {
        return res.status(400).json({ message: `date ${c.date} is outside the editable window` });
      }
    }
    const agent = agentForReq(req);
    const written: NurseAvailability[] = [];
    for (const c of cells) {
      const row = await applyCell(nurseId, c.date, c.shift, c.status, agent, "nurse");
      if (row) written.push(row);
    }
    await storage.createAuditLog({
      nurseId,
      module: "availability",
      action: "availability_updated",
      agentName: "nurse_portal",
      detail: { source: "portal", count: cells.length, sample: cells.slice(0, 5) },
    });
    res.json({ updated: cells.length, entries: written });
  });

  // ── Admin ───────────────────────────────────────────────────────────────

  // Whole-roster matrix for a given month. Filters: nurseId list, search.
  app.get("/api/admin/availability/matrix", requireAdmin, async (req, res) => {
    const monthParam = String(req.query.month || currentMonthIso());
    if (!MONTH_RE.test(monthParam)) {
      return res.status(400).json({ message: "month must be YYYY-MM" });
    }
    const fromIso = firstOfMonthIso(monthParam);
    const toIso = lastOfMonthIso(monthParam);
    const search = (req.query.search ? String(req.query.search) : "").toLowerCase().trim();
    const nurseIdsFilter = req.query.nurseIds
      ? String(req.query.nurseIds).split(",").map((s) => s.trim()).filter(Boolean)
      : null;
    // Stage filter: defaults to "completed" (Nurse) since only fully-onboarded
    // nurses can save availability, but admins can pass `stage=all` to include
    // earlier-stage nurses for visibility (the rows will just be empty).
    const stageParam = String(req.query.stage || "completed").toLowerCase();
    const stageFilter = stageParam === "all" ? null : "completed";

    let nurseRows = stageFilter
      ? await db
          .select({ id: nurses.id, fullName: nurses.fullName, email: nurses.email, currentStage: nurses.currentStage })
          .from(nurses)
          .where(eq(nurses.currentStage, stageFilter))
      : await db
          .select({ id: nurses.id, fullName: nurses.fullName, email: nurses.email, currentStage: nurses.currentStage })
          .from(nurses);

    if (nurseIdsFilter) nurseRows = nurseRows.filter((n) => nurseIdsFilter.includes(n.id));
    if (search) {
      nurseRows = nurseRows.filter(
        (n) =>
          n.fullName.toLowerCase().includes(search)
          || (n.email || "").toLowerCase().includes(search),
      );
    }
    const ids = nurseRows.map((n) => n.id);
    const entries = ids.length
      ? await db
          .select()
          .from(nurseAvailability)
          .where(
            and(
              inArray(nurseAvailability.nurseId, ids),
              gte(nurseAvailability.date, fromIso),
              lte(nurseAvailability.date, toIso),
            ),
          )
      : [];

    // Build matrix: nurseId -> date -> shift -> status
    const matrix: Record<string, Record<string, Record<Shift, AvailabilityStatus>>> = {};
    for (const e of entries) {
      const byDate = (matrix[e.nurseId] ??= {});
      const byShift = (byDate[e.date] ??= {} as Record<Shift, AvailabilityStatus>);
      byShift[e.shift as Shift] = e.status as AvailabilityStatus;
    }

    // Total nurse counts so the UI can give an actionable empty-state hint
    // (e.g. "you have N nurses but none are at the 'completed' stage").
    const allCountRows = await db
      .select({ id: nurses.id, currentStage: nurses.currentStage })
      .from(nurses);
    const totals = {
      all: allCountRows.length,
      completed: allCountRows.filter((n) => n.currentStage === "completed").length,
    };

    res.json({
      month: monthParam,
      from: fromIso,
      to: toIso,
      days: daysOfMonth(monthParam),
      shifts: SHIFTS,
      nurses: nurseRows,
      matrix,
      totals,
      stage: stageParam,
      windowMonths: { min: currentMonthIso(), max: addMonthsIso(currentMonthIso(), 6) },
    });
  });

  // CSV export — normalized one-row-per-(nurse,date,shift) format so that
  // the future rostering app can ingest directly.
  // Columns: nurse_id, name, email, date, shift, status
  app.get("/api/admin/availability/export.csv", requireAdmin, async (req, res) => {
    const monthParam = String(req.query.month || currentMonthIso());
    if (!MONTH_RE.test(monthParam)) {
      return res.status(400).json({ message: "month must be YYYY-MM" });
    }
    const fromIso = firstOfMonthIso(monthParam);
    const toIso = lastOfMonthIso(monthParam);

    // Mirror the matrix endpoint's filters so the CSV matches the visible view.
    const search = (req.query.search ? String(req.query.search) : "").toLowerCase().trim();
    const stageParam = String(req.query.stage || "completed").toLowerCase();
    const stageFilter = stageParam === "all" ? null : "completed";

    let nurseRows = stageFilter
      ? await db
          .select({ id: nurses.id, fullName: nurses.fullName, email: nurses.email })
          .from(nurses)
          .where(eq(nurses.currentStage, stageFilter))
      : await db
          .select({ id: nurses.id, fullName: nurses.fullName, email: nurses.email })
          .from(nurses);
    if (search) {
      nurseRows = nurseRows.filter(
        (n) =>
          n.fullName.toLowerCase().includes(search)
          || (n.email || "").toLowerCase().includes(search),
      );
    }
    const ids = nurseRows.map((n) => n.id);
    const entries = ids.length
      ? await db
          .select()
          .from(nurseAvailability)
          .where(
            and(
              inArray(nurseAvailability.nurseId, ids),
              gte(nurseAvailability.date, fromIso),
              lte(nurseAvailability.date, toIso),
            ),
          )
      : [];

    const nurseById = new Map(nurseRows.map((n) => [n.id, n]));
    const lines: string[] = [["nurse_id", "name", "email", "date", "shift", "status"].join(",")];
    // Sort by nurse name, then date, then shift order for stable output.
    const shiftOrder: Record<Shift, number> = { am: 0, pm: 1, night: 2 };
    const sorted = [...entries].sort((a, b) => {
      const na = nurseById.get(a.nurseId)?.fullName || "";
      const nb = nurseById.get(b.nurseId)?.fullName || "";
      if (na !== nb) return na.localeCompare(nb);
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return shiftOrder[a.shift as Shift] - shiftOrder[b.shift as Shift];
    });
    for (const e of sorted) {
      const n = nurseById.get(e.nurseId);
      if (!n) continue;
      lines.push([n.id, n.fullName, n.email || "", e.date, e.shift, e.status].map(csvEscape).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="availability-${monthParam}.csv"`,
    );
    res.send(lines.join("\n"));
  });

  // Per-nurse range fetch (for the editor side panel).
  app.get("/api/admin/nurses/:id/availability", requireAdmin, async (req, res) => {
    const monthParam = String(req.query.month || currentMonthIso());
    if (!MONTH_RE.test(monthParam)) {
      return res.status(400).json({ message: "month must be YYYY-MM" });
    }
    const nurse = await storage.getCandidate(String(req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    const fromIso = firstOfMonthIso(monthParam);
    const toIso = lastOfMonthIso(monthParam);
    const entries = await getRange(nurse.id, fromIso, toIso);
    res.json({
      nurseId: nurse.id,
      nurseName: nurse.fullName,
      stage: nurse.currentStage,
      month: monthParam,
      from: fromIso,
      to: toIso,
      shifts: SHIFTS,
      entries,
      windowMonths: { min: currentMonthIso(), max: addMonthsIso(currentMonthIso(), 6) },
    });
  });

  // Admin bulk upsert for one nurse.
  app.put("/api/admin/nurses/:id/availability", requireAdmin, async (req, res) => {
    const parsed = bulkSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const nurse = await storage.getCandidate(String(req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });

    const agent = agentForReq(req);
    const written: NurseAvailability[] = [];
    for (const c of parsed.data.cells) {
      if (!isDateInWindow(c.date)) {
        return res.status(400).json({ message: `date ${c.date} is outside the editable window` });
      }
      const row = await applyCell(nurse.id, c.date, c.shift, c.status, agent, "admin");
      if (row) written.push(row);
    }
    await storage.createAuditLog({
      nurseId: nurse.id,
      module: "availability",
      action: "availability_updated",
      agentName: agent,
      detail: { source: "admin", count: parsed.data.cells.length, sample: parsed.data.cells.slice(0, 5) },
    });
    res.json({ updated: parsed.data.cells.length, entries: written });
  });
}

function csvEscape(v: string): string {
  if (v == null) return "";
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
