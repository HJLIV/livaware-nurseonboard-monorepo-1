import crypto from "crypto";
import type { Request, Response } from "express";
import { and, eq, gt, isNull, desc, sql } from "drizzle-orm";
import { db } from "../db";
import {
  nurses,
  portalAuthCodes,
  portalSessions,
  portalLinks,
  type Nurse,
  type PortalSession,
} from "@shared/schema";
import { logAction } from "./audit";

export const PORTAL_SESSION_COOKIE = "portal.sid";
export const PORTAL_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PORTAL_CODE_TTL_MS = 10 * 60 * 1000;
export const PORTAL_CODE_MAX_ATTEMPTS = 5;
export const PORTAL_CODE_RATE_WINDOW_MS = 60 * 60 * 1000;
export const PORTAL_CODE_RATE_MAX = 5;
export const PORTAL_VERIFY_RATE_WINDOW_MS = 10 * 60 * 1000;
export const PORTAL_VERIFY_RATE_MAX = 10;

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function randomSessionToken(): string {
  // 48 bytes => 64 chars base64url, plenty of entropy.
  return crypto.randomBytes(48).toString("base64url");
}

export function generatePortalCode(): string {
  // 6 digits, zero-padded. Uniformly random via rejection sampling on
  // a 24-bit window divisible by 1_000_000 to avoid modulo bias.
  const limit = Math.floor(0xffffff / 1_000_000) * 1_000_000;
  let n: number;
  do {
    n = crypto.randomBytes(3).readUIntBE(0, 3);
  } while (n >= limit);
  return String(n % 1_000_000).padStart(6, "0");
}

export function hashCode(code: string): string {
  return sha256(code.trim());
}

export function getRequestIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

export function getUserAgent(req: Request): string {
  return String(req.headers["user-agent"] || "").slice(0, 500);
}

// Issue a fresh portal session for the given nurse, set the cookie on
// the response, and audit it. Returns the session row.
export async function issuePortalSession(
  req: Request,
  res: Response,
  nurseId: string,
  issuedVia: "bootstrap_link" | "email_code",
  agentName: string,
): Promise<{ session: PortalSession; token: string }> {
  const token = randomSessionToken();
  const tokenHash = sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PORTAL_SESSION_TTL_MS);

  const [session] = await db
    .insert(portalSessions)
    .values({
      nurseId,
      sessionTokenHash: tokenHash,
      issuedAt: now,
      expiresAt,
      lastSeenAt: now,
      ip: getRequestIp(req),
      userAgent: getUserAgent(req),
      issuedVia,
    })
    .returning();

  res.cookie(PORTAL_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PORTAL_SESSION_TTL_MS,
  });

  await logAction(nurseId, "portal_auth", "portal_session_issued", agentName, {
    sessionId: session.id,
    issuedVia,
    ip: session.ip,
  });

  return { session, token };
}

// Look up the active portal session from the inbound cookie. Returns
// undefined if there is no cookie, the session is unknown, expired, or
// revoked. Touches lastSeenAt opportunistically (best-effort).
export async function loadPortalSessionFromRequest(
  req: Request,
): Promise<{ session: PortalSession; nurse: Nurse } | undefined> {
  const raw = parseCookie(req.headers.cookie || "", PORTAL_SESSION_COOKIE);
  if (!raw) return undefined;
  const tokenHash = sha256(raw);
  const [session] = await db
    .select()
    .from(portalSessions)
    .where(eq(portalSessions.sessionTokenHash, tokenHash))
    .limit(1);
  if (!session) return undefined;
  if (session.revokedAt) return undefined;
  if (session.expiresAt.getTime() <= Date.now()) return undefined;

  const [nurse] = await db.select().from(nurses).where(eq(nurses.id, session.nurseId)).limit(1);
  if (!nurse) return undefined;

  // Best-effort touch — ignore failures.
  db
    .update(portalSessions)
    .set({ lastSeenAt: new Date(), ip: getRequestIp(req) })
    .where(eq(portalSessions.id, session.id))
    .catch(() => {});

  return { session, nurse };
}

export function parseCookie(header: string, name: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1));
      } catch {
        return part.slice(eq + 1);
      }
    }
  }
  return undefined;
}

export async function revokeAllPortalSessionsForNurse(
  nurseId: string,
  reason: string,
  agentName: string,
): Promise<number> {
  const result = await db
    .update(portalSessions)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(portalSessions.nurseId, nurseId), isNull(portalSessions.revokedAt)))
    .returning({ id: portalSessions.id });
  await logAction(nurseId, "portal_auth", "portal_sessions_revoked", agentName, {
    revoked: result.length,
    reason,
  });
  return result.length;
}

export async function clearPortalSessionCookie(res: Response): Promise<void> {
  res.clearCookie(PORTAL_SESSION_COOKIE, { path: "/" });
}

// Find the nurse most recently associated with the given email. Used
// by the request-code flow. Email match is case-insensitive.
export async function findNurseByEmail(email: string): Promise<Nurse | undefined> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return undefined;
  const [nurse] = await db
    .select()
    .from(nurses)
    .where(sql`lower(${nurses.email}) = ${normalised}`)
    .orderBy(desc(nurses.createdAt))
    .limit(1);
  return nurse;
}

// Ensure we don't issue more than PORTAL_CODE_RATE_MAX *active*
// (unconsumed, unexpired) codes for the same nurse within
// PORTAL_CODE_RATE_WINDOW_MS. Consumed/expired codes don't count, so a
// nurse who actually used or burned through codes can request fresh
// ones; only stockpiled live codes are limited.
export async function countRecentCodesForNurse(nurseId: string): Promise<number> {
  const now = new Date();
  const since = new Date(now.getTime() - PORTAL_CODE_RATE_WINDOW_MS);
  const rows = await db
    .select({ id: portalAuthCodes.id })
    .from(portalAuthCodes)
    .where(
      and(
        eq(portalAuthCodes.nurseId, nurseId),
        gt(portalAuthCodes.createdAt, since),
        isNull(portalAuthCodes.consumedAt),
        gt(portalAuthCodes.expiresAt, now),
      ),
    );
  return rows.length;
}

// Insert a fresh code row. Caller is responsible for sending the email.
export async function createPortalAuthCode(
  req: Request,
  nurseId: string,
): Promise<{ code: string; expiresAt: Date }> {
  const code = generatePortalCode();
  const expiresAt = new Date(Date.now() + PORTAL_CODE_TTL_MS);
  await db.insert(portalAuthCodes).values({
    nurseId,
    codeHash: hashCode(code),
    expiresAt,
    attemptsRemaining: PORTAL_CODE_MAX_ATTEMPTS,
    requestedIp: getRequestIp(req),
    requestedUserAgent: getUserAgent(req),
  });
  return { code, expiresAt };
}

export type CodeVerifyResult =
  | { ok: true; nurseId: string; codeId: string }
  | { ok: false; reason: "no_active_code" | "expired" | "wrong_code" | "locked"; attemptsRemaining?: number };

// Verify a submitted code against the most recent unconsumed code for
// the nurse. Single-use: success consumes the code; wrong-code
// decrements attemptsRemaining and burns the code when it hits zero.
export async function verifyPortalAuthCode(
  nurseId: string,
  submitted: string,
): Promise<CodeVerifyResult> {
  const [row] = await db
    .select()
    .from(portalAuthCodes)
    .where(and(eq(portalAuthCodes.nurseId, nurseId), isNull(portalAuthCodes.consumedAt)))
    .orderBy(desc(portalAuthCodes.createdAt))
    .limit(1);
  if (!row) return { ok: false, reason: "no_active_code" };
  if (row.expiresAt.getTime() <= Date.now()) {
    await db
      .update(portalAuthCodes)
      .set({ consumedAt: new Date() })
      .where(eq(portalAuthCodes.id, row.id));
    return { ok: false, reason: "expired" };
  }
  if (row.attemptsRemaining <= 0) {
    return { ok: false, reason: "locked" };
  }
  const submittedHash = hashCode(submitted);
  const a = Buffer.from(row.codeHash, "hex");
  const b = Buffer.from(submittedHash, "hex");
  const matches = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!matches) {
    const remaining = row.attemptsRemaining - 1;
    await db
      .update(portalAuthCodes)
      .set({
        attemptsRemaining: remaining,
        consumedAt: remaining <= 0 ? new Date() : null,
      })
      .where(eq(portalAuthCodes.id, row.id));
    return { ok: false, reason: remaining <= 0 ? "locked" : "wrong_code", attemptsRemaining: Math.max(0, remaining) };
  }
  await db
    .update(portalAuthCodes)
    .set({ consumedAt: new Date() })
    .where(eq(portalAuthCodes.id, row.id));
  return { ok: true, nurseId: row.nurseId, codeId: row.id };
}

// Bootstrap a portal session from a still-fresh portalLinks row. The
// link is single-use: claimedAt is stamped atomically here so a second
// call returns undefined.
export async function claimBootstrapLink(
  req: Request,
  res: Response,
  token: string,
): Promise<{ nurse: Nurse; sessionId: string } | { error: "not_found" | "consumed" | "expired" }>
{
  const [link] = await db
    .select()
    .from(portalLinks)
    .where(eq(portalLinks.token, token))
    .limit(1);
  if (!link) return { error: "not_found" };
  if (link.expiresAt.getTime() <= Date.now()) return { error: "expired" };
  if (link.claimedAt) return { error: "consumed" };

  // Atomic claim.
  const [claimed] = await db
    .update(portalLinks)
    .set({ claimedAt: new Date(), usedAt: link.usedAt ?? new Date() })
    .where(and(eq(portalLinks.id, link.id), isNull(portalLinks.claimedAt)))
    .returning();
  if (!claimed) return { error: "consumed" };

  const [nurse] = await db.select().from(nurses).where(eq(nurses.id, link.nurseId)).limit(1);
  if (!nurse) return { error: "not_found" };

  const { session } = await issuePortalSession(req, res, nurse.id, "bootstrap_link", "nurse_portal");
  await logAction(nurse.id, "portal_auth", "portal_bootstrap_claimed", `nurse_portal:${nurse.fullName}`, {
    linkId: link.id,
    module: link.module,
  });
  return { nurse, sessionId: session.id };
}

export async function listRecentSessionsForNurse(
  nurseId: string,
  limit = 10,
): Promise<PortalSession[]> {
  return db
    .select()
    .from(portalSessions)
    .where(eq(portalSessions.nurseId, nurseId))
    .orderBy(desc(portalSessions.issuedAt))
    .limit(limit);
}
