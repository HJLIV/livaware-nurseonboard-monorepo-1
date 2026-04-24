import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { parseCvWorkHistory } from "./cv-ai";
import { classifyDocumentSmart } from "./document-ai";
import { analyzeCertificateWithAI } from "./certificate-ai";
import { MANDATORY_TRAINING_MODULES } from "@shared/schema";

const uploadsDir = path.join(process.cwd(), "uploads");

export interface DocumentScanSummary {
  documentsScanned: number;
  cvDocsScanned: number;
  cvEntriesAdded: number;
  cvEntriesSkipped: number;
  certDocsScanned: number;
  trainingModulesAdded: number;
  errors: string[];
}

const CV_NAME_REGEX = /\b(cv|c\.v\.|résumé|resume|curriculum.?vitae)\b/i;

function looksLikeCvDoc(doc: any): boolean {
  if (doc.category === "profile") return true;
  const name = (doc.originalFilename || doc.filename || doc.type || "").toString();
  return CV_NAME_REGEX.test(name);
}

function looksLikeTrainingCertDoc(doc: any): boolean {
  if (doc.category === "training_certificate") return true;
  const name = (doc.originalFilename || doc.filename || doc.type || "").toString();
  return /\b(certificate|cert\.?|training|completion)\b/i.test(name);
}

function resolveDocPath(doc: any): string | null {
  if (!doc.filename) return null;
  const abs = path.join(uploadsDir, doc.filename);
  if (!fs.existsSync(abs)) return null;
  return abs;
}

function safeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(/[zZ]|[+\-]\d{2}:?\d{2}$/.test(value) ? value : value + " UTC");
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

/**
 * Re-scan all of a candidate's existing documents with AI and push any new
 * data into the relevant slots (work history from CVs, mandatory training
 * records from certificates). Idempotent — duplicates are skipped on
 * subsequent runs.
 */
export async function scanCandidateDocuments(nurseId: string): Promise<DocumentScanSummary> {
  const summary: DocumentScanSummary = {
    documentsScanned: 0,
    cvDocsScanned: 0,
    cvEntriesAdded: 0,
    cvEntriesSkipped: 0,
    certDocsScanned: 0,
    trainingModulesAdded: 0,
    errors: [],
  };

  const docs = await storage.getDocuments(nurseId);
  if (!docs.length) return summary;
  summary.documentsScanned = docs.length;

  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

  // ── CV / résumé extraction ───────────────────────────────────────────────
  const existingEmployment = await storage.getEmploymentHistory(nurseId);
  const seenEmpKeys = new Set<string>(
    existingEmployment.map((e: any) =>
      `${norm(e.employer)}|${norm(e.jobTitle)}|${norm(e.startDate)}`,
    ),
  );

  const cvDocs = docs.filter(looksLikeCvDoc);
  for (const doc of cvDocs) {
    const absPath = resolveDocPath(doc);
    if (!absPath) {
      summary.errors.push(`CV ${doc.id}: file missing on disk`);
      continue;
    }
    summary.cvDocsScanned += 1;
    try {
      const cv = await parseCvWorkHistory(absPath, doc.mimeType || "application/pdf");
      if (!cv.isCv || cv.entries.length === 0) continue;
      for (const entry of cv.entries) {
        const key = `${norm(entry.employer)}|${norm(entry.jobTitle)}|${norm(entry.startDate)}`;
        if (!entry.startDate || seenEmpKeys.has(key)) {
          summary.cvEntriesSkipped += 1;
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
        seenEmpKeys.add(key);
        summary.cvEntriesAdded += 1;
      }
    } catch (err: any) {
      summary.errors.push(`CV ${doc.id}: ${err.message || "parse failed"}`);
    }
  }

  // ── Training certificate extraction ──────────────────────────────────────
  const existingTraining = await storage.getMandatoryTraining(nurseId);
  const trainingByModule = new Set<string>(existingTraining.map((t: any) => norm(t.moduleName)));
  const trainingByDocId = new Set<string>(
    existingTraining.filter((t: any) => t.certificateDocumentId).map((t: any) => t.certificateDocumentId),
  );

  const moduleNames = MANDATORY_TRAINING_MODULES.map((m) => m.name);
  const certDocs = docs.filter(
    (d) => looksLikeTrainingCertDoc(d) && !trainingByDocId.has(d.id),
  );

  for (const doc of certDocs) {
    const absPath = resolveDocPath(doc);
    if (!absPath) {
      summary.errors.push(`Cert ${doc.id}: file missing on disk`);
      continue;
    }
    summary.certDocsScanned += 1;
    try {
      const classification = await classifyDocumentSmart(
        absPath,
        doc.mimeType || "application/pdf",
        moduleNames,
      );
      // Dedupe within a single classification result (the AI occasionally
      // returns the same module twice) and against existing records.
      const matchedModules = Array.from(
        new Set(
          classification.matchedTrainingModules.filter(
            (m) => !trainingByModule.has(norm(m)),
          ),
        ),
      );
      if (matchedModules.length === 0) continue;

      let certAnalysis: Awaited<ReturnType<typeof analyzeCertificateWithAI>> | null = null;
      try {
        certAnalysis = await analyzeCertificateWithAI(absPath, doc.mimeType || "application/pdf");
      } catch (certErr: any) {
        summary.errors.push(`Cert ${doc.id}: date extraction failed (${certErr.message})`);
      }

      for (const moduleName of matchedModules) {
        const modDef = MANDATORY_TRAINING_MODULES.find((m) => m.name === moduleName);
        const renewalFreq = modDef?.renewalFrequency || "Annual";
        const certModule = certAnalysis?.modules.find((m: any) => m.matchedModule === moduleName);

        const completedDate = safeDate(certModule?.completedDate ?? null) || new Date().toISOString().split("T")[0];
        let expiryDate = safeDate(certModule?.expiryDate ?? null);
        if (!expiryDate) {
          const completed = new Date(completedDate + "T00:00:00Z");
          const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
          expiryDate =
            renewalFreq === "Annual"
              ? new Date(completed.getTime() + msPerYear).toISOString().split("T")[0]
              : new Date(completed.getTime() + 3 * msPerYear).toISOString().split("T")[0];
        }
        const issuingBody = certModule?.issuingBody || "Auto-detected from existing document";

        await storage.createMandatoryTraining({
          nurseId,
          moduleName,
          renewalFrequency: renewalFreq,
          completedDate,
          expiryDate,
          issuingBody,
          certificateUploaded: true,
          certificateDocumentId: doc.id,
          status: "completed",
        });
        trainingByModule.add(norm(moduleName));
        summary.trainingModulesAdded += 1;
      }
    } catch (err: any) {
      summary.errors.push(`Cert ${doc.id}: ${err.message || "classification failed"}`);
    }
  }

  return summary;
}
