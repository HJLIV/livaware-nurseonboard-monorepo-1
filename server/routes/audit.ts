import type { Express } from "express";
import { db } from "../db";
import { auditLogs } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export function registerAuditRoutes(app: Express) {
  // GET /api/audit-logs - all audit logs with optional filters (admin only, middleware applied in routes.ts)
  app.get("/api/audit-logs", async (req, res) => {
    const module = req.query.module as string | undefined;
    const nurseId = req.query.nurseId as string | undefined;
    const action = req.query.action as string | undefined;
    const limitParam = parseInt(req.query.limit as string) || 500;
    const maxLimit = Math.max(1, Math.min(limitParam, 1000));

    const conditions = [];
    if (module) conditions.push(eq(auditLogs.module, module as any));
    if (nurseId) conditions.push(eq(auditLogs.nurseId, nurseId));
    if (action) conditions.push(eq(auditLogs.action, action));

    let query;
    if (conditions.length > 0) {
      query = db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.timestamp)).limit(maxLimit);
    } else {
      query = db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(maxLimit);
    }

    const result = await query;
    res.json(result);
  });

  // GET /api/audit-logs/stats - count by module and action type
  app.get("/api/audit-logs/stats", async (_req, res) => {
    const byModule = await db
      .select({ module: auditLogs.module, count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .groupBy(auditLogs.module);

    const byAction = await db
      .select({ action: auditLogs.action, count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .groupBy(auditLogs.action);

    res.json({ byModule, byAction });
  });

  // GET /api/audit-logs/nurse/:id - audit logs for a specific nurse
  app.get("/api/audit-logs/nurse/:id", async (req, res) => {
    const result = await db.select().from(auditLogs).where(eq(auditLogs.nurseId, req.params.id)).orderBy(desc(auditLogs.timestamp));
    res.json(result);
  });
}
