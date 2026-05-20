// SharePoint Online integration via Replit SharePoint connector
import { Client } from '@microsoft/microsoft-graph-client';
import fs from 'fs';
import path from 'path';

let connectionSettings: any;

function resolveAccessTokenFromSettings(settings: any): string | null {
  return settings?.access_token || settings?.oauth?.credentials?.access_token || null;
}

async function getAccessToken() {
  if (connectionSettings?.settings) {
    const cachedToken = resolveAccessTokenFromSettings(connectionSettings.settings);
    const expiresAt = connectionSettings.settings.expires_at;
    if (cachedToken && expiresAt && new Date(expiresAt).getTime() > Date.now()) {
      return cachedToken;
    }
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sharepoint',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = resolveAccessTokenFromSettings(connectionSettings?.settings);

  if (!connectionSettings || !accessToken) {
    throw new Error('SharePoint not connected');
  }
  return accessToken;
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
export async function getUncachableSharePointClient() {
  const accessToken = await getAccessToken();
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => accessToken
    }
  });
}

export const ROOT_FOLDER = 'NurseOnboarding';
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

const SHAREPOINT_SITE_ID = process.env.SHAREPOINT_SITE_ID || '';
const SHAREPOINT_DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID || '';
const SHAREPOINT_SITE_URL = process.env.SHAREPOINT_SITE_URL || '';

// When the operator gives us a site URL like
// https://livaware.sharepoint.com/sites/onboarding2 we can resolve it
// to a site id via Graph (`GET /sites/{hostname}:/{server-relative-path}`)
// once and cache it for the process lifetime. This avoids the
// alternative of asking the operator to hunt down a site GUID.
let resolvedSiteIdFromUrl: string | null = null;
async function resolveSiteIdFromUrl(client: Client): Promise<string | null> {
  if (resolvedSiteIdFromUrl) return resolvedSiteIdFromUrl;
  if (!SHAREPOINT_SITE_URL) return null;
  try {
    const u = new URL(SHAREPOINT_SITE_URL);
    const hostname = u.hostname;
    const serverPath = u.pathname.replace(/^\/+|\/+$/g, '');
    const result: any = await client
      .api(`/sites/${hostname}:/${serverPath}`)
      .get();
    if (result?.id) {
      resolvedSiteIdFromUrl = result.id;
      console.log(`[SharePoint] resolved site URL ${SHAREPOINT_SITE_URL} → ${result.id}`);
      return result.id;
    }
  } catch (err: any) {
    console.error(`[SharePoint] failed to resolve site URL ${SHAREPOINT_SITE_URL}:`, err?.message || err);
  }
  return null;
}

export function getDriveApiBase(): string {
  if (SHAREPOINT_SITE_ID && SHAREPOINT_DRIVE_ID) {
    return `/sites/${SHAREPOINT_SITE_ID}/drives/${SHAREPOINT_DRIVE_ID}`;
  }
  if (SHAREPOINT_SITE_ID) {
    return `/sites/${SHAREPOINT_SITE_ID}/drive`;
  }
  if (resolvedSiteIdFromUrl) {
    return `/sites/${resolvedSiteIdFromUrl}/drive`;
  }
  return '/me/drive';
}

// Async variant that will lazily resolve a site URL the first time
// it's called. Callers that can `await` should prefer this over the
// sync `getDriveApiBase()` so they don't fall back to `/me/drive`
// when only SHAREPOINT_SITE_URL is configured.
export async function resolveDriveApiBase(client: Client): Promise<string> {
  if (SHAREPOINT_SITE_ID) return getDriveApiBase();
  if (SHAREPOINT_SITE_URL) {
    const id = await resolveSiteIdFromUrl(client);
    if (id) return `/sites/${id}/drive`;
  }
  return '/me/drive';
}

// Diagnostic helper — returns what the recovery tooling will actually
// hit so the operator can confirm config before running a big job.
export async function describeSharepointTarget(): Promise<{
  hasSiteId: boolean;
  hasDriveId: boolean;
  hasSiteUrl: boolean;
  resolvedDriveBase: string;
  siteUrl: string | null;
}> {
  let resolvedDriveBase = getDriveApiBase();
  if (!SHAREPOINT_SITE_ID && SHAREPOINT_SITE_URL) {
    try {
      const client = await getUncachableSharePointClient();
      resolvedDriveBase = await resolveDriveApiBase(client);
    } catch {
      // leave the sync fallback
    }
  }
  return {
    hasSiteId: !!SHAREPOINT_SITE_ID,
    hasDriveId: !!SHAREPOINT_DRIVE_ID,
    hasSiteUrl: !!SHAREPOINT_SITE_URL,
    resolvedDriveBase,
    siteUrl: SHAREPOINT_SITE_URL || null,
  };
}

export function sanitizeName(name: string): string {
  return name.replace(/[#%&*:<>?/\\{|}~]/g, '_').replace(/\s+/g, '_');
}

function resolveAndValidateFilePath(localFilePath: string): string {
  let absolutePath: string;

  if (localFilePath.startsWith('/api/uploads/')) {
    absolutePath = path.join(UPLOADS_DIR, path.basename(localFilePath));
  } else if (path.isAbsolute(localFilePath)) {
    absolutePath = localFilePath;
  } else {
    absolutePath = path.join(UPLOADS_DIR, path.basename(localFilePath));
  }

  const resolved = path.resolve(absolutePath);
  if (!resolved.startsWith(UPLOADS_DIR)) {
    throw new Error(`File path not within uploads directory: ${localFilePath}`);
  }

  return resolved;
}

async function ensureFolderPath(client: Client, folderPath: string): Promise<void> {
  const driveBase = getDriveApiBase();
  const parts = folderPath.split('/').filter(Boolean);
  let currentPath = '';

  for (const part of parts) {
    const parentPath = currentPath || 'root';
    currentPath = currentPath ? `${currentPath}/${part}` : part;

    try {
      await client.api(`${driveBase}/root:/${currentPath}`).get();
    } catch (err: any) {
      if (err.statusCode === 404) {
        const parentApi = parentPath === 'root'
          ? `${driveBase}/root/children`
          : `${driveBase}/root:/${parentPath}:/children`;

        await client.api(parentApi).post({
          name: part,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail'
        }).catch((createErr: any) => {
          if (createErr.statusCode !== 409) throw createErr;
        });
      } else {
        throw err;
      }
    }
  }
}

export interface SharePointUploadResult {
  webUrl: string;
  driveItemId: string;
}

export async function uploadToSharePoint(
  localFilePath: string,
  candidateName: string,
  candidateId: string,
  category: string,
  originalFilename: string,
): Promise<SharePointUploadResult> {
  const client = await getUncachableSharePointClient();
  const driveBase = getDriveApiBase();

  const safeCandidateName = sanitizeName(candidateName);
  const safeCategory = sanitizeName(category || 'general');
  const folderPath = `${ROOT_FOLDER}/${safeCandidateName}_${candidateId}/${safeCategory}`;

  await ensureFolderPath(client, folderPath);

  const fileBuffer = fs.readFileSync(localFilePath);
  const safeFilename = sanitizeName(originalFilename);

  const uploadPath = `${folderPath}/${safeFilename}`;

  let result;
  if (fileBuffer.length < 4 * 1024 * 1024) {
    result = await client
      .api(`${driveBase}/root:/${uploadPath}:/content`)
      .header('Content-Type', 'application/octet-stream')
      .put(fileBuffer);
  } else {
    const session = await client
      .api(`${driveBase}/root:/${uploadPath}:/createUploadSession`)
      .post({
        item: {
          '@microsoft.graph.conflictBehavior': 'rename',
          name: safeFilename,
        }
      });

    const maxChunkSize = 320 * 1024 * 10;
    let offset = 0;
    while (offset < fileBuffer.length) {
      const chunkEnd = Math.min(offset + maxChunkSize, fileBuffer.length);
      const chunk = fileBuffer.slice(offset, chunkEnd);

      const chunkResponse = await fetch(session.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': chunk.length.toString(),
          'Content-Range': `bytes ${offset}-${chunkEnd - 1}/${fileBuffer.length}`,
        },
        body: chunk,
      });

      if (!chunkResponse.ok && chunkResponse.status !== 202) {
        throw new Error(`Chunk upload failed with status ${chunkResponse.status}`);
      }

      const chunkData = await chunkResponse.json();
      if (chunkEnd === fileBuffer.length) {
        result = chunkData;
      }

      offset = chunkEnd;
    }
  }

  if (!result?.webUrl || !result?.id) {
    throw new Error('SharePoint upload completed but no valid webUrl/id returned');
  }

  return {
    webUrl: result.webUrl,
    driveItemId: result.id,
  };
}

export async function uploadDocumentToSharePoint(
  documentId: string,
  localFilePath: string,
  candidateName: string,
  candidateId: string,
  category: string,
  originalFilename: string,
  updateDocFn: (id: string, data: { sharepointUrl: string }) => Promise<any>,
  createAuditLogFn: (data: any) => Promise<any>,
): Promise<void> {
  try {
    const absolutePath = resolveAndValidateFilePath(localFilePath);

    if (!fs.existsSync(absolutePath)) {
      console.error(`[SharePoint] File not found for upload: ${absolutePath}`);
      await createAuditLogFn({
        candidateId,
        action: 'sharepoint_upload_failed',
        agentName: 'system',
        detail: { documentId, error: 'File not found on disk', filePath: localFilePath },
      });
      return;
    }

    const result = await uploadToSharePoint(absolutePath, candidateName, candidateId, category, originalFilename);

    await updateDocFn(documentId, { sharepointUrl: result.webUrl });

    await createAuditLogFn({
      candidateId,
      action: 'sharepoint_upload_success',
      agentName: 'system',
      detail: { documentId, sharepointUrl: result.webUrl, driveItemId: result.driveItemId },
    });

    console.log(`[SharePoint] Uploaded ${originalFilename} for candidate ${candidateId}: ${result.webUrl}`);
  } catch (err: any) {
    console.error(`[SharePoint] Upload failed for document ${documentId}:`, err.message);
    await createAuditLogFn({
      candidateId,
      action: 'sharepoint_upload_failed',
      agentName: 'system',
      detail: { documentId, error: err.message },
    }).catch(() => {});
  }
}
