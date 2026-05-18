import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { storage as arcadeStorage } from "../arcade-storage";
import { scoreAttempt, type TaskResponse as ArcadeTaskResponse } from "../arcade-scoring";
import { db } from "../db";
import { arcadeUsers } from "@shared/schema";
import type { ScenarioContent } from "@shared/schema";
import { eq } from "drizzle-orm";
import { upload, validatePortalToken, uploadLimiter, requireOnboardingUnlocked, requireInductionAcknowledged, requireNurseStageCompleted, portalAgent } from "../middleware";
import { isShareCodeDoc, isValidRtwDoc } from "@shared/rtw-evidence";
import { isProofOfAddressWithinThreeMonths } from "@shared/poa-validity";
import { maybeAutoUnlock } from "../services/onboarding-gate";
import { sendReferenceRequestEmail } from "../outlook";
import { parseNmcPdfWithFallback, NmcVerificationError } from "../nmc-service";
import { parseTrainingCertificate } from "../training-cert-service";
import { triggerSharePointUpload, triggerEmailNotification } from "../sharepoint-helper";
import { parsePassportImage } from "../passport-parser";
import { analyzeCertificateWithAI, generateCompetencyGuidance } from "../certificate-ai";
import { triageHealthDeclaration, isTriageAvailable } from "../health-triage-ai";
import { triggerDocumentAnalysis } from "../document-analysis";
import { applyChaseReplyTrainingUpsert } from "../document-ingest";
import { evaluateMandatoryTrainingCell } from "../training-status";
import { MANDATORY_TRAINING_MODULES, PORTAL_STEPS, STEPS_REQUIRING_ADMIN_VERIFICATION, STEP_STATUS } from "@shared/schema";
import type { HealthDeclaration } from "@shared/schema";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { uploadsDir } from "../middleware";

// Terminal step statuses must never be silently downgraded by an unrelated
// candidate edit (e.g. they re-save a profile field after the step has
// already been marked complete). Admin-side verification routes in
// onboard.ts intentionally bypass this guard by writing the status field
// directly without going through it.
const TERMINAL_STEP_STATUSES: ReadonlySet<string> = new Set([
  STEP_STATUS.completed,
  STEP_STATUS.awaiting_verification,
]);

function applyStepStatusUpdates(
  current: Record<string, string>,
  updates: Record<string, string>,
): Record<string, string> {
  const next = { ...current };
  for (const [key, value] of Object.entries(updates)) {
    const existing = next[key];
    if (existing && TERMINAL_STEP_STATUSES.has(existing)) {
      // Keep terminal state — don't let a subsequent edit/upload demote
      // a step the candidate already explicitly finished.
      continue;
    }
    next[key] = value;
  }
  return next;
}

// Guarded step-status writer for portal handlers. Re-reads current state
// to win against in-flight writes, applies updates while preserving any
// terminal status (completed / awaiting_verification), and persists. Safe
// no-op if the state row doesn't exist or no fields actually change.
async function safeWriteStepStatuses(
  nurseId: string,
  updates: Record<string, string>,
): Promise<void> {
  const fresh = await storage.getOnboardingState(nurseId);
  if (!fresh) return;
  const current = (fresh.stepStatuses as Record<string, string>) || {};
  const next = applyStepStatusUpdates(current, updates);
  // Skip the write if nothing actually changed (a terminal-state key
  // shielded every incoming change).
  let changed = false;
  for (const k of Object.keys(updates)) {
    if (current[k] !== next[k]) { changed = true; break; }
  }
  if (!changed) return;
  await storage.updateOnboardingState(fresh.id, { stepStatuses: next });
}

function triageHealthDeclarationInBackground(declaration: HealthDeclaration) {
  if (!isTriageAvailable()) {
    console.log(`[Health Triage] Skipped — AI credentials not configured`);
    return;
  }
  triageHealthDeclaration(declaration)
    .then(async (result) => {
      await storage.updateHealthDeclaration(declaration.id, {
        aiTriageStatus: result.status,
        aiTriageNote: result.note,
        aiTriagedAt: new Date(),
      });
      console.log(`[Health Triage] Declaration ${declaration.id}: ${result.status}`);
    })
    .catch(async (err) => {
      console.error(`[Health Triage] Failed for declaration ${declaration.id}:`, err.message);
      try {
        await storage.updateHealthDeclaration(declaration.id, {
          aiTriageStatus: "skipped",
          aiTriagedAt: new Date(),
        });
      } catch (updateErr) {
        console.error(`[Health Triage] Could not mark as skipped:`, (updateErr as Error).message);
      }
    });
}

// ─── Portal-scoped Skills Arcade helpers ──────────────────────────────
// Resolve (and lazily provision) the arcade user record for the nurse
// behind a validated portal token. We don't create scaffolding modules
// here — assignments are created out-of-band by trainers/admins; if no
// arcade user exists yet we just provision an empty nurse user so the
// portal page can render the empty-state correctly.
async function resolvePortalArcadeUserId(req: Request): Promise<string> {
  const nurseId = (req as any).nurseId as string;
  const [existingByNurse] = await db
    .select()
    .from(arcadeUsers)
    .where(eq(arcadeUsers.nurseId, nurseId));
  if (existingByNurse) return existingByNurse.id;

  const candidate = await storage.getCandidate(nurseId);
  const email = (candidate?.email ?? "").toLowerCase();
  if (email) {
    const existingByEmail = await arcadeStorage.getUserByEmail(email);
    if (existingByEmail) {
      if (!existingByEmail.nurseId) {
        await db
          .update(arcadeUsers)
          .set({ nurseId })
          .where(eq(arcadeUsers.id, existingByEmail.id));
      }
      return existingByEmail.id;
    }
  }

  // Provision an empty arcade user so future assignments land somewhere.
  // The password field is required but never used — portal access is
  // gated solely by the magic-link token.
  const username = email || `nurse-${nurseId}`;
  const created = await arcadeStorage.createUser({
    username,
    password: "portal-only",
    name: candidate?.fullName ?? "Nurse",
    email: email || `nurse-${nurseId}@portal.local`,
    role: "nurse",
    active: true,
    nurseId,
  } as any);
  return created.id;
}

export function registerPortalRoutes(app: Express) {
  app.get("/api/portal/verify/:token", async (req, res) => {
    const tokenParam = req.params.token;
    // "me" / "session" → cookie-based auth (task 107).
    if (tokenParam === "me" || tokenParam === "session") {
      const { loadPortalSessionFromRequest } = await import("../services/portal-auth");
      const loaded = await loadPortalSessionFromRequest(req);
      if (!loaded) return res.status(401).json({ message: "Portal sign-in required" });
      const candidate = await storage.getCandidate(loaded.nurse.id);
      if (!candidate) return res.status(404).json({ message: "Candidate not found" });
      return res.json({ candidate, token: tokenParam });
    }
    const link = await storage.getMagicLinkByToken(tokenParam);
    // Bootstrap link is one-time: if it's been claimed, fall back to the
    // session cookie (the new canonical auth) and 401 → sign-in otherwise.
    if (!link || (link as any).claimedAt) {
      const { loadPortalSessionFromRequest } = await import("../services/portal-auth");
      const loaded = await loadPortalSessionFromRequest(req);
      if (loaded) {
        const candidate = await storage.getCandidate(loaded.nurse.id);
        if (!candidate) return res.status(404).json({ message: "Candidate not found" });
        return res.json({ candidate, token: "me" });
      }
      return res.status(link ? 410 : 404).json({ message: "Invalid or expired portal link", redirect: "/portal/sign-in" });
    }
    if (new Date() > link.expiresAt) return res.status(410).json({ message: "Portal link has expired", redirect: "/portal/sign-in" });
    const candidate = await storage.getCandidate(link.nurseId);
    if (!candidate) return res.status(404).json({ message: "Candidate not found" });
    if (!link.usedAt) {
      await storage.markMagicLinkUsed(link.id);
      await storage.createAuditLog({ nurseId: candidate.id, action: "portal_accessed", agentName: `nurse_portal:${candidate.fullName}`, detail: {} });
    }
    res.json({ candidate, token: link.token });
  });

  app.get("/api/portal/:token/candidate", validatePortalToken, async (req, res) => {
    const candidate = await storage.getCandidate((req as any).nurseId);
    res.json(candidate);
  });

  app.patch("/api/portal/:token/candidate", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const candidate = await storage.updateCandidate(nurseId, req.body);
    const updates: Record<string, string> = {};
    if (req.body.fullName || req.body.email || req.body.phone || req.body.address) updates.identity = "in_progress";
    if (req.body.nmcPin) updates.nmc = "in_progress";
    if (req.body.dbsNumber) updates.dbs = "in_progress";
    if (req.body.currentEmployer || req.body.yearsQualified || req.body.specialisms) updates.profile = "in_progress";
    if (Object.keys(updates).length > 0) await safeWriteStepStatuses(nurseId, updates);
    await storage.createAuditLog({ nurseId, action: "portal_candidate_updated", agentName: portalAgent(req), detail: { fields: Object.keys(req.body) } });
    res.json(candidate);
  });

  // ─── Uniform sizing (task 153) ───────────────────────────────────
  // Nurse can self-correct their own uniform sizes from the
  // Demographics card. Same validation + audit shape as the admin
  // PUT — see `applyUniformSizingUpdate` in routes/admin.ts.
  app.put("/api/portal/:token/uniform-sizing", validatePortalToken, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const { applyUniformSizingUpdate } = await import("./admin");
    const result = await applyUniformSizingUpdate({
      nurseId,
      body: req.body,
      updatedBy: portalAgent(req),
      module: "portal",
      action: "portal_uniform_sizing_updated",
    });
    if ("error" in result) return res.status(result.status).json({ message: result.error });
    res.json(result.nurse);
  });

  app.get("/api/portal/:token/onboarding-state", validatePortalToken, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const state = await storage.getOnboardingState(nurseId);
    if (!state) return res.json(null);
    const { enrichStepStatuses } = await import("../onboarding-status-derive");
    const enriched = await enrichStepStatuses(
      nurseId,
      (state.stepStatuses as Record<string, string>) || {},
    );
    res.json({ ...state, stepStatuses: enriched });
  });

  app.get("/api/portal/:token/employment-history", validatePortalToken, async (req, res) => {
    const result = await storage.getEmploymentHistory((req as any).nurseId);
    res.json(result);
  });

  app.post("/api/portal/:token/employment-history", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const { employer, jobTitle, startDate } = req.body;
    if (!employer || !jobTitle || !startDate) {
      return res.status(400).json({ message: "Employer, job title, and start date are required" });
    }
    const data = { ...req.body, nurseId };
    const result = await storage.createEmploymentHistory(data);
    await safeWriteStepStatuses(nurseId, { profile: "in_progress" });
    await storage.createAuditLog({ nurseId, action: "portal_employment_added", agentName: portalAgent(req), detail: { employer: result.employer, jobTitle: result.jobTitle } });
    res.status(201).json(result);
  });

  app.delete("/api/portal/:token/employment-history/:id", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const deleted = await storage.deleteEmploymentHistory(req.params.id, nurseId);
    if (!deleted) return res.status(404).json({ message: "Entry not found" });
    await storage.createAuditLog({ nurseId, action: "portal_employment_deleted", agentName: portalAgent(req), detail: { id: req.params.id } });
    res.json({ success: true });
  });

  app.get("/api/portal/:token/education-history", validatePortalToken, async (req, res) => {
    const result = await storage.getEducationHistory((req as any).nurseId);
    res.json(result);
  });

  app.post("/api/portal/:token/education-history", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const { institution, qualification } = req.body;
    if (!institution || !qualification) {
      return res.status(400).json({ message: "Institution and qualification are required" });
    }
    const data = { ...req.body, nurseId };
    const result = await storage.createEducationHistory(data);
    await safeWriteStepStatuses(nurseId, { profile: "in_progress" });
    await storage.createAuditLog({ nurseId, action: "portal_education_added", agentName: portalAgent(req), detail: { institution: result.institution, qualification: result.qualification } });
    res.status(201).json(result);
  });

  app.delete("/api/portal/:token/education-history/:id", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const deleted = await storage.deleteEducationHistory(req.params.id, nurseId);
    if (!deleted) return res.status(404).json({ message: "Entry not found" });
    await storage.createAuditLog({ nurseId, action: "portal_education_deleted", agentName: portalAgent(req), detail: { id: req.params.id } });
    res.json({ success: true });
  });

  app.post("/api/portal/:token/upload", validatePortalToken, uploadLimiter, upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    res.json({
      filename: req.file.filename,
      originalFilename: req.file.originalname,
      filePath: `/api/uploads/${req.file.filename}`,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });
  });

  app.post("/api/portal/:token/cv-upload", validatePortalToken, uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      const nurseId = (req as any).nurseId;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const supportedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!supportedTypes.includes(req.file.mimetype)) {
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(400).json({ message: "Only PDF and image files are accepted" });
      }

      const absolutePath = path.join(uploadsDir, req.file.filename);

      // Cheap pre-check: reject obvious non-CVs (passport, payslip, certificate
      // scans, etc.) before paying for an Anthropic call. The CV uploader is
      // CV-only, so any reject here is a hard reject.
      const { preCheckCv } = await import("../cv-ai");
      const preCheck = await preCheckCv(absolutePath, req.file.mimetype, req.file.originalname);
      if (!preCheck.ok) {
        try { fs.unlinkSync(absolutePath); } catch {}
        await storage.createAuditLog({
          nurseId,
          action: "portal_cv_upload_rejected",
          agentName: portalAgent(req),
          detail: {
            originalFilename: req.file.originalname,
            mimeType: req.file.mimetype,
            reason: preCheck.reason,
            details: preCheck.details,
          },
        });
        return res.status(400).json({
          message: preCheck.reason || "This doesn't look like a CV — try a PDF or Word export of your résumé.",
          rejected: true,
        });
      }

      const { ingestExistingFile } = await import("../document-ingest");

      const ingest = await ingestExistingFile({
        nurseId,
        absolutePath,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype,
        source: "nurse",
        uploadedBy: "nurse",
        // Nurse-uploaded paperwork must NOT auto-fill official identity
        // fields like passport / NMC PIN / DBS — those are admin-managed.
        skipPersonalInfo: true,
      });

      const doc = await storage.getDocument(ingest.documentId);

      await storage.createAuditLog({
        nurseId,
        action: "portal_cv_uploaded",
        agentName: portalAgent(req),
        detail: {
          detectedCategory: ingest.category,
          detectedType: ingest.type,
          documentId: ingest.documentId,
          aiAvailable: ingest.aiAvailable,
          cvDetected: ingest.cvDetected,
          cvEntriesAdded: ingest.cvEntriesAdded,
          cvEntriesSkipped: ingest.cvEntriesSkipped,
          cvEducationAdded: ingest.cvEducationAdded,
          cvEducationSkipped: ingest.cvEducationSkipped,
        },
      });

      res.json({
        document: doc,
        aiAvailable: ingest.aiAvailable,
        cv: ingest.cvDetected
          ? {
              detected: true,
              addedEntries: ingest.cvEntriesAdded,
              skippedAsDuplicate: ingest.cvEntriesSkipped,
              addedEducation: ingest.cvEducationAdded,
              educationSkipped: ingest.cvEducationSkipped,
              addedEmploymentEntries: ingest.cvAddedEmployment,
              addedEducationEntries: ingest.cvAddedEducation,
            }
          : {
              detected: false,
              addedEntries: 0,
              skippedAsDuplicate: 0,
              addedEducation: 0,
              educationSkipped: 0,
              addedEmploymentEntries: [],
              addedEducationEntries: [],
            },
      });
    } catch (err: any) {
      console.error("[Portal CV Upload] Error:", err.message);
      res.status(500).json({ message: "Failed to process CV" });
    }
  });

  app.post("/api/portal/:token/passport-photo", validatePortalToken, requireOnboardingUnlocked, uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
      if (!allowedImageTypes.includes(req.file.mimetype)) {
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(400).json({ message: "Only image files (JPG, PNG, WebP) are allowed for passport photos" });
      }
      const nurseId = (req as any).nurseId;
      const filePath = `/api/uploads/${req.file.filename}`;
      const updated = await storage.updateCandidate(nurseId, { passportPhotoPath: filePath });
      if (!updated) {
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(404).json({ message: "Candidate not found" });
      }
      await storage.createAuditLog({ nurseId, action: "portal_passport_photo_uploaded", agentName: portalAgent(req), detail: { filename: req.file.originalname, filePath } });
      res.json({ passportPhotoPath: filePath });
    } catch (err: any) {
      console.error("[Portal Passport Photo Upload] Error:", err.message);
      res.status(500).json({ message: "Failed to upload passport photo" });
    }
  });

  app.delete("/api/portal/:token/passport-photo", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    try {
      const nurseId = (req as any).nurseId;
      const updated = await storage.updateCandidate(nurseId, { passportPhotoPath: null });
      if (!updated) return res.status(404).json({ message: "Candidate not found" });
      await storage.createAuditLog({ nurseId, action: "portal_passport_photo_removed", agentName: portalAgent(req), detail: {} });
      res.json({ success: true });
    } catch (err: any) {
      console.error("[Portal Passport Photo Remove] Error:", err.message);
      res.status(500).json({ message: "Failed to remove passport photo" });
    }
  });

  app.post("/api/portal/:token/proof-of-address", validatePortalToken, requireOnboardingUnlocked, uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const nurseId = (req as any).nurseId;
      const documentDate = req.body.documentDate;
      if (!documentDate) return res.status(400).json({ message: "Document date is required" });
      const docDate = new Date(documentDate);
      const now = new Date();
      if (docDate > now) return res.status(400).json({ message: "Document date cannot be in the future" });
      if (!isProofOfAddressWithinThreeMonths(documentDate)) return res.status(400).json({ message: "Document must be dated within the last 3 months" });
      const filePath = `/api/uploads/${req.file.filename}`;
      const doc = await storage.createDocument({
        nurseId,
        type: "Proof of Address",
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        filePath,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        category: "proof_of_address",
        expiryDate: documentDate,
        uploadedBy: "nurse",
      });
      await safeWriteStepStatuses(nurseId, { identity: "in_progress" });
      await storage.createAuditLog({ nurseId, action: "portal_document_uploaded", agentName: portalAgent(req), detail: { type: "Proof of Address", category: "proof_of_address", filename: req.file.originalname } });
      if (doc.filePath) {
        triggerSharePointUpload(doc.id, doc.nurseId, doc.filePath, doc.originalFilename || doc.filename, 'proof_of_address');
        triggerEmailNotification(doc.nurseId, doc.filePath, doc.originalFilename || doc.filename, 'proof_of_address', 'nurse', doc.mimeType || undefined);
        triggerDocumentAnalysis(doc.id, doc.filePath, doc.mimeType || '', 'proof_of_address', 'Proof of Address', doc.nurseId);
      }
      res.status(201).json(doc);
    } catch (err: any) {
      console.error("[Portal PoA Upload] Error:", err.message);
      res.status(500).json({ message: "Failed to upload proof of address" });
    }
  });

  app.get("/api/portal/:token/documents", validatePortalToken, async (req, res) => {
    const docs = await storage.getDocuments((req as any).nurseId);
    res.json(docs);
  });

  app.post("/api/portal/:token/documents", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const data = { ...req.body, nurseId, uploadedBy: "nurse" };
    if (
      data.category === "right_to_work" &&
      isShareCodeDoc(data) &&
      !isValidRtwDoc(data)
    ) {
      return res.status(400).json({
        message: "A share code is required to submit a Share Code Screenshot.",
      });
    }
    const result = await storage.createDocument(data);
    const docUpdates: Record<string, string> = {};
    if (data.category === "right_to_work" && isValidRtwDoc(data)) {
      docUpdates.right_to_work = "in_progress";
    }
    if (data.category === "identity") docUpdates.identity = "in_progress";
    if (data.category === "dbs") docUpdates.dbs = "in_progress";
    if (data.category === "indemnity") docUpdates.indemnity = "in_progress";
    if (data.category === "profile") docUpdates.profile = "in_progress";
    if (data.category === "competency_evidence") docUpdates.competency = "in_progress";
    if (data.category === "training_certificate") docUpdates.training = "in_progress";
    if (Object.keys(docUpdates).length > 0) await safeWriteStepStatuses(nurseId, docUpdates);
    await storage.createAuditLog({ nurseId, action: "portal_document_uploaded", agentName: portalAgent(req), detail: { type: result.type, category: data.category, filename: result.filename } });
    if (result.filePath) {
      triggerSharePointUpload(result.id, result.nurseId, result.filePath, result.originalFilename || result.filename, result.category || 'general');
      triggerEmailNotification(result.nurseId, result.filePath, result.originalFilename || result.filename, result.category || 'general', 'nurse', result.mimeType || undefined);
      triggerDocumentAnalysis(result.id, result.filePath, result.mimeType || '', data.category || '', result.type, result.nurseId);
    }
    res.status(201).json(result);
  });

  app.get("/api/portal/:token/competency-declarations", validatePortalToken, async (req, res) => {
    const result = await storage.getCompetencyDeclarations((req as any).nurseId);
    res.json(result);
  });

  app.post("/api/portal/:token/competency-declarations", validatePortalToken, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const data = { ...req.body, nurseId };
    const result = await storage.createCompetencyDeclaration(data);
    await safeWriteStepStatuses(nurseId, { competency: "in_progress" });
    await storage.createAuditLog({ nurseId, action: "portal_competency_declared", agentName: portalAgent(req), detail: { domain: result.domain, competency: result.competencyName, level: result.selfAssessedLevel } });
    // Competency declaration is one of the auto-unlock prerequisites.
    try { await maybeAutoUnlock(nurseId, "nurse_portal"); } catch {}
    res.status(201).json(result);
  });

  app.post("/api/portal/:token/competency-guidance", validatePortalToken, async (req, res) => {
    const { competencyName, domain, specialty } = req.body;
    if (!competencyName || !domain) {
      return res.status(400).json({ message: "competencyName and domain are required" });
    }
    try {
      const result = await generateCompetencyGuidance(competencyName, domain, specialty);
      res.json(result);
    } catch (err: any) {
      console.error("[Competency Guidance] AI generation failed:", err.message);
      res.json({
        competency: competencyName,
        guidance: "Consider your recent clinical experience in this area. Think about situations where you have performed this skill, how confident you felt, and whether you needed supervision or support.",
      });
    }
  });

  app.get("/api/portal/:token/mandatory-training", validatePortalToken, async (req, res) => {
    const result = await storage.getMandatoryTraining((req as any).nurseId);
    res.json(result);
  });

  app.post("/api/portal/:token/mandatory-training", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const data = { ...req.body, nurseId };
    const result = await storage.createMandatoryTraining(data);
    await safeWriteStepStatuses(nurseId, { training: "in_progress" });
    await storage.createAuditLog({ nurseId, action: "portal_training_recorded", agentName: portalAgent(req), detail: { module: result.moduleName, certificateDocumentId: result.certificateDocumentId } });
    res.status(201).json(result);
  });

  app.post("/api/portal/:token/training-cert-upload", validatePortalToken, requireOnboardingUnlocked, uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      const nurseId = (req as any).nurseId;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      if (req.file.mimetype !== "application/pdf") return res.status(400).json({ message: "Only PDF files are accepted" });

      const buffer = fs.readFileSync(req.file.path);
      const parseResult = await parseTrainingCertificate(buffer);

      const doc = await storage.createDocument({
        nurseId,
        type: "Training Certificate Bundle",
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        filePath: `/api/uploads/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        category: "training_certificate",
        uploadedBy: "nurse",
      });
      triggerSharePointUpload(doc.id, nurseId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'training_certificate');
      triggerEmailNotification(nurseId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'training_certificate', 'nurse', req.file.mimetype);

      const autoRecorded: string[] = [];
      for (const match of parseResult.matches) {
        const existing = await storage.getMandatoryTraining(nurseId);
        const alreadyDone = existing.find((t: any) => t.moduleName === match.moduleName);
        if (!alreadyDone) {
          const mod = { name: match.moduleName, renewalFrequency: match.renewalFrequency };
          await storage.createMandatoryTraining({
            nurseId,
            moduleName: mod.name,
            renewalFrequency: mod.renewalFrequency,
            completedDate: new Date().toISOString().split("T")[0],
            expiryDate: mod.renewalFrequency === "Annual"
              ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
              : new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            issuingBody: "Auto-detected from certificate",
            certificateUploaded: true,
            certificateDocumentId: doc.id,
            status: "completed",
          });
          autoRecorded.push(mod.name);
        }
      }

      await safeWriteStepStatuses(nurseId, { training: "in_progress" });

      await storage.createAuditLog({
        nurseId,
        action: "portal_training_cert_uploaded",
        agentName: portalAgent(req),
        detail: { matches: parseResult.matches.map(m => m.moduleName), autoRecorded, documentId: doc.id },
      });

      res.json({
        document: doc,
        matches: parseResult.matches,
        autoRecorded,
        totalModulesMatched: parseResult.matches.length,
      });
    } catch (err: any) {
      console.error("[Portal Training Cert Upload] Error:", err.message);
      res.status(500).json({ message: "Failed to parse training certificate" });
    }
  });

  app.post("/api/portal/:token/training-cert-ai", validatePortalToken, requireOnboardingUnlocked, uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      const nurseId = (req as any).nurseId;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Please upload a PDF or image of your training certificate" });
      }

      const doc = await storage.createDocument({
        nurseId,
        type: "Training Certificate",
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        filePath: `/api/uploads/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        category: "training_certificate",
        uploadedBy: "nurse",
      });
      triggerSharePointUpload(doc.id, nurseId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'training_certificate');
      triggerEmailNotification(nurseId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'training_certificate', 'nurse', req.file.mimetype);

      const aiResult = await analyzeCertificateWithAI(req.file.path, req.file.mimetype);

      const autoRecorded: string[] = [];
      const safeDate = (dateStr: string | null): string | null => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
      };

      for (const mod of aiResult.modules) {
        if (!mod.matchedModule) continue;
        const existing = await storage.getMandatoryTraining(nurseId);
        const alreadyDone = existing.find((t: any) => t.moduleName === mod.matchedModule);
        if (alreadyDone) continue;

        const moduleDef = MANDATORY_TRAINING_MODULES.find(m => m.name === mod.matchedModule);
        if (!moduleDef) continue;

        const completedDate = safeDate(mod.completedDate) || new Date().toISOString().split("T")[0];
        let expiryDate = safeDate(mod.expiryDate);
        if (!expiryDate) {
          const completed = new Date(completedDate);
          const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
          expiryDate = moduleDef.renewalFrequency === "Annual"
            ? new Date(completed.getTime() + msPerYear).toISOString().split("T")[0]
            : new Date(completed.getTime() + 3 * msPerYear).toISOString().split("T")[0];
        }

        await storage.createMandatoryTraining({
          nurseId,
          moduleName: mod.matchedModule,
          renewalFrequency: moduleDef.renewalFrequency,
          completedDate,
          expiryDate,
          issuingBody: mod.issuingBody || "Detected by AI",
          certificateUploaded: true,
          certificateDocumentId: doc.id,
          status: "completed",
        });
        autoRecorded.push(mod.matchedModule);
      }

      await safeWriteStepStatuses(nurseId, { training: "in_progress" });

      await storage.createAuditLog({
        nurseId,
        action: "training_cert_ai_analyzed",
        agentName: "certificate_ai",
        detail: {
          documentId: doc.id,
          detected: aiResult.modules.map(m => ({ title: m.detectedTitle, matched: m.matchedModule, confidence: m.confidence })),
          autoRecorded,
          overallConfidence: aiResult.confidence,
        },
      });

      res.json({
        document: doc,
        aiAnalysis: aiResult.modules,
        autoRecorded,
        confidence: aiResult.confidence,
      });
    } catch (err: any) {
      console.error("[Portal Training Cert AI] Error:", err.message);
      if (err.message?.includes("API key is not configured")) {
        return res.status(503).json({ message: "AI certificate analysis is currently unavailable. Please enter your training details manually." });
      }
      res.status(500).json({ message: "Failed to analyze certificate with AI. Please try again or enter details manually." });
    }
  });

  // ── Chase-link flow ───────────────────────────────────────────────────
  // When a nurse clicks the portal link inside a chase email, we want them
  // to land on a focused "Upload outstanding training certificates" view
  // pre-populated with exactly the modules listed in the originating
  // trainingNotifications row. These two endpoints power that experience.

  app.get("/api/portal/:token/chase-status", validatePortalToken, async (req, res) => {
    try {
      const nurseId = (req as any).nurseId;
      const token = String(req.params.token);
      const notification = await storage.getTrainingNotificationByPortalToken(token);
      if (!notification || notification.nurseId !== nurseId) {
        return res.json({ isChase: false });
      }

      const nurse = await storage.getCandidate(nurseId);
      const records = await storage.getMandatoryTraining(nurseId);
      const moduleNames = Array.isArray(notification.modulesIncluded)
        ? (notification.modulesIncluded as string[])
        : [];

      const modules = moduleNames.map((moduleName) => {
        const cell = evaluateMandatoryTrainingCell(records, moduleName);
        const renewalFrequency =
          MANDATORY_TRAINING_MODULES.find((m) => m.name === moduleName)?.renewalFrequency || "Annual";
        return {
          moduleName,
          renewalFrequency,
          satisfied: cell.status === "green",
          status: cell.status,
          label: cell.label,
        };
      });

      const allSatisfied = modules.length > 0 && modules.every((m) => m.satisfied);

      res.json({
        isChase: true,
        sentAt: notification.sentAt,
        portalExpiresAt: notification.portalLinkExpiresAt,
        nurseName: nurse?.fullName ?? null,
        modules,
        allSatisfied,
      });
    } catch (err: any) {
      console.error("[Portal Chase Status] Error:", err.message);
      res.status(500).json({ message: "Failed to load chase status" });
    }
  });

  app.post(
    "/api/portal/:token/chase-upload",
    validatePortalToken,
    requireOnboardingUnlocked,
    uploadLimiter,
    upload.single("file"),
    async (req, res) => {
      try {
        const nurseId = (req as any).nurseId;
        const token = String(req.params.token);
        const moduleName = String(req.body?.moduleName || "").trim();
        if (!req.file) return res.status(400).json({ message: "No file uploaded" });

        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
        if (!allowedTypes.includes(req.file.mimetype)) {
          return res.status(400).json({ message: "Please upload a PDF or image of your training certificate" });
        }

        const notification = await storage.getTrainingNotificationByPortalToken(token);
        if (!notification || notification.nurseId !== nurseId) {
          return res.status(403).json({ message: "This portal link is not a chase link" });
        }
        const chasedModules = Array.isArray(notification.modulesIncluded)
          ? (notification.modulesIncluded as string[])
          : [];
        if (!moduleName || !chasedModules.includes(moduleName)) {
          return res.status(400).json({
            message: "moduleName must be one of the modules in your chase email",
          });
        }

        const filePath = `/api/uploads/${req.file.filename}`;
        const doc = await storage.createDocument({
          nurseId,
          type: `Training Certificate - ${moduleName}`,
          filename: req.file.filename,
          originalFilename: req.file.originalname,
          filePath,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          category: "training_certificate",
          uploadedBy: "nurse",
        });

        triggerSharePointUpload(doc.id, nurseId, filePath, req.file.originalname, "training_certificate");
        triggerEmailNotification(nurseId, filePath, req.file.originalname, "training_certificate", "nurse", req.file.mimetype);
        try {
          triggerDocumentAnalysis(doc.id, filePath, req.file.mimetype, "training_certificate", `Training Certificate - ${moduleName}`, nurseId);
        } catch (e) {
          console.warn("[Portal Chase Upload] Document analysis trigger failed (non-fatal)", e);
        }

        // Auto-tag against the chased module so admins don't have to triage.
        // applyChaseReplyTrainingUpsert handles both new and existing rows
        // (clearing expired/in-progress cells with the fresh certificate).
        const upsertResult = await applyChaseReplyTrainingUpsert({
          nurseId,
          documentId: doc.id,
          absolutePath: req.file.path,
          mimeType: req.file.mimetype,
          matchedExpectedModules: [moduleName],
        });

        await storage.createAuditLog({
          nurseId,
          action: "portal_chase_upload",
          agentName: portalAgent(req),
          detail: {
            module: moduleName,
            documentId: doc.id,
            updated: upsertResult.updated,
            created: upsertResult.created,
            notificationId: notification.id,
          },
        });

        // Return refreshed chase status so the client can re-render without
        // a separate round-trip.
        const records = await storage.getMandatoryTraining(nurseId);
        const modules = chasedModules.map((name) => {
          const cell = evaluateMandatoryTrainingCell(records, name);
          return {
            moduleName: name,
            renewalFrequency:
              MANDATORY_TRAINING_MODULES.find((m) => m.name === name)?.renewalFrequency || "Annual",
            satisfied: cell.status === "green",
            status: cell.status,
            label: cell.label,
          };
        });
        const allSatisfied = modules.length > 0 && modules.every((m) => m.satisfied);

        res.json({
          document: doc,
          moduleName,
          updated: upsertResult.updated,
          created: upsertResult.created,
          modules,
          allSatisfied,
        });
      } catch (err: any) {
        console.error("[Portal Chase Upload] Error:", err.message);
        res.status(500).json({ message: "Failed to upload chase certificate" });
      }
    },
  );

  app.get("/api/portal/:token/nmc-verification", validatePortalToken, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const verification = await storage.getNmcVerification(nurseId);
    if (!verification) return res.json(null);
    let document: { id: string; filename: string; originalFilename: string | null; filePath: string | null } | null = null;
    const raw = (verification.rawResponse || {}) as Record<string, any>;
    if (raw.documentId) {
      const doc = await storage.getDocument(raw.documentId);
      if (doc) document = { id: doc.id, filename: doc.filename, originalFilename: doc.originalFilename, filePath: doc.filePath };
    }
    res.json({ ...verification, document });
  });

  app.post("/api/portal/:token/nmc-parse-pdf", validatePortalToken, requireOnboardingUnlocked, uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      const nurseId = (req as any).nurseId;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      if (req.file.mimetype !== "application/pdf") return res.status(400).json({ message: "Only PDF files are accepted" });

      const buffer = fs.readFileSync(req.file.path);
      const result = await parseNmcPdfWithFallback(buffer);

      const doc = await storage.createDocument({
        nurseId,
        type: "NMC Register PDF",
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        filePath: `/api/uploads/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        category: "nmc",
        uploadedBy: "nurse",
      });
      triggerSharePointUpload(doc.id, nurseId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'nmc');
      triggerEmailNotification(nurseId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'nmc', 'nurse', req.file.mimetype);

      // Persist a pending NMC verification record so the parsed details + the
      // uploaded PDF are immediately visible on the admin candidate page and
      // survive a portal page refresh. Falls through to the existing admin
      // confirm flow which will flip the status to verified/failed/escalated.
      const candidate = await storage.getCandidate(nurseId);
      const existing = await storage.getNmcVerification(nurseId);
      const pinForRecord = (result.pin || candidate?.nmcPin || "").toUpperCase();
      const rawResponse = {
        pdfVerification: true,
        evidenceFilename: req.file.filename,
        originalFilename: req.file.originalname,
        documentId: doc.id,
        extractionMethod: result.extractionMethod,
        source: "portal_upload",
      };
      const verificationFields = {
        nurseId,
        pin: pinForRecord || "PENDING",
        registeredName: result.registeredName || "",
        registrationStatus: result.registrationStatus || "",
        fieldOfPractice: result.fieldOfPractice || "",
        conditions: result.conditions || [],
        effectiveDate: result.effectiveDate || null,
        renewalDate: result.renewalDate || null,
        status: "pending" as const,
        verifiedAt: null,
        rawResponse,
      };
      let verification;
      if (existing && existing.status === "pending") {
        verification = await storage.updateNmcVerification(existing.id, verificationFields) || existing;
      } else {
        verification = await storage.createNmcVerification(verificationFields);
      }

      await safeWriteStepStatuses(nurseId, { nmc: "in_progress" });

      await storage.createAuditLog({
        nurseId,
        action: "portal_nmc_pdf_parsed",
        agentName: portalAgent(req),
        detail: { registeredName: result.registeredName, status: result.registrationStatus, extractionMethod: result.extractionMethod, verificationId: verification.id },
      });

      res.json({
        ...result,
        uploadedFilename: req.file.filename,
        originalFilename: req.file.originalname,
        documentId: doc.id,
        verificationId: verification.id,
        status: "pending",
      });
    } catch (err: any) {
      if (err instanceof NmcVerificationError) {
        return res.status(400).json({ message: err.message, code: err.code });
      }
      console.error("[Portal NMC PDF Parse] Error:", err.message);
      res.status(500).json({ message: "Failed to parse NMC PDF" });
    }
  });

  app.post("/api/portal/:token/passport-parse", validatePortalToken, requireOnboardingUnlocked, uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      const nurseId = (req as any).nurseId;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Please upload an image (JPEG, PNG, or WebP) of your passport photo page" });
      }

      const result = await parsePassportImage(req.file.path);

      const doc = await storage.createDocument({
        nurseId,
        type: "Passport",
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        filePath: `/api/uploads/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        category: "identity",
        uploadedBy: "nurse",
      });
      triggerSharePointUpload(doc.id, nurseId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'identity');
      triggerEmailNotification(nurseId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'identity', 'nurse', req.file.mimetype);

      if (result.passportNumber) {
        await storage.updateCandidate(nurseId, { passportNumber: result.passportNumber });
      }

      await storage.createAuditLog({
        nurseId,
        action: "passport_uploaded",
        agentName: portalAgent(req),
        detail: {
          mrzDetected: result.mrzDetected,
          ocrConfidence: result.ocrConfidence,
          passportNumber: result.passportNumber ? `***${result.passportNumber.slice(-4)}` : null,
        },
      });

      const { rawText, ...clientResult } = result;
      if (!result.mrzDetected) {
        console.log("[Passport OCR] MRZ not detected. Confidence:", result.ocrConfidence, "Raw text preview:", rawText?.substring(0, 200));
      }

      res.json({
        ...clientResult,
        documentId: doc.id,
      });
    } catch (err: any) {
      console.error("[Portal Passport Parse] Error:", err.message);
      res.status(500).json({ message: "Failed to process passport image" });
    }
  });

  app.get("/api/portal/:token/health-declaration", validatePortalToken, async (req, res) => {
    const result = await storage.getHealthDeclaration((req as any).nurseId);
    res.json(result || null);
  });

  app.post("/api/portal/:token/health-declaration", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const data = { ...req.body, nurseId };
    const result = await storage.createHealthDeclaration(data);
    await safeWriteStepStatuses(nurseId, { health: result.completed ? "completed" : "in_progress" });
    await storage.createAuditLog({ nurseId, action: "portal_health_declared", agentName: portalAgent(req), detail: { ohReferral: result.ohReferralRequired } });
    res.status(201).json(result);

    triageHealthDeclarationInBackground(result);
  });

  app.get("/api/portal/:token/references", validatePortalToken, async (req, res) => {
    const result = await storage.getReferences((req as any).nurseId);
    res.json(result);
  });

  app.post("/api/portal/:token/references", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const data = { ...req.body, nurseId };
    const result = await storage.createReference(data);
    await safeWriteStepStatuses(nurseId, { references: "in_progress" });

    let emailSent = false;
    if (result.refereeEmail) {
      try {
        const refereeToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await storage.createRefereeToken({ referenceId: result.id, nurseId, token: refereeToken, expiresAt });

        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers["host"] || "localhost:5000";
        const refereeFormUrl = `${protocol}://${host}/referee/${refereeToken}`;

        const candidate = await storage.getCandidate(nurseId);
        const candidateName = candidate?.fullName || "the candidate";

        await sendReferenceRequestEmail(result.refereeEmail, result.refereeName, candidateName, refereeFormUrl, expiresAt);
        emailSent = true;

        await storage.updateReference(result.id, { outcome: "sent", emailSentAt: new Date() } as any);
        await storage.createAuditLog({ nurseId, action: "reference_email_sent", agentName: portalAgent(req), detail: { refereeEmail: result.refereeEmail, refereeName: result.refereeName } });
      } catch (err: any) {
        console.error("Failed to send reference request email:", err?.message || err);
        await storage.createAuditLog({ nurseId, action: "reference_email_failed", agentName: portalAgent(req), detail: { error: err?.message || "Unknown error", refereeEmail: result.refereeEmail } });
      }
    }

    await storage.createAuditLog({ nurseId, action: "portal_reference_added", agentName: portalAgent(req), detail: { refereeName: result.refereeName, emailSent } });
    res.status(201).json({ ...result, emailSent });
  });

  app.get("/api/portal/:token/induction-policies", validatePortalToken, requireNurseStageCompleted, async (req, res) => {
    const result = await storage.getInductionPolicies((req as any).nurseId);
    res.json(result);
  });

  // Legacy single-induction acknowledgement endpoint. Task 114 split
  // induction into 21 versioned items handled through
  // /api/portal/:token/induction + /policies/:id/acknowledge. The
  // legacy `inductionPolicies` table is now read-only (kept for audit
  // history). Writes are rejected to prevent drift.
  app.post("/api/portal/:token/induction-policies", validatePortalToken, async (_req, res) => {
    res.status(410).json({
      error: "deprecated",
      message:
        "Induction policies have moved to per-section read-and-acknowledge. Use the new induction page in the portal.",
    });
  });

  app.get("/api/portal/:token/professional-indemnity", validatePortalToken, async (req, res) => {
    const result = await storage.getProfessionalIndemnity((req as any).nurseId);
    res.json(result || null);
  });

  app.post("/api/portal/:token/professional-indemnity", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const data = { ...req.body, nurseId };
    const result = await storage.createProfessionalIndemnity(data);
    await safeWriteStepStatuses(nurseId, { indemnity: result.verified ? "completed" : "in_progress" });
    await storage.createAuditLog({ nurseId, action: "portal_indemnity_recorded", agentName: portalAgent(req), detail: { provider: result.provider } });
    res.status(201).json(result);
  });

  app.get("/api/portal/:token/dbs-verification", validatePortalToken, async (req, res) => {
    const result = await storage.getDbsVerification((req as any).nurseId);
    res.json(result || null);
  });

  app.post("/api/portal/:token/dbs-verification", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const { certificateNumber, issueDate, certificateType, updateServiceSubscribed } = req.body;
    if (!certificateNumber) {
      return res.status(400).json({ message: "certificateNumber is required" });
    }
    const data = {
      nurseId,
      certificateNumber,
      issueDate: issueDate || null,
      certificateType: certificateType || null,
      updateServiceSubscribed: !!updateServiceSubscribed,
      status: "pending" as const,
    };
    const result = await storage.createDbsVerification(data);
    await safeWriteStepStatuses(nurseId, {
      dbs: result.status === "verified" ? "completed" : result.status === "failed" ? "failed" : "in_progress",
    });
    await storage.createAuditLog({ nurseId, action: "portal_dbs_recorded", agentName: portalAgent(req), detail: { certificateNumber: result.certificateNumber } });
    res.status(201).json(result);
  });

  app.get("/api/portal/:token/equal-opportunities", validatePortalToken, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const result = await storage.getEqualOpportunities(nurseId);
    res.json(result || null);
  });

  app.post("/api/portal/:token/equal-opportunities", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const { gender, ethnicity, disabilityStatus, religionBelief, sexualOrientation, ageBand } = req.body;
    const existing = await storage.getEqualOpportunities(nurseId);
    let result;
    if (existing) {
      result = await storage.updateEqualOpportunities(existing.id, {
        gender: gender ?? existing.gender,
        ethnicity: ethnicity ?? existing.ethnicity,
        disabilityStatus: disabilityStatus ?? existing.disabilityStatus,
        religionBelief: religionBelief ?? existing.religionBelief,
        sexualOrientation: sexualOrientation ?? existing.sexualOrientation,
        ageBand: ageBand ?? existing.ageBand,
      });
    } else {
      result = await storage.createEqualOpportunities({
        candidateRef: nurseId,
        gender: gender || "Prefer not to say",
        ethnicity: ethnicity || "Prefer not to say",
        disabilityStatus: disabilityStatus || "Prefer not to say",
        religionBelief: religionBelief || "Prefer not to say",
        sexualOrientation: sexualOrientation || "Prefer not to say",
        ageBand: ageBand || "Prefer not to say",
      });
    }
    await safeWriteStepStatuses(nurseId, { equal_opportunities: "completed" });
    await storage.createAuditLog({
      nurseId,
      action: "equal_opportunities_submitted",
      agentName: portalAgent(req),
      detail: { submitted: true },
    });
    res.status(existing ? 200 : 201).json(result);
  });

  // Explicit per-step "I'm done with this step" action. The candidate
  // posts here when they've finished the natural work of a step (entered
  // their PIN, uploaded a doc, filled in a form, etc.) and want the
  // progress bar to advance.
  //
  // For NMC + DBS we never let the candidate self-mark "completed" —
  // those still require an admin to verify the registration / certificate.
  // We instead flip the step to "awaiting_verification" so the candidate
  // can see they've done their part and the admin has the ball.
  app.post("/api/portal/:token/steps/:stepKey/complete", validatePortalToken, requireOnboardingUnlocked, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const stepKey = String(req.params.stepKey);
    const validKeys = PORTAL_STEPS.map((s) => s.key) as readonly string[];
    if (!validKeys.includes(stepKey)) {
      return res.status(400).json({ message: "Unknown step key" });
    }
    const state = await storage.getOnboardingState(nurseId);
    if (!state) {
      return res.status(404).json({ message: "Onboarding state not found" });
    }
    const statuses = (state.stepStatuses as Record<string, string>) || {};
    const current = statuses[stepKey];

    // Don't downgrade an already-verified step.
    if (current === STEP_STATUS.completed) {
      return res.json({ stepKey, status: current, alreadyCompleted: true });
    }

    const requiresAdmin = (STEPS_REQUIRING_ADMIN_VERIFICATION as readonly string[]).includes(stepKey);
    const next = requiresAdmin ? STEP_STATUS.awaiting_verification : STEP_STATUS.completed;
    // safeWriteStepStatuses preserves terminal states. We've already
    // bailed on `completed` above, and `awaiting_verification -> completed`
    // is impossible here (both candidate-side targets are themselves
    // terminal), so we re-read + write directly to ensure the upgrade
    // (in_progress -> awaiting_verification, pending -> completed) goes
    // through.
    const fresh = await storage.getOnboardingState(nurseId);
    const freshStatuses = (fresh?.stepStatuses as Record<string, string>) || {};
    if (freshStatuses[stepKey] === STEP_STATUS.completed) {
      return res.json({ stepKey, status: freshStatuses[stepKey], alreadyCompleted: true });
    }
    freshStatuses[stepKey] = next;
    await storage.updateOnboardingState(state.id, { stepStatuses: freshStatuses });
    await storage.createAuditLog({
      nurseId,
      action: requiresAdmin ? "portal_step_submitted_for_verification" : "portal_step_completed",
      agentName: portalAgent(req),
      detail: { stepKey, previous: current ?? "pending", next },
    });
    res.json({ stepKey, status: next, requiresAdminVerification: requiresAdmin });
  });

  // ─── Portal-scoped Skills Arcade endpoints ──────────────────────────
  // These mirror the session-based /api/nurse/* arcade endpoints but
  // resolve the nurse from the portal token, so the portal never depends
  // on (or leaks data through) a platform admin session that happens to
  // be active in the same browser.
  app.get("/api/portal/:token/arcade/dashboard", validatePortalToken, async (req, res) => {
    try {
      const userId = await resolvePortalArcadeUserId(req);
      const allModules = await arcadeStorage.getAllModules();
      const userAssignments = await arcadeStorage.getAssignmentsByUser(userId);
      const assignmentData = await Promise.all(
        userAssignments.map(async (a) => {
          const mod = allModules.find((m) => m.id === a.moduleId);
          const attemptsList = await arcadeStorage.getAttemptsByAssignment(a.id);
          const failedAttempts = attemptsList.filter((at) => at.result === "fail").length;
          const lastAttempt = attemptsList[0];
          return {
            id: a.id,
            moduleId: a.moduleId,
            moduleName: mod?.name ?? "Unknown",
            moduleDescription: mod?.description ?? "",
            moduleIcon: mod?.icon ?? "BookOpen",
            moduleColor: mod?.color ?? "blue",
            status: a.status,
            dueAt: a.dueAt,
            attemptCount: attemptsList.length,
            failedAttempts,
            lastAttemptResult: lastAttempt?.result ?? null,
            moduleVersionId: a.moduleVersionId,
          };
        })
      );
      const stats = {
        totalAssigned: assignmentData.length,
        completed: assignmentData.filter((a) => a.status === "passed").length,
        inProgress: assignmentData.filter((a) => a.status === "in_progress" || a.status === "failed").length,
        locked: assignmentData.filter((a) => a.status === "locked").length,
      };
      res.json({ assignments: assignmentData, stats });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/portal/:token/arcade/assignments/:id", validatePortalToken, async (req, res) => {
    try {
      const userId = await resolvePortalArcadeUserId(req);
      const assignment = await arcadeStorage.getAssignment(String(req.params.id));
      if (!assignment || assignment.userId !== userId) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      const allModules = await arcadeStorage.getAllModules();
      const mod = allModules.find((m) => m.id === assignment.moduleId);
      const attemptsList = await arcadeStorage.getAttemptsByAssignment(assignment.id);
      const failedAttempts = attemptsList.filter((at) => at.result === "fail").length;
      res.json({
        moduleName: mod?.name ?? "Unknown",
        moduleDescription: mod?.description ?? "",
        status: assignment.status,
        attemptCount: attemptsList.length,
        failedAttempts,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/portal/:token/arcade/attempts/start", validatePortalToken, requireOnboardingUnlocked, requireInductionAcknowledged, async (req, res) => {
    try {
      const userId = await resolvePortalArcadeUserId(req);
      const assignmentId = String(req.body?.assignmentId ?? "");
      if (!assignmentId) return res.status(400).json({ message: "assignmentId is required" });
      const assignment = await arcadeStorage.getAssignment(assignmentId);
      if (!assignment || assignment.userId !== userId) {
        return res.status(404).json({ message: "Assignment not found" });
      }
      if (assignment.status === "locked") {
        return res.status(403).json({ message: "This module is locked. Face-to-face training required." });
      }
      const scenarioList = await arcadeStorage.getScenariosByModuleVersion(assignment.moduleVersionId);
      if (scenarioList.length === 0) return res.status(404).json({ message: "No scenarios available" });
      const scenario = scenarioList[Math.floor(Math.random() * scenarioList.length)];
      const attempt = await arcadeStorage.createAttempt({
        userId,
        moduleVersionId: assignment.moduleVersionId,
        scenarioId: scenario.id,
        assignmentId: assignment.id,
      });
      if (assignment.status === "not_started") {
        await arcadeStorage.updateAssignmentStatus(assignment.id, "in_progress");
      }
      const allModules = await arcadeStorage.getAllModules();
      const mod = allModules.find((m) => m.id === assignment.moduleId);
      res.json({
        attemptId: attempt.id,
        scenario: { id: scenario.id, title: scenario.title, contentJson: scenario.contentJson },
        moduleName: mod?.name ?? "Unknown",
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/portal/:token/arcade/attempts/submit", validatePortalToken, requireOnboardingUnlocked, requireInductionAcknowledged, async (req, res) => {
    try {
      const userId = await resolvePortalArcadeUserId(req);
      const attemptId = String(req.body?.attemptId ?? "");
      const responses = Array.isArray(req.body?.responses) ? req.body.responses : null;
      if (!attemptId || !responses) return res.status(400).json({ message: "Invalid submission format" });
      const attempt = await arcadeStorage.getAttempt(attemptId);
      if (!attempt || attempt.userId !== userId) {
        return res.status(404).json({ message: "Attempt not found" });
      }
      const scenario = await arcadeStorage.getScenario(attempt.scenarioId);
      if (!scenario) return res.status(404).json({ message: "Scenario not found" });
      const result = scoreAttempt(scenario.contentJson as ScenarioContent, responses as ArcadeTaskResponse[]);
      await arcadeStorage.updateAttempt(attemptId, {
        submittedAt: new Date(),
        result: result.passed ? "pass" : "fail",
        minorCount: result.minorCount,
        majorCount: result.majorCount,
        responseJson: responses,
        feedbackJson: result,
      });
      const assignment = await arcadeStorage.getAssignment(attempt.assignmentId);
      if (assignment) {
        if (result.passed) {
          await arcadeStorage.updateAssignmentStatus(assignment.id, "passed");
        } else {
          const failCount = await arcadeStorage.getFailedAttemptCount(attempt.userId, attempt.moduleVersionId);
          if (failCount >= 4) {
            await arcadeStorage.updateAssignmentStatus(assignment.id, "locked");
            await arcadeStorage.createRemediationCase({
              userId: attempt.userId,
              moduleVersionId: attempt.moduleVersionId,
              moduleId: assignment.moduleId,
              status: "open",
            });
            await arcadeStorage.upsertClearance({
              userId: attempt.userId,
              moduleId: assignment.moduleId,
              moduleVersionId: attempt.moduleVersionId,
              status: "restricted",
            });
          } else {
            await arcadeStorage.updateAssignmentStatus(assignment.id, "failed");
          }
        }
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
