import type { Express, Request } from "express";
import path from "path";
import fs from "fs";
import { db } from "../db";
import { documents, nurses } from "@shared/schema";
import { eq, desc, and, ilike, gte, lte, sql } from "drizzle-orm";
import { storage } from "../storage";
import { uploadsDir } from "../middleware";
import { logAction } from "../services/audit";

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
