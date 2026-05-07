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
  const [link] = await db.select().from(portalLinks).where(
    and(eq(portalLinks.token, token), gt(portalLinks.expiresAt, new Date()))
  );
  if (!link) return res.status(404).json({ message: "Invalid or expired portal link" });
  (req as any).nurseId = link.nurseId;
  (req as any).portalLink = link;
  next();
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

// ──────────────────────────────────────────────────────────────────────────
// Stricter admin tier: policy reading-behaviour
//
// The reading-behaviour columns (time spent, scrolled-to-end, pdf-opened,
// median/skimmed summary) are gated to a sub-set of admins so they don't
// become an unintended HR/disciplinary signal visible to every team admin.
//
// Top-level admin = the local-credentials admin login (env ADMIN_USERNAME,
// default "admin"). They implicitly have the permission and are the only
// ones who can grant/revoke it from /settings.
//
// Other admins (Microsoft SSO admins, etc.) need their lowercased
// username/email added to the `policy_read_behaviour_permissions`
// app_settings allowlist by a top-level admin.
// ──────────────────────────────────────────────────────────────────────────
// Super-admin gate. The super admin is a single fixed account
// (configured via SUPER_ADMIN_USERNAME/SUPER_ADMIN_PASSWORD or matched by
// SUPER_ADMIN_EMAIL on Microsoft SSO) that is the only role allowed to
// mutate platform-config: policies, settings, arcade modules/content,
// chase email templates, admin/team users.
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.session?.isAuthenticated && req.session?.role === "super_admin") {
    return next();
  }
  if (req.session?.isAuthenticated) {
    return res.status(403).json({ message: "Super admin access required" });
  }
  return res.status(401).json({ message: "Not authenticated" });
}

export function getTopLevelAdminUsername(): string {
  return process.env["ADMIN_USERNAME"] || "admin";
}

export function isTopLevelAdmin(req: Request): boolean {
  if (!req.session?.isAuthenticated || req.session?.role !== "admin") return false;
  if (req.session?.authMethod !== "local") return false;
  return (req.session?.username || "").toLowerCase() === getTopLevelAdminUsername().toLowerCase();
}

// Identifiers used to match a session against the allowlist. We try both
// the username and the email (lowercased) since SSO users have both, while
// local users only have a username.
export function sessionAdminIdentifiers(req: Request): string[] {
  const ids: string[] = [];
  const username = req.session?.username;
  const email = req.session?.email;
  if (username) ids.push(username.toLowerCase());
  if (email) ids.push(email.toLowerCase());
  return ids;
}

export async function userCanViewPolicyReadBehaviour(req: Request): Promise<boolean> {
  if (!req.session?.isAuthenticated || req.session?.role !== "admin") return false;
  if (isTopLevelAdmin(req)) return true;
  // Lazy import to avoid a circular import between middleware and storage.
  const { storage } = await import("./storage");
  const { POLICY_READ_BEHAVIOUR_PERMISSIONS_KEY } = await import("@shared/schema");
  const stored = await storage.getAppSetting<{ allowedIdentifiers?: unknown }>(
    POLICY_READ_BEHAVIOUR_PERMISSIONS_KEY,
  );
  const allowed = Array.isArray(stored?.allowedIdentifiers)
    ? (stored!.allowedIdentifiers as unknown[]).filter((x): x is string => typeof x === "string").map((s) => s.toLowerCase())
    : [];
  if (allowed.length === 0) return false;
  const ids = sessionAdminIdentifiers(req);
  return ids.some((id) => allowed.includes(id));
}

export async function requirePolicyReadBehaviour(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.isAuthenticated) return res.status(401).json({ message: "Not authenticated" });
  if (req.session?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  if (await userCanViewPolicyReadBehaviour(req)) return next();
  return res.status(403).json({ message: "You don't have permission to view policy reading-behaviour data." });
}

export async function requireTopLevelAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.isAuthenticated) return res.status(401).json({ message: "Not authenticated" });
  if (!isTopLevelAdmin(req)) return res.status(403).json({ message: "Top-level admin access required" });
  return next();
}
