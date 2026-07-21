import type { Express, Request } from "express";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  rosterPatients,
  rosterAllocations,
  rosterPatientUpsertSchema,
  nurses,
  nurseAvailability,
  nmcVerifications,
  dbsVerifications,
  competencyDeclarations,
  type RosterPatient,
  type RosterAllocation,
  type RosterSlot,
  type Shift,
} from "@shared/schema";
import { storage } from "../storage";
import { validatePortalToken, requireAdmin, portalAgent } from "../middleware";
import { cancelAllocationBooking } from "../semble/service";

// ─── Helpers ──────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }

function todayIso(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function addDaysIso(dateIso: string, n: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function daysBetween(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  let cur = fromIso;
  let guard = 0;
  while (cur <= toIso && guard < 400) {
    out.push(cur);
    cur = addDaysIso(cur, 1);
    guard++;
  }
  return out;
}

function epochDay(dateIso: string): number {
  return Math.floor(new Date(`${dateIso}T00:00:00Z`).getTime() / 86400000);
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Absolute minute interval for an allocation; end <= start means the shift
// crosses midnight into the next day.
function absInterval(dateIso: string, startTime: string, endTime: string): [number, number] {
  const base = epochDay(dateIso) * 1440;
  const s = toMinutes(startTime);
  let e = toMinutes(endTime);
  if (e <= s) e += 1440;
  return [base + s, base + e];
}

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

function slotDurationMinutes(startTime: string, endTime: string): number {
  const s = toMinutes(startTime);
  let e = toMinutes(endTime);
  if (e <= s) e += 1440;
  return e - s;
}

// Map a slot's time window onto the availability shift taxonomy so the
// nurse-picker can surface the availability hint for the right shift.
export function shiftForSlot(startTime: string, endTime: string): Shift {
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  if (s >= 20 * 60 || e <= s) return "night";
  if (s < 12 * 60) return "am";
  return "pm";
}

function patientSlots(patient: RosterPatient): RosterSlot[] {
  const raw = patient.slots;
  if (!Array.isArray(raw)) return [];
  return raw as RosterSlot[];
}

function dateInEngagement(patient: RosterPatient, dateIso: string): boolean {
  if (patient.engagementStart && dateIso < patient.engagementStart) return false;
  if (patient.engagementEnd && dateIso > patient.engagementEnd) return false;
  return true;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0]!.toUpperCase())
    .slice(0, 3)
    .join("");
}

function agentForReq(req: Request): string {
  const s = (req as any).session;
  const u = s?.username || s?.email;
  if (!u) return "system";
  return s?.role ? `${u} (${s.role})` : u;
}

function parseRange(req: Request, defaultDays = 13): { fromIso: string; toIso: string } | null {
  const fromIso = String(req.query.from || todayIso());
  const toIso = String(req.query.to || addDaysIso(fromIso, defaultDays));
  if (!ISO_DATE_RE.test(fromIso) || !ISO_DATE_RE.test(toIso)) return null;
  if (toIso < fromIso) return null;
  if (daysBetween(fromIso, toIso).length > 100) return null;
  return { fromIso, toIso };
}

// ─── Crossover (double-booking) detection ─────────────────────────────────

interface ConflictInfo {
  allocationId: string;
  patientId: string;
  patientName: string;
  date: string;
  slotKey: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
}

// Returns the nurse's existing allocations that overlap the candidate window.
// Looks at date-1..date+1 to catch midnight-crossing shifts on either side.
async function findCrossovers(
  nurseId: string,
  dateIso: string,
  startTime: string,
  endTime: string,
  excludeAllocationId?: string,
): Promise<ConflictInfo[]> {
  const candidate = absInterval(dateIso, startTime, endTime);
  const rows = await db
    .select({
      alloc: rosterAllocations,
      patientName: rosterPatients.name,
    })
    .from(rosterAllocations)
    .innerJoin(rosterPatients, eq(rosterAllocations.patientId, rosterPatients.id))
    .where(
      and(
        eq(rosterAllocations.nurseId, nurseId),
        gte(rosterAllocations.date, addDaysIso(dateIso, -1)),
        lte(rosterAllocations.date, addDaysIso(dateIso, 1)),
      ),
    );
  const conflicts: ConflictInfo[] = [];
  for (const { alloc, patientName } of rows) {
    if (excludeAllocationId && alloc.id === excludeAllocationId) continue;
    if (overlaps(candidate, absInterval(alloc.date, alloc.startTime, alloc.endTime))) {
      conflicts.push({
        allocationId: alloc.id,
        patientId: alloc.patientId,
        patientName,
        date: alloc.date,
        slotKey: alloc.slotKey,
        slotLabel: alloc.slotLabel,
        startTime: alloc.startTime,
        endTime: alloc.endTime,
      });
    }
  }
  return conflicts;
}

// All pairwise conflicts among a set of allocations (for the consolidated view).
function conflictsInSet(
  allocations: (RosterAllocation & { patientName: string })[],
): { nurseId: string; a: ConflictInfo; b: ConflictInfo }[] {
  const byNurse = new Map<string, (RosterAllocation & { patientName: string })[]>();
  for (const al of allocations) {
    const list = byNurse.get(al.nurseId) ?? [];
    list.push(al);
    byNurse.set(al.nurseId, list);
  }
  const out: { nurseId: string; a: ConflictInfo; b: ConflictInfo }[] = [];
  const info = (al: RosterAllocation & { patientName: string }): ConflictInfo => ({
    allocationId: al.id,
    patientId: al.patientId,
    patientName: al.patientName,
    date: al.date,
    slotKey: al.slotKey,
    slotLabel: al.slotLabel,
    startTime: al.startTime,
    endTime: al.endTime,
  });
  byNurse.forEach((list, nurseId) => {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const ia = absInterval(list[i].date, list[i].startTime, list[i].endTime);
        const ib = absInterval(list[j].date, list[j].startTime, list[j].endTime);
        if (overlaps(ia, ib)) out.push({ nurseId, a: info(list[i]), b: info(list[j]) });
      }
    }
  });
  return out;
}

// ─── Compliance quick-ticks ───────────────────────────────────────────────

async function complianceTicks(nurseIds: string[]): Promise<Record<string, { nmc: boolean; dbs: boolean; competency: boolean }>> {
  const out: Record<string, { nmc: boolean; dbs: boolean; competency: boolean }> = {};
  for (const id of nurseIds) out[id] = { nmc: false, dbs: false, competency: false };
  if (!nurseIds.length) return out;
  const [nmcRows, dbsRows, compRows] = await Promise.all([
    db.select({ nurseId: nmcVerifications.nurseId })
      .from(nmcVerifications)
      .where(and(inArray(nmcVerifications.nurseId, nurseIds), eq(nmcVerifications.status, "verified"))),
    db.select({ nurseId: dbsVerifications.nurseId })
      .from(dbsVerifications)
      .where(and(inArray(dbsVerifications.nurseId, nurseIds), eq(dbsVerifications.status, "verified"))),
    db.select({ nurseId: competencyDeclarations.nurseId })
      .from(competencyDeclarations)
      .where(and(inArray(competencyDeclarations.nurseId, nurseIds), eq(competencyDeclarations.status, "approved"))),
  ]);
  for (const r of nmcRows) out[r.nurseId] && (out[r.nurseId].nmc = true);
  for (const r of dbsRows) out[r.nurseId] && (out[r.nurseId].dbs = true);
  for (const r of compRows) out[r.nurseId] && (out[r.nurseId].competency = true);
  return out;
}

// ─── Route registration ───────────────────────────────────────────────────

export function registerRosteringRoutes(app: Express) {
  // ── Patients CRUD (admin) ──────────────────────────────────────────────

  app.get("/api/admin/rostering/patients", requireAdmin, async (req, res) => {
    const includeInactive = String(req.query.includeInactive || "") === "1";
    let rows = await db.select().from(rosterPatients);
    if (!includeInactive) rows = rows.filter((p) => p.active);
    rows.sort((a, b) => a.name.localeCompare(b.name));
    res.json(rows);
  });

  app.post("/api/admin/rostering/patients", requireAdmin, async (req, res) => {
    const parsed = rosterPatientUpsertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const d = parsed.data;
    const [row] = await db.insert(rosterPatients).values({
      name: d.name,
      carePattern: d.carePattern,
      engagementStart: d.engagementStart ?? null,
      engagementEnd: d.engagementEnd ?? null,
      notes: d.notes ?? null,
      active: d.active ?? true,
      slots: d.slots,
      sembleId: d.sembleId ?? null,
      dob: d.dob ?? null,
      email: d.email ?? null,
      phone: d.phone ?? null,
    }).returning();
    await storage.createAuditLog({
      module: "rostering",
      action: "patient_created",
      agentName: agentForReq(req),
      detail: { patientId: row.id, name: row.name, carePattern: row.carePattern, sembleId: row.sembleId ?? undefined },
    });
    if (row.sembleId) {
      await storage.createAuditLog({
        module: "semble",
        action: "patient_linked",
        agentName: agentForReq(req),
        detail: { patientId: row.id, name: row.name, sembleId: row.sembleId },
      });
    }
    res.status(201).json(row);
  });

  app.get("/api/admin/rostering/patients/:id", requireAdmin, async (req, res) => {
    const [row] = await db.select().from(rosterPatients).where(eq(rosterPatients.id, String(req.params.id)));
    if (!row) return res.status(404).json({ message: "Patient not found" });
    res.json(row);
  });

  app.put("/api/admin/rostering/patients/:id", requireAdmin, async (req, res) => {
    const parsed = rosterPatientUpsertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const d = parsed.data;
    const [before] = await db.select().from(rosterPatients).where(eq(rosterPatients.id, String(req.params.id)));
    if (!before) return res.status(404).json({ message: "Patient not found" });
    const [row] = await db.update(rosterPatients).set({
      name: d.name,
      carePattern: d.carePattern,
      engagementStart: d.engagementStart ?? null,
      engagementEnd: d.engagementEnd ?? null,
      notes: d.notes ?? null,
      active: d.active ?? true,
      slots: d.slots,
      // Semble linkage only changes when the field is present in the body
      // (undefined = leave as-is; null = unlink).
      ...(d.sembleId !== undefined ? { sembleId: d.sembleId } : {}),
      ...(d.dob !== undefined ? { dob: d.dob } : {}),
      ...(d.email !== undefined ? { email: d.email } : {}),
      ...(d.phone !== undefined ? { phone: d.phone } : {}),
      updatedAt: new Date(),
    }).where(eq(rosterPatients.id, String(req.params.id))).returning();
    if (!row) return res.status(404).json({ message: "Patient not found" });
    await storage.createAuditLog({
      module: "rostering",
      action: "patient_updated",
      agentName: agentForReq(req),
      detail: { patientId: row.id, name: row.name },
    });
    if (row.sembleId !== before.sembleId) {
      await storage.createAuditLog({
        module: "semble",
        action: row.sembleId ? "patient_linked" : "patient_unlinked",
        agentName: agentForReq(req),
        detail: { patientId: row.id, name: row.name, sembleId: row.sembleId ?? before.sembleId },
      });
    }
    res.json(row);
  });

  app.delete("/api/admin/rostering/patients/:id", requireAdmin, async (req, res) => {
    const [row] = await db.delete(rosterPatients).where(eq(rosterPatients.id, String(req.params.id))).returning();
    if (!row) return res.status(404).json({ message: "Patient not found" });
    await storage.createAuditLog({
      module: "rostering",
      action: "patient_deleted",
      agentName: agentForReq(req),
      detail: { patientId: row.id, name: row.name },
    });
    res.json({ deleted: true });
  });

  // ── Per-patient roster grid ────────────────────────────────────────────

  app.get("/api/admin/rostering/patients/:id/roster", requireAdmin, async (req, res) => {
    const range = parseRange(req);
    if (!range) return res.status(400).json({ message: "from/to must be YYYY-MM-DD, from <= to, max 100 days" });
    const [patient] = await db.select().from(rosterPatients).where(eq(rosterPatients.id, String(req.params.id)));
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    const allocations = await db
      .select()
      .from(rosterAllocations)
      .where(
        and(
          eq(rosterAllocations.patientId, patient.id),
          gte(rosterAllocations.date, range.fromIso),
          lte(rosterAllocations.date, range.toIso),
        ),
      );
    const nurseIds = Array.from(new Set(allocations.map((a) => a.nurseId)));
    const nurseRows = nurseIds.length
      ? await db.select({ id: nurses.id, fullName: nurses.fullName }).from(nurses).where(inArray(nurses.id, nurseIds))
      : [];
    const days = daysBetween(range.fromIso, range.toIso).map((date) => ({
      date,
      inEngagement: dateInEngagement(patient, date),
    }));
    res.json({
      patient,
      from: range.fromIso,
      to: range.toIso,
      slots: patientSlots(patient),
      days,
      allocations,
      nurses: nurseRows,
    });
  });

  // ── Nurse picker options with compliance quick-ticks ──────────────────

  app.get("/api/admin/rostering/nurse-options", requireAdmin, async (req, res) => {
    const date = String(req.query.date || "");
    const startTime = String(req.query.startTime || "");
    const endTime = String(req.query.endTime || "");
    if (!ISO_DATE_RE.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      return res.status(400).json({ message: "date (YYYY-MM-DD), startTime and endTime (HH:MM) are required" });
    }
    const nurseRows = await db
      .select({ id: nurses.id, fullName: nurses.fullName, email: nurses.email, currentStage: nurses.currentStage })
      .from(nurses);
    const eligible = nurseRows.filter((n) => n.currentStage !== "withdrawn" as any);
    const ids = eligible.map((n) => n.id);
    const ticks = await complianceTicks(ids);

    const shift = shiftForSlot(startTime, endTime);
    const availRows = ids.length
      ? await db
          .select()
          .from(nurseAvailability)
          .where(and(inArray(nurseAvailability.nurseId, ids), eq(nurseAvailability.date, date), eq(nurseAvailability.shift, shift)))
      : [];
    const availByNurse = new Map(availRows.map((r) => [r.nurseId, r.status]));

    // Conflicts for the candidate window across all nurses in one pass.
    const nearby = ids.length
      ? await db
          .select({ alloc: rosterAllocations, patientName: rosterPatients.name })
          .from(rosterAllocations)
          .innerJoin(rosterPatients, eq(rosterAllocations.patientId, rosterPatients.id))
          .where(and(gte(rosterAllocations.date, addDaysIso(date, -1)), lte(rosterAllocations.date, addDaysIso(date, 1))))
      : [];
    const candidate = absInterval(date, startTime, endTime);
    const conflictsByNurse = new Map<string, ConflictInfo[]>();
    for (const { alloc, patientName } of nearby) {
      if (overlaps(candidate, absInterval(alloc.date, alloc.startTime, alloc.endTime))) {
        const list = conflictsByNurse.get(alloc.nurseId) ?? [];
        list.push({
          allocationId: alloc.id,
          patientId: alloc.patientId,
          patientName,
          date: alloc.date,
          slotKey: alloc.slotKey,
          slotLabel: alloc.slotLabel,
          startTime: alloc.startTime,
          endTime: alloc.endTime,
        });
        conflictsByNurse.set(alloc.nurseId, list);
      }
    }

    res.json({
      date,
      startTime,
      endTime,
      shift,
      nurses: eligible
        .map((n) => ({
          id: n.id,
          fullName: n.fullName,
          email: n.email,
          currentStage: n.currentStage,
          compliance: ticks[n.id],
          availability: availByNurse.get(n.id) ?? null,
          conflicts: conflictsByNurse.get(n.id) ?? [],
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    });
  });

  // ── Allocation assign / unassign ───────────────────────────────────────

  const allocateSchema = z.object({
    date: z.string().regex(ISO_DATE_RE),
    slotKey: z.string().min(1),
    nurseId: z.string().min(1),
    override: z.boolean().optional(),
  });

  app.post("/api/admin/rostering/patients/:id/allocations", requireAdmin, async (req, res) => {
    const parsed = allocateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const { date, slotKey, nurseId, override } = parsed.data;

    const [patient] = await db.select().from(rosterPatients).where(eq(rosterPatients.id, String(req.params.id)));
    if (!patient) return res.status(404).json({ message: "Patient not found" });
    const slot = patientSlots(patient).find((s) => s.key === slotKey);
    if (!slot) return res.status(400).json({ message: `Unknown slot "${slotKey}" for this patient` });
    if (!dateInEngagement(patient, date)) {
      return res.status(400).json({ message: "Date is outside the patient's engagement window" });
    }
    const nurse = await storage.getCandidate(nurseId);
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });

    // Existing allocation for this cell (if any) is replaced — exclude it
    // from the crossover check so re-assigning the same cell doesn't
    // self-conflict.
    const [existing] = await db
      .select()
      .from(rosterAllocations)
      .where(and(
        eq(rosterAllocations.patientId, patient.id),
        eq(rosterAllocations.date, date),
        eq(rosterAllocations.slotKey, slotKey),
      ));

    const conflicts = await findCrossovers(nurseId, date, slot.startTime, slot.endTime, existing?.id);
    if (conflicts.length && !override) {
      return res.status(409).json({ error: "crossover_conflict", conflicts });
    }

    const agent = agentForReq(req);
    // If the cell is being replaced with a different nurse or time window,
    // any Semble booking attached to the old allocation is now stale: cancel
    // it (fire-and-forget) and reset the cell to "pending" so it shows up in
    // the next confirm-and-push run.
    const cellChanged =
      !!existing &&
      (existing.nurseId !== nurseId ||
        existing.startTime !== slot.startTime ||
        existing.endTime !== slot.endTime);
    const [row] = await db
      .insert(rosterAllocations)
      .values({
        patientId: patient.id,
        nurseId,
        date,
        slotKey,
        slotLabel: slot.label,
        startTime: slot.startTime,
        endTime: slot.endTime,
        assignedBy: agent,
      })
      .onConflictDoUpdate({
        target: [rosterAllocations.patientId, rosterAllocations.date, rosterAllocations.slotKey],
        set: {
          nurseId,
          slotLabel: slot.label,
          startTime: slot.startTime,
          endTime: slot.endTime,
          assignedBy: agent,
          updatedAt: new Date(),
          ...(cellChanged ? { sembleBookingId: null, sembleBookingError: null } : {}),
        },
      })
      .returning();

    await storage.createAuditLog({
      nurseId,
      module: "rostering",
      action: "nurse_allocated",
      agentName: agent,
      detail: {
        patientId: patient.id,
        patientName: patient.name,
        date,
        slotKey,
        slotLabel: slot.label,
        startTime: slot.startTime,
        endTime: slot.endTime,
        overridden: conflicts.length > 0,
        conflictCount: conflicts.length,
        replacedNurseId: existing && existing.nurseId !== nurseId ? existing.nurseId : undefined,
      },
    });
    // Semble bookings are NOT pushed automatically: allocations stay local
    // ("pending") until an admin confirms them via the bulk push flow
    // (POST /api/admin/semble/push-bookings). Only a superseded booking is
    // cancelled here, fire-and-forget, so the Semble diary never holds a
    // booking for a shift that no longer matches the roster.
    if (cellChanged && existing?.sembleBookingId) {
      void cancelAllocationBooking(existing, agent);
    }
    res.status(existing ? 200 : 201).json({ allocation: row, conflicts, overridden: conflicts.length > 0 });
  });

  app.delete("/api/admin/rostering/allocations/:id", requireAdmin, async (req, res) => {
    const [row] = await db.delete(rosterAllocations).where(eq(rosterAllocations.id, String(req.params.id))).returning();
    if (!row) return res.status(404).json({ message: "Allocation not found" });
    await storage.createAuditLog({
      nurseId: row.nurseId,
      module: "rostering",
      action: "nurse_unallocated",
      agentName: agentForReq(req),
      detail: { patientId: row.patientId, date: row.date, slotKey: row.slotKey },
    });
    // Fire-and-forget Semble booking cancellation (no-op if none attached).
    void cancelAllocationBooking(row, agentForReq(req));
    res.json({ deleted: true });
  });

  // ── Consolidated rota + dashboard stats ────────────────────────────────

  app.get("/api/admin/rostering/rota", requireAdmin, async (req, res) => {
    const range = parseRange(req);
    if (!range) return res.status(400).json({ message: "from/to must be YYYY-MM-DD, from <= to, max 100 days" });

    const patients = (await db.select().from(rosterPatients)).filter((p) => p.active);
    patients.sort((a, b) => a.name.localeCompare(b.name));
    const allocRows = await db
      .select({ alloc: rosterAllocations, patientName: rosterPatients.name })
      .from(rosterAllocations)
      .innerJoin(rosterPatients, eq(rosterAllocations.patientId, rosterPatients.id))
      .where(and(gte(rosterAllocations.date, range.fromIso), lte(rosterAllocations.date, range.toIso)));
    const allocations = allocRows.map((r) => ({ ...r.alloc, patientName: r.patientName }));

    const nurseIds = Array.from(new Set(allocations.map((a) => a.nurseId)));
    const nurseRows = nurseIds.length
      ? await db.select({ id: nurses.id, fullName: nurses.fullName }).from(nurses).where(inArray(nurses.id, nurseIds))
      : [];
    const nurseById = new Map(nurseRows.map((n) => [n.id, n.fullName]));

    // Staff totals: shifts + hours per nurse.
    const staffTotals = nurseIds
      .map((id) => {
        const mine = allocations.filter((a) => a.nurseId === id);
        const minutes = mine.reduce((sum, a) => sum + slotDurationMinutes(a.startTime, a.endTime), 0);
        return { nurseId: id, nurseName: nurseById.get(id) || "Unknown", shifts: mine.length, minutes, hours: Math.round((minutes / 60) * 10) / 10 };
      })
      .sort((a, b) => b.minutes - a.minutes);

    // Per-patient coverage / gaps.
    const days = daysBetween(range.fromIso, range.toIso);
    const coverage = patients.map((p) => {
      const slots = patientSlots(p);
      const activeDays = days.filter((d) => dateInEngagement(p, d));
      const totalSlots = activeDays.length * slots.length;
      const filled = allocations.filter((a) => a.patientId === p.id).length;
      return {
        patientId: p.id,
        patientName: p.name,
        totalSlots,
        filled,
        gaps: Math.max(0, totalSlots - filled),
      };
    });

    const conflicts = conflictsInSet(allocations).map((c) => ({
      ...c,
      nurseName: nurseById.get(c.nurseId) || "Unknown",
    }));

    res.json({
      from: range.fromIso,
      to: range.toIso,
      days,
      patients: patients.map((p) => ({ ...p, slots: patientSlots(p) })),
      allocations,
      nurses: nurseRows,
      staffTotals,
      coverage,
      conflicts,
    });
  });

  // Conflicts-only endpoint (mirrors the workbook's Double-Booking Alerts).
  app.get("/api/admin/rostering/conflicts", requireAdmin, async (req, res) => {
    const range = parseRange(req, 30);
    if (!range) return res.status(400).json({ message: "from/to must be YYYY-MM-DD, from <= to, max 100 days" });
    const allocRows = await db
      .select({ alloc: rosterAllocations, patientName: rosterPatients.name })
      .from(rosterAllocations)
      .innerJoin(rosterPatients, eq(rosterAllocations.patientId, rosterPatients.id))
      .where(and(gte(rosterAllocations.date, range.fromIso), lte(rosterAllocations.date, range.toIso)));
    const allocations = allocRows.map((r) => ({ ...r.alloc, patientName: r.patientName }));
    const nurseIds = Array.from(new Set(allocations.map((a) => a.nurseId)));
    const nurseRows = nurseIds.length
      ? await db.select({ id: nurses.id, fullName: nurses.fullName }).from(nurses).where(inArray(nurses.id, nurseIds))
      : [];
    const nurseById = new Map(nurseRows.map((n) => [n.id, n.fullName]));
    res.json({
      from: range.fromIso,
      to: range.toIso,
      conflicts: conflictsInSet(allocations).map((c) => ({ ...c, nurseName: nurseById.get(c.nurseId) || "Unknown" })),
    });
  });

  // ── Portal: read-only "My Shifts" ──────────────────────────────────────

  app.get("/api/portal/:token/my-shifts", validatePortalToken, async (req, res) => {
    const nurseId = (req as any).nurseId as string;
    const nurse = await storage.getCandidate(nurseId);
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    if (nurse.currentStage !== "completed" && nurse.graceAccessEnabled !== true) {
      return res.status(403).json({ message: "My Shifts is available once you've reached the Nurse stage." });
    }

    const rows = await db
      .select({ alloc: rosterAllocations, patientName: rosterPatients.name })
      .from(rosterAllocations)
      .innerJoin(rosterPatients, eq(rosterAllocations.patientId, rosterPatients.id))
      .where(eq(rosterAllocations.nurseId, nurseId));

    const shifts = rows
      .map(({ alloc, patientName }) => ({
        id: alloc.id,
        date: alloc.date,
        // Privacy: nurses see the patient's first name (or initials fallback),
        // never the full record.
        patient: patientName.split(/\s+/)[0] || initialsOf(patientName),
        slotLabel: alloc.slotLabel,
        startTime: alloc.startTime,
        endTime: alloc.endTime,
        minutes: slotDurationMinutes(alloc.startTime, alloc.endTime),
      }))
      .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));

    // Group by month with totals.
    const monthsMap = new Map<string, { month: string; shifts: typeof shifts; totalMinutes: number }>();
    for (const s of shifts) {
      const month = s.date.slice(0, 7);
      const g = monthsMap.get(month) ?? { month, shifts: [] as typeof shifts, totalMinutes: 0 };
      g.shifts.push(s);
      g.totalMinutes += s.minutes;
      monthsMap.set(month, g);
    }
    const months = Array.from(monthsMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((g) => ({ ...g, totalHours: Math.round((g.totalMinutes / 60) * 10) / 10 }));

    res.json({
      nurseId,
      today: todayIso(),
      months,
      totalShifts: shifts.length,
      totalMinutes: shifts.reduce((s, x) => s + x.minutes, 0),
    });
  });
}
