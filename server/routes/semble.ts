// Semble practice-management admin routes.
//
// Mounted under /api/admin/* so it inherits the global requireAdmin guard
// from routes.ts. Patient search + booking-option reads stay admin-level;
// saving booking defaults and testing the connection are super-admin (they
// shape what gets written to the practice's live Semble diary).
//
// There is no portal surface by design: nurses never interact with Semble
// directly — they only ever see their own shifts via /portal/my-shifts.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { and, eq, gte, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "../db";
import { rosterPatients, rosterAllocations, nurses, SEMBLE_PUSH_ENABLED } from "@shared/schema";
import { storage } from "../storage";
import { requireSuperAdmin } from "../middleware";
import {
  isSembleConfigured,
  testConnection,
  searchPatients,
  getBookingOptions,
  listUsers,
  SembleNotConfiguredError,
  SembleApiError,
} from "../semble/client";
import {
  SEMBLE_BOOKING_SETTINGS_KEY,
  getSembleBookingSettings,
  settingsComplete,
  pushAllocationBooking,
} from "../semble/service";

function actorName(req: Request): string {
  return (req.session as any)?.username || "admin";
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function spanDays(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / 86400000,
  ) + 1;
}

function handleSembleError(res: Response, err: unknown): void {
  if (err instanceof SembleNotConfiguredError) {
    res.status(503).json({ error: "semble_not_configured", message: err.message });
    return;
  }
  if (err instanceof SembleApiError) {
    res.status(502).json({ error: "semble_api_error", message: err.message, status: err.status, body: err.body });
    return;
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error("[semble] route error:", err);
  res.status(500).json({ error: "semble_error", message });
}

const settingsSchema = z.object({
  locationId: z.string().min(1).max(120).nullable(),
  locationName: z.string().max(200).nullable(),
  bookingTypeId: z.string().min(1).max(120).nullable(),
  bookingTypeName: z.string().max(200).nullable(),
  doctorId: z.string().min(1).max(120).nullable(),
  doctorName: z.string().max(200).nullable(),
  timezone: z.string().max(64).nullable(),
});

export function registerSembleRoutes(app: Express): void {
  // --- Status (admin) -----------------------------------------------------
  app.get("/api/admin/semble/status", async (_req: Request, res: Response) => {
    try {
      const settings = await getSembleBookingSettings();
      const linked = await db
        .select({ id: rosterPatients.id })
        .from(rosterPatients)
        .where(isNotNull(rosterPatients.sembleId));
      const linkedNurses = await db
        .select({ id: nurses.id })
        .from(nurses)
        .where(isNotNull(nurses.sembleUserId));
      res.json({
        configured: isSembleConfigured(),
        settings,
        settingsComplete: settingsComplete(settings),
        linkedPatientCount: linked.length,
        linkedNurseCount: linkedNurses.length,
      });
    } catch (err) {
      handleSembleError(res, err);
    }
  });

  // --- Test connection (super-admin) --------------------------------------
  app.post("/api/admin/semble/test-connection", requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
      const practice = await testConnection();
      res.json({ ok: true, practice });
    } catch (err) {
      handleSembleError(res, err);
    }
  });

  // --- Patient search (admin) ----------------------------------------------
  app.get("/api/admin/semble/patients", async (req: Request, res: Response) => {
    try {
      const search = String(req.query.search || "").trim();
      if (search.length < 2) {
        return res.status(400).json({ message: "search must be at least 2 characters" });
      }
      const result = await searchPatients(search);
      res.json(result);
    } catch (err) {
      handleSembleError(res, err);
    }
  });

  // --- Booking options (admin) ---------------------------------------------
  app.get("/api/admin/semble/booking-options", async (_req: Request, res: Response) => {
    try {
      res.json(await getBookingOptions());
    } catch (err) {
      handleSembleError(res, err);
    }
  });

  // --- Semble users (admin) --------------------------------------------------
  // Active Semble user accounts, used to match each platform nurse to their
  // own Semble account so bookings land under the actual nurse.
  app.get("/api/admin/semble/users", async (_req: Request, res: Response) => {
    try {
      res.json({ users: await listUsers() });
    } catch (err) {
      handleSembleError(res, err);
    }
  });

  // --- Nurse ↔ Semble user link (admin) --------------------------------------
  // Local write only (no Semble call): sets or clears nurses.sembleUserId.
  const nurseLinkSchema = z.object({
    sembleUserId: z.string().min(1).max(120).nullable(),
    sembleUserName: z.string().max(200).nullable().optional(),
  });

  app.put("/api/admin/semble/nurse-link/:nurseId", async (req: Request, res: Response) => {
    try {
      const parsed = nurseLinkSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const { nurseId } = req.params;
      const [nurse] = await db.select({ id: nurses.id, fullName: nurses.fullName }).from(nurses).where(eq(nurses.id, nurseId));
      if (!nurse) return res.status(404).json({ message: "Nurse not found" });

      const sembleUserId = parsed.data.sembleUserId;
      const sembleUserName = sembleUserId ? (parsed.data.sembleUserName ?? null) : null;
      // One Semble account maps to at most one nurse: linking here steals the
      // link from any other nurse that currently holds this Semble user.
      if (sembleUserId) {
        await db.update(nurses)
          .set({ sembleUserId: null, sembleUserName: null })
          .where(eq(nurses.sembleUserId, sembleUserId));
      }
      await db.update(nurses).set({ sembleUserId, sembleUserName }).where(eq(nurses.id, nurseId));
      await storage.createAuditLog({
        nurseId,
        module: "semble",
        action: sembleUserId ? "nurse_linked" : "nurse_unlinked",
        agentName: actorName(req),
        detail: { sembleUserId, sembleUserName },
      });
      res.json({ nurseId, sembleUserId, sembleUserName });
    } catch (err) {
      handleSembleError(res, err);
    }
  });

  // --- Auto-match nurses to Semble users (admin) ------------------------------
  // Matches unlinked nurses to unclaimed Semble users by email first
  // (case-insensitive), then by exact full name. Never overwrites an
  // existing link and never links two nurses to the same Semble user.
  app.post("/api/admin/semble/auto-match-nurses", async (req: Request, res: Response) => {
    try {
      const sembleUsers = await listUsers();
      const allNurses = await db
        .select({ id: nurses.id, fullName: nurses.fullName, email: nurses.email, sembleUserId: nurses.sembleUserId })
        .from(nurses);

      const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
      const claimed = new Set(allNurses.map((n) => n.sembleUserId).filter(Boolean) as string[]);
      // Ambiguous (duplicate) keys are dropped entirely — never guess
      // between two Semble users sharing an email or a full name.
      const buildUnique = (key: (u: typeof sembleUsers[number]) => string) => {
        const map = new Map<string, typeof sembleUsers[number]>();
        const dupes = new Set<string>();
        for (const u of sembleUsers) {
          const k = key(u);
          if (!k || dupes.has(k)) continue;
          if (map.has(k)) {
            map.delete(k);
            dupes.add(k);
          } else {
            map.set(k, u);
          }
        }
        return map;
      };
      const byEmail = buildUnique((u) => norm(u.email));
      const byName = buildUnique((u) => norm(u.fullName));

      const actor = actorName(req);
      const matched: Array<{ nurseId: string; nurseName: string; sembleUserId: string; sembleUserName: string | null; matchedBy: "email" | "name" }> = [];
      for (const nurse of allNurses) {
        if (nurse.sembleUserId) continue;
        const emailHit = byEmail.get(norm(nurse.email));
        const nameHit = byName.get(norm(nurse.fullName));
        const hit = emailHit && !claimed.has(emailHit.id) ? emailHit
          : nameHit && !claimed.has(nameHit.id) ? nameHit
          : null;
        if (!hit) continue;
        claimed.add(hit.id);
        await db.update(nurses).set({ sembleUserId: hit.id, sembleUserName: hit.fullName }).where(eq(nurses.id, nurse.id));
        await storage.createAuditLog({
          nurseId: nurse.id,
          module: "semble",
          action: "nurse_linked",
          agentName: actor,
          detail: { sembleUserId: hit.id, sembleUserName: hit.fullName, auto: true, matchedBy: emailHit === hit ? "email" : "name" },
        });
        matched.push({
          nurseId: nurse.id,
          nurseName: nurse.fullName,
          sembleUserId: hit.id,
          sembleUserName: hit.fullName,
          matchedBy: emailHit === hit ? "email" : "name",
        });
      }

      const alreadyLinked = allNurses.filter((n) => n.sembleUserId).length;
      await storage.createAuditLog({
        module: "semble",
        action: "nurse_auto_match_run",
        agentName: actor,
        detail: { matched: matched.length, alreadyLinked, sembleUsers: sembleUsers.length },
      });
      res.json({ matched, alreadyLinked, sembleUserCount: sembleUsers.length });
    } catch (err) {
      handleSembleError(res, err);
    }
  });

  // --- Pending bookings (admin) --------------------------------------------
  // Lists roster allocations for Semble-linked, active patients in a date
  // range, with their sync status: "pending" (never pushed), "failed"
  // (last push errored) or "booked" (booking exists in Semble). Feeds the
  // confirm-and-push dialog.
  app.get("/api/admin/semble/pending-bookings", async (req: Request, res: Response) => {
    try {
      const from = String(req.query.from || "");
      const to = String(req.query.to || "");
      const patientId = req.query.patientId ? String(req.query.patientId) : null;
      if (!ISO_DATE_RE.test(from) || !ISO_DATE_RE.test(to) || from > to || spanDays(from, to) > 100) {
        return res.status(400).json({ message: "from/to must be YYYY-MM-DD, from <= to, max 100 days" });
      }

      const rows = await db
        .select({
          alloc: rosterAllocations,
          patientName: rosterPatients.name,
          nurseName: nurses.fullName,
          nurseSembleUserId: nurses.sembleUserId,
          nurseSembleUserName: nurses.sembleUserName,
        })
        .from(rosterAllocations)
        .innerJoin(rosterPatients, eq(rosterAllocations.patientId, rosterPatients.id))
        .innerJoin(nurses, eq(rosterAllocations.nurseId, nurses.id))
        .where(and(
          isNotNull(rosterPatients.sembleId),
          eq(rosterPatients.active, true),
          gte(rosterAllocations.date, from),
          lte(rosterAllocations.date, to),
          ...(patientId ? [eq(rosterAllocations.patientId, patientId)] : []),
        ));

      const items = rows
        .map(({ alloc, patientName, nurseName, nurseSembleUserId, nurseSembleUserName }) => ({
          allocationId: alloc.id,
          patientId: alloc.patientId,
          patientName,
          nurseId: alloc.nurseId,
          nurseName,
          // Which Semble account the booking will be created under.
          nurseLinked: !!nurseSembleUserId,
          bookedAsName: nurseSembleUserName,
          date: alloc.date,
          slotKey: alloc.slotKey,
          slotLabel: alloc.slotLabel,
          startTime: alloc.startTime,
          endTime: alloc.endTime,
          status: alloc.sembleBookingId ? "booked" as const
            : alloc.sembleBookingError ? "failed" as const
            : "pending" as const,
          sembleBookingId: alloc.sembleBookingId,
          error: alloc.sembleBookingError,
        }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.patientName.localeCompare(b.patientName));

      const counts = { pending: 0, failed: 0, booked: 0 };
      for (const it of items) counts[it.status]++;

      const settings = await getSembleBookingSettings();
      res.json({
        from,
        to,
        configured: isSembleConfigured(),
        settingsComplete: settingsComplete(settings),
        items,
        counts,
      });
    } catch (err) {
      handleSembleError(res, err);
    }
  });

  // --- Confirm & push bookings (admin) ---------------------------------------
  // Pushes the selected allocations to Semble as bookings, sequentially, and
  // returns a per-allocation result so the UI can show exactly which shifts
  // were booked and which failed. Never partially aborts: every id gets a
  // result row.
  const pushSchema = z.object({
    allocationIds: z.array(z.string().min(1)).min(1).max(200),
  });

  app.post("/api/admin/semble/push-bookings", async (req: Request, res: Response) => {
    try {
      if (!SEMBLE_PUSH_ENABLED) {
        return res.status(503).json({
          error: "semble_push_disabled",
          message: "Pushing bookings to Semble is temporarily disabled",
        });
      }
      if (!isSembleConfigured()) {
        return res.status(503).json({ error: "semble_not_configured", message: "SEMBLE_API_TOKEN is not set" });
      }
      const settings = await getSembleBookingSettings();
      if (!settingsComplete(settings)) {
        return res.status(409).json({
          error: "semble_settings_incomplete",
          message: "Booking defaults (location / booking type / clinician) must be saved in Settings before pushing bookings",
        });
      }
      const parsed = pushSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

      const actor = actorName(req);
      const ids = Array.from(new Set(parsed.data.allocationIds));
      const results: Array<{
        allocationId: string;
        status: "created" | "failed" | "skipped";
        bookingId?: string;
        error?: string;
        skippedReason?: string;
      }> = [];

      for (const allocationId of ids) {
        const r = await pushAllocationBooking(allocationId, actor);
        if (r.pushed) {
          results.push({ allocationId, status: "created", bookingId: r.bookingId });
        } else if (r.skippedReason) {
          results.push({ allocationId, status: "skipped", skippedReason: r.skippedReason });
        } else {
          results.push({ allocationId, status: "failed", error: r.error || "Unknown error" });
        }
      }

      const summary = {
        requested: ids.length,
        pushed: results.filter((r) => r.status === "created").length,
        failed: results.filter((r) => r.status === "failed").length,
        skipped: results.filter((r) => r.status === "skipped").length,
      };
      await storage.createAuditLog({
        module: "semble",
        action: "booking_push_run",
        agentName: actor,
        detail: summary,
      });
      res.json({ results, summary });
    } catch (err) {
      handleSembleError(res, err);
    }
  });

  // --- Booking defaults (super-admin write) --------------------------------
  app.put("/api/admin/semble/settings", requireSuperAdmin, async (req: Request, res: Response) => {
    try {
      const parsed = settingsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      await storage.setAppSetting(SEMBLE_BOOKING_SETTINGS_KEY, parsed.data, actorName(req));
      const settings = await getSembleBookingSettings();
      await storage.createAuditLog({
        module: "semble",
        action: "config_updated",
        agentName: actorName(req),
        detail: {
          locationId: settings.locationId,
          bookingTypeId: settings.bookingTypeId,
          doctorId: settings.doctorId,
          settingsComplete: settingsComplete(settings),
        },
      });
      res.json({ settings, settingsComplete: settingsComplete(settings) });
    } catch (err) {
      handleSembleError(res, err);
    }
  });
}
