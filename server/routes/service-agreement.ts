// Service Agreement routes (task 170).
//
// Portal (token-gated; NOT service-agreement-gated so the nurse can sign):
//   GET  /api/portal/:token/service-agreement          state + contract + latest
//   PUT  /api/portal/:token/service-agreement/draft    save identity fields
//   POST /api/portal/:token/service-agreement/sign     sign + generate PDF
//
// Admin:
//   GET  /api/nurses/:id/service-agreement             status + pdf id (requireAdmin)
//   GET  /api/admin/settings/service-agreement         config (requireAdmin)
//   PUT  /api/admin/settings/service-agreement         config (requireSuperAdmin)

import type { Express, Request, Response } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db } from "../db";
import { nurses } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  requireAdmin,
  requireSuperAdmin,
  validatePortalToken,
  uploadsDir,
} from "../middleware";
import { logAction } from "../services/audit";
import { getGateState } from "../services/onboarding-gate";
import { storage } from "../storage";
import {
  createDraft,
  getLatest,
  getLatestSubmitted,
  markSubmitted,
  updateDraft,
  attachPdfDocument,
} from "../declarations/storage";
import {
  SERVICE_AGREEMENT_KEY,
  SERVICE_AGREEMENT_TITLE,
  SERVICE_AGREEMENT_FIELDS,
  buildServiceAgreementContract,
  getServiceAgreementConfig,
  getCurrentServiceAgreementVersion,
  saveServiceAgreementConfig,
  sanitizeServiceAgreementContentPatch,
  DEFAULT_SERVICE_AGREEMENT_CONFIG,
} from "../service-agreement/contract";
import { generateServiceAgreementPDF } from "../service-agreement/pdf";

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

function safeFilenamePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
}

function sanitizeAnswers(raw: unknown): Record<string, string> {
  const src = (raw && typeof raw === "object") ? (raw as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const field of SERVICE_AGREEMENT_FIELDS) {
    const v = src[field.id];
    out[field.id] = typeof v === "string" ? v.trim() : "";
  }
  return out;
}

function validateForSignature(answers: Record<string, string>) {
  const errors: { field: string; message: string }[] = [];
  for (const field of SERVICE_AGREEMENT_FIELDS) {
    if (field.required && !answers[field.id]) {
      errors.push({ field: field.id, message: `${field.label} is required.` });
    }
  }
  return errors;
}

function summarizeAgreement(
  latest: Awaited<ReturnType<typeof getLatest>> | undefined,
  latestSubmitted: Awaited<ReturnType<typeof getLatestSubmitted>> | undefined,
  currentVersion: number,
) {
  // Signed-state is derived from the most recent SUBMITTED row, never from the
  // latest row outright — after an amendment the nurse may have started a fresh
  // draft at the new version, which would otherwise mask that they previously
  // signed an older version (and still need to re-sign).
  const everSigned = !!latestSubmitted;
  // "signed" means signed the CURRENT version. If the contract has since been
  // amended (version bumped) the nurse must re-sign, so this flips back to
  // false and the portal/sidebar treat the item as actionable again.
  const signed = everSigned && latestSubmitted!.version === currentVersion;
  const needsResign = everSigned && !signed;
  return {
    signed,
    everSigned,
    needsResign,
    // Surface the live draft/submitted status of whatever the nurse is working
    // on now, but report the *signed* version (and signer details) so the admin
    // panel/portal can say "you signed version N, current is M".
    status: latest?.status ?? "not_started",
    version: everSigned ? latestSubmitted!.version : latest?.version ?? null,
    currentVersion,
    signerName: latestSubmitted?.signatureName ?? null,
    signedAt: latestSubmitted?.submittedAt?.toISOString() ?? null,
    pdfDocumentId: latestSubmitted?.pdfDocumentId ?? null,
  };
}

// Persists an already-rendered agreement PDF: writes the file, creates the
// document row, links it to the declaration, and mirrors it to object storage
// (so the signed agreement survives container restarts / scale events, exactly
// like every other upload). Throws on any storage failure so the caller can
// surface it — the signature is only meaningful with a retrievable PDF.
async function storeServiceAgreementPdf(
  nurseId: string,
  record: { id: string; version: number },
  nurse: { fullName: string },
  pdfBuffer: Buffer,
): Promise<string> {
  const datePart = new Date().toISOString().split("T")[0];
  const filename = `${SERVICE_AGREEMENT_KEY}-${safeFilenamePart(nurse.fullName)}-${datePart}-v${record.version}-${crypto
    .randomBytes(4)
    .toString("hex")}.pdf`;
  const absPath = path.join(uploadsDir, filename);
  await fs.promises.writeFile(absPath, pdfBuffer);

  const doc = await storage.createDocument({
    nurseId,
    type: `declaration_${SERVICE_AGREEMENT_KEY}`,
    category: "declaration",
    filename,
    originalFilename: `${SERVICE_AGREEMENT_TITLE} - ${nurse.fullName}.pdf`,
    filePath: `/api/uploads/${filename}`,
    fileSize: pdfBuffer.length,
    mimeType: "application/pdf",
    uploadedBy: "system",
  });

  await attachPdfDocument(record.id, doc.id);

  // Fire-and-forget mirror to the object-storage bucket, matching how the
  // shared upload middleware persists every other document.
  import("../object-storage")
    .then(({ triggerBucketMirror }) => triggerBucketMirror(filename))
    .catch((mirrorErr: any) =>
      console.error(
        "[service-agreement] bucket mirror failed:",
        mirrorErr?.message || mirrorErr,
      ),
    );

  await logAction(nurseId, "service_agreement", "agreement_pdf_generated", "system", {
    documentId: doc.id,
    version: record.version,
  });
  return doc.id;
}

export async function buildServiceAgreementState(nurseId: string) {
  const [latest, latestSubmitted, currentVersion] = await Promise.all([
    getLatest(nurseId, SERVICE_AGREEMENT_KEY),
    getLatestSubmitted(nurseId, SERVICE_AGREEMENT_KEY),
    getCurrentServiceAgreementVersion(),
  ]);
  return summarizeAgreement(latest, latestSubmitted, currentVersion);
}

// The Service Agreement lives inside the Compliance group and only becomes
// signable once an admin has explicitly approved the nurse's compliance.
// Returns true (and writes the 403) when the nurse is not yet approved so
// callers can `if (await requireComplianceApproved(...)) return;`.
async function requireComplianceApproved(
  nurseId: string,
  res: Response,
): Promise<boolean> {
  const gate = await getGateState(nurseId);
  if (!gate || !gate.complianceApproved) {
    res.status(403).json({
      error: "compliance_not_approved",
      message:
        "The Service Agreement becomes available once an admin has approved your compliance.",
    });
    return true;
  }
  return false;
}

export function registerServiceAgreementRoutes(app: Express) {
  // ─── Portal: contract + current signing state ────────────────────
  app.get(
    "/api/portal/:token/service-agreement",
    validatePortalToken,
    async (req, res) => {
      try {
        const nurseId = (req as any).nurseId as string;
        const contract = await buildServiceAgreementContract();
        const [latest, latestSubmitted] = await Promise.all([
          getLatest(nurseId, SERVICE_AGREEMENT_KEY),
          getLatestSubmitted(nurseId, SERVICE_AGREEMENT_KEY),
        ]);
        res.json({
          contract,
          state: summarizeAgreement(latest, latestSubmitted, contract.version),
          latest: latest
            ? {
                id: latest.id,
                version: latest.version,
                status: latest.status,
                answers: latest.answers,
                signatureName: latest.signatureName,
                submittedAt: latest.submittedAt?.toISOString() ?? null,
                pdfDocumentId: latest.pdfDocumentId ?? null,
              }
            : null,
        });
      } catch (err: any) {
        console.error("[service-agreement] portal fetch failed:", err);
        res.status(500).json({ message: err?.message || "Failed to load Service Agreement" });
      }
    },
  );

  // ─── Portal: save identity fields as a draft (pre-signature) ──────
  app.put(
    "/api/portal/:token/service-agreement/draft",
    validatePortalToken,
    async (req, res) => {
      try {
        const nurseId = (req as any).nurseId as string;
        const gateError = await requireComplianceApproved(nurseId, res);
        if (gateError) return;
        const answers = sanitizeAnswers((req.body || {}).answers);
        const signatureName =
          typeof (req.body || {}).signatureName === "string"
            ? (req.body as any).signatureName
            : undefined;

        const currentVersion = await getCurrentServiceAgreementVersion();
        let latest = await getLatest(nurseId, SERVICE_AGREEMENT_KEY);
        // Already signed the CURRENT version → nothing left to draft.
        if (latest && latest.status === "submitted" && latest.version === currentVersion) {
          return res.status(409).json({
            message: "The Service Agreement has already been signed.",
          });
        }
        if (latest && latest.status !== "submitted" && latest.version === currentVersion) {
          // Editing an in-progress draft at the current version.
          latest = (await updateDraft(latest.id, {
            answers,
            ...(signatureName !== undefined ? { signatureName } : {}),
          })) ?? latest;
        } else {
          // No draft yet, or only an older (signed/draft) version exists — i.e.
          // the contract was amended and the nurse must re-sign: start a fresh
          // draft at the current version.
          latest = await createDraft(nurseId, SERVICE_AGREEMENT_KEY, currentVersion, answers);
          if (signatureName !== undefined) {
            latest = (await updateDraft(latest.id, { signatureName })) ?? latest;
          }
        }
        res.json({ ok: true, latest });
      } catch (err: any) {
        console.error("[service-agreement] save draft failed:", err);
        res.status(500).json({ message: err?.message || "Failed to save draft" });
      }
    },
  );

  // ─── Portal: sign ────────────────────────────────────────────────
  app.post(
    "/api/portal/:token/service-agreement/sign",
    validatePortalToken,
    async (req, res) => {
      try {
        const nurseId = (req as any).nurseId as string;
        const gateError = await requireComplianceApproved(nurseId, res);
        if (gateError) return;
        const body = req.body || {};
        const signatureName = typeof body.signatureName === "string" ? body.signatureName.trim() : "";
        const answers = sanitizeAnswers(body.answers);

        if (!signatureName) {
          return res.status(400).json({
            message: "A typed signature is required to sign.",
            errors: [{ field: "__signature__", message: "Please type your full legal name to sign." }],
          });
        }
        const errors = validateForSignature(answers);
        if (errors.length > 0) {
          return res.status(400).json({ message: "Please complete the required fields.", errors });
        }

        const currentVersion = await getCurrentServiceAgreementVersion();
        let latest = await getLatest(nurseId, SERVICE_AGREEMENT_KEY);
        if (latest && latest.status === "submitted" && latest.version === currentVersion) {
          return res.status(409).json({ message: "The Service Agreement has already been signed." });
        }
        // Need a draft at the CURRENT version to sign. Create one when none
        // exists, or when only an older (signed/draft) version is present
        // (contract amended → re-sign).
        if (!latest || latest.version !== currentVersion) {
          latest = await createDraft(nurseId, SERVICE_AGREEMENT_KEY, currentVersion, answers);
        }

        const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
        if (!nurse) {
          return res.status(500).json({ message: "Failed to sign the Service Agreement." });
        }
        const config = await getServiceAgreementConfig();
        const ipAddress = clientIp(req);
        const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;

        // Render the countersigned PDF *before* finalizing the signature so a
        // rendering failure never leaves a signed-but-PDF-less record (the
        // signature is only meaningful alongside a retrievable agreement PDF).
        const pdfRecord = {
          ...latest,
          answers,
          signatureName,
          status: "submitted" as const,
          submittedAt: new Date(),
          ipAddress,
          userAgent,
        } as typeof latest;
        let pdfBuffer: Buffer;
        try {
          pdfBuffer = await generateServiceAgreementPDF(pdfRecord, nurse, config);
        } catch (err: any) {
          console.error(
            "[service-agreement] pdf render failed (signature NOT recorded):",
            err?.message || err,
          );
          return res.status(500).json({
            message:
              "We couldn't generate your signed agreement. Your signature was not recorded — please try again.",
          });
        }

        const submitted = await markSubmitted(latest.id, {
          answers,
          signatureName,
          ipAddress,
          userAgent,
        });
        if (!submitted) {
          return res.status(500).json({ message: "Failed to sign the Service Agreement." });
        }
        await logAction(nurseId, "service_agreement", "agreement_signed", "candidate", {
          version: submitted.version,
          ipAddress: submitted.ipAddress,
        });

        let documentId: string;
        try {
          documentId = await storeServiceAgreementPdf(nurseId, submitted, nurse, pdfBuffer);
        } catch (err: any) {
          console.error(
            "[service-agreement] pdf storage failed after signing:",
            err?.message || err,
          );
          return res.status(500).json({
            message:
              "Your agreement was signed but we couldn't store the PDF. Please contact support.",
          });
        }
        // After a successful sign the latest row IS the just-submitted row at
        // the current version, so it doubles as the latest-submitted row.
        const finalRow = await getLatest(nurseId, SERVICE_AGREEMENT_KEY);
        res.json({
          ok: true,
          state: summarizeAgreement(finalRow, finalRow, currentVersion),
          pdfDocumentId: documentId,
        });
      } catch (err: any) {
        console.error("[service-agreement] sign failed:", err);
        res.status(500).json({ message: err?.message || "Failed to sign the Service Agreement" });
      }
    },
  );

  // ─── Admin: signed status + PDF id for a nurse ───────────────────
  app.get(
    "/api/nurses/:id/service-agreement",
    requireAdmin,
    async (req, res) => {
      try {
        const nurseId = String(req.params.id);
        const [latest, latestSubmitted, currentVersion] = await Promise.all([
          getLatest(nurseId, SERVICE_AGREEMENT_KEY),
          getLatestSubmitted(nurseId, SERVICE_AGREEMENT_KEY),
          getCurrentServiceAgreementVersion(),
        ]);
        if (latestSubmitted) {
          await logAction(nurseId, "service_agreement", "agreement_viewed", agentFor(req), {
            version: latestSubmitted.version,
          });
        }
        res.json({
          state: summarizeAgreement(latest, latestSubmitted, currentVersion),
          fields: SERVICE_AGREEMENT_FIELDS,
          answers: (latestSubmitted ?? latest)?.answers ?? {},
          ipAddress: (latestSubmitted ?? latest)?.ipAddress ?? null,
          userAgent: (latestSubmitted ?? latest)?.userAgent ?? null,
        });
      } catch (err: any) {
        console.error("[service-agreement] admin fetch failed:", err);
        res.status(500).json({ message: err?.message || "Failed to load Service Agreement" });
      }
    },
  );

  // ─── Admin: config (Recovery Fee + countersignatory) ─────────────
  app.get(
    "/api/admin/settings/service-agreement",
    requireAdmin,
    async (_req, res) => {
      try {
        const config = await getServiceAgreementConfig();
        res.json({ config, defaults: DEFAULT_SERVICE_AGREEMENT_CONFIG });
      } catch (err: any) {
        res.status(500).json({ message: err?.message || "Failed to load settings" });
      }
    },
  );

  app.put(
    "/api/admin/settings/service-agreement",
    requireSuperAdmin,
    async (req, res) => {
      try {
        const { patch, errors } = sanitizeServiceAgreementContentPatch(req.body || {});
        if (errors.length > 0) {
          return res
            .status(400)
            .json({ message: "Please correct the contract before saving.", errors });
        }
        const { config, versionBumped, previousVersion } = await saveServiceAgreementConfig(
          patch,
          agentFor(req),
        );
        // A real content change bumps the version (forcing every signed nurse to
        // re-sign) and is recorded as a distinct, auditable amendment.
        await logAction(
          null,
          "service_agreement",
          versionBumped ? "agreement_amended" : "config_updated",
          agentFor(req),
          versionBumped
            ? { previousVersion, version: config.version }
            : {
                recoveryFee: config.recoveryFee,
                countersignatoryName: config.countersignatoryName,
                countersignatoryPosition: config.countersignatoryPosition,
              },
        );
        res.json({ ok: true, config, versionBumped, previousVersion });
      } catch (err: any) {
        console.error("[service-agreement] save config failed:", err);
        res.status(500).json({ message: err?.message || "Failed to save settings" });
      }
    },
  );
}
