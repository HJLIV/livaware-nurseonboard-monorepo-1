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
