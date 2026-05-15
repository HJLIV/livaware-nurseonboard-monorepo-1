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
  nurses,
  type Policy,
  type PolicyAcknowledgement,
} from "@shared/schema";
import { eq, and, or, desc, asc, sql, isNull, ne, inArray } from "drizzle-orm";
import {
  requireAdmin,
  requireSuperAdmin,
  validatePortalToken,
  portalAgent,
  requireNurseStageCompleted,
  isSuperAdmin,
} from "../middleware";
import { logAction } from "../services/audit";
import { extractPolicyFromFile, PolicyExtractionError } from "../policy-extractor";
import { cleanupPolicyMarkdown } from "../policy-ai-cleanup";

const policyImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function agentFor(req: Request): string {
  const u = req.session?.username;
  const r = req.session?.role;
  if (!u) return "system";
  return r ? `${u} (${r})` : u;
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
  // Stable identifiers used by the portal to group induction items
  // (Handbook Part / SOP / Appendix). Slug-based grouping survives
  // admin edits to the title, unlike text matching.
  slug: string | null;
  category: string | null;
}

async function buildPolicyListForNurse(
  nurseId: string,
  options: { category?: string | null } = {},
): Promise<{
  policies: PolicyForNurse[];
  totalRequired: number;
  outstanding: number;
}> {
  // When category is omitted (default) we exclude induction-tagged rows
  // so the legacy /portal/policies surface keeps only admin-managed
  // policies. Pass `category: "induction"` to fetch the induction set.
  const categoryFilter = options.category === undefined
    ? or(isNull(policies.category), ne(policies.category, "induction"))
    : options.category === null
      ? isNull(policies.category)
      : eq(policies.category, options.category);

  const active = await db
    .select()
    .from(policies)
    .where(and(eq(policies.isActive, true), categoryFilter))
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
      slug: p.slug ?? null,
      category: p.category ?? null,
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
        const cleanup = await cleanupPolicyMarkdown(result.body);
        res.json({
          title: result.title,
          body: cleanup.body,
          aiCleaned: cleanup.aiCleaned,
          aiCleanupReason: cleanup.aiCleaned ? undefined : cleanup.reason,
        });
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
  // Hides category="induction" rows by default — those are managed by
  // the induction seeder and surfaced on a separate admin view.
  app.get("/api/admin/policies", requireAdmin, async (req, res) => {
    try {
      const includeInduction = req.query.includeInduction === "1";
      const rows = await db
        .select()
        .from(policies)
        .where(includeInduction
          ? sql`true`
          : or(isNull(policies.category), ne(policies.category, "induction")))
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
  app.get("/api/portal/:token/policies", validatePortalToken, requireNurseStageCompleted, async (req, res) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const summary = await buildPolicyListForNurse(nurseId);
      res.json(summary);
    } catch (err: any) {
      console.error("[policies] portal list failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load policies" });
    }
  });

  // ─── Portal: list induction items + per-nurse status (task 114) ──
  // Same shape as /policies, but only returns the 21 Staff-Handbook
  // items. Nurses use this to read & acknowledge each section before
  // the Skills Arcade unlocks for them.
  app.get("/api/portal/:token/induction", validatePortalToken, requireNurseStageCompleted, async (req, res) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const summary = await buildPolicyListForNurse(nurseId, { category: "induction" });
      // Attach a `group` tag (part / sop / appendix) so the portal can
      // render the items grouped without an extra round-trip. We match
      // on the stable `slug` column rather than the human-editable
      // title so renaming an induction section in the admin UI never
      // breaks the grouping or the gating semantics.
      const { getInductionItems } = await import("../induction-content");
      const items = getInductionItems();
      const groupBySlug = new Map(items.map((i) => [i.slug, i.group]));
      const enriched = summary.policies.map((p) => {
        const itemGroup = p.slug ? groupBySlug.get(p.slug) ?? null : null;
        return { ...p, group: itemGroup };
      });
      res.json({ ...summary, policies: enriched });
    } catch (err: any) {
      console.error("[policies] portal induction list failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load induction items" });
    }
  });

  // ─── Admin: induction items + per-nurse acknowledgement matrix ───
  // Used by the per-nurse admin panel to show the 21-row checklist
  // with time-tracking columns (super-admin only for the read-
  // behaviour fields, mirroring the policies endpoint).
  app.get("/api/admin/induction/items", requireAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(policies)
        .where(eq(policies.category, "induction"))
        .orderBy(asc(policies.sortOrder), asc(policies.title));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to load induction items" });
    }
  });

  app.get("/api/nurses/:id/induction-progress", requireAdmin, async (req, res) => {
    // Per task #114: admins AND super-admins both need full visibility
    // of induction engagement (active time, sessions, scrolled, last
    // read). Nurses never see these — the portal endpoints already omit
    // them. We keep the `canViewReadBehaviour` flag in the response for
    // backward compatibility with the panel, but always set it true on
    // this admin-only route.
    try {
      const nurseId = String(req.params.id);
      const summary = await buildPolicyListForNurse(nurseId, { category: "induction" });
      const acks = await db
        .select()
        .from(policyAcknowledgements)
        .where(eq(policyAcknowledgements.nurseId, nurseId));
      const latestAck = new Map<string, typeof acks[number]>();
      for (const a of acks) {
        const prev = latestAck.get(a.policyId);
        if (!prev || a.acknowledgedAt > prev.acknowledgedAt) latestAck.set(a.policyId, a);
      }
      // Admins + super-admins both get the metrics on this admin-only
      // route. The flag is kept in the response purely for the panel's
      // existing rendering branch.
      const canViewBehaviour = true;

      // Pull the longest single-session duration + most-recent read
      // timestamp from the raw events table for each policy. Cheap
      // single round-trip (one row per policy).
      const inductionPolicyIds = summary.policies.map((p) => p.id);
      let perPolicyExtras: Record<string, { longestSessionSeconds: number; lastReadAt: string | null }> = {};
      if (canViewBehaviour && inductionPolicyIds.length > 0) {
        const rows = await db
          .select({
            policyId: policyReadEvents.policyId,
            longestMs: sql<number>`coalesce(max(${policyReadEvents.durationMs}), 0)`,
            lastAt: sql<Date | null>`max(${policyReadEvents.occurredAt})`,
          })
          .from(policyReadEvents)
          .where(and(
            eq(policyReadEvents.nurseId, nurseId),
            inArray(policyReadEvents.policyId, inductionPolicyIds),
          ))
          .groupBy(policyReadEvents.policyId);
        for (const r of rows) {
          perPolicyExtras[r.policyId] = {
            longestSessionSeconds: Math.floor(Number(r.longestMs ?? 0) / 1000),
            lastReadAt: r.lastAt ? new Date(r.lastAt as any).toISOString() : null,
          };
        }
      }

      const enriched = summary.policies.map((p) => {
        const a = latestAck.get(p.id);
        const extras = perPolicyExtras[p.id];
        return canViewBehaviour
          ? {
              ...p,
              totalActiveSeconds: a?.totalActiveSeconds ?? null,
              sessionCount: a?.sessionCount ?? null,
              scrolledToEnd: a?.scrolledToEnd ?? null,
              openedPdf: a?.openedPdf ?? null,
              longestSessionSeconds: extras?.longestSessionSeconds ?? null,
              lastReadAt: extras?.lastReadAt ?? a?.acknowledgedAt?.toISOString() ?? null,
            }
          : p;
      });
      res.json({ ...summary, policies: enriched, canViewReadBehaviour: canViewBehaviour });
    } catch (err: any) {
      res.status(500).json({ message: err?.message || "Failed to load induction progress" });
    }
  });

  // ─── Super-admin: aggregate induction engagement (task 114) ──────
  // Returns one row per nurse: total active seconds across all 21
  // induction items, last-read timestamp, % acknowledged, and a
  // "short-ack" flag (acknowledged with < 30s active time on the
  // section, used by the dashboard to flag potentially rushed reads).
  app.get("/api/super-admin/induction/engagement", requireSuperAdmin, async (_req, res) => {
    try {
      const SHORT_ACK_THRESHOLD_SECONDS = 30;
      const inductionRows = await db
        .select({ id: policies.id, version: policies.version })
        .from(policies)
        .where(and(eq(policies.category, "induction"), eq(policies.isActive, true)));
      const totalRequired = inductionRows.length;
      const policyIds = inductionRows.map((p) => p.id);

      const allNurses = await db.select({ id: nurses.id, fullName: nurses.fullName, email: nurses.email }).from(nurses);

      if (policyIds.length === 0 || allNurses.length === 0) {
        return res.json({ totalRequired, shortAckThresholdSeconds: SHORT_ACK_THRESHOLD_SECONDS, nurses: [] });
      }

      const acks = await db
        .select()
        .from(policyAcknowledgements)
        .where(inArray(policyAcknowledgements.policyId, policyIds));
      // Latest ack per (nurse, policy)
      const latestAckByNurse = new Map<string, Map<string, typeof acks[number]>>();
      for (const a of acks) {
        const m = latestAckByNurse.get(a.nurseId) ?? new Map();
        const prev = m.get(a.policyId);
        if (!prev || a.acknowledgedAt > prev.acknowledgedAt) m.set(a.policyId, a);
        latestAckByNurse.set(a.nurseId, m);
      }

      const summaryRows = allNurses.map((n) => {
        const m = latestAckByNurse.get(n.id) ?? new Map();
        let totalActiveSeconds = 0;
        let acknowledgedCount = 0;
        let shortAckCount = 0;
        let lastReadAt: Date | null = null;
        for (const policy of inductionRows) {
          const a = m.get(policy.id);
          if (!a) continue;
          if (a.policyVersion === policy.version) {
            acknowledgedCount += 1;
            if ((a.totalActiveSeconds ?? 0) < SHORT_ACK_THRESHOLD_SECONDS && a.userAgent !== "induction_seed:legacy_induction_policies") {
              shortAckCount += 1;
            }
          }
          totalActiveSeconds += a.totalActiveSeconds ?? 0;
          if (!lastReadAt || a.acknowledgedAt > lastReadAt) lastReadAt = a.acknowledgedAt;
        }
        return {
          nurseId: n.id,
          fullName: n.fullName,
          email: n.email,
          acknowledgedCount,
          totalRequired,
          completionPct: totalRequired === 0 ? 0 : Math.round((acknowledgedCount / totalRequired) * 100),
          totalActiveSeconds,
          shortAckCount,
          lastReadAt: lastReadAt ? (lastReadAt as Date).toISOString() : null,
        };
      });

      // Sort: in-progress (least complete) first, then by last activity.
      summaryRows.sort((a, b) => {
        if (a.completionPct !== b.completionPct) return a.completionPct - b.completionPct;
        const at = a.lastReadAt ? Date.parse(a.lastReadAt) : 0;
        const bt = b.lastReadAt ? Date.parse(b.lastReadAt) : 0;
        return bt - at;
      });

      res.json({ totalRequired, shortAckThresholdSeconds: SHORT_ACK_THRESHOLD_SECONDS, nurses: summaryRows });
    } catch (err: any) {
      console.error("[policies] super-admin induction engagement failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load induction engagement" });
    }
  });

  // ─── Super-admin: force-reseed induction items from bundled MD ───
  // Default seeder is insert-only (preserves admin edits). This
  // endpoint opts in to overwriting drifted rows back to the bundled
  // handbook content + bumping HANDBOOK_VERSION when it advanced.
  app.post("/api/admin/induction/reseed", requireSuperAdmin, async (req, res) => {
    try {
      const { seedInductionItems } = await import("../induction-seed");
      const result = await seedInductionItems({ force: true });
      // No nurseId for this audit — it's a system-wide event.
      res.json({ ok: true, ...result });
      void req;
    } catch (err: any) {
      console.error("[induction] force reseed failed:", err);
      res.status(500).json({ message: err?.message || "Failed to reseed induction" });
    }
  });

  // ─── Portal: ingest read-events (invisible tracking) ─────────────
  // Body: { events: [{ type: "session"|"pdf_open"|"scroll_end", durationMs?, sessionId?, occurredAt? }] }
  // Used by the portal page to record visible-time, scroll-to-end, and
  // pdf-open signals. The nurse never sees this fire — it's debounced and
  // sent on visibilitychange/pagehide.
  app.post("/api/portal/:token/policies/:id/read-events", validatePortalToken, requireNurseStageCompleted, async (req, res) => {
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
  app.post("/api/portal/:token/policies/:id/acknowledge", validatePortalToken, requireNurseStageCompleted, async (req, res) => {
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
        await db
          .update(policyAcknowledgements)
          .set({ totalActiveSeconds, sessionCount, scrolledToEnd, openedPdf })
          .where(eq(policyAcknowledgements.id, existing.id));
        // Strict admin-only telemetry: never echo read-behaviour
        // counters (totalActiveSeconds / sessionCount / scrolledToEnd /
        // openedPdf) back on the nurse-facing response.
        return res.json({
          ok: true,
          alreadyAcknowledged: true,
          policyId,
          policyVersion: policy.version,
        });
      }

      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
        || req.socket.remoteAddress
        || null;
      const userAgent = (req.headers["user-agent"] as string) || null;

      await db
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
        });

      await logAction(nurseId, "portal", "policy_acknowledged", portalAgent(req), {
        policyId,
        title: policy.title,
        version: policy.version,
      });

      // Strict admin-only telemetry: never echo read-behaviour counters
      // back on the nurse-facing response.
      res.status(201).json({
        ok: true,
        alreadyAcknowledged: false,
        policyId,
        policyVersion: policy.version,
      });
    } catch (err: any) {
      console.error("[policies] acknowledge failed:", err);
      res.status(500).json({ message: err?.message || "Failed to acknowledge policy" });
    }
  });
}
