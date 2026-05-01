import path from "path";
import { storage } from "./storage";
import { uploadsDir } from "./middleware";
import {
  analyzeDocumentCompleteness,
  compareNamesForMatch,
  pickExtractedName,
  type DocumentAiIssueEntry,
} from "./document-ai";

const ANALYZABLE_CATEGORIES = new Set([
  "dbs",
  "indemnity",
  "right_to_work",
  "identity",
  "nmc",
  "health",
  "competency_evidence",
  "training_certificate",
  "proof_of_address",
]);

const ANALYZABLE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

/**
 * Resolve a stored document `filePath` (which is typically the public
 * `/api/uploads/<basename>` form) to an absolute path on disk.
 */
function resolveDocumentPath(filePath: string): string {
  if (filePath.startsWith("/api/uploads/")) {
    return path.join(uploadsDir, path.basename(filePath));
  }
  return path.resolve(filePath);
}

/**
 * Kick off the AI completeness check for a document in the background.
 * Marks the document as `pending` immediately and updates `aiStatus`,
 * `aiIssues`, and `aiAnalyzedAt` once the analysis completes (or clears
 * them on failure so the UI doesn't block on a broken state).
 *
 * If the candidate's full name is available, the result is also compared
 * against the name extracted from the document and a structured
 * `name_mismatch` issue is appended (and the status escalated to
 * `warning`) when they disagree.
 */
export function triggerDocumentAnalysis(
  documentId: string,
  filePath: string,
  mimeType: string,
  category: string,
  documentType: string,
  nurseId?: string,
): void {
  if (!ANALYZABLE_CATEGORIES.has(category)) return;
  if (!ANALYZABLE_MIME_TYPES.has(mimeType)) return;

  storage.updateDocument(documentId, { aiStatus: "pending" } as any).catch(() => {});

  const resolvedPath = resolveDocumentPath(filePath);

  setImmediate(async () => {
    try {
      // Preserve sticky markers (e.g. manual_category_override) that aren't
      // produced by the AI itself but should keep showing on the document
      // after analysis re-runs.
      let stickyEntries: DocumentAiIssueEntry[] = [];
      try {
        const existingDoc = await storage.getDocument(documentId);
        const existingIssues = Array.isArray(existingDoc?.aiIssues)
          ? (existingDoc?.aiIssues as DocumentAiIssueEntry[])
          : [];
        stickyEntries = existingIssues.filter((e) => {
          if (!e || typeof e !== "object") return false;
          const code = (e as any).code;
          return code === "manual_category_override";
        });
      } catch {
        stickyEntries = [];
      }

      const result = await analyzeDocumentCompleteness(
        resolvedPath,
        mimeType,
        category,
        documentType,
      );

      const issues: DocumentAiIssueEntry[] = [...stickyEntries, ...result.issues];
      let status: "pass" | "warning" | "fail" = result.status;

      let mismatchDetected: { documentName: string; nurseName: string } | null = null;
      if (nurseId) {
        try {
          const nurse = await storage.getCandidate(nurseId);
          const documentName = pickExtractedName(result.extractedFields);
          if (nurse?.fullName && documentName) {
            const cmp = compareNamesForMatch(documentName, nurse.fullName);
            if (!cmp.match) {
              issues.push({
                code: "name_mismatch",
                message: `Name on document ("${documentName}") does not match the candidate's profile ("${nurse.fullName}")`,
                nameOnDocument: documentName,
                nurseName: nurse.fullName,
              });
              if (status === "pass") status = "warning";
              mismatchDetected = { documentName, nurseName: nurse.fullName };
            }
          }
        } catch (nameErr: any) {
          console.warn(
            `[Document AI] Name comparison failed for doc ${documentId}:`,
            nameErr?.message || nameErr,
          );
        }
      }

      await storage.updateDocument(documentId, {
        aiStatus: status,
        aiIssues: issues,
        aiAnalyzedAt: new Date(),
      } as any);
      console.log(
        `[Document AI] Analyzed doc ${documentId}: ${status} (${issues.length} issues)`,
      );
      if (mismatchDetected && nurseId) {
        try {
          await storage.createAuditLog({
            nurseId,
            action: "document_name_mismatch_flagged",
            agentName: "system",
            detail: {
              documentId,
              category,
              documentType,
              nameOnDocument: mismatchDetected.documentName,
              nurseName: mismatchDetected.nurseName,
            },
          } as any);
        } catch (auditErr: any) {
          console.warn(
            `[Document AI] Failed to write mismatch audit for doc ${documentId}:`,
            auditErr?.message || auditErr,
          );
        }
      }
    } catch (err: any) {
      console.error(`[Document AI] Failed to analyze doc ${documentId}:`, err.message);
      await storage
        .updateDocument(documentId, {
          aiStatus: null,
          aiIssues: null,
          aiAnalyzedAt: null,
        } as any)
        .catch(() => {});
    }
  });
}
