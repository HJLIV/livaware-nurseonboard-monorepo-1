import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { uploadsDir } from "./middleware";
import { pipeline } from "stream/promises";
import crypto from "crypto";
import { ingestExistingFile, adoptFileIntoUploads, saveBufferIntoUploads } from "./document-ingest";
import {
  getUncachableSharePointClient,
  getDriveApiBase,
  ROOT_FOLDER,
  sanitizeName,
} from "./sharepoint";
import { listMailboxAttachmentsForCandidate, downloadMailboxAttachment } from "./outlook";

// ──────────────────────────────────────────────────────────────────────────
// Orphan upload scan
// ──────────────────────────────────────────────────────────────────────────

export interface OrphanUploadInfo {
  filename: string;
  sizeBytes: number;
  mtime: string;
  mimeType: string;
  hint: string | null; // e.g. timestamp-derived "uploaded ~Mar 26"
}

const EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function inferMime(filename: string): string {
  return EXT_MIME[path.extname(filename).toLowerCase()] || "application/octet-stream";
}

/**
 * List every file in `uploadsDir` that is NOT referenced by any row in the
 * documents table. These are recoverable orphans an admin can re-link.
 */
export async function listOrphanUploads(): Promise<OrphanUploadInfo[]> {
  if (!fs.existsSync(uploadsDir)) return [];
  const files = fs.readdirSync(uploadsDir);
  if (files.length === 0) return [];

  // Build a Set of every filename currently referenced in the documents
  // table. We compare by basename so paths like `/api/uploads/foo.pdf` and
  // bare `foo.pdf` both match.
  const allDocs = await storage.getAllDocuments();
  const referenced = new Set<string>();
  for (const d of allDocs) {
    if (d.filename) referenced.add(d.filename);
    if (d.filePath) referenced.add(path.basename(d.filePath));
  }

  const orphans: OrphanUploadInfo[] = [];
  for (const f of files) {
    if (referenced.has(f)) continue;
    const abs = path.join(uploadsDir, f);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    // Multer's default filename pattern starts with a millisecond timestamp.
    // Use it as a "uploaded around" hint so admins recognise the file.
    let hint: string | null = null;
    const tsMatch = f.match(/^(\d{10,13})/);
    if (tsMatch) {
      const ts = parseInt(tsMatch[1], 10);
      const date = new Date(ts < 1e12 ? ts * 1000 : ts);
      if (!isNaN(date.getTime())) hint = `uploaded ${date.toISOString().slice(0, 10)}`;
    }

    orphans.push({
      filename: f,
      sizeBytes: stat.size,
      mtime: stat.mtime.toISOString(),
      mimeType: inferMime(f),
      hint,
    });
  }

  // Newest first.
  orphans.sort((a, b) => b.mtime.localeCompare(a.mtime));
  return orphans;
}

function resolveOrphanPath(filename: string): string {
  const safe = path.basename(filename);
  if (!safe || safe !== filename) throw new Error("Invalid filename");
  const abs = path.resolve(uploadsDir, safe);
  const root = path.resolve(uploadsDir);
  if (path.dirname(abs) !== root) throw new Error("Invalid filename");
  return abs;
}

export async function linkOrphanUpload(filename: string, nurseId: string) {
  const abs = resolveOrphanPath(filename);
  if (!fs.existsSync(abs)) throw new Error("Orphan file no longer exists on disk");

  const candidate = await storage.getCandidate(nurseId);
  if (!candidate) throw new Error("Candidate not found");

  // We re-use the file in place — no need to copy/move.
  const ingest = await ingestExistingFile({
    nurseId,
    absolutePath: abs,
    originalFilename: filename,
    mimeType: inferMime(filename),
    source: "orphan_recovery",
    uploadedBy: "admin",
  });

  await storage.createAuditLog({
    nurseId,
    action: "orphan_document_recovered",
    agentName: "AI Recovery Agent",
    detail: {
      filename,
      documentId: ingest.documentId,
      category: ingest.category,
      cvEntriesAdded: ingest.cvEntriesAdded,
      cvEducationAdded: ingest.cvEducationAdded,
      trainingModulesAdded: ingest.trainingModulesAdded,
    },
  });

  return ingest;
}

export function discardOrphanUpload(filename: string) {
  const abs = resolveOrphanPath(filename);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
}

// ──────────────────────────────────────────────────────────────────────────
// SharePoint pull-back
// ──────────────────────────────────────────────────────────────────────────

export interface SharePointPullSummary {
  nurseId: string;
  candidateName: string;
  filesFoundInSharePoint: number;
  filesPulled: number;
  filesSkippedAlreadyOnFile: number;
  errors: string[];
  results: { filename: string; documentId: string; category: string }[];
}

async function listSharePointFolderRecursive(client: any, driveBase: string, folderPath: string): Promise<any[]> {
  // Returns DriveItem objects (file leaves only).
  const out: any[] = [];
  let resp: any;
  try {
    resp = await client.api(`${driveBase}/root:/${folderPath}:/children`).get();
  } catch (err: any) {
    // 404 = folder doesn't exist (no SharePoint history for this candidate)
    if (err.statusCode === 404 || err?.code === "itemNotFound") return [];
    throw err;
  }
  for (const item of resp?.value || []) {
    if (item.folder) {
      const sub = await listSharePointFolderRecursive(client, driveBase, `${folderPath}/${item.name}`);
      out.push(...sub);
    } else if (item.file) {
      out.push({ ...item, _path: `${folderPath}/${item.name}` });
    }
  }
  return out;
}

export async function pullSharePointForCandidate(nurseId: string): Promise<SharePointPullSummary> {
  const candidate = await storage.getCandidate(nurseId);
  if (!candidate) throw new Error("Candidate not found");

  const summary: SharePointPullSummary = {
    nurseId,
    candidateName: candidate.fullName,
    filesFoundInSharePoint: 0,
    filesPulled: 0,
    filesSkippedAlreadyOnFile: 0,
    errors: [],
    results: [],
  };

  let client: any;
  try {
    client = await getUncachableSharePointClient();
  } catch (err: any) {
    summary.errors.push(`SharePoint not configured: ${err.message}`);
    return summary;
  }
  const driveBase = getDriveApiBase();
  const folderPath = `${ROOT_FOLDER}/${sanitizeName(candidate.fullName)}_${candidate.id}`;

  let items: any[];
  try {
    items = await listSharePointFolderRecursive(client, driveBase, folderPath);
  } catch (err: any) {
    summary.errors.push(`SharePoint listing failed: ${err.message}`);
    return summary;
  }
  summary.filesFoundInSharePoint = items.length;
  if (items.length === 0) return summary;

  // Build a set of filenames already attached to this candidate so we don't
  // re-import duplicates.
  const existing = await storage.getDocuments(nurseId);
  const have = new Set<string>(
    existing.flatMap((d: any) => [d.originalFilename, d.filename].filter(Boolean).map((s: string) => s.toLowerCase())),
  );

  for (const item of items) {
    const name: string = item.name;
    if (have.has(name.toLowerCase())) {
      summary.filesSkippedAlreadyOnFile += 1;
      continue;
    }
    let abs = "";
    try {
      // Stream straight to disk to avoid buffering large attachments in memory.
      const ext = path.extname(name) || "";
      const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
      abs = path.join(uploadsDir, uniqueName);
      const stream: any = await client.api(`${driveBase}/items/${item.id}/content`).getStream();
      await pipeline(stream, fs.createWriteStream(abs));
      const mimeType = item.file?.mimeType || inferMime(name);

      const ingest = await ingestExistingFile({
        nurseId,
        absolutePath: abs,
        originalFilename: name,
        mimeType,
        source: "sharepoint_recovery",
        uploadedBy: "admin",
        skipSharePointUpload: true, // came FROM SharePoint
      });
      summary.filesPulled += 1;
      summary.results.push({ filename: name, documentId: ingest.documentId, category: ingest.category });
    } catch (err: any) {
      summary.errors.push(`${name}: ${err.message}`);
    }
  }

  if (summary.filesPulled > 0) {
    await storage.createAuditLog({
      nurseId,
      action: "sharepoint_documents_recovered",
      agentName: "AI Recovery Agent",
      detail: {
        filesPulled: summary.filesPulled,
        filesSkippedAlreadyOnFile: summary.filesSkippedAlreadyOnFile,
      },
    });
  }
  return summary;
}

// ──────────────────────────────────────────────────────────────────────────
// Mailbox scan via Microsoft Graph
// ──────────────────────────────────────────────────────────────────────────

export interface MailboxScanSummary {
  nurseId: string;
  candidateName: string;
  candidateEmail: string;
  attachmentsFound: number;
  attachmentsPulled: number;
  attachmentsSkippedAlreadyOnFile: number;
  errors: string[];
  results: { filename: string; documentId: string; category: string; messageId: string }[];
}

const SUPPORTED_INGEST_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function scanMailboxForCandidate(nurseId: string): Promise<MailboxScanSummary> {
  const candidate = await storage.getCandidate(nurseId);
  if (!candidate) throw new Error("Candidate not found");

  const summary: MailboxScanSummary = {
    nurseId,
    candidateName: candidate.fullName,
    candidateEmail: candidate.email || "",
    attachmentsFound: 0,
    attachmentsPulled: 0,
    attachmentsSkippedAlreadyOnFile: 0,
    errors: [],
    results: [],
  };

  if (!candidate.email) {
    summary.errors.push("Candidate has no email on file");
    return summary;
  }

  let refs;
  try {
    refs = await listMailboxAttachmentsForCandidate(candidate.email);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (/Mail\.Read|forbidden|insufficient|access_denied/i.test(msg)) {
      summary.errors.push(
        "Mailbox access not granted. The Microsoft 365 app needs the 'Mail.Read.All' application permission with admin consent.",
      );
    } else {
      summary.errors.push(`Mailbox search failed: ${msg}`);
    }
    return summary;
  }
  summary.attachmentsFound = refs.length;
  if (refs.length === 0) return summary;

  const existing = await storage.getDocuments(nurseId);
  const have = new Set<string>(
    existing.flatMap((d: any) => [d.originalFilename, d.filename].filter(Boolean).map((s: string) => s.toLowerCase())),
  );

  for (const ref of refs) {
    if (have.has(ref.filename.toLowerCase())) {
      summary.attachmentsSkippedAlreadyOnFile += 1;
      continue;
    }
    if (!SUPPORTED_INGEST_MIMES.has(ref.contentType)) {
      // Still save it as a document row so admins know it exists, but skip
      // AI extraction by passing the original mime — ingestExistingFile will
      // simply classify=general.
    }
    try {
      const { buffer, filename, contentType } = await downloadMailboxAttachment(ref.messageId, ref.attachmentId);
      const abs = saveBufferIntoUploads(buffer, filename);
      const mimeType = SUPPORTED_INGEST_MIMES.has(contentType) ? contentType : inferMime(filename);

      const ingest = await ingestExistingFile({
        nurseId,
        absolutePath: abs,
        originalFilename: filename,
        mimeType,
        source: "mailbox_recovery",
        uploadedBy: "admin",
      });
      summary.attachmentsPulled += 1;
      summary.results.push({
        filename,
        documentId: ingest.documentId,
        category: ingest.category,
        messageId: ref.messageId,
      });
      have.add(filename.toLowerCase());
    } catch (err: any) {
      summary.errors.push(`${ref.filename}: ${err.message}`);
    }
  }

  if (summary.attachmentsPulled > 0) {
    await storage.createAuditLog({
      nurseId,
      action: "mailbox_documents_recovered",
      agentName: "AI Recovery Agent",
      detail: {
        attachmentsPulled: summary.attachmentsPulled,
        attachmentsSkippedAlreadyOnFile: summary.attachmentsSkippedAlreadyOnFile,
        candidateEmail: candidate.email,
      },
    });
  }
  return summary;
}

// ──────────────────────────────────────────────────────────────────────────
// Bulk wrappers
// ──────────────────────────────────────────────────────────────────────────

async function runBulk<T extends { errors: string[] }>(
  fn: (nurseId: string) => Promise<T>,
  concurrency = 3,
): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  results: (T & { nurseId: string; candidateName: string })[];
}> {
  const allNurses = await storage.getCandidates();
  const results: (T & { nurseId: string; candidateName: string })[] = new Array(allNurses.length);
  let succeeded = 0;
  let failed = 0;
  let cursor = 0;

  const worker = async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= allNurses.length) return;
      const nurse = allNurses[idx];
      try {
        const r = await fn(nurse.id);
        results[idx] = { ...(r as any), nurseId: nurse.id, candidateName: nurse.fullName };
        if (r.errors.length === 0) succeeded += 1;
        else failed += 1;
      } catch (err: any) {
        failed += 1;
        results[idx] = {
          ...({ errors: [err.message || String(err)] } as any),
          nurseId: nurse.id,
          candidateName: nurse.fullName,
        };
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { total: allNurses.length, succeeded, failed, results };
}

export const pullSharePointForAll = () => runBulk(pullSharePointForCandidate);
export const scanMailboxForAll = () => runBulk(scanMailboxForCandidate);
