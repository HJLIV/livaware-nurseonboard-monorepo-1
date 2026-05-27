// Supervision & Appraisals (task 162) — admin-only per-nurse log of
// 1:1 supervision calls, appraisals, and reflective conversations.
// Mounted under /api/admin/* so it inherits the global requireAdmin
// guard from routes.ts. Write paths that target someone else's entry
// require super-admin.
import type { Express, Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import { storage } from "../storage";
import { uploadLimiter, uploadsDir, isSuperAdmin } from "../middleware";
import { logAction } from "../services/audit";
import { insertNurseSupervisionSchema } from "@shared/schema";

// Supervision attachments accept the document formats a supervisor is
// realistically going to upload alongside a 1:1 summary: PDF, Word, and
// plain text. The shared `upload` middleware deliberately restricts to
// PDF/image/Word — broader doc types live on this route-local multer
// so we don't widen the surface for every other upload in the app.
const SUPERVISION_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
const SUPERVISION_ALLOWED_EXT = new Set([".pdf", ".doc", ".docx", ".txt"]);

const supervisionDiskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

const supervisionStorage: multer.StorageEngine = {
  _handleFile(req, file, cb) {
    supervisionDiskStorage._handleFile(req, file, (err, info) => {
      if (err || !info) return cb(err || new Error("multer disk write failed"));
      const filename = (info as any).filename as string;
      // Mirror to object storage so attachments survive container restarts,
      // matching how the shared `upload` middleware handles persistence.
      import("../object-storage")
        .then(({ triggerBucketMirror }) => triggerBucketMirror(filename))
        .catch((mirrorErr) =>
          console.error(
            "[supervisions] bucket mirror dispatch failed:",
            (mirrorErr as Error)?.message || mirrorErr,
          ),
        );
      cb(null, info);
    });
  },
  _removeFile(req, file, cb) {
    supervisionDiskStorage._removeFile(req, file, (err) => cb(err));
  },
};

const upload = multer({
  storage: supervisionStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (
      SUPERVISION_ALLOWED_MIME.has(file.mimetype) ||
      SUPERVISION_ALLOWED_EXT.has(ext)
    ) {
      return cb(null, true);
    }
    cb(new Error("File type not allowed. Accepted: PDF, DOC, DOCX, TXT"));
  },
});

const SUPERVISION_TYPES = ["supervision", "appraisal", "reflection", "other"] as const;
type SupervisionType = (typeof SUPERVISION_TYPES)[number];

function agentFor(req: Request): string {
  const u = req.session?.username;
  const r = req.session?.role;
  if (!u) return "system";
  return r ? `${u} (${r})` : u;
}

function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseType(raw: unknown): SupervisionType | null {
  if (typeof raw !== "string") return null;
  return (SUPERVISION_TYPES as readonly string[]).includes(raw)
    ? (raw as SupervisionType)
    : null;
}

function deleteAttachmentFile(filename: string | null | undefined) {
  if (!filename) return;
  try {
    const abs = path.join(uploadsDir, filename);
    if (abs.startsWith(uploadsDir) && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (err) {
    console.error(
      "[supervisions] failed to delete attachment from disk:",
      (err as Error)?.message || err,
    );
  }
  // Best-effort bucket cleanup mirrors the disk delete.
  import("../object-storage")
    .then(({ deleteFromBucket }) => deleteFromBucket(filename))
    .catch((err) =>
      console.error(
        "[supervisions] bucket delete dispatch failed:",
        (err as Error)?.message || err,
      ),
    );
}

export function registerSupervisionRoutes(app: Express) {
  // ─── List entries for a nurse ────────────────────────────────────
  app.get("/api/admin/nurses/:id/supervisions", async (req: Request, res: Response) => {
    const nurse = await storage.getCandidate(String(req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    const rows = await storage.listSupervisionsByNurse(nurse.id);
    res.json(rows);
  });

  // ─── Create a new entry (with optional file attachment) ─────────
  app.post(
    "/api/admin/nurses/:id/supervisions",
    uploadLimiter,
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const nurse = await storage.getCandidate(String(req.params.id));
        if (!nurse) {
          if (req.file) deleteAttachmentFile(req.file.filename);
          return res.status(404).json({ message: "Nurse not found" });
        }
        const type = parseType(req.body.type);
        const conversationDate = String(req.body.conversationDate || "").trim();
        const notes = typeof req.body.notes === "string" ? req.body.notes : "";
        const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
        if (!type) {
          if (req.file) deleteAttachmentFile(req.file.filename);
          return res.status(400).json({ message: "Invalid type" });
        }
        if (!isValidDate(conversationDate)) {
          if (req.file) deleteAttachmentFile(req.file.filename);
          return res
            .status(400)
            .json({ message: "conversationDate must be YYYY-MM-DD" });
        }
        if (!notes.trim()) {
          if (req.file) deleteAttachmentFile(req.file.filename);
          return res.status(400).json({ message: "Notes are required" });
        }

        const data = insertNurseSupervisionSchema.parse({
          nurseId: nurse.id,
          type,
          title: title || null,
          conversationDate,
          notes,
          attachmentFilename: req.file?.filename ?? null,
          attachmentOriginalFilename: req.file?.originalname ?? null,
          attachmentMimeType: req.file?.mimetype ?? null,
          attachmentSize: req.file?.size ?? null,
          createdBy: agentFor(req),
          updatedBy: agentFor(req),
        });

        const row = await storage.createSupervision(data);
        await logAction(nurse.id, "supervision", "supervision_added", agentFor(req), {
          supervisionId: row.id,
          type: row.type,
          conversationDate: row.conversationDate,
          hasAttachment: !!row.attachmentFilename,
        });
        res.status(201).json(row);
      } catch (err: any) {
        if (req.file) deleteAttachmentFile(req.file.filename);
        console.error("[supervisions.create] error:", err?.message || err);
        res.status(500).json({ message: err?.message || "Failed to create entry" });
      }
    },
  );

  // ─── Get a single entry ──────────────────────────────────────────
  app.get("/api/admin/supervisions/:id", async (req: Request, res: Response) => {
    const row = await storage.getSupervision(String(req.params.id));
    if (!row) return res.status(404).json({ message: "Entry not found" });
    res.json(row);
  });

  // ─── Update an entry ─────────────────────────────────────────────
  // Author can edit their own row; super-admin can edit any row.
  app.put(
    "/api/admin/supervisions/:id",
    uploadLimiter,
    upload.single("file"),
    async (req: Request, res: Response) => {
      const row = await storage.getSupervision(String(req.params.id));
      if (!row) {
        if (req.file) deleteAttachmentFile(req.file.filename);
        return res.status(404).json({ message: "Entry not found" });
      }
      const agent = agentFor(req);
      if (row.createdBy !== agent && !isSuperAdmin(req)) {
        if (req.file) deleteAttachmentFile(req.file.filename);
        return res
          .status(403)
          .json({ message: "Only the author or a super-admin can edit this entry" });
      }

      const patch: Record<string, unknown> = { updatedBy: agent };
      if (req.body.type !== undefined) {
        const t = parseType(req.body.type);
        if (!t) {
          if (req.file) deleteAttachmentFile(req.file.filename);
          return res.status(400).json({ message: "Invalid type" });
        }
        patch.type = t;
      }
      if (req.body.conversationDate !== undefined) {
        if (!isValidDate(req.body.conversationDate)) {
          if (req.file) deleteAttachmentFile(req.file.filename);
          return res
            .status(400)
            .json({ message: "conversationDate must be YYYY-MM-DD" });
        }
        patch.conversationDate = String(req.body.conversationDate);
      }
      if (typeof req.body.title === "string") {
        const t = req.body.title.trim();
        patch.title = t || null;
      }
      if (typeof req.body.notes === "string") {
        if (!req.body.notes.trim()) {
          if (req.file) deleteAttachmentFile(req.file.filename);
          return res.status(400).json({ message: "Notes are required" });
        }
        patch.notes = req.body.notes;
      }

      let removedAttachment: string | null = null;
      const removeFlag = String(req.body.removeAttachment || "").toLowerCase() === "true";
      if (req.file) {
        removedAttachment = row.attachmentFilename;
        patch.attachmentFilename = req.file.filename;
        patch.attachmentOriginalFilename = req.file.originalname;
        patch.attachmentMimeType = req.file.mimetype;
        patch.attachmentSize = req.file.size;
      } else if (removeFlag) {
        removedAttachment = row.attachmentFilename;
        patch.attachmentFilename = null;
        patch.attachmentOriginalFilename = null;
        patch.attachmentMimeType = null;
        patch.attachmentSize = null;
      }

      const updated = await storage.updateSupervision(row.id, patch as any);
      if (removedAttachment) deleteAttachmentFile(removedAttachment);
      await logAction(row.nurseId, "supervision", "supervision_updated", agent, {
        supervisionId: row.id,
        changedFields: Object.keys(patch).filter((k) => k !== "updatedBy"),
      });
      res.json(updated);
    },
  );

  // ─── Delete an entry ─────────────────────────────────────────────
  app.delete("/api/admin/supervisions/:id", async (req: Request, res: Response) => {
    const row = await storage.getSupervision(String(req.params.id));
    if (!row) return res.status(404).json({ message: "Entry not found" });
    const agent = agentFor(req);
    if (row.createdBy !== agent && !isSuperAdmin(req)) {
      return res
        .status(403)
        .json({ message: "Only the author or a super-admin can delete this entry" });
    }
    await storage.deleteSupervision(row.id);
    if (row.attachmentFilename) deleteAttachmentFile(row.attachmentFilename);
    await logAction(row.nurseId, "supervision", "supervision_deleted", agent, {
      supervisionId: row.id,
      type: row.type,
      conversationDate: row.conversationDate,
    });
    res.json({ ok: true });
  });

  // ─── Download an attachment (admin-only, never via portal) ───────
  app.get(
    "/api/admin/supervisions/:id/attachment",
    async (req: Request, res: Response) => {
      const row = await storage.getSupervision(String(req.params.id));
      if (!row || !row.attachmentFilename) {
        return res.status(404).json({ message: "Attachment not found" });
      }
      const basename = path.basename(row.attachmentFilename);
      const abs = path.join(uploadsDir, basename);
      if (!abs.startsWith(uploadsDir)) {
        return res.status(404).json({ message: "Attachment not found" });
      }
      if (!fs.existsSync(abs)) {
        const { ensureLocalCopy } = await import("../object-storage");
        const restored = await ensureLocalCopy(basename);
        if (!restored) return res.status(404).json({ message: "Attachment not found" });
      }
      if (row.attachmentMimeType) res.setHeader("Content-Type", row.attachmentMimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${(row.attachmentOriginalFilename || basename).replace(/"/g, "")}"`,
      );
      res.sendFile(abs);
    },
  );
}
