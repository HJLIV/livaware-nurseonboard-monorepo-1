// Admin-added reading materials (task: reading materials with read
// tracking). These live in the `policies` table with category="reading"
// so they flow through the exact same read-event ingestion, roll-up and
// acknowledgement endpoints as policies — the portal reuses
// /api/portal/:token/policies/:id/read-events and /acknowledge.
//
// What this module adds on top:
// - Super-admin CRUD (create from uploaded PDF/DOCX with the source
//   file KEPT and downloadable, or from pasted text / link).
// - Admin list + per-item per-nurse status view.
// - Portal listing + source-file download for nurses.

import type { Express, Request } from "express";
import path from "path";
import fs from "fs";
import { db } from "../db";
import {
  policies,
  policyAcknowledgements,
  nurses,
  type Policy,
} from "@shared/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import {
  requireAdmin,
  requireSuperAdmin,
  validatePortalToken,
  requireNurseStageCompleted,
  isSuperAdmin,
  upload,
  uploadsDir,
} from "../middleware";
import { logAction } from "../services/audit";
import { buildPolicyListForNurse } from "./policies";
import { policyReadEvents } from "@shared/schema";

const READING_CATEGORY = "reading";

function agentFor(req: Request): string {
  const u = req.session?.username;
  const r = req.session?.role;
  if (!u) return "system";
  return r ? `${u} (${r})` : u;
}

async function getReadingMaterial(id: string): Promise<Policy | undefined> {
  const [row] = await db
    .select()
    .from(policies)
    .where(and(eq(policies.id, id), eq(policies.category, READING_CATEGORY)));
  return row;
}

// Serve the kept source file (uploads dir is a hot cache; the durable
// copy lives in Replit Object Storage — same pattern as documents.ts).
async function sendSourceFile(res: any, material: Policy) {
  if (!material.sourceFilePath) {
    return res.status(404).json({ message: "This reading item has no stored source file" });
  }
  const basename = path.basename(material.sourceFilePath);
  const absolute = path.join(uploadsDir, basename);
  if (!absolute.startsWith(uploadsDir)) {
    return res.status(404).json({ message: "File not found on server" });
  }
  if (!fs.existsSync(absolute)) {
    const { ensureLocalCopy } = await import("../object-storage");
    const restored = await ensureLocalCopy(basename);
    if (!restored) {
      return res.status(404).json({ message: "File not found on server" });
    }
  }
  if (material.sourceMimeType) res.setHeader("Content-Type", material.sourceMimeType);
  if (material.sourceFileName) {
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${material.sourceFileName.replace(/[^\w. -]+/g, "_")}"`,
    );
  }
  res.sendFile(absolute);
}

export function registerReadingMaterialRoutes(app: Express) {
  // ─── Admin: list all reading materials (active + inactive) ───────
  app.get("/api/admin/reading-materials", requireAdmin, async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(policies)
        .where(eq(policies.category, READING_CATEGORY))
        .orderBy(asc(policies.sortOrder), asc(policies.title));
      res.json(rows);
    } catch (err: any) {
      console.error("[reading-materials] list failed:", err);
      res.status(500).json({ message: err?.message || "Failed to list reading materials" });
    }
  });

  // ─── Super-admin: create reading material ────────────────────────
  // Multipart form. Optional "file" part (.pdf/.docx) — the file is
  // STORED (disk + bucket mirror) and its text extracted into `body`
  // unless the admin supplied body text themselves. Alternatively the
  // admin can paste text (`body`) and/or a link (`linkUrl` → pdfUrl).
  app.post(
    "/api/admin/reading-materials",
    requireSuperAdmin,
    (req, res, next) => {
      upload.single("file")(req, res, (err: any) => {
        if (!err) return next();
        if (err?.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File too large. Maximum size is 10 MB." });
        }
        return res.status(400).json({ message: err?.message || "Upload failed" });
      });
    },
    async (req, res) => {
      try {
        const b = req.body || {};
        const title = typeof b.title === "string" ? b.title.trim() : "";
        let body = typeof b.body === "string" && b.body.trim() ? b.body : null;
        const linkUrl = typeof b.linkUrl === "string" && b.linkUrl.trim() ? b.linkUrl.trim() : null;
        const readingCategory =
          typeof b.readingCategory === "string" && b.readingCategory.trim()
            ? b.readingCategory.trim()
            : null;
        const version = typeof b.version === "string" && b.version.trim() ? b.version.trim() : "1.0";
        const requireAcknowledgement = String(b.requireAcknowledgement ?? "true") !== "false";
        const isActive = String(b.isActive ?? "true") !== "false";
        const sortOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;

        const file = (req as any).file as Express.Multer.File | undefined;
        let finalTitle = title;
        let sourceFileName: string | null = null;
        let sourceFilePath: string | null = null;
        let sourceMimeType: string | null = null;
        let aiCleaned: boolean | undefined;

        if (file) {
          const ext = path.extname(file.originalname).toLowerCase();
          if (ext !== ".pdf" && ext !== ".docx") {
            try { fs.unlinkSync(file.path); } catch {}
            return res.status(415).json({ message: "Unsupported file type. Please upload a .pdf or .docx file." });
          }
          sourceFileName = file.originalname;
          sourceFilePath = file.filename;
          sourceMimeType = file.mimetype;
          if (!body) {
            // Extract text from the stored file so the nurse can read
            // it inline (read-time tracking needs an in-page body).
            try {
              const { extractPolicyFromFile } = await import("../policy-extractor");
              const { cleanupPolicyMarkdown } = await import("../policy-ai-cleanup");
              const buffer = fs.readFileSync(file.path);
              const extracted = await extractPolicyFromFile(buffer, file.originalname, file.mimetype);
              const cleanup = await cleanupPolicyMarkdown(extracted.body);
              body = cleanup.body;
              aiCleaned = cleanup.aiCleaned;
              if (!finalTitle) finalTitle = extracted.title;
            } catch (extractErr: any) {
              console.error("[reading-materials] extraction failed:", extractErr);
              // Keep the file anyway — nurses can still download it.
            }
          }
        }

        if (!finalTitle) {
          return res.status(400).json({ message: "Title is required" });
        }
        if (!body?.trim() && !linkUrl && !sourceFilePath) {
          return res.status(400).json({ message: "Provide text, a link, or an uploaded document so nurses have something to read." });
        }

        const [created] = await db
          .insert(policies)
          .values({
            title: finalTitle,
            body,
            pdfUrl: linkUrl,
            version,
            isActive,
            requireAcknowledgement,
            sortOrder,
            category: READING_CATEGORY,
            readingCategory,
            sourceFileName,
            sourceFilePath,
            sourceMimeType,
            createdBy: agentFor(req),
          })
          .returning();

        await logAction(null, "admin", "reading_material_created", agentFor(req), {
          policyId: created.id,
          title: created.title,
          version: created.version,
          readingCategory,
          hasSourceFile: !!sourceFilePath,
        });
        res.status(201).json({ ...created, aiCleaned });
      } catch (err: any) {
        console.error("[reading-materials] create failed:", err);
        res.status(500).json({ message: err?.message || "Failed to create reading material" });
      }
    },
  );

  // ─── Super-admin: update reading material ────────────────────────
  app.patch("/api/admin/reading-materials/:id", requireSuperAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      const existing = await getReadingMaterial(id);
      if (!existing) return res.status(404).json({ message: "Reading material not found" });

      const allowed: Partial<Policy> = {};
      const b = req.body || {};
      if (typeof b.title === "string") allowed.title = b.title;
      if (typeof b.body === "string" || b.body === null) allowed.body = b.body;
      if (typeof b.linkUrl === "string" || b.linkUrl === null) allowed.pdfUrl = b.linkUrl;
      if (typeof b.readingCategory === "string" || b.readingCategory === null) allowed.readingCategory = b.readingCategory;
      if (typeof b.version === "string") allowed.version = b.version;
      if (typeof b.isActive === "boolean") allowed.isActive = b.isActive;
      if (typeof b.requireAcknowledgement === "boolean") allowed.requireAcknowledgement = b.requireAcknowledgement;
      if (typeof b.sortOrder === "number") allowed.sortOrder = b.sortOrder;

      const finalBody = allowed.body !== undefined ? allowed.body : existing.body;
      const finalLink = allowed.pdfUrl !== undefined ? allowed.pdfUrl : existing.pdfUrl;
      if (!finalBody?.trim() && !finalLink?.trim() && !existing.sourceFilePath) {
        return res.status(400).json({ message: "Provide text, a link, or an uploaded document so nurses have something to read." });
      }

      const [updated] = await db
        .update(policies)
        .set({ ...allowed, updatedAt: new Date() })
        .where(eq(policies.id, id))
        .returning();

      await logAction(null, "admin", "reading_material_updated", agentFor(req), {
        policyId: id,
        changes: allowed,
        previousVersion: existing.version,
        newVersion: updated.version,
      });
      res.json(updated);
    } catch (err: any) {
      console.error("[reading-materials] update failed:", err);
      res.status(500).json({ message: err?.message || "Failed to update reading material" });
    }
  });

  // ─── Super-admin: delete reading material ────────────────────────
  app.delete("/api/admin/reading-materials/:id", requireSuperAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      const existing = await getReadingMaterial(id);
      if (!existing) return res.status(404).json({ message: "Reading material not found" });

      await db.delete(policyReadEvents).where(eq(policyReadEvents.policyId, id));
      await db.delete(policyAcknowledgements).where(eq(policyAcknowledgements.policyId, id));
      await db.delete(policies).where(eq(policies.id, id));

      await logAction(null, "admin", "reading_material_deleted", agentFor(req), {
        policyId: id,
        title: existing.title,
        version: existing.version,
      });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[reading-materials] delete failed:", err);
      res.status(500).json({ message: err?.message || "Failed to delete reading material" });
    }
  });

  // ─── Admin: per-item per-nurse status (read / outstanding) ───────
  // One row per nurse with their latest-version ack status + (super-
  // admin only) the reading-behaviour roll-up. Mirrors the policy
  // acknowledgement privacy tiering.
  app.get("/api/admin/reading-materials/:id/nurse-status", requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      const material = await getReadingMaterial(id);
      if (!material) return res.status(404).json({ message: "Reading material not found" });

      const allNurses = await db
        .select({ id: nurses.id, fullName: nurses.fullName, email: nurses.email, currentStage: nurses.currentStage })
        .from(nurses);
      const acks = await db
        .select()
        .from(policyAcknowledgements)
        .where(eq(policyAcknowledgements.policyId, id))
        .orderBy(desc(policyAcknowledgements.acknowledgedAt));
      const latestByNurse = new Map<string, typeof acks[number]>();
      for (const a of acks) {
        if (!latestByNurse.has(a.nurseId)) latestByNurse.set(a.nurseId, a);
      }
      const canViewBehaviour = isSuperAdmin(req);
      const rows = allNurses.map((n) => {
        const a = latestByNurse.get(n.id);
        const acknowledged = !!a && a.policyVersion === material.version;
        const base = {
          nurseId: n.id,
          fullName: n.fullName,
          email: n.email,
          currentStage: n.currentStage,
          acknowledged,
          acknowledgedAt: acknowledged ? a!.acknowledgedAt.toISOString() : null,
          acknowledgedVersion: a?.policyVersion ?? null,
        };
        return canViewBehaviour
          ? {
              ...base,
              totalActiveSeconds: a?.totalActiveSeconds ?? null,
              sessionCount: a?.sessionCount ?? null,
              scrolledToEnd: a?.scrolledToEnd ?? null,
              openedPdf: a?.openedPdf ?? null,
            }
          : base;
      });
      // Outstanding-first so admins see who still needs chasing.
      rows.sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged) || a.fullName.localeCompare(b.fullName));
      res.json({
        material: { id: material.id, title: material.title, version: material.version, requireAcknowledgement: material.requireAcknowledgement },
        canViewReadBehaviour: canViewBehaviour,
        nurses: rows,
      });
    } catch (err: any) {
      console.error("[reading-materials] nurse-status failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load reading status" });
    }
  });

  // ─── Admin: per-nurse reading progress (nurse-detail view) ───────
  app.get("/api/nurses/:id/reading-materials-progress", requireAdmin, async (req, res) => {
    try {
      const nurseId = String(req.params.id);
      const summary = await buildPolicyListForNurse(nurseId, { category: READING_CATEGORY });
      const acks = await db
        .select()
        .from(policyAcknowledgements)
        .where(eq(policyAcknowledgements.nurseId, nurseId));
      const latestAck = new Map<string, typeof acks[number]>();
      for (const a of acks) {
        const prev = latestAck.get(a.policyId);
        if (!prev || a.acknowledgedAt > prev.acknowledgedAt) latestAck.set(a.policyId, a);
      }
      // Attach reading-material extras (label / file presence).
      const rows = await db
        .select()
        .from(policies)
        .where(eq(policies.category, READING_CATEGORY));
      const byId = new Map(rows.map((r) => [r.id, r]));
      const canViewBehaviour = isSuperAdmin(req);
      const enriched = summary.policies.map((p) => {
        const a = latestAck.get(p.id);
        const row = byId.get(p.id);
        const base = {
          ...p,
          readingCategory: row?.readingCategory ?? null,
          hasSourceFile: !!row?.sourceFilePath,
          sourceFileName: row?.sourceFileName ?? null,
        };
        return canViewBehaviour
          ? {
              ...base,
              totalActiveSeconds: a?.totalActiveSeconds ?? null,
              sessionCount: a?.sessionCount ?? null,
              scrolledToEnd: a?.scrolledToEnd ?? null,
              openedPdf: a?.openedPdf ?? null,
            }
          : base;
      });
      res.json({ ...summary, policies: enriched, canViewReadBehaviour: canViewBehaviour });
    } catch (err: any) {
      console.error("[reading-materials] nurse progress failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load reading progress" });
    }
  });

  // ─── Admin: download the kept source file ────────────────────────
  app.get("/api/admin/reading-materials/:id/file", requireAdmin, async (req, res) => {
    try {
      const material = await getReadingMaterial(String(req.params.id));
      if (!material) return res.status(404).json({ message: "Reading material not found" });
      await sendSourceFile(res, material);
    } catch (err: any) {
      console.error("[reading-materials] admin file download failed:", err);
      res.status(500).json({ message: err?.message || "Failed to download file" });
    }
  });

  // ─── Portal: list reading materials + per-nurse status ───────────
  app.get("/api/portal/:token/reading-materials", validatePortalToken, requireNurseStageCompleted, async (req, res) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const summary = await buildPolicyListForNurse(nurseId, { category: READING_CATEGORY });
      // Attach the reading-material extras the shared builder doesn't map.
      const rows = await db
        .select()
        .from(policies)
        .where(and(eq(policies.category, READING_CATEGORY), eq(policies.isActive, true)));
      const byId = new Map(rows.map((r) => [r.id, r]));
      const enriched = summary.policies.map((p) => {
        const row = byId.get(p.id);
        return {
          ...p,
          readingCategory: row?.readingCategory ?? null,
          hasSourceFile: !!row?.sourceFilePath,
          sourceFileName: row?.sourceFileName ?? null,
        };
      });
      res.json({ ...summary, policies: enriched });
    } catch (err: any) {
      console.error("[reading-materials] portal list failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load reading materials" });
    }
  });

  // ─── Portal: download the kept source file ───────────────────────
  app.get("/api/portal/:token/reading-materials/:id/file", validatePortalToken, requireNurseStageCompleted, async (req, res) => {
    try {
      const material = await getReadingMaterial(String(req.params.id));
      if (!material || !material.isActive) return res.status(404).json({ message: "Reading material not found" });
      await sendSourceFile(res, material);
    } catch (err: any) {
      console.error("[reading-materials] portal file download failed:", err);
      res.status(500).json({ message: err?.message || "Failed to download file" });
    }
  });
}
