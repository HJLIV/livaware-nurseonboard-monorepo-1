import type { Express } from "express";
import { db } from "../db";
import { documents, nurses } from "@shared/schema";
import { eq, desc, and, ilike, gte, lte, sql } from "drizzle-orm";

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
