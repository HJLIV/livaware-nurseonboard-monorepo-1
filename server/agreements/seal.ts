// Shared helpers for producing and storing the sealed signed-agreement PDF
// (task 201). Used by the portal sign route and by the regeneration pass that
// rebuilds records issued before the wording was embedded.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { uploadsDir } from "../middleware";
import { storage } from "../storage";
import { generateSignedAgreementPDF } from "./pdf";
import type { NurseAgreement, Nurse } from "@shared/schema";

export interface SourceDocumentLike {
  filename: string;
  originalFilename: string | null;
  mimeType?: string | null;
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
}

// Read an uploaded file from local disk, pulling it back from the durable
// bucket first when the container's hot cache no longer has it.
export async function readUploadBuffer(filename: string): Promise<Buffer | null> {
  try {
    const basename = path.basename(filename);
    const absolute = path.join(uploadsDir, basename);
    if (!absolute.startsWith(uploadsDir)) return null;
    if (!fs.existsSync(absolute)) {
      const { ensureLocalCopy } = await import("../object-storage");
      const restored = await ensureLocalCopy(basename);
      if (!restored) return null;
    }
    return await fs.promises.readFile(absolute);
  } catch (err: any) {
    console.error("[agreements] could not read upload:", err?.message || err);
    return null;
  }
}

export function fingerprint(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

// Render the sealed record. The fingerprint of the original upload is
// best-effort: an unreadable original degrades the printed detail but never
// blocks signing.
export async function buildSignedAgreementPdf(opts: {
  agreement: NurseAgreement;
  nurse: Pick<Nurse, "fullName" | "email">;
  sourceDocument: SourceDocumentLike;
}): Promise<Buffer> {
  const sourceBuffer = await readUploadBuffer(opts.sourceDocument.filename);
  return generateSignedAgreementPDF({
    agreement: opts.agreement,
    nurse: opts.nurse,
    sourceDocument: opts.sourceDocument,
    fingerprint: sourceBuffer ? fingerprint(sourceBuffer) : null,
  });
}

// Write the rendered PDF to disk and register it as a documents row. Callers
// own the cleanup path: if whatever they do next fails, they must call
// `discardStoredPdf` so no orphan file/row is left behind.
export async function storeSignedAgreementPdf(opts: {
  nurseId: string;
  nurseFullName: string;
  agreementTitle: string;
  buffer: Buffer;
}): Promise<{ documentId: string; filename: string }> {
  const datePart = new Date().toISOString().split("T")[0];
  const filename = `individual-agreement-${safeFilenamePart(opts.nurseFullName)}-${datePart}-${crypto
    .randomBytes(4)
    .toString("hex")}.pdf`;
  await fs.promises.writeFile(path.join(uploadsDir, filename), opts.buffer);
  try {
    const doc = await storage.createDocument({
      nurseId: opts.nurseId,
      type: "individual_agreement_signed",
      category: "agreement",
      filename,
      originalFilename: `${opts.agreementTitle} — Signed — ${opts.nurseFullName}.pdf`,
      filePath: `/api/uploads/${filename}`,
      fileSize: opts.buffer.length,
      mimeType: "application/pdf",
      uploadedBy: "system",
    });
    return { documentId: doc.id, filename };
  } catch (err) {
    fs.promises.unlink(path.join(uploadsDir, filename)).catch(() => {});
    throw err;
  }
}

// Removal of a stored record (orphans after a lost race, superseded records
// after a regeneration). Never throws; resolves to the first error so callers
// that care — the regeneration run — can report it instead of losing it.
export async function discardStoredPdf(
  documentId: string | null,
  filename: string | null,
): Promise<string | null> {
  let problem: string | null = null;
  if (documentId) {
    try {
      await storage.deleteDocument(documentId);
    } catch (err: any) {
      problem = `document row ${documentId} could not be deleted: ${err?.message || err}`;
      console.error("[agreements] superseded record cleanup failed:", problem);
    }
  }
  if (filename) {
    const basename = path.basename(filename);
    await fs.promises.unlink(path.join(uploadsDir, basename)).catch(() => {});
    try {
      const { deleteFromBucket } = await import("../object-storage");
      await deleteFromBucket(basename);
    } catch (err: any) {
      console.error("[agreements] superseded file cleanup failed:", err?.message || err);
    }
  }
  return problem;
}

export function mirrorToBucket(filename: string): void {
  import("../object-storage")
    .then(({ triggerBucketMirror }) => triggerBucketMirror(filename))
    .catch((err: any) =>
      console.error("[agreements] bucket mirror failed:", err?.message || err),
    );
}
