// Thin DB layer for individual nurse agreements (task 191). Kept separate
// from the big server/storage.ts, mirroring server/declarations/storage.ts.

import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { nurseAgreements, type NurseAgreement } from "@shared/schema";

export async function listForNurse(nurseId: string): Promise<NurseAgreement[]> {
  return db.select().from(nurseAgreements)
    .where(eq(nurseAgreements.nurseId, nurseId))
    .orderBy(desc(nurseAgreements.createdAt));
}

// Portal view: voided agreements are admin bookkeeping — the nurse never
// sees them.
export async function listVisibleForNurse(nurseId: string): Promise<NurseAgreement[]> {
  const rows = await db.select().from(nurseAgreements)
    .where(eq(nurseAgreements.nurseId, nurseId))
    .orderBy(desc(nurseAgreements.createdAt));
  return rows.filter((r) => r.status !== "voided");
}

export async function getById(id: string): Promise<NurseAgreement | undefined> {
  const [row] = await db.select().from(nurseAgreements)
    .where(eq(nurseAgreements.id, id));
  return row;
}

export async function getForNurse(
  id: string,
  nurseId: string,
): Promise<NurseAgreement | undefined> {
  const [row] = await db.select().from(nurseAgreements)
    .where(and(eq(nurseAgreements.id, id), eq(nurseAgreements.nurseId, nurseId)));
  return row;
}

export async function create(input: {
  nurseId: string;
  title: string;
  contextType: "project" | "patient" | "deployment" | "other";
  contextLabel: string | null;
  sourceDocumentId: string;
  createdBy: string;
}): Promise<NurseAgreement> {
  const [row] = await db.insert(nurseAgreements).values({
    nurseId: input.nurseId,
    title: input.title,
    contextType: input.contextType,
    contextLabel: input.contextLabel,
    sourceDocumentId: input.sourceDocumentId,
    createdBy: input.createdBy,
    status: "pending",
  }).returning();
  return row;
}

// All pending→X transitions below are CONDITIONAL on status='pending' in
// SQL, so two concurrent transitions (sign vs sign, sign vs void/replace)
// cannot both win — the loser gets `undefined` back and the route returns
// 409. This is what keeps signed agreements immutable under races.
export async function replaceSourceDocument(
  id: string,
  sourceDocumentId: string,
): Promise<NurseAgreement | undefined> {
  const [row] = await db.update(nurseAgreements)
    .set({ sourceDocumentId, updatedAt: new Date() })
    .where(and(eq(nurseAgreements.id, id), eq(nurseAgreements.status, "pending")))
    .returning();
  return row;
}

// The signed-PDF document id is written in the SAME conditional update as
// the pending→signed transition, so a signed row always carries its
// certificate linkage — the PDF file + documents row are persisted BEFORE
// this is called, and cleaned up by the caller if the transition loses.
export async function markSigned(
  id: string,
  meta: {
    signatureName: string;
    ipAddress: string | null;
    userAgent: string | null;
    signedPdfDocumentId: string;
  },
): Promise<NurseAgreement | undefined> {
  const [row] = await db.update(nurseAgreements)
    .set({
      status: "signed",
      signatureName: meta.signatureName,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      signedPdfDocumentId: meta.signedPdfDocumentId,
      signedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(nurseAgreements.id, id), eq(nurseAgreements.status, "pending")))
    .returning();
  return row;
}

export async function markVoided(
  id: string,
  by: string,
  reason: string | null,
): Promise<NurseAgreement | undefined> {
  const [row] = await db.update(nurseAgreements)
    .set({
      status: "voided",
      voidedAt: new Date(),
      voidedBy: by,
      voidReason: reason,
      updatedAt: new Date(),
    })
    .where(and(eq(nurseAgreements.id, id), eq(nurseAgreements.status, "pending")))
    .returning();
  return row;
}
