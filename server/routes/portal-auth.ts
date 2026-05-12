import type { Express, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { portalSessions } from "@shared/schema";
import { logAction } from "../services/audit";
import {
  PORTAL_SESSION_COOKIE,
  PORTAL_VERIFY_RATE_MAX,
  PORTAL_VERIFY_RATE_WINDOW_MS,
  PORTAL_CODE_RATE_MAX,
  PORTAL_CODE_RATE_WINDOW_MS,
  countRecentCodesForNurse,
  createPortalAuthCode,
  findNurseByEmail,
  getRequestIp,
  issuePortalSession,
  loadPortalSessionFromRequest,
  verifyPortalAuthCode,
  parseCookie,
  clearPortalSessionCookie,
} from "../services/portal-auth";
import { sendPortalSignInCodeEmail, isOutlookConfigured } from "../outlook";

const requestCodeIpLimiter = rateLimit({
  windowMs: PORTAL_CODE_RATE_WINDOW_MS,
  max: PORTAL_CODE_RATE_MAX * 4,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many code requests, please try again later" },
});

const verifyCodeIpLimiter = rateLimit({
  windowMs: PORTAL_VERIFY_RATE_WINDOW_MS,
  max: PORTAL_VERIFY_RATE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many code attempts, please try again later" },
});

export function registerPortalAuthRoutes(app: Express) {
  // POST /api/portal/auth/request-code { email }
  // Always returns 200 to avoid leaking which emails belong to nurses.
  app.post("/api/portal/auth/request-code", requestCodeIpLimiter, async (req, res) => {
    const email = String(req.body?.email || "").trim();
    if (!email) return res.status(400).json({ message: "Email is required" });

    const nurse = await findNurseByEmail(email);
    if (!nurse) {
      // Audit the unknown-email attempt under a synthetic nurseId=null entry.
      await logAction(null, "portal_auth", "portal_code_requested_unknown", "nurse_portal", {
        email,
        ip: getRequestIp(req),
      });
      return res.json({ ok: true });
    }

    const recent = await countRecentCodesForNurse(nurse.id);
    if (recent >= PORTAL_CODE_RATE_MAX) {
      await logAction(nurse.id, "portal_auth", "portal_code_rate_limited", "nurse_portal", {
        recent,
        ip: getRequestIp(req),
      });
      return res.status(429).json({ message: "Too many codes requested. Please try again later." });
    }

    const { code, expiresAt } = await createPortalAuthCode(req, nurse.id);
    await logAction(nurse.id, "portal_auth", "portal_code_requested", "nurse_portal", {
      ip: getRequestIp(req),
      expiresAt: expiresAt.toISOString(),
    });

    let emailSent = false;
    let emailError: string | undefined;
    if (isOutlookConfigured()) {
      try {
        await sendPortalSignInCodeEmail(nurse.email, nurse.fullName, code, expiresAt);
        emailSent = true;
      } catch (err: any) {
        emailError = err?.message || String(err);
        console.error("[portal-auth] sendPortalSignInCodeEmail failed:", emailError);
      }
    }

    await logAction(nurse.id, "portal_auth", "portal_code_email", "nurse_portal", {
      emailSent,
      emailError: emailError || null,
    });

    // In test/dev (or when email isn't configured) we surface the code in
    // the response so end-to-end tests can verify the flow without an
    // actual mailbox. In production the code is sent only via email.
    const exposeCode = !isOutlookConfigured() || process.env.NODE_ENV !== "production";
    if (exposeCode) {
      return res.json({ ok: true, devCode: code, expiresAt: expiresAt.toISOString() });
    }
    return res.json({ ok: true });
  });

  // POST /api/portal/auth/verify-code { email, code }
  app.post("/api/portal/auth/verify-code", verifyCodeIpLimiter, async (req, res) => {
    const email = String(req.body?.email || "").trim();
    const code = String(req.body?.code || "").trim();
    if (!email || !code) return res.status(400).json({ message: "Email and code are required" });

    const nurse = await findNurseByEmail(email);
    if (!nurse) {
      // Generic invalid-code response — don't reveal account existence.
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    const result = await verifyPortalAuthCode(nurse.id, code);
    if (!result.ok) {
      await logAction(nurse.id, "portal_auth", "portal_code_verify_failed", "nurse_portal", {
        reason: result.reason,
        ip: getRequestIp(req),
      });
      const status = result.reason === "locked" ? 429 : 400;
      return res.status(status).json({
        message: result.reason === "locked"
          ? "Too many wrong attempts. Please request a new code."
          : "Invalid or expired code",
        reason: result.reason,
        attemptsRemaining: result.attemptsRemaining,
      });
    }

    const { session } = await issuePortalSession(req, res, nurse.id, "email_code", "nurse_portal");
    await logAction(nurse.id, "portal_auth", "portal_code_verified", "nurse_portal", {
      sessionId: session.id,
      ip: getRequestIp(req),
    });
    return res.json({
      ok: true,
      nurse: { id: nurse.id, fullName: nurse.fullName, email: nurse.email },
      sessionExpiresAt: session.expiresAt.toISOString(),
    });
  });

  // GET /api/portal/auth/me — returns the current portal session's nurse.
  app.get("/api/portal/auth/me", async (req, res) => {
    const loaded = await loadPortalSessionFromRequest(req);
    if (!loaded) return res.status(401).json({ authenticated: false });
    return res.json({
      authenticated: true,
      nurse: {
        id: loaded.nurse.id,
        fullName: loaded.nurse.fullName,
        email: loaded.nurse.email,
        currentStage: loaded.nurse.currentStage,
      },
      session: {
        id: loaded.session.id,
        issuedAt: loaded.session.issuedAt.toISOString(),
        expiresAt: loaded.session.expiresAt.toISOString(),
      },
    });
  });

  // POST /api/portal/auth/sign-out — revokes the current session only.
  app.post("/api/portal/auth/sign-out", async (req, res) => {
    const raw = parseCookie(req.headers.cookie || "", PORTAL_SESSION_COOKIE);
    if (raw) {
      // Hash inline to avoid an extra import; mirrors loadPortalSessionFromRequest.
      const crypto = await import("crypto");
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      const [revoked] = await db
        .update(portalSessions)
        .set({ revokedAt: new Date(), revokedReason: "sign_out" })
        .where(and(eq(portalSessions.sessionTokenHash, hash), isNull(portalSessions.revokedAt)))
        .returning();
      if (revoked) {
        await logAction(revoked.nurseId, "portal_auth", "portal_signed_out", "nurse_portal", {
          sessionId: revoked.id,
        });
      }
    }
    await clearPortalSessionCookie(res);
    return res.json({ ok: true });
  });
}

// Drop-in middleware for routes that need a portal session (no token).
export async function requirePortalSession(req: Request, res: Response, next: NextFunction) {
  const loaded = await loadPortalSessionFromRequest(req);
  if (!loaded) return res.status(401).json({ message: "Portal sign-in required" });
  (req as any).nurseId = loaded.nurse.id;
  (req as any).portalSession = loaded.session;
  next();
}
