// Super-admin-only endpoints powering the Activity Dashboard.
//
// Source of truth is the existing audit_logs table — no new schema. We
// expose three flavours: a paged feed (with module/action/agent/text
// filters), a per-actor leaderboard, and a single-actor drill-down.

import type { Express, Request } from "express";
import { db } from "../db";
import { auditLogs } from "@shared/schema";
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { requireSuperAdmin } from "../middleware";

type AuditModule = "preboard" | "onboard" | "skills_arcade" | "admin" | "portal" | "system";
const VALID_MODULES: ReadonlySet<AuditModule> = new Set<AuditModule>([
  "preboard",
  "onboard",
  "skills_arcade",
  "admin",
  "portal",
  "system",
]);
function isAuditModule(value: string): value is AuditModule {
  return (VALID_MODULES as ReadonlySet<string>).has(value);
}

function buildFilters(req: Request): SQL[] {
  const where: SQL[] = [];
  const module = typeof req.query.module === "string" ? req.query.module : "";
  const action = typeof req.query.action === "string" ? req.query.action : "";
  const agent = typeof req.query.agent === "string" ? req.query.agent : "";
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const since = typeof req.query.since === "string" ? req.query.since : "";
  const until = typeof req.query.until === "string" ? req.query.until : "";
  const nurseId = typeof req.query.nurseId === "string" ? req.query.nurseId : "";

  if (module && isAuditModule(module)) where.push(eq(auditLogs.module, module));
  if (action) where.push(eq(auditLogs.action, action));
  if (agent) where.push(eq(auditLogs.agentName, agent));
  if (nurseId) where.push(eq(auditLogs.nurseId, nurseId));
  if (since) {
    const d = new Date(since);
    if (!Number.isNaN(d.getTime())) where.push(gte(auditLogs.timestamp, d));
  }
  if (until) {
    const d = new Date(until);
    if (!Number.isNaN(d.getTime())) where.push(lte(auditLogs.timestamp, d));
  }
  if (q) {
    const pattern = `%${q}%`;
    where.push(
      or(
        ilike(auditLogs.action, pattern),
        ilike(auditLogs.agentName, pattern),
        sql`(${auditLogs.detail})::text ILIKE ${pattern}`,
      )!,
    );
  }
  return where;
}

export function registerSuperAdminRoutes(app: Express) {
  // Paged activity feed for the dashboard (filterable).
  app.get("/api/super-admin/activity", requireSuperAdmin, async (req, res) => {
    try {
      const limit = Math.max(
        1,
        Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500),
      );
      const where = buildFilters(req);
      const rows = where.length
        ? await db
            .select()
            .from(auditLogs)
            .where(and(...where))
            .orderBy(desc(auditLogs.timestamp))
            .limit(limit)
        : await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(limit);
      res.json({ rows, count: rows.length });
    } catch (err: any) {
      console.error("[super-admin] activity feed failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load activity" });
    }
  });

  // Per-actor (agentName) leaderboard with totals + last seen, honouring
  // the same filter set so the drill-down lines up with the feed.
  app.get("/api/super-admin/activity/actors", requireSuperAdmin, async (req, res) => {
    try {
      const where = buildFilters(req);
      const baseQuery = db
        .select({
          agentName: auditLogs.agentName,
          count: sql<number>`count(*)::int`,
          lastSeen: sql<Date>`max(${auditLogs.timestamp})`,
        })
        .from(auditLogs);
      const rows = where.length
        ? await baseQuery
            .where(and(...where))
            .groupBy(auditLogs.agentName)
            .orderBy(sql`count(*) desc`)
            .limit(200)
        : await baseQuery
            .groupBy(auditLogs.agentName)
            .orderBy(sql`count(*) desc`)
            .limit(200);
      res.json({ actors: rows });
    } catch (err: any) {
      console.error("[super-admin] actors failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load actors" });
    }
  });

  // Single-actor drill-down: recent activity + per-action and per-module
  // breakdowns. The actor name comes from the URL path, not query — so a
  // text search box can still filter the inner activity list.
  app.get("/api/super-admin/activity/actor/:name", requireSuperAdmin, async (req, res) => {
    try {
      const name = String(req.params.name || "");
      if (!name) return res.status(400).json({ message: "actor name required" });
      const limit = Math.max(
        1,
        Math.min(parseInt(String(req.query.limit ?? "200"), 10) || 200, 1000),
      );
      const where: SQL[] = [eq(auditLogs.agentName, name), ...buildFilters(req)];

      const rows = await db
        .select()
        .from(auditLogs)
        .where(and(...where))
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit);

      const byAction = await db
        .select({
          action: auditLogs.action,
          count: sql<number>`count(*)::int`,
        })
        .from(auditLogs)
        .where(and(...where))
        .groupBy(auditLogs.action)
        .orderBy(sql`count(*) desc`)
        .limit(50);

      const byModule = await db
        .select({
          module: auditLogs.module,
          count: sql<number>`count(*)::int`,
        })
        .from(auditLogs)
        .where(and(...where))
        .groupBy(auditLogs.module);

      res.json({
        actor: name,
        rows,
        byAction,
        byModule,
        total: rows.length,
      });
    } catch (err: any) {
      console.error("[super-admin] actor drill-down failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load actor activity" });
    }
  });
}
