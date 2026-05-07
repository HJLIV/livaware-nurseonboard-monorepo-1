// Admin-managed policy library + nurse-facing acknowledgement endpoints.
//
// Admin endpoints (auth-protected) let an admin manage the master list of
// policies (title, body, version, active flag, ordering). Portal endpoints
// (token-gated) let a nurse list active policies along with their own
// acknowledgement status, and record a fresh acknowledgement.

import type { Express, Request } from "express";
import multer from "multer";
import path from "path";
import { db } from "../db";
import {
  policies,
  policyAcknowledgements,
  policyReadEvents,
  insertPolicySchema,
  type Policy,
  type PolicyAcknowledgement,
} from "@shared/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import {
  requireAdmin,
  requireSuperAdmin,
  validatePortalToken,
  isSuperAdmin,
} from "../middleware";
import { logAction } from "../services/audit";
import { extractPolicyFromFile, PolicyExtractionError } from "../policy-extractor";

const policyImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function agentFor(req: Request): string {
  return req.session?.username || "system";
}

interface PolicyForNurse {
  id: string;
  title: string;
  body: string | null;
  pdfUrl: string | null;
  version: string;
  requireAcknowledgement: boolean;
  sortOrder: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedVersion: string | null;
  needsReacknowledgement: boolean;
}

async function buildPolicyListForNurse(nurseId: string): Promise<{
  policies: PolicyForNurse[];
  totalRequired: number;
  outstanding: number;
}> {
  const active = await db
    .select()
    .from(policies)
    .where(eq(policies.isActive, true))
    .orderBy(asc(policies.sortOrder), asc(policies.title));

  const acks = await db
    .select()
    .from(policyAcknowledgements)
    .where(eq(policyAcknowledgements.nurseId, nurseId));

  // Latest ack per policy id wins.
  const latestAck = new Map<string, PolicyAcknowledgement>();
  for (const a of acks) {
    const prev = latestAck.get(a.policyId);
    if (!prev || (a.acknowledgedAt > prev.acknowledgedAt)) {
      latestAck.set(a.policyId, a);
    }
  }

  const list: PolicyForNurse[] = active.map((p) => {
    const ack = latestAck.get(p.id);
    const versionMatches = ack ? ack.policyVersion === p.version : false;
    return {
      id: p.id,
      title: p.title,
      body: p.body,
      pdfUrl: p.pdfUrl,
      version: p.version,
      requireAcknowledgement: p.requireAcknowledgement,
      sortOrder: p.sortOrder,
      acknowledged: !!ack && versionMatches,
      acknowledgedAt: ack?.acknowledgedAt?.toISOString() ?? null,
      acknowledgedVersion: ack?.policyVersion ?? null,
      needsReacknowledgement: !!ack && !versionMatches,
    };
  });

  const required = list.filter((p) => p.requireAcknowledgement);
  const outstanding = required.filter((p) => !p.acknowledged).length;

  return {
    policies: list,
    totalRequired: required.length,
    outstanding,
  };
}

export function registerPolicyRoutes(app: Express) {
  // ─── Admin: extract title/body from an uploaded .pdf or .docx ────
  // One-shot helper that populates the New/Edit Policy form fields.
  // The uploaded file is NOT stored — we just parse it in memory.
  app.post(
    "/api/admin/policies/extract",
    requireAdmin,
    (req, res, next) => {
      policyImportUpload.single("file")(req, res, (err: any) => {
        if (!err) return next();
        if (err?.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File too large. Maximum size is 10 MB." });
        }
        return res.status(400).json({ message: err?.message || "Upload failed" });
      });
    },
    async (req, res) => {
      try {
        const file = (req as any).file as Express.Multer.File | undefined;
        if (!file) return res.status(400).json({ message: "No file uploaded" });

        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== ".pdf" && ext !== ".docx") {
          return res.status(415).json({ message: "Unsupported file type. Please upload a .pdf or .docx file." });
        }

        const result = await extractPolicyFromFile(file.buffer, file.originalname, file.mimetype);
        res.json(result);
      } catch (err: any) {
        if (err instanceof PolicyExtractionError) {
          return res.status(err.status).json({ message: err.message });
        }
        console.error("[policies] extract failed:", err);
        res.status(500).json({ message: err?.message || "Failed to extract policy" });
      }
    },
  );

  // ─── Admin: list all policies (active + inactive) ────────────────
  app.get("/api/admin/policies", requireAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(policies)
        .orderBy(asc(policies.sortOrder), asc(policies.title));
      res.json(rows);
    } catch (err: any) {
      console.error("[policies] list failed:", err);
      res.status(500).json({ message: err?.message || "Failed to list policies" });
    }
  });

  // ─── Admin: create policy ────────────────────────────────────────
  app.post("/api/admin/policies", requireSuperAdmin, async (req, res) => {
    try {
      const parsed = insertPolicySchema.safeParse({
        ...req.body,
        createdBy: agentFor(req),
      });
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid policy", errors: parsed.error.errors });
      }
      // A policy with neither body text nor a PDF link would be unreadable
      // for nurses, so reject it up front.
      if (!parsed.data.body?.trim() && !parsed.data.pdfUrl?.trim()) {
        return res.status(400).json({ message: "Provide policy text or a PDF URL so nurses have something to read." });
      }
      const [created] = await db.insert(policies).values(parsed.data).returning();
      await logAction(null, "admin", "policy_created", agentFor(req), {
        policyId: created.id,
        title: created.title,
        version: created.version,
      });
      res.status(201).json(created);
    } catch (err: any) {
      console.error("[policies] create failed:", err);
      res.status(500).json({ message: err?.message || "Failed to create policy" });
    }
  });

  // ─── Admin: update policy ────────────────────────────────────────
  app.patch("/api/admin/policies/:id", requireSuperAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      const [existing] = await db.select().from(policies).where(eq(policies.id, id));
      if (!existing) return res.status(404).json({ message: "Policy not found" });

      const allowed: Partial<Policy> = {};
      const b = req.body || {};
      if (typeof b.title === "string") allowed.title = b.title;
      if (typeof b.body === "string" || b.body === null) allowed.body = b.body;
      if (typeof b.pdfUrl === "string" || b.pdfUrl === null) allowed.pdfUrl = b.pdfUrl;
      if (typeof b.version === "string") allowed.version = b.version;
      if (typeof b.isActive === "boolean") allowed.isActive = b.isActive;
      if (typeof b.requireAcknowledgement === "boolean") allowed.requireAcknowledgement = b.requireAcknowledgement;
      if (typeof b.sortOrder === "number") allowed.sortOrder = b.sortOrder;

      const finalBody = allowed.body !== undefined ? allowed.body : existing.body;
      const finalPdf = allowed.pdfUrl !== undefined ? allowed.pdfUrl : existing.pdfUrl;
      if (!finalBody?.trim() && !finalPdf?.trim()) {
        return res.status(400).json({ message: "Provide policy text or a PDF URL so nurses have something to read." });
      }

      const [updated] = await db
        .update(policies)
        .set({ ...allowed, updatedAt: new Date() })
        .where(eq(policies.id, id))
        .returning();

      await logAction(null, "admin", "policy_updated", agentFor(req), {
        policyId: id,
        changes: allowed,
        previousVersion: existing.version,
        newVersion: updated.version,
      });
      res.json(updated);
    } catch (err: any) {
      console.error("[policies] update failed:", err);
      res.status(500).json({ message: err?.message || "Failed to update policy" });
    }
  });

  // ─── Admin: delete policy ────────────────────────────────────────
  app.delete("/api/admin/policies/:id", requireSuperAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      const [existing] = await db.select().from(policies).where(eq(policies.id, id));
      if (!existing) return res.status(404).json({ message: "Policy not found" });

      // Acknowledgements and read-events reference this policy via FK.
      // Remove the dependent rows first so the delete is unambiguous from
      // the admin's perspective and doesn't violate FK constraints.
      await db.delete(policyReadEvents).where(eq(policyReadEvents.policyId, id));
      await db.delete(policyAcknowledgements).where(eq(policyAcknowledgements.policyId, id));
      await db.delete(policies).where(eq(policies.id, id));

      await logAction(null, "admin", "policy_deleted", agentFor(req), {
        policyId: id,
        title: existing.title,
        version: existing.version,
      });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[policies] delete failed:", err);
      res.status(500).json({ message: err?.message || "Failed to delete policy" });
    }
  });

  // ─── Admin: list acknowledgements (audit/reporting) ──────────────
  // Reading-behaviour fields (totalActiveSeconds / sessionCount /
  // scrolledToEnd / openedPdf) are only included for admins in the
  // stricter "policy read-behaviour" tier; everyone else just sees the
  // basic acknowledgement audit (who/when/version/IP).
  app.get("/api/admin/policies/:id/acknowledgements", requireAdmin, async (req, res) => {
    try {
      const rows = await db
        .select()
        .from(policyAcknowledgements)
        .where(eq(policyAcknowledgements.policyId, String(req.params.id)))
        .orderBy(desc(policyAcknowledgements.acknowledgedAt));
      const canViewBehaviour = isSuperAdmin(req);
      const sanitized = canViewBehaviour
        ? rows
        : rows.map(({ totalActiveSeconds: _t, sessionCount: _s, scrolledToEnd: _sc, openedPdf: _o, ...rest }) => rest);
      res.json(sanitized);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to load acknowledgements" });
    }
  });

  // ─── Admin: list acknowledgements for a nurse ────────────────────
  // Returns the per-nurse policy list with their latest ack + reading-
  // behaviour fields so the nurse-detail "Policies" view can show admins
  // exactly how each policy was read.
  app.get("/api/nurses/:id/policy-acknowledgements", requireAdmin, async (req, res) => {
    try {
      const nurseId = String(req.params.id);
      const summary = await buildPolicyListForNurse(nurseId);
      const acks = await db
        .select()
        .from(policyAcknowledgements)
        .where(eq(policyAcknowledgements.nurseId, nurseId));
      // Latest ack per policy id wins.
      const latestAck = new Map<string, typeof acks[number]>();
      for (const a of acks) {
        const prev = latestAck.get(a.policyId);
        if (!prev || a.acknowledgedAt > prev.acknowledgedAt) latestAck.set(a.policyId, a);
      }
      // Only super admins see the time-spent / scrolled / pdf-opened
      // columns; other admins still get the acknowledgement list, just
      // without those fields.
      const canViewBehaviour = isSuperAdmin(req);
      const enriched = summary.policies.map((p) => {
        const a = latestAck.get(p.id);
        return canViewBehaviour
          ? {
              ...p,
              totalActiveSeconds: a?.totalActiveSeconds ?? null,
              sessionCount: a?.sessionCount ?? null,
              scrolledToEnd: a?.scrolledToEnd ?? null,
              openedPdf: a?.openedPdf ?? null,
            }
          : p;
      });
      res.json({ ...summary, policies: enriched, canViewReadBehaviour: canViewBehaviour });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to load acknowledgements" });
    }
  });

  // ─── Portal: list policies + per-nurse status ────────────────────
  app.get("/api/portal/:token/policies", validatePortalToken, async (req, res) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const summary = await buildPolicyListForNurse(nurseId);
      res.json(summary);
    } catch (err: any) {
      console.error("[policies] portal list failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load policies" });
    }
  });

  // ─── Portal: ingest read-events (invisible tracking) ─────────────
  // Body: { events: [{ type: "session"|"pdf_open"|"scroll_end", durationMs?, sessionId?, occurredAt? }] }
  // Used by the portal page to record visible-time, scroll-to-end, and
  // pdf-open signals. The nurse never sees this fire — it's debounced and
  // sent on visibilitychange/pagehide.
  app.post("/api/portal/:token/policies/:id/read-events", validatePortalToken, async (req, res) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const policyId = String(req.params.id);
      const events = Array.isArray(req.body?.events) ? req.body.events : [];
      if (events.length === 0) return res.json({ ok: true, inserted: 0 });
      if (events.length > 200) return res.status(400).json({ message: "Too many events in batch" });

      const [policy] = await db.select().from(policies).where(eq(policies.id, policyId));
      if (!policy) return res.status(404).json({ message: "Policy not found" });

      const ALLOWED = new Set(["session", "pdf_open", "scroll_end"]);
      const rows = events
        .filter((e: any) => e && ALLOWED.has(e.type))
        .map((e: any) => {
          const rawMs = Number(e.durationMs ?? 0);
          // Cap a single session contribution at 1 hour to defend against
          // clock-skew or buggy clients inflating the total.
          const durationMs = Number.isFinite(rawMs)
            ? Math.max(0, Math.min(Math.round(rawMs), 60 * 60 * 1000))
            : 0;
          return {
            nurseId,
            policyId,
            policyVersion: policy.version,
            eventType: String(e.type),
            durationMs,
            sessionId: typeof e.sessionId === "string" ? e.sessionId.slice(0, 64) : null,
          };
        });
      if (rows.length === 0) return res.json({ ok: true, inserted: 0 });

      await db.insert(policyReadEvents).values(rows);
      res.json({ ok: true, inserted: rows.length });
    } catch (err: any) {
      console.error("[policies] read-events ingest failed:", err);
      res.status(500).json({ message: err?.message || "Failed to record read events" });
    }
  });

  // ─── Admin: per-policy reading-behaviour aggregate ───────────────
  // Super-admin only — regular admins get a 403 here even though they
  // can still see the basic acknowledgement audit list above.
  app.get("/api/admin/policies/:id/read-summary", requireSuperAdmin, async (req, res) => {
    try {
      const policyId = String(req.params.id);
      const acks = await db
        .select()
        .from(policyAcknowledgements)
        .where(eq(policyAcknowledgements.policyId, policyId));

      const SKIM_THRESHOLD_SECONDS = 10;
      // Only count acks that have a recorded read time (events were ingested).
      // Acks created before tracking shipped will have totalActiveSeconds = 0
      // AND sessionCount = 0; we exclude those from the median to avoid
      // dragging the number down with "—" rows.
      const tracked = acks.filter((a) => a.sessionCount > 0 || a.totalActiveSeconds > 0);
      const seconds = tracked.map((a) => a.totalActiveSeconds).sort((x, y) => x - y);
      const median = seconds.length === 0
        ? null
        : seconds.length % 2 === 1
          ? seconds[(seconds.length - 1) / 2]
          : Math.round((seconds[seconds.length / 2 - 1] + seconds[seconds.length / 2]) / 2);
      const skimmedCount = tracked.filter((a) => a.totalActiveSeconds < SKIM_THRESHOLD_SECONDS).length;
      const skimmedPct = tracked.length === 0 ? null : Math.round((skimmedCount / tracked.length) * 1000) / 10;

      res.json({
        totalAcknowledgements: acks.length,
        trackedAcknowledgements: tracked.length,
        medianReadSeconds: median,
        skimmedCount,
        skimmedPct,
        skimThresholdSeconds: SKIM_THRESHOLD_SECONDS,
      });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to load read summary" });
    }
  });

  // ─── Portal: acknowledge a policy ────────────────────────────────
  app.post("/api/portal/:token/policies/:id/acknowledge", validatePortalToken, async (req, res) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const policyId = String(req.params.id);

      const [policy] = await db.select().from(policies).where(eq(policies.id, policyId));
      if (!policy) return res.status(404).json({ message: "Policy not found" });
      if (!policy.isActive) return res.status(400).json({ message: "Policy is no longer active" });

      // Drain any read-events the client sent in the same request body so
      // late-arriving signals (e.g. final session before clicking) make it
      // into the rolled-up summary.
      const flushEvents = Array.isArray(req.body?.events) ? req.body.events : [];
      if (flushEvents.length > 0 && flushEvents.length <= 200) {
        const ALLOWED = new Set(["session", "pdf_open", "scroll_end"]);
        const rows = flushEvents
          .filter((e: any) => e && ALLOWED.has(e.type))
          .map((e: any) => {
            const rawMs = Number(e.durationMs ?? 0);
            const durationMs = Number.isFinite(rawMs)
              ? Math.max(0, Math.min(Math.round(rawMs), 60 * 60 * 1000))
              : 0;
            return {
              nurseId,
              policyId,
              policyVersion: policy.version,
              eventType: String(e.type),
              durationMs,
              sessionId: typeof e.sessionId === "string" ? e.sessionId.slice(0, 64) : null,
            };
          });
        if (rows.length > 0) await db.insert(policyReadEvents).values(rows);
      }

      // Roll up read events for (nurse, policy, version) into the summary
      // fields stored on the acknowledgement row.
      const events = await db
        .select()
        .from(policyReadEvents)
        .where(and(
          eq(policyReadEvents.nurseId, nurseId),
          eq(policyReadEvents.policyId, policyId),
          eq(policyReadEvents.policyVersion, policy.version),
        ));
      let totalMs = 0;
      // Count distinct session runs by sessionId. Long uninterrupted reads
      // are sliced into multiple "session" rows that all share one
      // sessionId, so this represents true open/close runs rather than
      // slice rows. Sessions without a sessionId (defensive fallback) are
      // each counted as their own session.
      const sessionIds = new Set<string>();
      let anonSessionRows = 0;
      let scrolledToEnd = false;
      let openedPdf = false;
      for (const ev of events) {
        if (ev.eventType === "session") {
          totalMs += ev.durationMs || 0;
          if (ev.sessionId) sessionIds.add(ev.sessionId);
          else anonSessionRows += 1;
        } else if (ev.eventType === "scroll_end") {
          scrolledToEnd = true;
        } else if (ev.eventType === "pdf_open") {
          openedPdf = true;
        }
      }
      const sessionCount = sessionIds.size + anonSessionRows;
      const totalActiveSeconds = Math.round(totalMs / 1000);

      // Idempotent: if the nurse already acked this exact version, refresh
      // the rolled-up summary on the existing row (so a later "scroll to
      // end" still gets reflected) and return it.
      const [existing] = await db
        .select()
        .from(policyAcknowledgements)
        .where(and(
          eq(policyAcknowledgements.nurseId, nurseId),
          eq(policyAcknowledgements.policyId, policyId),
          eq(policyAcknowledgements.policyVersion, policy.version),
        ));
      if (existing) {
        const [refreshed] = await db
          .update(policyAcknowledgements)
          .set({ totalActiveSeconds, sessionCount, scrolledToEnd, openedPdf })
          .where(eq(policyAcknowledgements.id, existing.id))
          .returning();
        return res.json({ ok: true, acknowledgement: refreshed, alreadyAcknowledged: true });
      }

      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
        || req.socket.remoteAddress
        || null;
      const userAgent = (req.headers["user-agent"] as string) || null;

      const [created] = await db
        .insert(policyAcknowledgements)
        .values({
          nurseId,
          policyId,
          policyVersion: policy.version,
          ipAddress,
          userAgent,
          totalActiveSeconds,
          sessionCount,
          scrolledToEnd,
          openedPdf,
        })
        .returning();

      await logAction(nurseId, "portal", "policy_acknowledged", "nurse_portal", {
        policyId,
        title: policy.title,
        version: policy.version,
      });

      res.status(201).json({ ok: true, acknowledgement: created });
    } catch (err: any) {
      console.error("[policies] acknowledge failed:", err);
      res.status(500).json({ message: err?.message || "Failed to acknowledge policy" });
    }
  });
}
