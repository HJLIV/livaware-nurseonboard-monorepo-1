import type { Express, Request } from "express";
import path from "path";
import fs from "fs";
import { db } from "../db";
import { documents, nurses } from "@shared/schema";
import { eq, desc, and, ilike, gte, lte, sql } from "drizzle-orm";
import { storage } from "../storage";
import { uploadsDir, requireAdmin } from "../middleware";
import { logAction } from "../services/audit";
import { applyTrainingCertExtraction } from "../document-ingest";
import { triggerDocumentAnalysis } from "../document-analysis";

function agentFor(req: Request): string {
  return req.session?.username || "system";
}

function isNameMismatchEntry(entry: unknown): boolean {
  if (typeof entry === "string") return entry.startsWith("name_mismatch");
  if (entry && typeof entry === "object") {
    const code = (entry as { code?: unknown }).code;
    return typeof code === "string" && code === "name_mismatch";
  }
  return false;
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

    if (doc.filePath) {
      try {
        const basename = path.basename(doc.filePath);
        const absolute = path.join(uploadsDir, basename);
        if (absolute.startsWith(uploadsDir) && fs.existsSync(absolute)) {
          fs.unlinkSync(absolute);
        }
      } catch (e: any) {
        console.warn(`[Document Delete] Failed to remove file for ${docId}:`, e?.message || e);
      }
    }

    await storage.deleteDocument(docId);

    await logAction(doc.nurseId, "admin", "document_deleted", agentFor(req), {
      documentId: docId,
      type: doc.type,
      category: doc.category,
      filename: doc.originalFilename || doc.filename,
      filePath: doc.filePath,
    });

    res.json({ ok: true });
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
