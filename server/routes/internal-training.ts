// Internal Training certificates — roster-wide completion tracking.
// Nurses upload one certificate per fixed training type (sourced from
// external platforms); admins see a whole-roster traffic-light matrix and
// can download each certificate. Deliberately simple: a fixed list of
// trainings, one cert per nurse per training (re-upload replaces).
//
// Admin + portal write surfaces are kept in lockstep (portal-admin-parity):
// both go through `performUpsert`, both log to the `internal_training` audit
// module, both stream files through the same `serveCertificate` helper.
import type { Express, Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import { storage } from "../storage";
import {
  uploadLimiter,
  uploadsDir,
  requireAdmin,
  validatePortalToken,
  portalAgent,
} from "../middleware";
import { logAction } from "../services/audit";
import {
  INTERNAL_TRAININGS,
  INTERNAL_TRAINING_KEYS,
  type InternalTrainingCertificate,
  type InternalTrainingKey,
} from "@shared/schema";

interface MatrixCell {
  status: "green" | "amber" | "red" | "grey";
  label: string;
  date?: string | null;
  href?: string | null;
}
interface MatrixColumn {
  key: string;
  label: string;
  group?: string;
}
interface MatrixCandidate {
  id: string;
  name: string;
  email: string | null;
  band: number | null;
  onboardStatus: string | null;
  cells: Record<string, MatrixCell>;
}

// Certificates are PDFs or image scans exported from external platforms.
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_EXT = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp"]);

// Canonical, trusted content-type per extension. We never echo the
// client-supplied MIME back when serving — that would let an attacker upload
// HTML/JS disguised as a `.pdf` and have the browser render it in-origin.
const EXT_CONTENT_TYPE: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const EXCELLENCE_BLUEPRINT_FILE = "excellence-blueprint.mp4";

function excellenceBlueprintPath(): string {
  return process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "private-assets", EXCELLENCE_BLUEPRINT_FILE)
    : path.resolve(process.cwd(), "server", "private-assets", EXCELLENCE_BLUEPRINT_FILE);
}

function parseByteRange(
  header: string,
  fileSize: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : fileSize - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null;
  }
  return { start, end: Math.min(end, fileSize - 1) };
}

function streamProtectedVideo(req: Request, res: Response): void {
  const filePath = excellenceBlueprintPath();
  if (!fs.existsSync(filePath)) {
    console.error("[internal-training.excellence-blueprint] protected video is missing");
    res.status(503).json({ message: "Training video is temporarily unavailable" });
    return;
  }

  const fileSize = fs.statSync(filePath).size;
  const rangeHeader = req.headers.range;
  const commonHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Type": "video/mp4",
    "X-Content-Type-Options": "nosniff",
  };

  if (!rangeHeader) {
    res.status(200).set({ ...commonHeaders, "Content-Length": String(fileSize) });
    const stream = fs.createReadStream(filePath);
    stream.on("error", (err) => {
      console.error(
        "[internal-training.excellence-blueprint] file stream failed:",
        err.message,
      );
      res.destroy();
    });
    stream.pipe(res);
    return;
  }

  const range = parseByteRange(rangeHeader, fileSize);
  if (!range) {
    res.status(416).set({
      ...commonHeaders,
      "Content-Range": `bytes */${fileSize}`,
    }).end();
    return;
  }

  const contentLength = range.end - range.start + 1;
  res.status(206).set({
    ...commonHeaders,
    "Content-Length": String(contentLength),
    "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
  });
  const stream = fs.createReadStream(filePath, range);
  stream.on("error", (err) => {
    console.error(
      "[internal-training.excellence-blueprint] range stream failed:",
      err.message,
    );
    res.destroy();
  });
  stream.pipe(res);
}

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  },
});

const mirroringStorage: multer.StorageEngine = {
  _handleFile(req, file, cb) {
    diskStorage._handleFile(req, file, (err, info) => {
      if (err || !info) return cb(err || new Error("multer disk write failed"));
      const filename = (info as any).filename as string;
      // Mirror to object storage so certs survive container restarts.
      import("../object-storage")
        .then(({ triggerBucketMirror }) => triggerBucketMirror(filename))
        .catch((mirrorErr) =>
          console.error(
            "[internal-training] bucket mirror dispatch failed:",
            (mirrorErr as Error)?.message || mirrorErr,
          ),
        );
      cb(null, info);
    });
  },
  _removeFile(req, file, cb) {
    diskStorage._removeFile(req, file, (err) => cb(err));
  },
};

const upload = multer({
  storage: mirroringStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    // Require BOTH a trusted MIME and an allowed extension so an attacker
    // cannot smuggle an HTML/JS payload past the filter by extension alone.
    if (ALLOWED_MIME.has(file.mimetype) && ALLOWED_EXT.has(ext)) {
      return cb(null, true);
    }
    cb(new Error("File type not allowed. Accepted: PDF, JPG, PNG, WEBP"));
  },
});

function isValidTrainingKey(raw: unknown): raw is InternalTrainingKey {
  return (
    typeof raw === "string" &&
    (INTERNAL_TRAINING_KEYS as readonly string[]).includes(raw)
  );
}

function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function deleteCertFile(filename: string | null | undefined) {
  if (!filename) return;
  try {
    const abs = path.join(uploadsDir, path.basename(filename));
    if (abs.startsWith(uploadsDir) && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (err) {
    console.error(
      "[internal-training] failed to delete cert from disk:",
      (err as Error)?.message || err,
    );
  }
  import("../object-storage")
    .then(({ deleteFromBucket }) => deleteFromBucket(path.basename(filename!)))
    .catch((err) =>
      console.error(
        "[internal-training] bucket delete dispatch failed:",
        (err as Error)?.message || err,
      ),
    );
}

// Shared upsert used by both admin (on-behalf) and portal (self-service).
// Replaces the existing cert for a (nurse, trainingKey) pair and cleans up
// the previously-stored file on disk + bucket.
async function performUpsert(opts: {
  nurseId: string;
  trainingKey: InternalTrainingKey;
  completedDate: string | null;
  file: Express.Multer.File;
  uploadedBy: string;
}): Promise<InternalTrainingCertificate> {
  const existing = (
    await storage.getInternalTrainingCertificatesByNurse(opts.nurseId)
  ).find((c) => c.trainingKey === opts.trainingKey);

  const row = await storage.upsertInternalTrainingCertificate({
    nurseId: opts.nurseId,
    trainingKey: opts.trainingKey,
    fileName: opts.file.filename,
    originalFileName: opts.file.originalname,
    filePath: `/api/uploads/${opts.file.filename}`,
    mimeType: opts.file.mimetype,
    fileSize: opts.file.size,
    completedDate: opts.completedDate,
    uploadedBy: opts.uploadedBy,
  });

  // Remove the superseded file (only when it actually changed).
  if (existing && existing.fileName && existing.fileName !== row.fileName) {
    deleteCertFile(existing.fileName);
  }
  return row;
}

async function serveCertificate(
  cert: InternalTrainingCertificate,
  res: Response,
) {
  const basename = path.basename(cert.fileName);
  const abs = path.join(uploadsDir, basename);
  if (!abs.startsWith(uploadsDir)) {
    return res.status(404).json({ message: "Certificate not found" });
  }
  if (!fs.existsSync(abs)) {
    const { ensureLocalCopy } = await import("../object-storage");
    const restored = await ensureLocalCopy(basename);
    if (!restored) return res.status(404).json({ message: "Certificate not found" });
  }
  // Derive the content-type from the stored file extension, never from the
  // client-supplied MIME, and force a download with nosniff so a malicious
  // upload can't be rendered as HTML/JS in our origin.
  const ext = path.extname(basename).toLowerCase();
  res.setHeader("Content-Type", EXT_CONTENT_TYPE[ext] || "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${(cert.originalFileName || basename).replace(/[\r\n"]/g, "")}"`,
  );
  res.sendFile(abs);
}

function adminAgent(req: Request): string {
  const u = (req.session as any)?.username;
  const r = (req.session as any)?.role;
  if (!u) return "system";
  return r ? `${u} (${r})` : u;
}

export function registerInternalTrainingRoutes(app: Express) {
  // ==================== ADMIN ====================

  // Whole-roster completion matrix.
  app.get(
    "/api/admin/reports/internal-training-matrix",
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const [candidates, certs] = await Promise.all([
          storage.getCandidates(),
          storage.getAllInternalTrainingCertificates(),
        ]);

        // Index certs by nurse → trainingKey for O(1) cell lookups.
        const byNurse = new Map<string, Map<string, InternalTrainingCertificate>>();
        for (const c of certs) {
          let m = byNurse.get(c.nurseId);
          if (!m) {
            m = new Map();
            byNurse.set(c.nurseId, m);
          }
          m.set(c.trainingKey, c);
        }

        const columns: MatrixColumn[] = INTERNAL_TRAININGS.map((t) => ({
          key: t.key,
          label: t.label,
          group: "Internal Training",
        }));

        const rows: MatrixCandidate[] = candidates.map((c) => {
          const cells: Record<string, MatrixCell> = {};
          const nurseCerts = byNurse.get(c.id);
          for (const t of INTERNAL_TRAININGS) {
            const cert = nurseCerts?.get(t.key);
            if (cert) {
              cells[t.key] = {
                status: "green",
                label: cert.completedDate
                  ? `Completed ${formatDate(cert.completedDate)}`
                  : "Uploaded",
                date: cert.completedDate ?? null,
                href: `/api/admin/internal-training/${cert.id}/certificate`,
              };
            } else {
              cells[t.key] = { status: "grey", label: "Not uploaded" };
            }
          }
          return {
            id: c.id,
            name: c.fullName,
            email: c.email,
            band: c.band ?? null,
            onboardStatus: c.onboardStatus ?? null,
            cells,
          };
        });

        res.json({
          generatedAt: new Date().toISOString(),
          columns,
          candidates: rows,
        });
      } catch (err: any) {
        console.error("[internal-training] matrix failed:", err);
        res
          .status(500)
          .json({ message: err?.message || "Failed to build internal training matrix" });
      }
    },
  );

  // Admin upload on behalf of a nurse.
  app.post(
    "/api/admin/nurses/:nurseId/internal-training",
    requireAdmin,
    uploadLimiter,
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const nurse = await storage.getCandidate(String(req.params.nurseId));
        if (!nurse) {
          if (req.file) deleteCertFile(req.file.filename);
          return res.status(404).json({ message: "Nurse not found" });
        }
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });
        const trainingKey = req.body.trainingKey ?? req.query.trainingKey;
        if (!isValidTrainingKey(trainingKey)) {
          deleteCertFile(req.file.filename);
          return res.status(400).json({ message: "Invalid trainingKey" });
        }
        const rawDate = req.body.completedDate ?? req.query.completedDate;
        const completedDate =
          rawDate && String(rawDate).trim() ? String(rawDate).trim() : null;
        if (completedDate !== null && !isValidDate(completedDate)) {
          deleteCertFile(req.file.filename);
          return res.status(400).json({ message: "completedDate must be YYYY-MM-DD" });
        }

        const row = await performUpsert({
          nurseId: nurse.id,
          trainingKey,
          completedDate,
          file: req.file,
          uploadedBy: adminAgent(req),
        });
        await logAction(nurse.id, "internal_training", "certificate_uploaded", adminAgent(req), {
          certificateId: row.id,
          trainingKey: row.trainingKey,
          completedDate: row.completedDate,
        });
        res.status(201).json(row);
      } catch (err: any) {
        if (req.file) deleteCertFile(req.file.filename);
        console.error("[internal-training.admin.upload] error:", err?.message || err);
        res.status(500).json({ message: err?.message || "Failed to upload certificate" });
      }
    },
  );

  // Admin download of any nurse's certificate.
  app.get(
    "/api/admin/internal-training/:id/certificate",
    requireAdmin,
    async (req: Request, res: Response) => {
      const cert = await storage.getInternalTrainingCertificate(String(req.params.id));
      if (!cert) return res.status(404).json({ message: "Certificate not found" });
      await serveCertificate(cert, res);
    },
  );

  // Admin delete.
  app.delete(
    "/api/admin/internal-training/:id",
    requireAdmin,
    async (req: Request, res: Response) => {
      const cert = await storage.getInternalTrainingCertificate(String(req.params.id));
      if (!cert) return res.status(404).json({ message: "Certificate not found" });
      await storage.deleteInternalTrainingCertificate(cert.id);
      deleteCertFile(cert.fileName);
      await logAction(cert.nurseId, "internal_training", "certificate_deleted", adminAgent(req), {
        certificateId: cert.id,
        trainingKey: cert.trainingKey,
      });
      res.json({ ok: true });
    },
  );

  // ==================== PORTAL (nurse self-service) ====================

  // Do not let the former public URL fall through to the SPA shell. The file
  // no longer exists under client/public, and all access must use the
  // authenticated endpoint below.
  app.get("/videos/excellence-blueprint.mp4", (_req: Request, res: Response) => {
    res.status(404).json({ message: "Not found" });
  });

  // The Excellence Blueprint contains proprietary training material. Keep
  // both the UI and the bytes themselves unavailable until the nurse reaches
  // the final completed stage; a copied API URL must not bypass this check.
  app.get(
    "/api/portal/:token/training/excellence-blueprint",
    validatePortalToken,
    async (req: Request, res: Response) => {
      try {
        const nurseId = (req as any).nurseId as string;
        const nurse = await storage.getCandidate(nurseId);
        if (!nurse) return res.status(404).json({ message: "Nurse not found" });
        if (nurse.currentStage !== "completed") {
          return res.status(403).json({
            error: "nurse_stage_incomplete",
            message: "Available after onboarding is complete.",
          });
        }
        streamProtectedVideo(req, res);
      } catch (err: any) {
        console.error(
          "[internal-training.excellence-blueprint] stream failed:",
          err?.message || err,
        );
        if (!res.headersSent) {
          return res.status(500).json({ message: "Failed to load training video" });
        }
        res.destroy();
      }
    },
  );

  // List the fixed trainings + this nurse's uploaded state.
  app.get(
    "/api/portal/:token/internal-training",
    validatePortalToken,
    async (req: Request, res: Response) => {
      const nurseId = (req as any).nurseId as string;
      const certs = await storage.getInternalTrainingCertificatesByNurse(nurseId);
      const byKey = new Map(certs.map((c) => [c.trainingKey, c]));
      const trainings = INTERNAL_TRAININGS.map((t) => {
        const cert = byKey.get(t.key);
        return {
          key: t.key,
          label: t.label,
          certificate: cert
            ? {
                id: cert.id,
                originalFileName: cert.originalFileName,
                completedDate: cert.completedDate,
                uploadedAt: cert.uploadedAt,
              }
            : null,
        };
      });
      res.json({ trainings });
    },
  );

  // Nurse uploads / replaces their own certificate.
  app.post(
    "/api/portal/:token/internal-training",
    validatePortalToken,
    uploadLimiter,
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        const nurseId = (req as any).nurseId as string;
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });
        const trainingKey = req.body.trainingKey ?? req.query.trainingKey;
        if (!isValidTrainingKey(trainingKey)) {
          deleteCertFile(req.file.filename);
          return res.status(400).json({ message: "Invalid trainingKey" });
        }
        const rawDate = req.body.completedDate ?? req.query.completedDate;
        const completedDate =
          rawDate && String(rawDate).trim() ? String(rawDate).trim() : null;
        if (completedDate !== null && !isValidDate(completedDate)) {
          deleteCertFile(req.file.filename);
          return res.status(400).json({ message: "completedDate must be YYYY-MM-DD" });
        }

        const row = await performUpsert({
          nurseId,
          trainingKey,
          completedDate,
          file: req.file,
          uploadedBy: "nurse",
        });
        await logAction(nurseId, "internal_training", "certificate_uploaded", portalAgent(req), {
          certificateId: row.id,
          trainingKey: row.trainingKey,
          completedDate: row.completedDate,
        });
        res.status(201).json(row);
      } catch (err: any) {
        if (req.file) deleteCertFile(req.file.filename);
        console.error("[internal-training.portal.upload] error:", err?.message || err);
        res.status(500).json({ message: err?.message || "Failed to upload certificate" });
      }
    },
  );

  // Nurse downloads their own certificate (own-only).
  app.get(
    "/api/portal/:token/internal-training/:id/certificate",
    validatePortalToken,
    async (req: Request, res: Response) => {
      const nurseId = (req as any).nurseId as string;
      const cert = await storage.getInternalTrainingCertificate(String(req.params.id));
      if (!cert || cert.nurseId !== nurseId) {
        return res.status(404).json({ message: "Certificate not found" });
      }
      await serveCertificate(cert, res);
    },
  );
}
