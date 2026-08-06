// Super-admin-only endpoints powering the Activity Dashboard.
//
// Source of truth is the existing audit_logs table — no new schema. We
// expose three flavours: a paged feed (with module/action/agent/text
// filters), a per-actor leaderboard, and a single-actor drill-down.

import type { Express, Request } from "express";
import multer from "multer";
import { db } from "../db";
import { auditLogs, nurses } from "@shared/schema";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { requireSuperAdmin, uploadLimiter } from "../middleware";
import { enrichAuditLogs, actorGroupKey } from "../services/audit-enrich";
import { storage } from "../storage";
import { renderEnvelope, paragraphs } from "../email-templates";
import { isOutlookConfigured, isEmailSendingSuppressed, sendMassEmailMessage } from "../outlook";

// SQL expression that mirrors actorGroupKey() — collapses
// "<portal_label>:<anything>" to "<portal_label>" so portal writes that
// now embed a real name (e.g. "nurse_portal:Jane Doe") still aggregate
// into a single bucket on the actor leaderboard.
const PORTAL_GROUP_PREFIXES = ["nurse_portal", "candidate", "applicant", "referee", "system", "certificate_ai"];
const groupKeySql = sql<string>`
  CASE
    WHEN position(':' in ${auditLogs.agentName}) > 0
     AND split_part(${auditLogs.agentName}, ':', 1) = ANY(${PORTAL_GROUP_PREFIXES}::text[])
    THEN split_part(${auditLogs.agentName}, ':', 1)
    ELSE ${auditLogs.agentName}
  END
`;

type AuditModule = "preboard" | "onboard" | "skills_arcade" | "admin" | "portal" | "portal_auth" | "system" | "availability" | "invoices" | "announcements" | "service_agreement";
const VALID_MODULES: ReadonlySet<AuditModule> = new Set<AuditModule>([
  "preboard",
  "onboard",
  "skills_arcade",
  "admin",
  "portal",
  "portal_auth",
  "system",
  "availability",
  "invoices",
  "announcements",
  "service_agreement",
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

// ─── Mass email broadcast (task 186) ────────────────────────────────
// Renders the admin's plain-text body into the standard branded envelope.
// Blank lines split paragraphs; everything is escaped (no raw HTML).
export function renderMassEmailHtml(body: string): string {
  return renderEnvelope({
    headerTitle: "Livaware",
    headerSubtitle: "Livaware Ltd — Staff Communication",
    bodyHtml: paragraphs(body),
    footerText: "Livaware Ltd — Secure Nurse Onboarding",
    footerSecondLine: "Replies to this email reach our onboarding team directly.",
  });
}

// Combined cap for all attachments on a single broadcast. Graph's simple
// sendMail request tops out around 4MB total, so we stay under that
// (base64 inflates payloads by ~33%).
const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024;

// Dedicated in-memory upload handler for broadcast attachments. These
// files are email payload only: they are held in memory for the duration
// of the request, base64-inlined into the Graph messages, and never
// written to the shared uploads dir — so they cannot be fetched via the
// /api/uploads download surface, and there is nothing to clean up on
// either the success or failure path.
const MASS_EMAIL_ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const massEmailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_TOTAL_ATTACHMENT_BYTES, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (MASS_EMAIL_ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed. Accepted: PDF, JPG, PNG, DOC, DOCX"));
  },
});

export function registerSuperAdminRoutes(app: Express) {
  // Roster for the recipient picker: every non-archived nurse, flagged
  // when they have no usable email address.
  app.get("/api/super-admin/mass-email/roster", requireSuperAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select({
          id: nurses.id,
          fullName: nurses.fullName,
          email: nurses.email,
          currentStage: nurses.currentStage,
        })
        .from(nurses)
        .where(isNull(nurses.archivedAt))
        .orderBy(nurses.fullName);
      res.json({
        nurses: rows.map((n) => ({ ...n, hasEmail: !!(n.email && n.email.trim()) })),
      });
    } catch (err: any) {
      console.error("[mass-email] roster failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load roster" });
    }
  });

  // Preview: render the subject/body into the branded HTML envelope.
  app.post("/api/super-admin/mass-email/preview", requireSuperAdmin, async (req, res) => {
    try {
      const body = typeof req.body?.body === "string" ? req.body.body : "";
      if (!body.trim()) return res.status(400).json({ message: "Body is required" });
      res.json({ html: renderMassEmailHtml(body) });
    } catch (err: any) {
      console.error("[mass-email] preview failed:", err);
      res.status(500).json({ message: err?.message || "Failed to render preview" });
    }
  });

  // Send: multipart form — subject, body, nurseIds (JSON array), plus up
  // to 5 file attachments. One Graph message per recipient; failures are
  // isolated per nurse and reported in the summary.
  app.post(
    "/api/super-admin/mass-email/send",
    requireSuperAdmin,
    uploadLimiter,
    massEmailUpload.array("attachments", 5),
    async (req, res) => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      try {
        const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
        const body = typeof req.body?.body === "string" ? req.body.body : "";
        let nurseIds: string[] = [];
        try {
          const parsed = JSON.parse(String(req.body?.nurseIds ?? "[]"));
          if (Array.isArray(parsed)) nurseIds = parsed.filter((x) => typeof x === "string");
        } catch {
          return res.status(400).json({ message: "nurseIds must be a JSON array of nurse IDs" });
        }
        if (!subject) {
          return res.status(400).json({ message: "Subject is required" });
        }
        if (!body.trim()) {
          return res.status(400).json({ message: "Body is required" });
        }
        if (nurseIds.length === 0) {
          return res.status(400).json({ message: "Select at least one recipient" });
        }
        const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
        if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
          return res.status(400).json({
            message: `Attachments too large: combined size must be under ${Math.floor(MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024))}MB`,
          });
        }
        if (!isOutlookConfigured() && !isEmailSendingSuppressed()) {
          return res.status(503).json({ message: "Outlook integration not configured — cannot send email." });
        }

        // Resolve selected nurses; unknown IDs are reported, nurses
        // without an email are excluded and listed.
        const selected = await db
          .select({ id: nurses.id, fullName: nurses.fullName, email: nurses.email })
          .from(nurses)
          .where(inArray(nurses.id, nurseIds));
        const foundIds = new Set(selected.map((n) => n.id));
        const unknownIds = nurseIds.filter((id) => !foundIds.has(id));
        const withEmail = selected.filter((n) => !!(n.email && n.email.trim()));
        const excludedNoEmail = selected
          .filter((n) => !(n.email && n.email.trim()))
          .map((n) => ({ nurseId: n.id, fullName: n.fullName }));
        if (withEmail.length === 0) {
          return res.status(400).json({
            message: "None of the selected recipients has an email address on file",
            excludedNoEmail,
            unknownIds,
          });
        }

        const sentBy = (req.session as any)?.username || "super_admin";
        const attachmentsMeta = files.map((f) => ({
          originalFilename: f.originalname,
          mimeType: f.mimetype,
          sizeBytes: f.size,
        }));
        const attachmentPayloads = files.map((f) => ({
          name: f.originalname,
          contentType: f.mimetype,
          contentBytes: f.buffer.toString("base64"),
        }));
        const html = renderMassEmailHtml(body);

        const record = await storage.createMassEmail({
          sentBy,
          subject,
          body,
          attachments: attachmentsMeta,
          recipientCount: withEmail.length,
          excludedNoEmail,
        });

        // Per the bulk-loop resilience convention: isolate each nurse's
        // failure, log it, and keep going.
        const results: Array<{ nurseId: string; fullName: string; email: string; status: "sent" | "failed"; error?: string }> = [];
        let sentCount = 0;
        let failedCount = 0;
        for (const nurse of withEmail) {
          try {
            await sendMassEmailMessage({
              recipientEmail: nurse.email!,
              recipientName: nurse.fullName,
              subject,
              html,
              attachments: attachmentPayloads,
            });
            sentCount++;
            results.push({ nurseId: nurse.id, fullName: nurse.fullName, email: nurse.email!, status: "sent" });
            await storage.createMassEmailRecipient({
              massEmailId: record.id,
              nurseId: nurse.id,
              recipientEmail: nurse.email!,
              recipientName: nurse.fullName,
              status: "sent",
              error: null,
            });
            await storage.createAuditLog({
              nurseId: nurse.id,
              module: "admin",
              action: "mass_email_sent",
              agentName: sentBy,
              detail: {
                massEmailId: record.id,
                subject,
                recipientEmail: nurse.email,
                attachmentCount: attachmentsMeta.length,
                attachmentNames: attachmentsMeta.map((a) => a.originalFilename),
              },
            });
          } catch (err: any) {
            failedCount++;
            const message = err?.message || String(err);
            console.error(`[mass-email] send failed for nurse ${nurse.id} (${nurse.fullName}):`, message);
            results.push({ nurseId: nurse.id, fullName: nurse.fullName, email: nurse.email!, status: "failed", error: message });
            try {
              await storage.createMassEmailRecipient({
                massEmailId: record.id,
                nurseId: nurse.id,
                recipientEmail: nurse.email!,
                recipientName: nurse.fullName,
                status: "failed",
                error: message,
              });
              await storage.createAuditLog({
                nurseId: nurse.id,
                module: "admin",
                action: "mass_email_failed",
                agentName: sentBy,
                detail: { massEmailId: record.id, subject, recipientEmail: nurse.email, error: message },
              });
            } catch (persistErr: any) {
              console.error(`[mass-email] failed to persist failure for nurse ${nurse.id}:`, persistErr?.message || persistErr);
            }
          }
        }

        await storage.updateMassEmail(record.id, { sentCount, failedCount });
        await storage.createAuditLog({
          module: "admin",
          action: "mass_email_broadcast",
          agentName: sentBy,
          detail: {
            massEmailId: record.id,
            subject,
            recipientCount: withEmail.length,
            sentCount,
            failedCount,
            excludedNoEmailCount: excludedNoEmail.length,
            attachmentCount: attachmentsMeta.length,
          },
        });

        res.json({
          id: record.id,
          sentCount,
          failedCount,
          excludedNoEmail,
          unknownIds,
          results,
        });
      } catch (err: any) {
        console.error("[mass-email] send failed:", err);
        res.status(500).json({ message: err?.message || "Failed to send broadcast" });
      }
    },
  );

  // History: past broadcasts with their per-recipient outcomes.
  app.get("/api/super-admin/mass-email/history", requireSuperAdmin, async (_req, res) => {
    try {
      const sends = await storage.listMassEmails(50);
      const withRecipients = await Promise.all(
        sends.map(async (s) => ({
          ...s,
          recipients: await storage.getMassEmailRecipients(s.id),
        })),
      );
      res.json({ sends: withRecipients });
    } catch (err: any) {
      console.error("[mass-email] history failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load history" });
    }
  });

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
      const enriched = await enrichAuditLogs(rows);
      res.json({ rows: enriched, count: enriched.length });
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
          agentName: groupKeySql,
          count: sql<number>`count(*)::int`,
          lastSeen: sql<Date>`max(${auditLogs.timestamp})`,
        })
        .from(auditLogs);
      const rows = where.length
        ? await baseQuery
            .where(and(...where))
            .groupBy(groupKeySql)
            .orderBy(sql`count(*) desc`)
            .limit(200)
        : await baseQuery
            .groupBy(groupKeySql)
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
      const where: SQL[] = [sql`${groupKeySql} = ${name}`, ...buildFilters(req)];

      const rows = await db
        .select()
        .from(auditLogs)
        .where(and(...where))
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit);
      const enrichedRows = await enrichAuditLogs(rows);

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
        rows: enrichedRows,
        byAction,
        byModule,
        total: enrichedRows.length,
      });
    } catch (err: any) {
      console.error("[super-admin] actor drill-down failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load actor activity" });
    }
  });
}
