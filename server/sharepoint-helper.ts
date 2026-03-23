import { storage } from './storage';
import { uploadDocumentToSharePoint } from './sharepoint';
import { sendDocumentUploadNotification } from './outlook';
import fs from 'fs';
import path from 'path';

const uploadsDir = path.join(process.cwd(), 'uploads');

export function triggerSharePointUpload(
  documentId: string,
  candidateId: string,
  filePath: string,
  originalFilename: string,
  category: string,
) {
  storage.getCandidate(candidateId).then(candidate => {
    if (!candidate) {
      console.error(`[SharePoint] Candidate ${candidateId} not found, skipping upload`);
      return;
    }

    uploadDocumentToSharePoint(
      documentId,
      filePath,
      candidate.fullName,
      candidateId,
      category,
      originalFilename,
      (id, data) => storage.updateDocument(id, data),
      (data) => storage.createAuditLog(data),
    );
  }).catch(err => {
    console.error(`[SharePoint] Failed to trigger upload for document ${documentId}:`, err.message);
  });
}

function resolveAndValidateFilePath(filePath: string): string | null {
  let resolved: string;
  if (filePath.startsWith('/api/uploads/')) {
    resolved = path.join(uploadsDir, path.basename(filePath));
  } else if (path.isAbsolute(filePath)) {
    resolved = path.resolve(filePath);
  } else {
    resolved = path.resolve(uploadsDir, filePath);
  }

  const normalizedUploadsDir = path.resolve(uploadsDir) + path.sep;
  if (!resolved.startsWith(normalizedUploadsDir) && resolved !== path.resolve(uploadsDir)) {
    return null;
  }
  return resolved;
}

export function triggerEmailNotification(
  candidateId: string,
  filePath: string,
  originalFilename: string,
  category: string,
  uploadedBy: string,
  mimeType?: string,
) {
  (async () => {
    try {
      const candidate = await storage.getCandidate(candidateId);
      if (!candidate) {
        console.error(`[EmailNotification] Candidate ${candidateId} not found, skipping notification`);
        return;
      }

      const resolvedPath = resolveAndValidateFilePath(filePath);
      if (!resolvedPath) {
        console.error(`[EmailNotification] File path ${filePath} is outside uploads directory, skipping notification`);
        return;
      }

      try {
        await fs.promises.access(resolvedPath, fs.constants.R_OK);
      } catch {
        console.error(`[EmailNotification] File not found at ${resolvedPath}, skipping notification`);
        return;
      }

      const fileBuffer = await fs.promises.readFile(resolvedPath);
      const detectedMime = mimeType || 'application/octet-stream';

      await sendDocumentUploadNotification(
        candidate.fullName,
        category,
        uploadedBy,
        originalFilename,
        fileBuffer,
        detectedMime,
      );
      console.log(`[EmailNotification] Sent notification for ${originalFilename} (${category}) — candidate ${candidate.fullName}`);
    } catch (err: any) {
      console.error(`[EmailNotification] Failed for ${originalFilename}:`, err.message);
    }
  })();
}
