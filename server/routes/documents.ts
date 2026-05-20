import type { Express, Request } from "express";
import path from "path";
import fs from "fs";
import { db } from "../db";
import { documents, nurses } from "@shared/schema";
import { eq, desc, and, or, ilike, gte, lte, sql } from "drizzle-orm";
import { storage } from "../storage";
import { uploadsDir, requireAdmin } from "../middleware";
import { logAction } from "../services/audit";
import { applyTrainingCertExtraction } from "../document-ingest";
import { triggerDocumentAnalysis } from "../document-analysis";

function agentFor(req: Request): string {
  const u = req.session?.username;
  const r = req.session?.role;
  if (!u) return "system";
  return r ? `${u} (${r})` : u;
}

function isNameMismatchEntry(entry: unknown): boolean {
  if (typeof entry === "string") return entry.startsWith("name_mismatch");
  if (entry && typeof entry === "object") {
    const code = (entry as { code?: unknown }).code;
    return typeof code === "string" && code === "name_mismatch";
  }
  return false;
}

// Document download by id. MUST be registered BEFORE the global
// `app.use("/api/documents", requireAdmin)` guard in routes.ts so that
// portal sessions (nurse signed into their own portal) can fetch their
// own documents — the requireAdmin guard would otherwise 401 them.
export function registerDocumentDownloadRoute(app: Express) {
  app.get("/api/documents/:id/download", async (req, res) => {
    const { resolveUploadAccessor, setNoCacheHeaders } = await import(
      "../services/file-access"
    );
    const docId = String(req.params.id);
    const doc = await storage.getDocument(docId);
    if (!doc) {
      setNoCacheHeaders(res);
      return res.status(404).json({ message: "Document not found" });
    }

    const accessor = await resolveUploadAccessor(req);
    if (!accessor) {
      setNoCacheHeaders(res);
      return res.status(401).json({ message: "Authentication required" });
    }

    const refereeMismatch =
      accessor.kind === "referee" &&
      (!accessor.allowedDocumentId || accessor.allowedDocumentId !== doc.id);
    if (
      accessor.kind !== "admin" &&
      (accessor.nurseId !== doc.nurseId || refereeMismatch)
    ) {
      await storage
        .createAuditLog({
          nurseId: doc.nurseId,
          module: "documents",
          action: "document_fetch_denied",
          agentName: `${accessor.kind}:${accessor.nurseId}`,
          detail: {
            documentId: docId,
            filename: doc.filename,
            requestedByNurseId: accessor.nurseId,
            ownerNurseId: doc.nurseId,
            accessorKind: accessor.kind,
            reason: "owner_mismatch",
          },
        })
        .catch((err) =>
          console.error("[documents/download] audit write failed:", (err as Error)?.message || err),
        );
      setNoCacheHeaders(res);
      return res.status(403).json({ message: "Document not available" });
    }

    if (!doc.filePath) {
      setNoCacheHeaders(res);
      return res.status(404).json({ message: "Document has no stored file" });
    }
    const basename = path.basename(doc.filePath);
    const absolute = path.join(uploadsDir, basename);
    if (!absolute.startsWith(uploadsDir)) {
      setNoCacheHeaders(res);
      return res.status(404).json({ message: "File not found on server" });
    }
    if (!fs.existsSync(absolute)) {
      // Try to re-hydrate from the persistent bucket — disk is a hot
      // cache; the durable copy lives in Replit Object Storage and may
      // need to be pulled back down after a container restart / scale.
      const { ensureLocalCopy } = await import("../object-storage");
      const restored = await ensureLocalCopy(basename);
      if (!restored) {
        setNoCacheHeaders(res);
        return res.status(404).json({ message: "File not found on server" });
      }
    }
    setNoCacheHeaders(res);
    if (doc.mimeType) res.setHeader("Content-Type", doc.mimeType);
    if (doc.originalFilename) {
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${doc.originalFilename.replace(/[^\w. -]+/g, "_")}"`,
      );
    }
    res.sendFile(absolute);
  });
}

export function registerDocumentRoutes(app: Express) {
  app.get("/api/admin/documents", async (req, res) => {
    const search = req.query.search as string | undefined;
    const candidate = req.query.candidate as string | undefined;
    const category = req.query.category as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string) || 50, 200));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (candidate) conditions.push(eq(documents.nurseId, candidate));
    if (category) conditions.push(eq(documents.category, category));
    if (dateFrom) conditions.push(gte(documents.uploadedAt, new Date(dateFrom)));
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setDate(endOfDay.getDate() + 1);
      conditions.push(lte(documents.uploadedAt, endOfDay));
    }
    if (search) {
      const term = `%${search}%`;
      conditions.push(
        sql`(${ilike(documents.filename, term)} OR ${ilike(documents.originalFilename, term)} OR ${ilike(nurses.fullName, term)})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: documents.id,
          nurseId: documents.nurseId,
          type: documents.type,
          filename: documents.filename,
          originalFilename: documents.originalFilename,
          filePath: documents.filePath,
          fileSize: documents.fileSize,
          mimeType: documents.mimeType,
          category: documents.category,
          sharepointUrl: documents.sharepointUrl,
          aiStatus: documents.aiStatus,
          uploadedAt: documents.uploadedAt,
          candidateName: nurses.fullName,
        })
        .from(documents)
        .innerJoin(nurses, eq(documents.nurseId, nurses.id))
        .where(whereClause)
        .orderBy(desc(documents.uploadedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .innerJoin(nurses, eq(documents.nurseId, nurses.id))
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  app.delete("/api/documents/:id", async (req, res) => {
    const docId = req.params.id;
    const doc = await storage.getDocument(docId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    // Cascade: any mandatory_training row that was auto-recorded against
    // this document (e.g. by the chase-reply auto-attach pipeline) must be
    // removed too, otherwise the training matrix keeps a green cell pointing
    // at a deleted certificate.
    let removedTrainingRows = 0;
    try {
      removedTrainingRows = await storage.deleteMandatoryTrainingByDocumentId(docId);
    } catch (e: any) {
      console.warn(`[Document Delete] Failed to clean training rows for ${docId}:`, e?.message || e);
    }

    if (doc.filePath) {
      const basename = path.basename(doc.filePath);
      try {
        const absolute = path.join(uploadsDir, basename);
        if (absolute.startsWith(uploadsDir) && fs.existsSync(absolute)) {
          fs.unlinkSync(absolute);
        }
      } catch (e: any) {
        console.warn(`[Document Delete] Failed to remove file for ${docId}:`, e?.message || e);
      }
      // Mirror the disk delete into the persistent bucket so the file
      // is gone from BOTH stores. Fire-and-forget — never block the
      // user-visible reject action on a bucket round-trip.
      try {
        const { deleteFromBucket } = await import("../object-storage");
        void deleteFromBucket(basename);
      } catch (e: any) {
        console.warn(
          `[Document Delete] bucket delete dispatch failed for ${docId}:`,
          e?.message || e,
        );
      }
    }

    await storage.deleteDocument(docId);

    await logAction(doc.nurseId, "admin", "document_deleted", agentFor(req), {
      documentId: docId,
      type: doc.type,
      category: doc.category,
      filename: doc.originalFilename || doc.filename,
      filePath: doc.filePath,
      removedTrainingRows,
    });

    res.json({ ok: true, removedTrainingRows });
  });

  // ── Admin "keep but don't assign" action for the review queue ──────────
  // Used when an admin wants to retain a document on the candidate's record
  // for audit purposes but explicitly NOT credit it against any mandatory
  // training module / section. Strips any auto-attached mandatory_training
  // rows linked to the doc, replaces chase-reply / low-confidence markers
  // with a `manual_unassigned` sticky marker, and clears aiStatus to "pass"
  // so the row drops out of the review queue.
  app.post("/api/documents/:id/unassign-training", requireAdmin, async (req, res) => {
    const docId = String(req.params.id);
    const doc = await storage.getDocument(docId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    let removedTrainingRows = 0;
    try {
      removedTrainingRows = await storage.deleteMandatoryTrainingByDocumentId(docId);
    } catch (e: any) {
      console.warn(`[Document Unassign] Failed to clean training rows for ${docId}:`, e?.message || e);
    }

    const prior = Array.isArray(doc.aiIssues) ? (doc.aiIssues as any[]) : [];
    const filtered = prior.filter(
      (e) =>
        !e ||
        typeof e !== "object" ||
        (e.code !== "chase_reply_low_confidence" &&
          e.code !== "chase_reply_upsert_failed" &&
          e.code !== "chase_reply_auto_attached" &&
          e.code !== "low_confidence_classification" &&
          e.code !== "manual_unassigned"),
    );
    const marker = {
      code: "manual_unassigned",
      message: `Stored on file but explicitly NOT credited against any mandatory training module — set by ${agentFor(req)}.`,
      setBy: agentFor(req),
      setAt: new Date().toISOString(),
      removedTrainingRows,
    };

    const updated = await storage.updateDocument(docId, {
      aiStatus: "pass",
      aiIssues: [...filtered, marker],
      aiAnalyzedAt: new Date(),
    } as any);

    await logAction(doc.nurseId, "admin", "document_unassigned_from_training", agentFor(req), {
      documentId: docId,
      type: doc.type,
      category: doc.category,
      filename: doc.originalFilename || doc.filename,
      removedTrainingRows,
    });

    res.json({ ok: true, document: updated, removedTrainingRows });
  });

  // ── Admin manual category override ─────────────────────────────────────
  // Lets an admin correct a misclassified document (e.g. "other" → "training
  // certificate"). When set to training_certificate, the cert-specific
  // pipeline (module match + completion/expiry dates + attendee name) is
  // re-run automatically. When changed AWAY from training_certificate, any
  // mandatory_training rows that were auto-recorded from this document are
  // removed so stale entries don't keep showing.
  const ALLOWED_CATEGORIES = new Set([
    "identity",
    "right_to_work",
    "profile",
    "competency_evidence",
    "training_certificate",
    "health",
    "indemnity",
    "dbs",
    "nmc",
    "proof_of_address",
    "other",
  ]);

  app.patch("/api/documents/:id/category", requireAdmin, async (req, res) => {
    const docId = String(req.params.id);
    const newCategory = typeof req.body?.category === "string" ? req.body.category.trim() : "";
    if (!ALLOWED_CATEGORIES.has(newCategory)) {
      return res.status(400).json({
        message: `Invalid category. Must be one of: ${Array.from(ALLOWED_CATEGORIES).join(", ")}`,
      });
    }

    const doc = await storage.getDocument(docId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const fromCategory = doc.category || "other";
    if (fromCategory === newCategory) {
      return res.json({ ok: true, document: doc, changed: false });
    }

    // Stamp the override so the UI can show "Set by admin" and admins can see
    // it wasn't an AI decision. Stored as a structured aiIssues entry rather
    // than adding a new column — keeps the schema simple and reuses the
    // existing front-end issue rendering.
    const overrideMarker = {
      code: "manual_category_override",
      message: `Category set by admin (${agentFor(req)}) — was "${fromCategory}", now "${newCategory}".`,
      from: fromCategory,
      to: newCategory,
      setBy: agentFor(req),
      setAt: new Date().toISOString(),
    };

    // Always wipe stale AI issues from the previous category — they were
    // assessed against a different document type and shouldn't leak through.
    // aiStatus is reset to null; triggerDocumentAnalysis below will flip it
    // to "pending" then to a real status once the new analysis lands.
    const updates: Record<string, unknown> = {
      category: newCategory,
      aiStatus: null,
      aiIssues: [overrideMarker],
      aiAnalyzedAt: null,
    };

    let updated = await storage.updateDocument(docId, updates as any);

    // If we're moving AWAY from training_certificate, clear any mandatory
    // training rows we previously auto-recorded from this doc — they will
    // now be misleading.
    let removedTrainingRows = 0;
    if (fromCategory === "training_certificate" && newCategory !== "training_certificate") {
      try {
        removedTrainingRows = await storage.deleteMandatoryTrainingByDocumentId(docId);
      } catch (e: any) {
        console.warn(
          `[Document Category Override] Failed to clean training rows for ${docId}:`,
          e?.message || e,
        );
      }
    }

    // Kick off completeness analysis appropriate to the NEW category.
    // triggerDocumentAnalysis short-circuits for unsupported categories /
    // mime types, but in those cases we still want a clean UI state.
    if (doc.filePath && doc.mimeType) {
      try {
        triggerDocumentAnalysis(
          docId,
          doc.filePath,
          doc.mimeType,
          newCategory,
          doc.type || newCategory,
          doc.nurseId,
        );
      } catch (e: any) {
        console.warn(
          `[Document Category Override] triggerDocumentAnalysis failed for ${docId}:`,
          e?.message || e,
        );
      }
    }

    // If the new category is training_certificate, run the cert-specific
    // pipeline (module match + dates + auto-create mandatory_training rows).
    // We do this in the background so the API response returns promptly.
    let trainingAddedPromise: Promise<string[]> | null = null;
    if (newCategory === "training_certificate" && doc.filePath && doc.mimeType) {
      const basename = path.basename(doc.filePath);
      const absolutePath = path.join(uploadsDir, basename);
      if (fs.existsSync(absolutePath)) {
        trainingAddedPromise = applyTrainingCertExtraction({
          nurseId: doc.nurseId,
          documentId: docId,
          absolutePath,
          mimeType: doc.mimeType,
        }).catch((e: any) => {
          console.warn(
            `[Document Category Override] Cert extraction failed for ${docId}:`,
            e?.message || e,
          );
          return [];
        });
      } else {
        console.warn(
          `[Document Category Override] File missing on disk for ${docId} at ${absolutePath}; skipping cert extraction.`,
        );
      }
    }

    await logAction(doc.nurseId, "admin", "document_category_overridden", agentFor(req), {
      documentId: docId,
      type: doc.type,
      filename: doc.originalFilename || doc.filename,
      fromCategory,
      toCategory: newCategory,
      removedTrainingRows,
      manualOverride: true,
    });

    // If cert extraction was triggered, await it briefly so the response can
    // tell the admin which modules (if any) were auto-recorded. We do this
    // synchronously because the UI already accepts a small wait — the toast
    // can then say "2 training modules auto-recorded".
    let trainingAdded: string[] = [];
    if (trainingAddedPromise) {
      try {
        trainingAdded = await trainingAddedPromise;
      } catch {
        trainingAdded = [];
      }
    }

    res.json({
      ok: true,
      document: updated,
      changed: true,
      fromCategory,
      toCategory: newCategory,
      removedTrainingRows,
      trainingModulesAdded: trainingAdded,
    });
  });

  app.post("/api/documents/:id/confirm-name-match", async (req, res) => {
    const docId = req.params.id;
    const doc = await storage.getDocument(docId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const currentIssues: unknown[] = Array.isArray(doc.aiIssues) ? (doc.aiIssues as unknown[]) : [];
    const removed = currentIssues.filter(isNameMismatchEntry);
    if (removed.length === 0) {
      return res.json({ ok: true, document: doc, cleared: 0 });
    }

    const remainingIssues = currentIssues.filter((entry) => !isNameMismatchEntry(entry));
    const onlyMismatchWasFlagging = doc.aiStatus === "warning" && remainingIssues.length === 0;
    const updates: Record<string, unknown> = {
      aiIssues: remainingIssues,
    };
    if (onlyMismatchWasFlagging) {
      updates.aiStatus = "pass";
    }

    const updated = await storage.updateDocument(docId, updates as any);

    await logAction(doc.nurseId, "admin", "document_name_match_confirmed", agentFor(req), {
      documentId: docId,
      type: doc.type,
      category: doc.category,
      filename: doc.originalFilename || doc.filename,
      clearedIssues: removed,
    });

    res.json({ ok: true, document: updated, cleared: removed.length });
  });

  // ── Admin review queue: every document the AI is unhappy with ─────────
  // Lists every document with `aiStatus IN ('warning', 'fail')` across all
  // candidates. This is the single surface admins use to clear AI-flagged
  // documents — low-confidence classifications, chase-reply auto-ingest
  // markers, name mismatches, expired/illegible certificates, NMC parsing
  // problems, etc. all land here.
  //
  // The list naturally shrinks as admins act on items: PATCH
  // /api/documents/:id/category, the chase-reply auto-attach handlers,
  // and the confirm-name-match endpoint all reset `aiStatus` and replace
  // `aiIssues` so the row drops out of the queue on the next refetch.
  // ── Admin approval ─────────────────────────────────────────────────────
  // Confirms a flagged document is genuine and applies the chosen category
  // (which auto-attaches mandatory training rows when the category is
  // `training_certificate`). Clears the review flag (aiStatus → pass) so
  // the row drops off /documents-review, records an optional short note
  // against the document AND in the audit trail.
  app.post("/api/documents/:id/approve", requireAdmin, async (req, res) => {
    const docId = String(req.params.id);
    const rawCategory = typeof req.body?.category === "string" ? req.body.category.trim() : "";
    const rawNote = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    if (!ALLOWED_CATEGORIES.has(rawCategory)) {
      return res.status(400).json({
        message: `Invalid category. Must be one of: ${Array.from(ALLOWED_CATEGORIES).join(", ")}`,
      });
    }
    if (rawNote.length > 500) {
      return res.status(400).json({ message: "Note must be 500 characters or fewer." });
    }

    const doc = await storage.getDocument(docId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const fromCategory = doc.category || "other";
    const categoryChanged = fromCategory !== rawCategory;
    const agent = agentFor(req);
    const nowIso = new Date().toISOString();

    // Build the approval marker. Replaces noisy AI flags so the candidate
    // detail page shows a clean "approved by admin" indicator instead of
    // the old amber warning.
    const approvalMarker: Record<string, unknown> = {
      code: "admin_approved",
      message: rawNote
        ? `Approved by ${agent} as "${rawCategory}". Note: ${rawNote}`
        : `Approved by ${agent} as "${rawCategory}".`,
      category: rawCategory,
      fromCategory,
      approvedBy: agent,
      approvedAt: nowIso,
    };
    if (rawNote) approvalMarker.note = rawNote;

    // Keep any non-review structured issues (e.g. extracted dates) for
    // context but drop everything the review queue keys off so the row
    // can leave the queue cleanly.
    const prior = Array.isArray(doc.aiIssues) ? (doc.aiIssues as any[]) : [];
    const filtered = prior.filter(
      (e) =>
        !e ||
        typeof e !== "object" ||
        (e.code !== "chase_reply_low_confidence" &&
          e.code !== "chase_reply_upsert_failed" &&
          e.code !== "chase_reply_auto_attached" &&
          e.code !== "low_confidence_classification" &&
          e.code !== "manual_unassigned" &&
          e.code !== "manual_category_override" &&
          e.code !== "admin_approved"),
    );

    const updates: Record<string, unknown> = {
      category: rawCategory,
      aiStatus: "pass",
      aiIssues: [...filtered, approvalMarker],
      aiAnalyzedAt: new Date(),
    };

    let updated = await storage.updateDocument(docId, updates as any);

    // If we're moving AWAY from training_certificate, clear any mandatory
    // training rows previously auto-recorded from this doc.
    let removedTrainingRows = 0;
    if (categoryChanged && fromCategory === "training_certificate" && rawCategory !== "training_certificate") {
      try {
        removedTrainingRows = await storage.deleteMandatoryTrainingByDocumentId(docId);
      } catch (e: any) {
        console.warn(`[Document Approve] Failed to clean training rows for ${docId}:`, e?.message || e);
      }
    }

    // If the (new) category is training_certificate, run the cert pipeline
    // so training modules get auto-attached on approval. Only re-runs when
    // the category actually changed — re-approving a doc already at
    // training_certificate doesn't need to redo the extraction.
    let trainingAdded: string[] = [];
    if (
      categoryChanged &&
      rawCategory === "training_certificate" &&
      doc.filePath &&
      doc.mimeType
    ) {
      const basename = path.basename(doc.filePath);
      const absolutePath = path.join(uploadsDir, basename);
      if (fs.existsSync(absolutePath)) {
        try {
          trainingAdded = await applyTrainingCertExtraction({
            nurseId: doc.nurseId,
            documentId: docId,
            absolutePath,
            mimeType: doc.mimeType,
          });
        } catch (e: any) {
          console.warn(`[Document Approve] Cert extraction failed for ${docId}:`, e?.message || e);
        }
      } else {
        console.warn(
          `[Document Approve] File missing on disk for ${docId} at ${absolutePath}; skipping cert extraction.`,
        );
      }
    }

    await logAction(doc.nurseId, "documents", "document_approved", agent, {
      documentId: docId,
      type: doc.type,
      filename: doc.originalFilename || doc.filename,
      fromCategory,
      toCategory: rawCategory,
      categoryChanged,
      note: rawNote || null,
      removedTrainingRows,
      trainingModulesAdded: trainingAdded,
    });

    res.json({
      ok: true,
      document: updated,
      fromCategory,
      toCategory: rawCategory,
      categoryChanged,
      removedTrainingRows,
      trainingModulesAdded: trainingAdded,
      note: rawNote || null,
    });
  });

  app.get("/api/admin/documents/review-queue", async (_req, res) => {
    const rows = await db
      .select({
        id: documents.id,
        nurseId: documents.nurseId,
        type: documents.type,
        filename: documents.filename,
        originalFilename: documents.originalFilename,
        filePath: documents.filePath,
        fileSize: documents.fileSize,
        mimeType: documents.mimeType,
        category: documents.category,
        notes: documents.notes,
        sharepointUrl: documents.sharepointUrl,
        aiStatus: documents.aiStatus,
        aiIssues: documents.aiIssues,
        uploadedAt: documents.uploadedAt,
        candidateName: nurses.fullName,
      })
      .from(documents)
      .innerJoin(nurses, eq(documents.nurseId, nurses.id))
      .where(
        or(
          eq(documents.aiStatus, "warning"),
          eq(documents.aiStatus, "fail"),
        ),
      )
      .orderBy(desc(documents.uploadedAt));

    res.json({ data: rows, total: rows.length });
  });

  app.get("/api/admin/documents/filters", async (_req, res) => {
    const [candidateRows, categoryRows] = await Promise.all([
      db
        .selectDistinct({ id: nurses.id, name: nurses.fullName })
        .from(nurses)
        .innerJoin(documents, eq(documents.nurseId, nurses.id))
        .orderBy(nurses.fullName),
      db
        .selectDistinct({ category: documents.category })
        .from(documents)
        .where(sql`${documents.category} IS NOT NULL`)
        .orderBy(documents.category),
    ]);

    res.json({
      candidates: candidateRows,
      categories: categoryRows.map((r) => r.category).filter(Boolean),
    });
  });
}
