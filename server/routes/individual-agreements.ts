// Individual nurse agreements (task 191) — ad-hoc, admin-issued agreements
// for a specific project, patient, or deployment. The admin uploads the
// agreement document; the nurse signs it in the portal with the same
// typed-signature ceremony as the Service Agreement.
//
// Admin (requireAdmin):
//   GET    /api/nurses/:id/agreements                 list with status
//   POST   /api/nurses/:id/agreements                 create (multipart, file)
//   POST   /api/agreements/:id/void                   void an unsigned one
//   POST   /api/agreements/:id/replace-document       replace file on unsigned
//
// Portal (validatePortalToken; intentionally NOT gated on onboarding /
// compliance approval — these agreements are explicitly issued by an admin
// to this nurse, so the admin's act of issuing IS the gate):
//   GET    /api/portal/:token/agreements              list (excludes voided)
//   POST   /api/portal/:token/agreements/:id/sign     sign

import type { Express, Request } from "express";
import fs from "fs";
import { db } from "../db";
import { nurses } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  requireAdmin,
  validatePortalToken,
  upload,
  uploadLimiter,
} from "../middleware";
import { logAction } from "../services/audit";
import { storage } from "../storage";
import * as agreements from "../agreements/storage";
import {
  buildSignedAgreementPdf,
  storeSignedAgreementPdf,
  discardStoredPdf,
  mirrorToBucket,
} from "../agreements/seal";
import { regenerateSignedAgreementPdfs } from "../agreements/regenerate";
import { extractPolicyFromFile } from "../policy-extractor";
import { sendIndividualAgreementIssuedEmail, isOutlookConfigured } from "../outlook";
import { mintChasePortalLinkForNurse } from "../training-notifications";

const CONTEXT_TYPES = ["project", "patient", "deployment", "other"] as const;
type ContextType = (typeof CONTEXT_TYPES)[number];

function agentFor(req: Request): string {
  const u = req.session?.username;
  const r = req.session?.role;
  if (!u) return "system";
  return r ? `${u} (${r})` : u;
}

function clientIp(req: Request): string | null {
  const fwd = (req.headers["x-forwarded-for"] as string | undefined) || "";
  return fwd.split(",")[0]?.trim() || req.ip || null;
}

// The shared multer filter also accepts images; agreements must be PDF or
// Word documents, so enforce that here (create AND replace).
const AGREEMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

async function rejectNonAgreementFile(
  file: Express.Multer.File,
): Promise<boolean> {
  if (AGREEMENT_MIME_TYPES.has(file.mimetype)) return false;
  // Best-effort cleanup of the already-written upload.
  fs.promises.unlink(file.path).catch(() => {});
  return true;
}

// Extract the uploaded document's text as Markdown so the portal can
// render the agreement in-app (task 195). Extraction failure is recorded,
// never fatal — the client falls back to the raw file view.
async function extractAgreementContent(
  file: Express.Multer.File,
): Promise<{ contentMarkdown: string | null; extractionError: string | null }> {
  try {
    const buffer = await fs.promises.readFile(file.path);
    const { body } = await extractPolicyFromFile(buffer, file.originalname, file.mimetype);
    return { contentMarkdown: body, extractionError: null };
  } catch (err: any) {
    const message = err?.message || "Text could not be extracted from the document.";
    console.error("[agreements] content extraction failed (falling back to file view):", message);
    return { contentMarkdown: null, extractionError: message };
  }
}

// Resolve the public base URL for the emailed portal link from trusted
// configuration ONLY — never from request headers (Host/X-Forwarded-Proto
// are client-controlled, and this URL carries a 30-day bearer token).
// Same env-var order as the training-chase scheduler.
function resolvePortalBaseUrl(): string {
  const portalBaseUrl = process.env.PORTAL_BASE_URL;
  if (portalBaseUrl && portalBaseUrl.trim()) return portalBaseUrl.trim();
  const publicAppUrl = process.env.PUBLIC_APP_URL;
  if (publicAppUrl && publicAppUrl.trim()) return publicAppUrl.trim();
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain && devDomain.trim()) return `https://${devDomain.trim()}`;
  return "http://localhost:5000";
}

const CONTEXT_TITLES: Record<ContextType, string> = {
  project: "Project",
  patient: "Patient",
  deployment: "Deployment",
  other: "Agreement",
};

// Fire-and-forget notification to the nurse that a new agreement needs
// their signature. Mail failure never blocks issuing; success is audited.
function notifyNurseOfIssuedAgreement(opts: {
  nurse: { id: string; fullName: string; email: string | null };
  agreementId: string;
  title: string;
  contextType: ContextType;
  contextLabel: string | null;
  sentBy: string;
  portalBaseUrl: string;
}): void {
  void (async () => {
    try {
      if (!opts.nurse.email) return;
      if (!isOutlookConfigured()) return;
      const { portalUrl } = await mintChasePortalLinkForNurse({
        nurseId: opts.nurse.id,
        sentBy: opts.sentBy,
        portalBaseUrl: opts.portalBaseUrl,
      });
      const contextLine = opts.contextLabel
        ? `${CONTEXT_TITLES[opts.contextType]}: ${opts.contextLabel}`
        : CONTEXT_TITLES[opts.contextType];
      await sendIndividualAgreementIssuedEmail(
        opts.nurse.email,
        opts.nurse.fullName,
        portalUrl,
        opts.title,
        contextLine,
      );
      await logAction(opts.nurse.id, "service_agreement", "individual_agreement_email_sent", "system", {
        agreementId: opts.agreementId,
        title: opts.title,
        recipientEmail: opts.nurse.email,
      });
    } catch (err: any) {
      console.error("[agreements] issue email failed (agreement still created):", err?.message || err);
    }
  })();
}

// Shape returned to both admin and portal. The portal additionally receives
// the source-document URL so the nurse can read the agreement inline.
async function serialize(a: Awaited<ReturnType<typeof agreements.getById>> & object) {
  const sourceDoc = await storage.getDocument(a.sourceDocumentId);
  return {
    id: a.id,
    title: a.title,
    contextType: a.contextType,
    contextLabel: a.contextLabel,
    status: a.status,
    signatureName: a.signatureName,
    signedAt: a.signedAt?.toISOString() ?? null,
    ipAddress: a.ipAddress,
    userAgent: a.userAgent,
    signedPdfDocumentId: a.signedPdfDocumentId,
    createdBy: a.createdBy,
    createdAt: a.createdAt.toISOString(),
    contentMarkdown: a.contentMarkdown ?? null,
    extractionError: a.extractionError ?? null,
    voidedAt: a.voidedAt?.toISOString() ?? null,
    voidedBy: a.voidedBy,
    voidReason: a.voidReason,
    sourceDocument: sourceDoc
      ? {
          id: sourceDoc.id,
          filePath: sourceDoc.filePath,
          originalFilename: sourceDoc.originalFilename,
          mimeType: sourceDoc.mimeType,
        }
      : null,
  };
}

// Create the `documents` row for an admin-uploaded agreement file.
async function createSourceDocument(
  nurseId: string,
  file: Express.Multer.File,
): Promise<string> {
  const doc = await storage.createDocument({
    nurseId,
    type: "individual_agreement",
    category: "agreement",
    filename: file.filename,
    originalFilename: file.originalname,
    filePath: `/api/uploads/${file.filename}`,
    fileSize: file.size,
    mimeType: file.mimetype,
    uploadedBy: "admin",
  });
  return doc.id;
}

export function registerIndividualAgreementRoutes(app: Express) {
  // ─── Admin: list ─────────────────────────────────────────────────
  app.get("/api/nurses/:id/agreements", requireAdmin, async (req, res) => {
    try {
      const rows = await agreements.listForNurse(String(req.params.id));
      res.json({ agreements: await Promise.all(rows.map(serialize)) });
    } catch (err: any) {
      console.error("[agreements] admin list failed:", err?.message || err);
      res.status(500).json({ message: err?.message || "Failed to load agreements" });
    }
  });

  // ─── Admin: create with document upload ──────────────────────────
  app.post(
    "/api/nurses/:id/agreements",
    requireAdmin,
    uploadLimiter,
    upload.single("file"),
    async (req, res) => {
      try {
        const nurseId = String(req.params.id);
        const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
        if (!nurse) return res.status(404).json({ message: "Nurse not found" });
        if (!req.file) {
          return res.status(400).json({ message: "An agreement document (PDF or Word) is required." });
        }
        if (await rejectNonAgreementFile(req.file)) {
          return res.status(400).json({ message: "Agreement documents must be PDF or Word files." });
        }
        const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
        if (!title) return res.status(400).json({ message: "A title is required." });
        const rawContext = typeof req.body?.contextType === "string" ? req.body.contextType : "other";
        const contextType: ContextType = (CONTEXT_TYPES as readonly string[]).includes(rawContext)
          ? (rawContext as ContextType)
          : "other";
        const contextLabel =
          typeof req.body?.contextLabel === "string" && req.body.contextLabel.trim()
            ? req.body.contextLabel.trim()
            : null;

        const sourceDocumentId = await createSourceDocument(nurseId, req.file);
        const content = await extractAgreementContent(req.file);
        const created = await agreements.create({
          nurseId,
          title,
          contextType,
          contextLabel,
          sourceDocumentId,
          createdBy: agentFor(req),
          contentMarkdown: content.contentMarkdown,
          extractionError: content.extractionError,
        });
        await logAction(nurseId, "service_agreement", "individual_agreement_created", agentFor(req), {
          agreementId: created.id,
          title,
          contextType,
          contextLabel,
          sourceDocumentId,
        });
        notifyNurseOfIssuedAgreement({
          nurse: { id: nurse.id, fullName: nurse.fullName, email: nurse.email ?? null },
          agreementId: created.id,
          title,
          contextType,
          contextLabel,
          sentBy: agentFor(req),
          portalBaseUrl: resolvePortalBaseUrl(),
        });
        res.status(201).json({ agreement: await serialize(created) });
      } catch (err: any) {
        console.error("[agreements] create failed:", err?.message || err);
        res.status(500).json({ message: err?.message || "Failed to create agreement" });
      }
    },
  );

  // ─── Admin: void an unsigned agreement ───────────────────────────
  app.post("/api/agreements/:id/void", requireAdmin, async (req, res) => {
    try {
      const existing = await agreements.getById(String(req.params.id));
      if (!existing) return res.status(404).json({ message: "Agreement not found" });
      if (existing.status === "signed") {
        return res.status(409).json({ message: "A signed agreement cannot be voided." });
      }
      if (existing.status === "voided") {
        return res.status(409).json({ message: "This agreement is already voided." });
      }
      const reason =
        typeof req.body?.reason === "string" && req.body.reason.trim()
          ? req.body.reason.trim()
          : null;
      const voided = await agreements.markVoided(existing.id, agentFor(req), reason);
      if (!voided) {
        // Lost a race — the agreement was signed (or voided) concurrently.
        return res.status(409).json({ message: "This agreement can no longer be voided." });
      }
      await logAction(existing.nurseId, "service_agreement", "individual_agreement_voided", agentFor(req), {
        agreementId: existing.id,
        title: existing.title,
        reason,
      });
      res.json({ agreement: await serialize(voided) });
    } catch (err: any) {
      console.error("[agreements] void failed:", err?.message || err);
      res.status(500).json({ message: err?.message || "Failed to void agreement" });
    }
  });

  // ─── Admin: replace the document on an unsigned agreement ────────
  app.post(
    "/api/agreements/:id/replace-document",
    requireAdmin,
    uploadLimiter,
    upload.single("file"),
    async (req, res) => {
      try {
        const existing = await agreements.getById(String(req.params.id));
        if (!existing) return res.status(404).json({ message: "Agreement not found" });
        if (existing.status !== "pending") {
          return res.status(409).json({
            message: "Only an unsigned (pending) agreement's document can be replaced.",
          });
        }
        if (!req.file) {
          return res.status(400).json({ message: "A replacement document is required." });
        }
        if (await rejectNonAgreementFile(req.file)) {
          return res.status(400).json({ message: "Agreement documents must be PDF or Word files." });
        }
        const sourceDocumentId = await createSourceDocument(existing.nurseId, req.file);
        const content = await extractAgreementContent(req.file);
        const updated = await agreements.replaceSourceDocument(existing.id, sourceDocumentId, content);
        if (!updated) {
          // Lost a race — signed/voided concurrently; the row is untouched.
          return res.status(409).json({
            message: "Only an unsigned (pending) agreement's document can be replaced.",
          });
        }
        await logAction(existing.nurseId, "service_agreement", "individual_agreement_document_replaced", agentFor(req), {
          agreementId: existing.id,
          previousDocumentId: existing.sourceDocumentId,
          sourceDocumentId,
        });
        res.json({ agreement: await serialize(updated!) });
      } catch (err: any) {
        console.error("[agreements] replace-document failed:", err?.message || err);
        res.status(500).json({ message: err?.message || "Failed to replace document" });
      }
    },
  );

  // ─── Admin: rebuild sealed records ───────────────────────────────
  // One-off maintenance for agreements signed before the wording was
  // embedded in the PDF. Signature data is never altered — only the
  // rendered record is rebuilt (and the wording re-extracted if it was
  // never captured).
  app.post("/api/agreements/regenerate-signed-pdfs", requireAdmin, async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.agreementIds)
        ? req.body.agreementIds.filter((id: unknown) => typeof id === "string")
        : undefined;
      const result = await regenerateSignedAgreementPdfs({
        triggeredBy: agentFor(req),
        agreementIds: ids,
      });
      res.json(result);
    } catch (err: any) {
      console.error("[agreements] regeneration run failed:", err?.message || err);
      res.status(500).json({ message: err?.message || "Failed to regenerate signed records" });
    }
  });

  // ─── Portal: list (voided hidden) ────────────────────────────────
  app.get("/api/portal/:token/agreements", validatePortalToken, async (req, res) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const rows = await agreements.listVisibleForNurse(nurseId);
      res.json({ agreements: await Promise.all(rows.map(serialize)) });
    } catch (err: any) {
      console.error("[agreements] portal list failed:", err?.message || err);
      res.status(500).json({ message: err?.message || "Failed to load agreements" });
    }
  });

  // ─── Portal: sign ────────────────────────────────────────────────
  app.post(
    "/api/portal/:token/agreements/:id/sign",
    validatePortalToken,
    async (req, res) => {
      try {
        const nurseId = (req as any).nurseId as string;
        const agreement = await agreements.getForNurse(String(req.params.id), nurseId);
        if (!agreement || agreement.status === "voided") {
          return res.status(404).json({ message: "Agreement not found" });
        }
        if (agreement.status === "signed") {
          return res.status(409).json({ message: "This agreement has already been signed." });
        }
        const signatureName =
          typeof req.body?.signatureName === "string" ? req.body.signatureName.trim() : "";
        if (!signatureName || signatureName.length < 2) {
          return res.status(400).json({
            message: "A typed signature is required to sign.",
            errors: [{ field: "__signature__", message: "Please type your full legal name to sign." }],
          });
        }
        const confirmed = req.body?.confirmRead === true;
        if (!confirmed) {
          return res.status(400).json({
            message: "Please confirm you have read the agreement document before signing.",
            errors: [{ field: "confirmRead", message: "You must confirm you have read the agreement." }],
          });
        }

        const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
        const sourceDoc = await storage.getDocument(agreement.sourceDocumentId);
        if (!nurse || !sourceDoc) {
          return res.status(500).json({ message: "Failed to sign the agreement." });
        }

        const ipAddress = clientIp(req);
        const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;

        // Render the sealed record (agreement wording + execution details)
        // BEFORE recording the signature so a rendering failure never leaves
        // a signed-but-PDF-less record — same ordering as the Service
        // Agreement sign flow.
        const pdfSource = {
          ...agreement,
          signatureName,
          ipAddress,
          userAgent,
          status: "signed" as const,
          signedAt: new Date(),
        };
        let pdfBuffer: Buffer;
        try {
          pdfBuffer = await buildSignedAgreementPdf({
            agreement: pdfSource,
            nurse,
            sourceDocument: sourceDoc,
          });
        } catch (err: any) {
          console.error("[agreements] pdf render failed (signature NOT recorded):", err?.message || err);
          return res.status(500).json({
            message:
              "We couldn't generate your signed agreement record. Your signature was not recorded — please try again.",
          });
        }

        // Persist the sealed PDF (file + documents row) BEFORE the
        // pending→signed transition, so a signed row ALWAYS carries a
        // retrievable record. If persistence fails, the agreement is
        // untouched (still pending) and the nurse can simply retry. If the
        // later transition loses a race, the orphaned file/doc is cleaned up.
        let signedPdfDocumentId: string;
        let filename: string;
        try {
          const stored = await storeSignedAgreementPdf({
            nurseId,
            nurseFullName: nurse.fullName,
            agreementTitle: agreement.title,
            buffer: pdfBuffer,
          });
          signedPdfDocumentId = stored.documentId;
          filename = stored.filename;
        } catch (err: any) {
          console.error("[agreements] pdf storage failed (signature NOT recorded):", err?.message || err);
          return res.status(500).json({
            message:
              "We couldn't store your signed agreement record. Your signature was not recorded — please try again.",
          });
        }

        const signed = await agreements.markSigned(agreement.id, {
          signatureName,
          ipAddress,
          userAgent,
          signedPdfDocumentId,
        });
        if (!signed) {
          // Conditional pending→signed update matched no row: a concurrent
          // sign/void/replace won the race. Clean up the now-orphaned
          // record file + document row; nothing was recorded for this
          // request, so a 409 is accurate.
          void discardStoredPdf(signedPdfDocumentId, filename);
          return res.status(409).json({ message: "This agreement has already been signed or is no longer available." });
        }

        await logAction(nurseId, "service_agreement", "individual_agreement_signed", "candidate", {
          agreementId: agreement.id,
          title: agreement.title,
          contextType: agreement.contextType,
          ipAddress,
          source: "portal",
        });
        await logAction(nurseId, "service_agreement", "individual_agreement_pdf_generated", "system", {
          agreementId: agreement.id,
          documentId: signedPdfDocumentId,
        });
        mirrorToBucket(filename);

        const finalRow = await agreements.getById(agreement.id);
        res.json({
          ok: true,
          agreement: await serialize(finalRow!),
          signedPdfDocumentId,
        });
      } catch (err: any) {
        console.error("[agreements] sign failed:", err?.message || err);
        res.status(500).json({ message: err?.message || "Failed to sign the agreement" });
      }
    },
  );
}

// Portal-hub summary block: how many agreements the nurse can see and how
// many still need signing.
export async function buildAgreementsSummary(nurseId: string) {
  const rows = await agreements.listVisibleForNurse(nurseId);
  return {
    total: rows.length,
    outstanding: rows.filter((r) => r.status === "pending").length,
  };
}
