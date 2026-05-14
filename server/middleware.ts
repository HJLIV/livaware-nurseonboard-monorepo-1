import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import rateLimit from "express-rate-limit";
import { db } from "./db";
import { portalLinks } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";

export const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const multerStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    cb(null, name);
  },
});

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("File type not allowed. Accepted: PDF, JPG, PNG, DOC, DOCX"));
  },
});

export async function validatePortalToken(req: Request, res: Response, next: NextFunction) {
  const token = req.params.token as string;
  // Sentinel "me" / "session" → no URL token, authenticate via the
  // passwordless portal session cookie (task 107).
  if (token === "me" || token === "session") {
    const { loadPortalSessionFromRequest } = await import("./services/portal-auth");
    const loaded = await loadPortalSessionFromRequest(req);
    if (!loaded) return res.status(401).json({ message: "Portal sign-in required" });
    (req as any).nurseId = loaded.nurse.id;
    (req as any).portalSession = loaded.session;
    return next();
  }
  const [link] = await db.select().from(portalLinks).where(
    and(eq(portalLinks.token, token), gt(portalLinks.expiresAt, new Date()))
  );
  // Bootstrap links are one-time: once claimed they may NOT continue to
  // authenticate /api/portal/:token/* requests. The session cookie is the
  // only valid auth from that point on. Unclaimed, non-expired links
  // remain valid so the very first hit can bootstrap a session.
  if (link && !link.claimedAt) {
    (req as any).nurseId = link.nurseId;
    (req as any).portalLink = link;
    return next();
  }
  // Token unknown/expired/already-claimed — fall back to a portal-session
  // cookie if the client is signed in. This is what lets newly issued
  // sessions keep using /api/portal/:token/* routes after the bootstrap.
  const { loadPortalSessionFromRequest } = await import("./services/portal-auth");
  const loaded = await loadPortalSessionFromRequest(req);
  if (loaded) {
    (req as any).nurseId = loaded.nurse.id;
    (req as any).portalSession = loaded.session;
    return next();
  }
  return res.status(404).json({ message: "Invalid or expired portal link" });
}

export const magicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many portal link requests, please try again later" },
});

export const refereeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many upload requests, please try again later" },
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again later" },
});

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.isAuthenticated) {
    return next();
  }
  return res.status(401).json({ message: "Not authenticated" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (
    req.session?.isAuthenticated &&
    (req.session?.role === "admin" || req.session?.role === "super_admin")
  ) {
    return next();
  }
  if (req.session?.isAuthenticated) {
    return res.status(403).json({ message: "Admin access required" });
  }
  return res.status(401).json({ message: "Not authenticated" });
}

// Super-admin gate. The super admin is a single fixed account
// (configured via SUPER_ADMIN_USERNAME/SUPER_ADMIN_PASSWORD or matched by
// SUPER_ADMIN_EMAIL on Microsoft SSO). It's the only role allowed to
// mutate platform-config (policies, settings, arcade modules/content,
// chase email templates, admin/team users) AND the only role allowed to
// view privacy-sensitive policy reading-behaviour data (time spent,
// scrolled-to-end, pdf-opened, median/skimmed summary).
export function isSuperAdmin(req: Request): boolean {
  return !!req.session?.isAuthenticated && req.session?.role === "super_admin";
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (isSuperAdmin(req)) return next();
  if (req.session?.isAuthenticated) {
    return res.status(403).json({ message: "Super admin access required" });
  }
  return res.status(401).json({ message: "Not authenticated" });
}

// Onboarding access gate (task 94) — refuses portal-side writes that
// belong to the Onboarding / Compliance / Skills Arcade sections until
// the gate is open for this nurse. Must run AFTER validatePortalToken
// (it relies on req.nurseId). The Assessment-group routes (clinical
// examination submission, competency declarations, CV upload) MUST NOT
// be wrapped with this — those are how the candidate satisfies the
// prerequisites in auto-unlock mode.
// Induction acknowledgement gate (task 114) — refuses Skills Arcade
// writes (start attempt, submit attempt, etc.) until every active
// induction item has been acknowledged at its current version. The
// portal is unaffected — this only wraps the arcade write paths.
//
// For session-authenticated arcade users (`/api/nurse/...`) the nurse
// is identified via `req.session.nurseId`; for portal-authenticated
// arcade routes the gate uses `req.nurseId` populated by
// validatePortalToken.
export async function requireInductionAcknowledged(req: Request, res: Response, next: NextFunction) {
  try {
    let nurseId =
      ((req as any).nurseId as string | undefined)
      || (req.session as any)?.nurseId
      || undefined;
    // Session-authenticated arcade users (`/api/nurse/*`) carry an
    // arcade userId on the session; resolve back to the nurse record
    // via arcadeUsers.nurseId. Trainers/admins logging into the arcade
    // are not gated (they don't have a nurseId on their arcade user).
    if (!nurseId) {
      const arcadeUserId = (req.session as any)?.userId as string | undefined;
      if (arcadeUserId) {
        const { arcadeUsers } = await import("@shared/schema");
        const [u] = await db
          .select({ nurseId: arcadeUsers.nurseId })
          .from(arcadeUsers)
          .where(eq(arcadeUsers.id, arcadeUserId));
        if (u?.nurseId) nurseId = u.nurseId;
      }
    }
    if (!nurseId) {
      // No nurse context (e.g. arcade trainer/admin). Don't gate.
      return next();
    }
    const { getInductionGateState } = await import("./services/induction-gate");
    const state = await getInductionGateState(nurseId);
    if (!state.unlocked) {
      return res.status(403).json({
        error: "induction_incomplete",
        message: `Skills Arcade is locked until you have read and acknowledged all ${state.total} induction items (${state.outstanding} outstanding).`,
        induction: state,
      });
    }
    next();
  } catch (err: any) {
    console.error("[requireInductionAcknowledged] error:", err.message);
    return res.status(500).json({ message: "Failed to verify induction status" });
  }
}

// Gate for employer-facing post-onboarding surfaces (policies, induction
// pack, SOP comprehension). These must NOT be visible while the nurse is
// still working through assessment / onboarding — only once an admin has
// advanced them to the final "Nurse" stage (current_stage = "completed").
export async function requireNurseStageCompleted(req: Request, res: Response, next: NextFunction) {
  try {
    const nurseId = (req as any).nurseId as string | undefined;
    if (!nurseId) return res.status(401).json({ message: "Not authenticated" });
    const { getGateState } = await import("./services/onboarding-gate");
    const state = await getGateState(nurseId);
    if (!state) return res.status(404).json({ message: "Nurse not found" });
    if (!state.complianceApproved) {
      return res.status(403).json({
        error: "compliance_not_approved",
        message: "Available once your employer has approved your compliance file.",
        gate: state,
      });
    }
    next();
  } catch (err: any) {
    console.error("[requireNurseStageCompleted] error:", err.message);
    return res.status(500).json({ message: "Failed to verify nurse stage" });
  }
}

export async function requireOnboardingUnlocked(req: Request, res: Response, next: NextFunction) {
  try {
    const nurseId = (req as any).nurseId as string | undefined;
    if (!nurseId) return res.status(401).json({ message: "Not authenticated" });
    const { getGateState } = await import("./services/onboarding-gate");
    const state = await getGateState(nurseId);
    if (!state) return res.status(404).json({ message: "Nurse not found" });
    if (!state.unlocked) {
      return res.status(403).json({
        error: "onboarding_locked",
        message: "Onboarding access has not been opened for this nurse yet",
        gate: state,
      });
    }
    next();
  } catch (err: any) {
    console.error("[requireOnboardingUnlocked] error:", err.message);
    return res.status(500).json({ message: "Failed to verify onboarding access" });
  }
}
