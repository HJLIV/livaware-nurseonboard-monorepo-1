import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { uploadsDir } from "./middleware";
import { classifyDocumentSmart } from "./document-ai";
import { parseCvWorkHistory } from "./cv-ai";
import { analyzeCertificateWithAI } from "./certificate-ai";
import { triggerSharePointUpload, triggerEmailNotification } from "./sharepoint-helper";
import { MANDATORY_TRAINING_MODULES } from "@shared/schema";

export type IngestSource = "admin" | "nurse" | "orphan_recovery" | "sharepoint_recovery" | "mailbox_recovery";

export interface IngestResult {
  documentId: string;
  category: string;
  type: string;
  aiAvailable: boolean;
  cvDetected: boolean;
  cvEntriesAdded: number;
  cvEntriesSkipped: number;
  cvEducationAdded: number;
  cvEducationSkipped: number;
  trainingModulesAdded: string[];
  classificationConfidence: string;
  matchedTrainingModules: string[];
}

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const safeDate = (dateStr: string | null): string | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
};

/**
 * Take a file already saved to disk (typically in `uploadsDir`) and run the
 * full ingestion pipeline:
 *   1. Persist a `documents` row.
 *   2. Trigger background SharePoint upload + email notification.
 *   3. AI-classify the document.
 *   4. Extract CV work history + education (if it's a CV).
 *   5. Extract mandatory training entries (if it's a certificate).
 *
 * The caller is responsible for putting the file at `absolutePath` (usually
 * inside `uploadsDir`). The relative `filePath` stored in the DB will be
 * `/api/uploads/<basename>`.
 */
export async function ingestExistingFile(opts: {
  nurseId: string;
  absolutePath: string;
  originalFilename: string;
  mimeType: string;
  source: IngestSource;
  uploadedBy?: string;
  /**
   * If true, skip triggering the SharePoint background upload. Useful for the
   * SharePoint-recovery flow where the file *came from* SharePoint and would
   * just round-trip uselessly.
   */
  skipSharePointUpload?: boolean;
  skipEmailNotification?: boolean;
}): Promise<IngestResult> {
  const { nurseId, absolutePath, originalFilename, mimeType, source } = opts;

  const stat = fs.statSync(absolutePath);
  const filename = path.basename(absolutePath);
  const filePath = `/api/uploads/${filename}`;
  const moduleNames = MANDATORY_TRAINING_MODULES.map((m) => m.name);

  // ── 1. Classify ────────────────────────────────────────────────────────
  let classification: Awaited<ReturnType<typeof classifyDocumentSmart>> | null = null;
  let aiAvailable = true;
  try {
    classification = await classifyDocumentSmart(absolutePath, mimeType, moduleNames);
  } catch (err: any) {
    if (err.message?.includes("API key is not configured")) {
      aiAvailable = false;
    } else {
      throw err;
    }
  }
  const detectedCategory = classification?.detectedCategory || "general";
  const detectedType = classification?.detectedType || originalFilename || "Document";

  // ── 2. Persist document row ────────────────────────────────────────────
  const doc = await storage.createDocument({
    nurseId,
    type: detectedType,
    filename,
    originalFilename,
    filePath,
    fileSize: stat.size,
    mimeType,
    category: detectedCategory,
    uploadedBy: opts.uploadedBy ?? (source === "nurse" ? "nurse" : "admin"),
  });

  // ── 3. Background side-effects ────────────────────────────────────────
  if (!opts.skipSharePointUpload) {
    try {
      triggerSharePointUpload(doc.id, nurseId, filePath, originalFilename, detectedCategory);
    } catch (e) {
      console.warn("[ingestExistingFile] SharePoint trigger failed (non-fatal)", e);
    }
  }
  if (!opts.skipEmailNotification) {
    try {
      triggerEmailNotification(nurseId, filePath, originalFilename, detectedCategory, opts.uploadedBy ?? "admin", mimeType);
    } catch (e) {
      console.warn("[ingestExistingFile] Email trigger failed (non-fatal)", e);
    }
  }

  try {
    const { triggerDocumentAnalysis } = await import("./document-analysis");
    triggerDocumentAnalysis(doc.id, filePath, mimeType, detectedCategory, detectedType, nurseId);
  } catch (e) {
    console.warn("[ingestExistingFile] AI analysis trigger failed (non-fatal)", e);
  }

  // Surface low-confidence catch-all classifications so admins know to
  // double-check the category instead of a silent drop into "other"/"general".
  // Only kicks in when triggerDocumentAnalysis won't itself produce an
  // aiStatus (which happens for un-analyzable categories like "other").
  if (
    classification &&
    classification.confidence === "low" &&
    (detectedCategory === "other" || detectedCategory === "general")
  ) {
    try {
      await storage.updateDocument(doc.id, {
        aiStatus: "warning",
        aiIssues: [
          {
            code: "low_confidence_classification",
            message:
              "AI was not confident about this document's category. Please review and override the category if needed (e.g. set to Training Certificate).",
          },
        ],
        aiAnalyzedAt: new Date(),
      } as any);
    } catch (e) {
      console.warn("[ingestExistingFile] Failed to mark low-confidence warning (non-fatal)", e);
    }
  }

  // ── 4. CV / résumé → employment + education ───────────────────────────
  let cvEntriesAdded = 0;
  let cvEntriesSkipped = 0;
  let cvEducationAdded = 0;
  let cvEducationSkipped = 0;
  let cvDetected = false;

  const looksLikeCv =
    aiAvailable &&
    (detectedCategory === "profile" ||
      /\b(cv|c\.v\.|résumé|resume|curriculum vitae)\b/i.test(detectedType));

  if (looksLikeCv) {
    try {
      const cvResult = await parseCvWorkHistory(absolutePath, mimeType);
      cvDetected = !!cvResult?.isCv;
      if (cvResult?.isCv) {
        if (cvResult.entries.length > 0) {
          const existing = await storage.getEmploymentHistory(nurseId);
          const seen = new Set<string>(
            existing.map((e: any) => `${norm(e.employer)}|${norm(e.jobTitle)}|${norm(e.startDate)}`),
          );
          for (const entry of cvResult.entries) {
            const key = `${norm(entry.employer)}|${norm(entry.jobTitle)}|${norm(entry.startDate)}`;
            if (seen.has(key) || !entry.startDate) {
              cvEntriesSkipped += 1;
              continue;
            }
            await storage.createEmploymentHistory({
              nurseId,
              employer: entry.employer,
              jobTitle: entry.jobTitle,
              department: entry.department,
              startDate: entry.startDate,
              endDate: entry.endDate,
              isCurrent: entry.isCurrent,
              reasonForLeaving: entry.reasonForLeaving,
              duties: entry.duties,
            });
            seen.add(key);
            cvEntriesAdded += 1;
          }
        }

        if (cvResult.education?.length > 0) {
          const existingEdu = await storage.getEducationHistory(nurseId);
          const seenEdu = new Set<string>(
            existingEdu.map((e: any) => `${norm(e.institution)}|${norm(e.qualification)}|${norm(e.subject)}`),
          );
          for (const edu of cvResult.education) {
            const key = `${norm(edu.institution)}|${norm(edu.qualification)}|${norm(edu.subject)}`;
            if (seenEdu.has(key)) {
              cvEducationSkipped += 1;
              continue;
            }
            await storage.createEducationHistory({
              nurseId,
              institution: edu.institution,
              qualification: edu.qualification,
              subject: edu.subject,
              startDate: edu.startDate,
              endDate: edu.endDate,
              grade: edu.grade,
            });
            seenEdu.add(key);
            cvEducationAdded += 1;
          }
        }
      }
    } catch (cvErr: any) {
      console.error("[ingestExistingFile] CV parse failed:", cvErr.message);
    }
  }

  // ── 5. Training certificate → mandatory training rows ─────────────────
  let trainingAdded: string[] = [];
  if (classification && classification.matchedTrainingModules.length > 0) {
    trainingAdded = await applyTrainingCertExtraction({
      nurseId,
      documentId: doc.id,
      absolutePath,
      mimeType,
      matchedTrainingModules: classification.matchedTrainingModules,
    });
  }

  return {
    documentId: doc.id,
    category: detectedCategory,
    type: detectedType,
    aiAvailable,
    cvDetected,
    cvEntriesAdded,
    cvEntriesSkipped,
    cvEducationAdded,
    cvEducationSkipped,
    trainingModulesAdded: trainingAdded,
    classificationConfidence: classification?.confidence || "none",
    matchedTrainingModules: classification?.matchedTrainingModules || [],
  };
}

/**
 * Move (or copy if cross-device) a file into `uploadsDir` with a unique
 * filename and return the new absolute path. Mirrors multer's filename
 * pattern so files look like all other uploads.
 */
export function adoptFileIntoUploads(srcAbsolutePath: string, originalFilename: string, opts?: { copy?: boolean }): string {
  const ext = path.extname(originalFilename) || path.extname(srcAbsolutePath) || "";
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 18)}${ext}`;
  const destAbs = path.join(uploadsDir, unique);
  if (opts?.copy) {
    fs.copyFileSync(srcAbsolutePath, destAbs);
  } else {
    try {
      fs.renameSync(srcAbsolutePath, destAbs);
    } catch {
      fs.copyFileSync(srcAbsolutePath, destAbs);
      try { fs.unlinkSync(srcAbsolutePath); } catch {}
    }
  }
  return destAbs;
}

/**
 * Run the training-certificate–specific extraction pipeline against an
 * already-uploaded document. Used by the initial ingest pipeline (after the
 * smart classifier matches modules) and also by the admin category-override
 * flow when a doc is manually re-categorised as a training certificate.
 *
 * If `matchedTrainingModules` is omitted, the document is re-classified to
 * discover module matches (which is what the manual override path needs —
 * the original classification said "other" so there are no matches yet).
 *
 * Returns the list of module names added to mandatory_training (already
 * existing modules for the candidate are skipped).
 */
export async function applyTrainingCertExtraction(opts: {
  nurseId: string;
  documentId: string;
  absolutePath: string;
  mimeType: string;
  matchedTrainingModules?: string[];
}): Promise<string[]> {
  const { nurseId, documentId, absolutePath, mimeType } = opts;
  const moduleNames = MANDATORY_TRAINING_MODULES.map((m) => m.name);

  let matched = opts.matchedTrainingModules;
  if (!matched) {
    try {
      const classification = await classifyDocumentSmart(absolutePath, mimeType, moduleNames);
      matched = classification.matchedTrainingModules;
    } catch (e: any) {
      console.warn(
        "[applyTrainingCertExtraction] Classification failed; proceeding with no module matches:",
        e?.message || e,
      );
      matched = [];
    }
  }

  if (!matched.length) return [];

  let certAnalysis: Awaited<ReturnType<typeof analyzeCertificateWithAI>> | null = null;
  try {
    certAnalysis = await analyzeCertificateWithAI(absolutePath, mimeType);
  } catch (e: any) {
    console.warn("[applyTrainingCertExtraction] Cert date extraction failed; using fallbacks:", e?.message || e);
  }

  const existingTraining = await storage.getMandatoryTraining(nurseId);
  const trainingAdded: string[] = [];
  for (const moduleName of matched) {
    if (existingTraining.some((t: any) => t.moduleName === moduleName)) continue;

    const modDef = MANDATORY_TRAINING_MODULES.find((m) => m.name === moduleName);
    const renewalFreq = modDef?.renewalFrequency || "Annual";
    const certModule = certAnalysis?.modules.find((m: any) => m.matchedModule === moduleName);

    const completedDate = safeDate(certModule?.completedDate ?? null) || new Date().toISOString().split("T")[0];
    let expiryDate = safeDate(certModule?.expiryDate ?? null);
    if (!expiryDate) {
      const completed = new Date(completedDate);
      const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
      expiryDate =
        renewalFreq === "Annual"
          ? new Date(completed.getTime() + msPerYear).toISOString().split("T")[0]
          : new Date(completed.getTime() + 3 * msPerYear).toISOString().split("T")[0];
    }
    const issuingBody = certModule?.issuingBody || "Auto-detected from document";

    await storage.createMandatoryTraining({
      nurseId,
      moduleName,
      renewalFrequency: renewalFreq,
      completedDate,
      expiryDate,
      issuingBody,
      certificateUploaded: true,
      certificateDocumentId: documentId,
      status: "completed",
    });
    trainingAdded.push(moduleName);
  }
  return trainingAdded;
}

/**
 * Save a buffer (e.g. an email attachment or a SharePoint download) into the
 * uploads directory and return the absolute path.
 */
export function saveBufferIntoUploads(buf: Buffer, originalFilename: string): string {
  const ext = path.extname(originalFilename) || "";
  const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 18)}${ext}`;
  const destAbs = path.join(uploadsDir, unique);
  fs.writeFileSync(destAbs, buf);
  return destAbs;
}
