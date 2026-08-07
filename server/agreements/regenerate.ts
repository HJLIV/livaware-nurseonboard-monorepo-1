// Rebuild sealed records for agreements signed before the wording was
// embedded in the PDF (task 201).
//
// Signature data is never touched: the regenerated PDF is rendered from the
// signature already on record. Only the derived fields change — the extracted
// wording (re-read from the stored original when it was never captured) and
// the pointer to the freshly rendered record. Each agreement is isolated so
// one unreadable document cannot stop the run.

import { db } from "../db";
import { nurses } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { logAction } from "../services/audit";
import * as agreements from "./storage";
import {
  buildSignedAgreementPdf,
  storeSignedAgreementPdf,
  discardStoredPdf,
  mirrorToBucket,
  readUploadBuffer,
} from "./seal";
import { extractPolicyFromFile } from "../policy-extractor";

export interface RegenerateResult {
  considered: number;
  regenerated: number;
  failed: { agreementId: string; reason: string }[];
}

export async function regenerateSignedAgreementPdfs(opts: {
  triggeredBy: string;
  agreementIds?: string[];
}): Promise<RegenerateResult> {
  const all = await agreements.listSigned();
  const wanted = opts.agreementIds?.length
    ? all.filter((a) => opts.agreementIds!.includes(a.id))
    : all;

  const result: RegenerateResult = { considered: wanted.length, regenerated: 0, failed: [] };

  for (const agreement of wanted) {
    try {
      const [nurse] = await db.select().from(nurses).where(eq(nurses.id, agreement.nurseId));
      const sourceDoc = await storage.getDocument(agreement.sourceDocumentId);
      if (!nurse || !sourceDoc) {
        result.failed.push({ agreementId: agreement.id, reason: "Nurse or source document missing" });
        continue;
      }

      // Records issued before in-app reading have no stored wording — try to
      // read it out of the original now so the rebuilt PDF is self-contained.
      let row = agreement;
      if (!row.contentMarkdown) {
        const buffer = await readUploadBuffer(sourceDoc.filename);
        if (buffer) {
          try {
            const { body } = await extractPolicyFromFile(
              buffer,
              sourceDoc.originalFilename || sourceDoc.filename,
              sourceDoc.mimeType || "",
            );
            await agreements.setExtractedContent(row.id, { contentMarkdown: body, extractionError: null });
            row = { ...row, contentMarkdown: body, extractionError: null };
          } catch (err: any) {
            const message = err?.message || "Text could not be extracted from the document.";
            await agreements.setExtractedContent(row.id, { contentMarkdown: null, extractionError: message });
            row = { ...row, contentMarkdown: null, extractionError: message };
          }
        }
      }

      const buffer = await buildSignedAgreementPdf({
        agreement: row,
        nurse,
        sourceDocument: sourceDoc,
      });
      const stored = await storeSignedAgreementPdf({
        nurseId: row.nurseId,
        nurseFullName: nurse.fullName,
        agreementTitle: row.title,
        buffer,
      });

      // Compare-and-swap against the pointer we started from: if the row was
      // voided/replaced or another rebuild won in the meantime, this one
      // loses and cleans up after itself.
      const supersededId = agreement.signedPdfDocumentId;
      const superseded = supersededId ? await storage.getDocument(supersededId) : null;
      const relinked = await agreements.relinkSignedPdf(row.id, stored.documentId, supersededId);
      if (!relinked) {
        await discardStoredPdf(stored.documentId, stored.filename);
        result.failed.push({
          agreementId: row.id,
          reason: "The agreement changed while it was being rebuilt — nothing was replaced",
        });
        continue;
      }

      let cleanupProblem: string | null = null;
      if (supersededId && supersededId !== stored.documentId) {
        cleanupProblem = await discardStoredPdf(supersededId, superseded?.filename ?? null);
      }

      mirrorToBucket(stored.filename);
      await logAction(row.nurseId, "service_agreement", "individual_agreement_pdf_regenerated", opts.triggeredBy, {
        agreementId: row.id,
        title: row.title,
        documentId: stored.documentId,
        supersededDocumentId: supersededId,
        embeddedWording: Boolean(row.contentMarkdown),
        ...(cleanupProblem ? { cleanupProblem } : {}),
      });
      result.regenerated++;
      // The rebuild itself succeeded; surface a stuck superseded row so it is
      // visible rather than silently left behind.
      if (cleanupProblem) result.failed.push({ agreementId: row.id, reason: cleanupProblem });
    } catch (err: any) {
      const reason = err?.message || String(err);
      console.error(`[agreements] regeneration failed for ${agreement.id}:`, reason);
      result.failed.push({ agreementId: agreement.id, reason });
    }
  }

  return result;
}
