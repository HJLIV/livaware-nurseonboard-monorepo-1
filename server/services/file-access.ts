// Shared authorization & cache-control helpers for file-serving routes
// (`/api/uploads/:filename`, `/api/documents/:id/download`, …).
//
// All file responses MUST set strict no-store cache headers so a proxied
// or browser-cached response cannot bleed across users — this was the
// underlying class of bug behind task 151.

import type { Request, Response } from "express";
import { and, eq, gt, or } from "drizzle-orm";
import { db } from "../db";
import {
  documents,
  nurses,
  portalLinks,
  references,
  refereeTokens,
} from "@shared/schema";
import { loadPortalSessionFromRequest } from "./portal-auth";

// A referee accessor is intentionally NOT keyed by nurseId — it grants
// access to one specific document only (the one attached to the
// referee's reference row), never to the nurse's full document set.
export type UploadAccessor =
  | { kind: "admin"; nurseId: null; via: "session" }
  | { kind: "portal_session"; nurseId: string; via: "cookie" }
  | { kind: "portal_bootstrap"; nurseId: string; via: "query_token" }
  | {
      kind: "referee";
      nurseId: string;
      via: "query_token";
      allowedDocumentId: string | null;
    };

export function setNoCacheHeaders(res: Response): void {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Vary", "Cookie");
}

function isAdminSession(req: Request): boolean {
  const role = req.session?.role;
  return (
    req.session?.isAuthenticated === true &&
    (role === "admin" || role === "super_admin" || role === "team")
  );
}

function readQueryString(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0 && value.length < 512) return value;
  return null;
}

// Identify who is asking for a file. Order is significant: admin
// session wins, then a logged-in portal session cookie, then an
// unexpired portal bootstrap link passed via `?portalToken=...`, then a
// referee link via `?refereeToken=...`. Returns null when the caller is
// effectively anonymous (any of the above all failed).
export async function resolveUploadAccessor(
  req: Request,
): Promise<UploadAccessor | null> {
  if (isAdminSession(req)) {
    return { kind: "admin", nurseId: null, via: "session" };
  }

  // Some routes (e.g. /api/portal/:token/...) populate req.nurseId via
  // the validatePortalToken middleware. Honour it as a portal session
  // equivalent so files fetched in the same handler chain authorize.
  const middlewareNurseId = (req as unknown as { nurseId?: unknown }).nurseId;
  if (typeof middlewareNurseId === "string" && middlewareNurseId) {
    return { kind: "portal_session", nurseId: middlewareNurseId, via: "cookie" };
  }

  try {
    const loaded = await loadPortalSessionFromRequest(req);
    if (loaded) {
      return { kind: "portal_session", nurseId: loaded.nurse.id, via: "cookie" };
    }
  } catch (err) {
    console.error("[file-access] portal session lookup failed:", (err as Error)?.message || err);
  }

  const portalToken = readQueryString(req.query?.portalToken);
  if (portalToken) {
    try {
      const [link] = await db
        .select({ nurseId: portalLinks.nurseId })
        .from(portalLinks)
        .where(and(eq(portalLinks.token, portalToken), gt(portalLinks.expiresAt, new Date())))
        .limit(1);
      if (link) {
        return { kind: "portal_bootstrap", nurseId: link.nurseId, via: "query_token" };
      }
    } catch (err) {
      console.error("[file-access] portal token lookup failed:", (err as Error)?.message || err);
    }
  }

  // Referee tokens are SCOPED: a valid token unlocks only the single
  // document linked to that token's reference row (references.documentId),
  // never the nurse's broader file set. If references.documentId is null,
  // the referee has no file access at all.
  const refereeToken = readQueryString(req.query?.refereeToken);
  if (refereeToken) {
    try {
      const [row] = await db
        .select({
          nurseId: refereeTokens.nurseId,
          expiresAt: refereeTokens.expiresAt,
          completedAt: refereeTokens.completedAt,
          referenceId: refereeTokens.referenceId,
        })
        .from(refereeTokens)
        .where(eq(refereeTokens.token, refereeToken))
        .limit(1);
      if (row && row.expiresAt.getTime() > Date.now() && !row.completedAt) {
        const [refRow] = await db
          .select({ documentId: references.documentId })
          .from(references)
          .where(eq(references.id, row.referenceId))
          .limit(1);
        return {
          kind: "referee",
          nurseId: row.nurseId,
          via: "query_token",
          allowedDocumentId: refRow?.documentId ?? null,
        };
      }
    } catch (err) {
      console.error("[file-access] referee token lookup failed:", (err as Error)?.message || err);
    }
  }

  return null;
}

export type FileOwnerLookup =
  | { ownerNurseId: string; documentId: string | null }
  | null
  | "error";

// Resolve which nurse owns the file at `<uploadsDir>/<filename>`. We
// match by basename against documents.filename and basename of
// documents.filePath (legacy rows persisted either form), and fall back
// to the candidate row's passport photo column.
export async function lookupFileOwnerNurseId(filename: string): Promise<FileOwnerLookup> {
  try {
    const [docRow] = await db
      .select({ id: documents.id, nurseId: documents.nurseId })
      .from(documents)
      .where(
        or(
          eq(documents.filename, filename),
          eq(documents.filePath, `/api/uploads/${filename}`),
          eq(documents.filePath, filename),
        ),
      )
      .limit(1);
    if (docRow) {
      return { ownerNurseId: docRow.nurseId, documentId: docRow.id };
    }
    const [passportRow] = await db
      .select({ id: nurses.id })
      .from(nurses)
      .where(eq(nurses.passportPhotoPath, `/api/uploads/${filename}`))
      .limit(1);
    if (passportRow) {
      return { ownerNurseId: passportRow.id, documentId: null };
    }
    return null;
  } catch (err) {
    console.error("[file-access] ownership lookup failed:", (err as Error)?.message || err);
    return "error";
  }
}
