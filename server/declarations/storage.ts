// Thin DB layer for nurse declarations (task 121). Kept separate from the
// big server/storage.ts to avoid bloating the IStorage interface — these
// rows are always accessed by (nurseId, declarationKey).

import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { nurseDeclarations, type NurseDeclaration } from "@shared/schema";

export async function listLatestPerKey(nurseId: string): Promise<Map<string, NurseDeclaration>> {
  const rows = await db.select().from(nurseDeclarations)
    .where(eq(nurseDeclarations.nurseId, nurseId))
    .orderBy(desc(nurseDeclarations.version));
  const map = new Map<string, NurseDeclaration>();
  for (const r of rows) {
    if (!map.has(r.declarationKey)) map.set(r.declarationKey, r);
  }
  return map;
}

export async function getLatest(
  nurseId: string,
  declarationKey: string,
): Promise<NurseDeclaration | undefined> {
  const [row] = await db.select().from(nurseDeclarations)
    .where(and(
      eq(nurseDeclarations.nurseId, nurseId),
      eq(nurseDeclarations.declarationKey, declarationKey),
    ))
    .orderBy(desc(nurseDeclarations.version))
    .limit(1);
  return row;
}

export async function getHistory(
  nurseId: string,
  declarationKey: string,
): Promise<NurseDeclaration[]> {
  return db.select().from(nurseDeclarations)
    .where(and(
      eq(nurseDeclarations.nurseId, nurseId),
      eq(nurseDeclarations.declarationKey, declarationKey),
    ))
    .orderBy(desc(nurseDeclarations.version));
}

export async function createDraft(
  nurseId: string,
  declarationKey: string,
  version: number,
  answers: Record<string, unknown>,
): Promise<NurseDeclaration> {
  const [row] = await db.insert(nurseDeclarations).values({
    nurseId,
    declarationKey,
    version,
    status: "draft",
    answers,
  }).returning();
  return row;
}

export async function updateDraft(
  id: string,
  patch: Partial<{
    answers: Record<string, unknown>;
    signatureName: string | null;
  }>,
): Promise<NurseDeclaration | undefined> {
  const [row] = await db.update(nurseDeclarations)
    .set({
      ...(patch.answers !== undefined ? { answers: patch.answers } : {}),
      ...(patch.signatureName !== undefined ? { signatureName: patch.signatureName } : {}),
      updatedAt: new Date(),
    })
    .where(eq(nurseDeclarations.id, id))
    .returning();
  return row;
}

export async function markSubmitted(
  id: string,
  meta: {
    answers: Record<string, unknown>;
    signatureName: string;
    ipAddress: string | null;
    userAgent: string | null;
  },
): Promise<NurseDeclaration | undefined> {
  const [row] = await db.update(nurseDeclarations)
    .set({
      answers: meta.answers,
      signatureName: meta.signatureName,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      status: "submitted",
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(nurseDeclarations.id, id))
    .returning();
  return row;
}

export async function attachPdfDocument(
  id: string,
  pdfDocumentId: string,
): Promise<void> {
  await db.update(nurseDeclarations)
    .set({ pdfDocumentId, updatedAt: new Date() })
    .where(eq(nurseDeclarations.id, id));
}

export async function reopen(
  nurseId: string,
  declarationKey: string,
  by: string,
  reason: string,
): Promise<{ previous: NurseDeclaration; next: NurseDeclaration } | undefined> {
  const previous = await getLatest(nurseId, declarationKey);
  if (!previous) return undefined;
  // Mark the previous as 'reopened' and create a fresh draft at version+1
  // pre-populated with the previous answers so the candidate can edit.
  await db.update(nurseDeclarations)
    .set({
      status: "reopened",
      reopenedAt: new Date(),
      reopenedBy: by,
      reopenReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(nurseDeclarations.id, previous.id));
  const [next] = await db.insert(nurseDeclarations).values({
    nurseId,
    declarationKey,
    version: previous.version + 1,
    status: "draft",
    answers: (previous.answers ?? {}),
  }).returning();
  const [previousAfter] = await db.select().from(nurseDeclarations)
    .where(eq(nurseDeclarations.id, previous.id));
  return { previous: previousAfter ?? previous, next };
}
