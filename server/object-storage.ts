// Persistent object-storage layer for user-uploaded files.
//
// Why this exists
// ---------------
// On Replit autoscale every container has its own ephemeral /uploads
// directory. When the app scales up, scales down, or restarts, files
// that were written on one container are GONE for the next request that
// lands on a fresh container. SharePoint mirroring is fire-and-forget
// and only completes minutes later, so it isn't a safe primary store
// either. To stop losing files we mirror every upload into Replit
// Object Storage (a persistent bucket that all containers share) and
// re-hydrate the local disk copy on demand whenever a serve route needs
// to read a file that isn't on the current container's disk.
//
// Design
// ------
// - Local `/uploads/<name>` stays the "hot path" — multer keeps writing
//   there so existing readers (document-extractor, sharepoint helper,
//   declarations PDF, etc.) keep working with zero changes.
// - Immediately after multer finishes writing, we async-upload the same
//   file to Object Storage. Failures are logged but never block the
//   request — the local copy is already good for the current container.
// - Before serving a file, the GET handlers call `ensureLocalCopy()`.
//   If the local file is missing (different container, restart, scale
//   event), we stream it down from the bucket into /uploads and then
//   serve it normally.
// - At boot we run a one-shot backfill that:
//     1. Mirrors every file currently on disk into the bucket (no-op if
//        already present), so existing files stop being at risk.
//     2. Logs any DB-known files that are missing from BOTH disk and
//        bucket so the admin team can spot files that were lost before
//        this layer was added.
//
// Operations against the bucket are wrapped in try/catch so the rest
// of the app behaves identically when Object Storage is unreachable or
// not configured (e.g. local dev with no bucket bound).

import fs from "fs";
import path from "path";
import { Client } from "@replit/object-storage";
import { uploadsDir } from "./middleware";

// The Replit Object Storage SDK auto-detects the default bucket bound
// to the Repl via environment, so we don't need a bucket id here. If
// the SDK can't find a bucket, calls will fail and we fall back to the
// local-disk-only behaviour we had before.
let cachedClient: Client | null = null;
let clientUnavailable = false;

function getClient(): Client | null {
  if (clientUnavailable) return null;
  if (cachedClient) return cachedClient;
  try {
    cachedClient = new Client();
    return cachedClient;
  } catch (err) {
    console.error(
      "[object-storage] client init failed — falling back to local disk only:",
      (err as Error)?.message || err,
    );
    clientUnavailable = true;
    return null;
  }
}

export function objectStorageAvailable(): boolean {
  return getClient() !== null;
}

// Mirror a file already on local disk into the bucket. Idempotent —
// safe to call repeatedly with the same filename.
export async function uploadFromDisk(filename: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const absolute = path.join(uploadsDir, filename);
  if (!fs.existsSync(absolute)) {
    console.error(`[object-storage] uploadFromDisk: ${filename} not on disk`);
    return false;
  }
  try {
    const { ok, error } = await client.uploadFromFilename(filename, absolute);
    if (!ok) {
      console.error(
        `[object-storage] uploadFromFilename failed for ${filename}:`,
        error,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `[object-storage] uploadFromDisk threw for ${filename}:`,
      (err as Error)?.message || err,
    );
    return false;
  }
}

export async function existsInBucket(filename: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    const { ok, value } = await client.exists(filename);
    return ok && value === true;
  } catch (err) {
    console.error(
      `[object-storage] exists failed for ${filename}:`,
      (err as Error)?.message || err,
    );
    return false;
  }
}

// Download a file from the bucket into `<uploadsDir>/<filename>` if it
// isn't already on disk. Returns true if the file is now present on
// disk (either because it already was, or because we just fetched it).
export async function ensureLocalCopy(filename: string): Promise<boolean> {
  const absolute = path.join(uploadsDir, filename);
  if (fs.existsSync(absolute)) return true;
  const client = getClient();
  if (!client) return false;
  try {
    // Make sure the destination directory exists. The middleware
    // already creates uploadsDir at boot but this is defensive.
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const { ok, error } = await client.downloadToFilename(filename, absolute);
    if (!ok) {
      // "not found" is the common, expected case for legacy files that
      // were lost before we started mirroring. Don't spam the log for
      // that one specifically.
      const message = (error as any)?.message || String(error);
      if (!/not.?found|404/i.test(message)) {
        console.error(
          `[object-storage] ensureLocalCopy failed for ${filename}:`,
          message,
        );
      }
      return false;
    }
    console.log(`[object-storage] re-hydrated ${filename} from bucket`);
    return true;
  } catch (err) {
    console.error(
      `[object-storage] ensureLocalCopy threw for ${filename}:`,
      (err as Error)?.message || err,
    );
    return false;
  }
}

export async function deleteFromBucket(filename: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  try {
    const { ok, error } = await client.delete(filename);
    if (!ok) {
      const message = (error as any)?.message || String(error);
      if (!/not.?found|404/i.test(message)) {
        console.error(
          `[object-storage] delete failed for ${filename}:`,
          message,
        );
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `[object-storage] delete threw for ${filename}:`,
      (err as Error)?.message || err,
    );
    return false;
  }
}

// Fire-and-forget mirror used by the upload middleware. Never throws,
// never blocks the caller — failures are logged and the local-disk
// copy remains authoritative until the next successful mirror attempt.
// One-shot backfill executed at boot. Two passes:
//   1. Every file currently on local /uploads is uploaded to the
//      bucket (skipping anything already present). This rescues every
//      file that exists right now from the next container restart.
//   2. Every documents.filePath / nurses.passportPhotoPath the DB
//      knows about is checked — if it is missing from BOTH disk and
//      the bucket, we log it so the office team has a clear list of
//      files that were lost BEFORE this layer was added and need to
//      be re-collected from the candidate.
//
// Best-effort: failures are logged, never thrown. Skipped entirely if
// Object Storage isn't available (e.g. local dev with no bucket).
export async function backfillUploadsToBucket(): Promise<void> {
  const client = getClient();
  if (!client) {
    console.log("[object-storage] backfill skipped — bucket not available");
    return;
  }

  // Pass 1 — disk → bucket
  let mirrored = 0;
  let skipped = 0;
  let diskFiles: string[] = [];
  try {
    diskFiles = await fs.promises.readdir(uploadsDir);
  } catch (err) {
    console.error(
      "[object-storage] backfill: failed to read uploads dir:",
      (err as Error)?.message || err,
    );
  }
  for (const filename of diskFiles) {
    try {
      const absolute = path.join(uploadsDir, filename);
      const stat = await fs.promises.stat(absolute);
      if (!stat.isFile()) continue;
      const already = await existsInBucket(filename);
      if (already) {
        skipped++;
        continue;
      }
      const ok = await uploadFromDisk(filename);
      if (ok) mirrored++;
    } catch (err) {
      console.error(
        `[object-storage] backfill mirror failed for ${filename}:`,
        (err as Error)?.message || err,
      );
    }
  }
  console.log(
    `[object-storage] backfill pass 1: mirrored ${mirrored} disk files (${skipped} already in bucket)`,
  );

  // Pass 2 — DB-known files that aren't in either store
  try {
    const { db } = await import("./db");
    const { documents, nurses } = await import("@shared/schema");
    const docs = await db
      .select({ id: documents.id, filePath: documents.filePath })
      .from(documents);
    const passports = await db
      .select({ id: nurses.id, filePath: nurses.passportPhotoPath })
      .from(nurses);
    const candidates: { id: string; filePath: string }[] = [];
    for (const d of docs) if (d.filePath) candidates.push({ id: d.id, filePath: d.filePath });
    for (const n of passports) if (n.filePath) candidates.push({ id: n.id, filePath: n.filePath });

    let lostCount = 0;
    const lostSamples: string[] = [];
    for (const { id, filePath } of candidates) {
      const filename = path.basename(filePath);
      const onDisk = fs.existsSync(path.join(uploadsDir, filename));
      if (onDisk) continue;
      const inBucket = await existsInBucket(filename);
      if (inBucket) continue;
      lostCount++;
      if (lostSamples.length < 10) lostSamples.push(`${id}:${filename}`);
    }
    if (lostCount > 0) {
      console.warn(
        `[object-storage] backfill pass 2: ${lostCount} DB-referenced files are missing from BOTH disk and bucket (lost before mirroring). First few: ${lostSamples.join(", ")}`,
      );
    } else {
      console.log(
        `[object-storage] backfill pass 2: all ${candidates.length} DB-referenced files are recoverable`,
      );
    }
  } catch (err) {
    console.error(
      "[object-storage] backfill pass 2 failed:",
      (err as Error)?.message || err,
    );
  }
}

// Bounded retry with exponential backoff. The fire-and-forget mirror
// has a small "crash window" where a container that dies in the seconds
// between disk-write and bucket-upload could lose the file. Three quick
// retries (≈1s, 3s, 9s) close most of that window without blocking the
// request. Anything still failing after that is logged loudly so it
// can be picked up manually — the startup backfill on the next boot
// will also catch it as long as the disk file is still around.
const MIRROR_RETRY_DELAYS_MS = [1_000, 3_000, 9_000];

export function triggerBucketMirror(filename: string): void {
  void (async () => {
    for (let attempt = 0; attempt <= MIRROR_RETRY_DELAYS_MS.length; attempt++) {
      try {
        const ok = await uploadFromDisk(filename);
        if (ok) return;
      } catch (err) {
        console.error(
          `[object-storage] triggerBucketMirror attempt ${attempt + 1} threw for ${filename}:`,
          (err as Error)?.message || err,
        );
      }
      const delay = MIRROR_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;
      await new Promise((r) => setTimeout(r, delay));
    }
    console.error(
      `[object-storage] FAILED to mirror ${filename} after ${MIRROR_RETRY_DELAYS_MS.length + 1} attempts — file is only on local disk; startup backfill will retry on next boot.`,
    );
  })();
}
