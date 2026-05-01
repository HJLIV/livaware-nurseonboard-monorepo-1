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
  documentsReclassified: number;
  cvDocsScanned: number;
  cvEntriesAdded: number;
  cvEntriesSkipped: number;
  cvEducationAdded: number;
  cvEducationSkipped: number;
  certDocsScanned: number;
  trainingModulesAdded: number;
  errors: string[];
}

const CV_NAME_REGEX = /\b(cv|c\.v\.|résumé|resume|curriculum.?vitae)\b/i;
// Tightened to catch real-world certificate naming. Covers explicit certificate
// language ("certificate", "record of attendance", "statement of completion"),
// achievement / pass markers ("passed", "achievement", "CPD"), and the most
// common UK clinical training module short codes (BLS / ILS / ALS / PMVA,
// "moving and handling", etc.) so that even a file called e.g. "BLS_2024.pdf"
// or "Record of Attendance.pdf" is routed to training-cert handling.
const CERT_NAME_REGEX =
  /\b(certificate|cert\.?|training|completion|course|module|attendance|achievement|passed|cpd|record\s*of\s*attendance|statement\s*of\s*completion|completion\s*record|bls|ils|als|pmva|mapa|moving\s*and\s*handling|manual\s*handling|safeguarding|fire\s*safety|infection\s*prevention|ipc|gdpr|edi|equality\s*and\s*diversity|mca|dols|prevent|conflict\s*resolution|de.?escalation|food\s*hygiene|lone\s*working|duty\s*of\s*candour|modern\s*slavery|anaphylaxis|venepuncture|cannulation|catheterisation)\b/i;

// Categories where we already know how to handle the document — no need to
// re-classify with the AI on every scan.
const KNOWN_ROUTED_CATEGORIES = new Set([
  "profile",
  "training_certificate",
  "identity",
  "right_to_work",
  "competency_evidence",
  "health",
  "indemnity",
  "dbs",
  "nmc",
  "proof_of_address",
]);

function looksLikeCvDoc(doc: any): boolean {
  if (doc.category === "profile") return true;
  const name = (doc.originalFilename || doc.filename || doc.type || "").toString();
  return CV_NAME_REGEX.test(name);
}

function looksLikeTrainingCertDoc(doc: any): boolean {
  if (doc.category === "training_certificate") return true;
  const name = (doc.originalFilename || doc.filename || doc.type || "").toString();
  return CERT_NAME_REGEX.test(name);
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

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/**
 * Re-scan all of a candidate's existing documents with AI and push any new
 * data into the relevant slots:
 *   - Work history extracted from CVs → employment_history
 *   - Education / qualifications extracted from CVs → education_history
 *   - Mandatory training certificates → mandatory_training (linked to doc)
 *
 * Idempotent — duplicates are skipped on subsequent runs. Documents that
 * were uploaded with an unknown / generic category get re-classified by the
 * AI first so previously-uncategorised CVs and certificates finally land
 * in the right place without a re-upload.
 */
export async function scanCandidateDocuments(nurseId: string): Promise<DocumentScanSummary> {
  const summary: DocumentScanSummary = {
    documentsScanned: 0,
    documentsReclassified: 0,
    cvDocsScanned: 0,
    cvEntriesAdded: 0,
    cvEntriesSkipped: 0,
    cvEducationAdded: 0,
    cvEducationSkipped: 0,
    certDocsScanned: 0,
    trainingModulesAdded: 0,
    errors: [],
  };

  const docs = await storage.getDocuments(nurseId);
  if (!docs.length) return summary;
  summary.documentsScanned = docs.length;

  // ── Step 1: re-classify any document we don't already know how to route ──
  // This lets old uploads sitting under category="general" / "other" /
  // null get pushed into the CV or training-cert pipeline below without
  // requiring the user to re-upload them.
  const moduleNames = MANDATORY_TRAINING_MODULES.map((m) => m.name);
  for (const doc of docs) {
    const cat = (doc.category || "").toLowerCase();
    if (KNOWN_ROUTED_CATEGORIES.has(cat)) continue;

    // If filename heuristics already point to CV or training cert, set the
    // category directly without spending an AI call. This still counts as a
    // re-classification so the audit trail accurately reflects the change.
    if (looksLikeCvDoc(doc)) {
      try {
        await storage.updateDocument(doc.id, { category: "profile" });
        (doc as any).category = "profile";
        summary.documentsReclassified += 1;
      } catch (updateErr: any) {
        summary.errors.push(`Doc ${doc.id}: filename re-classify failed (${updateErr.message})`);
      }
      continue;
    }
    if (looksLikeTrainingCertDoc(doc)) {
      try {
        await storage.updateDocument(doc.id, { category: "training_certificate" });
        (doc as any).category = "training_certificate";
        summary.documentsReclassified += 1;
      } catch (updateErr: any) {
        summary.errors.push(`Doc ${doc.id}: filename re-classify failed (${updateErr.message})`);
      }
      continue;
    }


    const absPath = resolveDocPath(doc);
    if (!absPath) {
      summary.errors.push(`Doc ${doc.id}: file missing on disk`);
      continue;
    }

    try {
      const classification = await classifyDocumentSmart(
        absPath,
        doc.mimeType || "application/pdf",
        moduleNames,
      );
      const newCategory = classification?.detectedCategory;
      if (newCategory && newCategory !== doc.category) {
        try {
          await storage.updateDocument(doc.id, {
            category: newCategory,
            type: doc.type || classification.detectedType || doc.type,
          });
          (doc as any).category = newCategory;
          summary.documentsReclassified += 1;
        } catch (updateErr: any) {
          summary.errors.push(`Doc ${doc.id}: re-classify update failed (${updateErr.message})`);
        }
      }
    } catch (err: any) {
      summary.errors.push(`Doc ${doc.id}: classification failed (${err.message || "unknown"})`);
    }
  }

  // ── Step 2: CV / résumé extraction ──────────────────────────────────────
  const existingEmployment = await storage.getEmploymentHistory(nurseId);
  const seenEmpKeys = new Set<string>(
    existingEmployment.map((e: any) =>
      `${norm(e.employer)}|${norm(e.jobTitle)}|${norm(e.startDate)}`,
    ),
  );

  const existingEducation = await storage.getEducationHistory(nurseId);
  const seenEduKeys = new Set<string>(
    existingEducation.map((e: any) =>
      `${norm(e.institution)}|${norm(e.qualification)}|${norm(e.subject)}`,
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
      if (!cv.isCv) continue;

      // Work history
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

      // Education / qualifications
      for (const edu of cv.education) {
        const key = `${norm(edu.institution)}|${norm(edu.qualification)}|${norm(edu.subject)}`;
        if (seenEduKeys.has(key)) {
          summary.cvEducationSkipped += 1;
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
        seenEduKeys.add(key);
        summary.cvEducationAdded += 1;
      }
    } catch (err: any) {
      summary.errors.push(`CV ${doc.id}: ${err.message || "parse failed"}`);
    }
  }

  // ── Step 3: Training certificate extraction ─────────────────────────────
  const existingTraining = await storage.getMandatoryTraining(nurseId);
  const trainingByModule = new Set<string>(existingTraining.map((t: any) => norm(t.moduleName)));
  const trainingByDocId = new Set<string>(
    existingTraining.filter((t: any) => t.certificateDocumentId).map((t: any) => t.certificateDocumentId),
  );

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
      // Dedupe within a single classification result and against existing.
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
