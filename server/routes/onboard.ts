import type { Express, Request } from "express";
import { storage } from "../storage";
import { upload, uploadsDir, magicLinkLimiter, uploadLimiter, requireAdmin } from "../middleware";
import { sendPortalInviteEmail, sendReferenceRequestEmail, getDefaultReferenceEmailBody } from "../outlook";
import { draftReferenceRequestEmail } from "../reference-ai";
import { checkDbsCertificate, isDbsConfigured, DbsUpdateServiceError } from "../dbs-service";
import { isNmcAgentAvailable, validatePin, parseNmcPdfWithFallback, NmcVerificationError } from "../nmc-service";
import { parseTrainingCertificate } from "../training-cert-service";
import { triggerSharePointUpload, triggerEmailNotification } from "../sharepoint-helper";
import { triageHealthDeclaration, isTriageAvailable } from "../health-triage-ai";
import { classifyDocumentSmart } from "../document-ai";
import type { HealthDeclaration } from "@shared/schema";
import { MANDATORY_TRAINING_MODULES } from "@shared/schema";
import { generateAuditSummary, isAuditSummaryAvailable } from "../audit-summary-ai";
import { generateCandidatePDF } from "../pdf-generator";
import { runComplianceCheck, isComplianceCheckAvailable } from "../compliance-check-ai";
import crypto from "crypto";
import fs from "fs";
import path from "path";

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

function param(req: Request, name: string): string {
  return req.params[name] as string;
}

function agentFor(req: Request): string {
  const username = req.session?.username;
  const role = req.session?.role;
  if (username && role) return `${username} (${role})`;
  if (username) return username;
  return "system";
}

export function registerAdminRoutes(app: Express) {
  app.get("/api/candidates", async (_req, res) => {
    const result = await storage.getCandidates();
    res.json(result);
  });

  app.post("/api/candidates", async (req, res) => {
    const { insertCandidateSchema } = await import("@shared/schema");
    const parsed = insertCandidateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const data = { ...parsed.data };
    if (data.fastTracked) {
      data.currentStage = "onboard";
    }
    const candidate = await storage.createCandidate(data);
    await storage.createOnboardingState({
      nurseId: candidate.id,
      currentStep: 1,
      stepStatuses: { identity: "in_progress", nmc: "pending", dbs: "pending", right_to_work: "pending", profile: "pending", competency: "pending", training: "pending", health: "pending", references: "pending", induction: "pending", indemnity: "pending", equal_opportunities: "pending" },
    });
    await storage.createAuditLog({ nurseId: candidate.id, action: "candidate_created", agentName: agentFor(req), detail: { name: candidate.fullName } });
    if (candidate.fastTracked) {
      await storage.createAuditLog({ nurseId: candidate.id, action: "fast_tracked", agentName: agentFor(req), detail: { skippedStage: "preboard", reason: "Fast-tracked to onboarding — awaiting admin reason" } });
    }

    let emailSent = false;
    if (candidate.email) {
      try {
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        const link = await storage.createMagicLink({ nurseId: candidate.id, token, expiresAt, module: "onboard" });
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers["host"] || "localhost:5000";
        const portalUrl = `${protocol}://${host}/portal/${link.token}`;
        const emailStage = candidate.currentStage === "onboard" ? "onboard" : candidate.currentStage === "skills_arcade" ? "skills_arcade" : "preboard";
        await sendPortalInviteEmail(candidate.email, candidate.fullName, portalUrl, expiresAt, emailStage);
        emailSent = true;
        await storage.createAuditLog({ nurseId: candidate.id, action: "magic_link_generated", agentName: agentFor(req), detail: { expiresAt: expiresAt.toISOString(), emailSent: true } });
        await storage.createAuditLog({ nurseId: candidate.id, action: "portal_invite_emailed", agentName: agentFor(req), detail: { recipientEmail: candidate.email, expiresAt: expiresAt.toISOString() } });
      } catch (err: any) {
        console.error("Auto-invite email failed:", err?.message || err);
        await storage.createAuditLog({ nurseId: candidate.id, action: "portal_invite_email_failed", agentName: agentFor(req), detail: { error: err?.message || "Unknown error", recipientEmail: candidate.email } });
      }
    }

    res.status(201).json({ ...candidate, emailSent });
  });

  app.get("/api/candidates/:id", async (req, res) => {
    const candidate = await storage.getCandidate(param(req, "id"));
    if (!candidate) return res.status(404).json({ message: "Not found" });
    res.json(candidate);
  });

  app.post("/api/candidates/:id/passport-photo", uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const allowedImageTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
      if (!allowedImageTypes.includes(req.file.mimetype)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "Only image files (JPG, PNG, WebP) are allowed for passport photos" });
      }
      const candidate = await storage.getCandidate(param(req, "id"));
      if (!candidate) return res.status(404).json({ message: "Not found" });
      const filePath = `/api/uploads/${req.file.filename}`;
      await storage.updateNurse(candidate.id, { passportPhotoPath: filePath });
      await storage.createAuditLog({ nurseId: candidate.id, action: "passport_photo_uploaded", agentName: agentFor(req), detail: { filename: req.file.originalname, filePath } });
      res.json({ passportPhotoPath: filePath });
    } catch (err: any) {
      console.error("[Passport Photo Upload] Error:", err.message);
      res.status(500).json({ message: "Failed to upload passport photo" });
    }
  });

  app.post("/api/candidates/:id/proof-of-address", uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const documentDate = req.body.documentDate;
      if (!documentDate) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "Document date is required" });
      }
      const docDate = new Date(documentDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (docDate > today) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "Document date cannot be in the future" });
      }
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      if (docDate < threeMonthsAgo) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ message: "Document must be dated within the last 3 months" });
      }
      const candidate = await storage.getCandidate(param(req, "id"));
      if (!candidate) return res.status(404).json({ message: "Not found" });
      const filePath = `/api/uploads/${req.file.filename}`;
      const doc = await storage.createDocument({
        nurseId: candidate.id,
        type: "Proof of Address",
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        filePath,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        category: "proof_of_address",
        expiryDate: documentDate,
        uploadedBy: "admin",
      });
      await storage.createAuditLog({ nurseId: candidate.id, action: "proof_of_address_uploaded", agentName: agentFor(req), detail: { filename: req.file.originalname, documentDate, filePath } });
      res.json(doc);
    } catch (err: any) {
      console.error("[Proof of Address Upload] Error:", err.message);
      res.status(500).json({ message: "Failed to upload proof of address" });
    }
  });

  app.delete("/api/candidates/:id/proof-of-address/:docId", async (req, res) => {
    try {
      const candidate = await storage.getCandidate(param(req, "id"));
      if (!candidate) return res.status(404).json({ message: "Not found" });
      const docs = await storage.getDocuments(candidate.id);
      const doc = docs.find(d => d.id === req.params.docId && d.category === "proof_of_address");
      if (!doc) return res.status(404).json({ message: "Document not found" });
      await storage.deleteDocument(doc.id);
      await storage.createAuditLog({ nurseId: candidate.id, action: "proof_of_address_removed", agentName: agentFor(req), detail: { documentId: doc.id, filename: doc.originalFilename || doc.filename } });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to remove proof of address" });
    }
  });

  app.delete("/api/candidates/:id/passport-photo", async (req, res) => {
    try {
      const candidate = await storage.getCandidate(param(req, "id"));
      if (!candidate) return res.status(404).json({ message: "Not found" });
      await storage.updateNurse(candidate.id, { passportPhotoPath: null });
      await storage.createAuditLog({ nurseId: candidate.id, action: "passport_photo_removed", agentName: agentFor(req), detail: {} });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to remove passport photo" });
    }
  });

  app.patch("/api/candidates/:id", async (req, res) => {
    const candidate = await storage.updateCandidate(param(req, "id"), req.body);
    if (!candidate) return res.status(404).json({ message: "Not found" });
    const state = await storage.getOnboardingState(param(req, "id"));
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      if (req.body.currentEmployer || req.body.yearsQualified || req.body.specialisms) {
        statuses.profile = "in_progress";
      }
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ nurseId: candidate.id, action: "candidate_updated", agentName: agentFor(req), detail: req.body });
    res.json(candidate);
  });

  app.get("/api/candidates/:id/nmc-verification", async (req, res) => {
    const result = await storage.getNmcVerification(param(req, "id"));
    res.json(result || null);
  });

  app.post("/api/candidates/:id/nmc-verification", async (req, res) => {
    const data = { ...req.body, nurseId: param(req, "id") };
    if (typeof data.verifiedAt === "string") data.verifiedAt = new Date(data.verifiedAt);
    if (!data.verifiedAt && data.status === "verified") data.verifiedAt = new Date();
    const result = await storage.createNmcVerification(data);
    const state = await storage.getOnboardingState(param(req, "id"));
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.nmc = result.status === "verified" ? "completed" : result.status === "failed" ? "failed" : "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ nurseId: param(req, "id"), action: "nmc_verification_created", agentName: agentFor(req), detail: { pin: result.pin, status: result.status } });
    res.status(201).json(result);
  });

  app.get("/api/nmc/status", (_req, res) => {
    res.json({ available: isNmcAgentAvailable() });
  });

  app.post("/api/candidates/:id/nmc-parse-pdf", uploadLimiter, upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No PDF file uploaded" });
    if (req.file.mimetype !== "application/pdf") return res.status(400).json({ message: "Only PDF files are accepted" });

    try {
      const pdfBuffer = fs.readFileSync(req.file.path);
      const parsed = await parseNmcPdfWithFallback(pdfBuffer);
      const uploadedFilename = path.basename(req.file.path);
      res.json({ ...parsed, uploadedFilename: uploadedFilename, originalFilename: req.file.originalname });
    } catch (err) {
      if (err instanceof NmcVerificationError) {
        return res.status(400).json({ message: err.message, code: err.code });
      }
      res.status(500).json({ message: "Failed to parse PDF" });
    }
  });

  app.post("/api/candidates/:id/nmc-verify", async (req, res) => {
    const { pin, registeredName, registrationStatus, fieldOfPractice, conditions, effectiveDate, renewalDate, uploadedFilename, originalFilename, extractionMethod } = req.body;
    if (!pin) return res.status(400).json({ message: "pin is required" });
    if (!validatePin(pin)) return res.status(400).json({ message: "Invalid NMC PIN format. Expected: two digits, one letter, four digits, one letter (e.g. 18A1234C)." });
    if (!registrationStatus) return res.status(400).json({ message: "registrationStatus is required" });

    let verificationStatus: "verified" | "failed" | "escalated" = "verified";
    const statusLower = (registrationStatus || "").toLowerCase();
    if (statusLower.includes("suspend") || statusLower.includes("removed") || statusLower.includes("struck")) verificationStatus = "failed";
    else if ((conditions || []).length > 0 || statusLower.includes("caution") || statusLower.includes("condition")) verificationStatus = "escalated";
    else if (statusLower.includes("lapsed") || statusLower.includes("expired")) verificationStatus = "failed";

    let resolvedFilePath: string | null = null;
    if (uploadedFilename) {
      const safeName = path.basename(uploadedFilename);
      const fullPath = path.join(uploadsDir, safeName);
      if (fs.existsSync(fullPath)) {
        resolvedFilePath = fullPath;
      }
    }

    const nmcData = {
      nurseId: param(req, "id"),
      pin: pin.trim().toUpperCase(),
      registeredName: registeredName || "",
      registrationStatus,
      fieldOfPractice: fieldOfPractice || "",
      conditions: conditions || [],
      effectiveDate: effectiveDate || null,
      renewalDate: renewalDate || null,
      status: verificationStatus,
      verifiedAt: new Date(),
      rawResponse: { pdfVerification: true, evidenceFilename: uploadedFilename || null, extractionMethod: extractionMethod === "ai-extracted" ? "ai-extracted" : "parsed" },
    };

    const result = await storage.createNmcVerification(nmcData);

    if (resolvedFilePath && uploadedFilename) {
      const nmcDoc = await storage.createDocument({
        nurseId: param(req, "id"),
        type: "nmc_register_check",
        filename: uploadedFilename,
        originalFilename: originalFilename || "nmc-register-check.pdf",
        filePath: resolvedFilePath,
        fileSize: fs.statSync(resolvedFilePath).size,
        mimeType: "application/pdf",
        uploadedBy: "admin",
      });
      triggerSharePointUpload(nmcDoc.id, nmcDoc.nurseId, resolvedFilePath, originalFilename || "nmc-register-check.pdf", 'nmc');
      triggerEmailNotification(nmcDoc.nurseId, resolvedFilePath, originalFilename || "nmc-register-check.pdf", 'nmc', 'admin', 'application/pdf');
    }

    const state = await storage.getOnboardingState(param(req, "id"));
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.nmc = verificationStatus === "verified" ? "completed" : verificationStatus === "failed" ? "failed" : "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }

    await storage.createAuditLog({
      nurseId: param(req, "id"),
      action: "nmc_verification_created",
      agentName: agentFor(req),
      detail: { pin: nmcData.pin, registrationStatus, registeredName: nmcData.registeredName, status: verificationStatus },
    });

    res.status(201).json(result);
  });

  app.get("/api/candidates/:id/dbs-verification", async (req, res) => {
    const result = await storage.getDbsVerification(param(req, "id"));
    res.json(result || null);
  });

  app.post("/api/candidates/:id/dbs-verification", async (req, res) => {
    const data = { ...req.body, nurseId: param(req, "id") };
    if (typeof data.verifiedAt === "string") data.verifiedAt = new Date(data.verifiedAt);
    if (!data.verifiedAt && data.status === "verified") data.verifiedAt = new Date();
    const result = await storage.createDbsVerification(data);
    const state = await storage.getOnboardingState(param(req, "id"));
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.dbs = result.status === "verified" ? "completed" : result.status === "failed" ? "failed" : "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ nurseId: param(req, "id"), action: "dbs_verification_created", agentName: agentFor(req), detail: { certificateNumber: result.certificateNumber, status: result.status } });
    res.status(201).json(result);
  });

  app.get("/api/dbs/status", (_req, res) => {
    res.json({ configured: isDbsConfigured() });
  });

  app.post("/api/candidates/:id/dbs-live-check", async (req, res) => {
    const { certificateNumber, surname, dateOfBirth } = req.body;
    if (!certificateNumber || !surname || !dateOfBirth) {
      return res.status(400).json({ message: "certificateNumber, surname, and dateOfBirth are required" });
    }

    try {
      const checkResult = await checkDbsCertificate(certificateNumber, surname, dateOfBirth);

      let verificationStatus: "verified" | "failed" | "escalated" = "verified";
      let checkResultText = "No new information";

      if (!checkResult.isCurrent) {
        verificationStatus = "escalated";
        checkResultText = "New information available — manual review required";
      } else if (!checkResult.isClear) {
        verificationStatus = "escalated";
        checkResultText = "Certificate has existing information — review recommended";
      }

      const dbsData = {
        nurseId: param(req, "id"),
        certificateNumber,
        issueDate: checkResult.printDate || null,
        certificateType: "Enhanced with Barred List",
        updateServiceSubscribed: true,
        checkResult: checkResultText,
        status: verificationStatus,
        verifiedAt: new Date(),
      };

      const result = await storage.createDbsVerification(dbsData);
      const state = await storage.getOnboardingState(param(req, "id"));
      if (state) {
        const statuses = (state.stepStatuses as Record<string, string>) || {};
        statuses.dbs = verificationStatus === "verified" ? "completed" : "in_progress";
        await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
      }

      await storage.createAuditLog({
        nurseId: param(req, "id"),
        action: "dbs_verification_created",
        agentName: agentFor(req),
        detail: {
          certificateNumber,
          liveCheck: true,
          isCurrent: checkResult.isCurrent,
          isClear: checkResult.isClear,
          status: verificationStatus,
          apiStatus: checkResult.status,
        },
      });

      res.status(201).json({
        ...result,
        liveCheckResult: {
          isCurrent: checkResult.isCurrent,
          isClear: checkResult.isClear,
          status: checkResult.status,
          forename: checkResult.forename,
          surname: checkResult.surname,
          printDate: checkResult.printDate,
        },
      });
    } catch (err) {
      if (err instanceof DbsUpdateServiceError) {
        const statusMap: Record<string, number> = {
          NOT_CONFIGURED: 503,
          ACCESS_DENIED: 403,
          NOT_FOUND: 404,
          CONNECTION_FAILED: 502,
          INVALID_RESPONSE: 502,
          MALFORMED_DATA: 400,
        };
        return res.status(statusMap[err.code] || 500).json({
          message: err.message,
          code: err.code,
        });
      }
      return res.status(500).json({ message: "Unexpected error during DBS check" });
    }
  });

  app.get("/api/candidates/:id/competency-declarations", async (req, res) => {
    const result = await storage.getCompetencyDeclarations(param(req, "id"));
    res.json(result);
  });

  app.post("/api/candidates/:id/competency-declarations", async (req, res) => {
    const data = { ...req.body, nurseId: param(req, "id") };
    const result = await storage.createCompetencyDeclaration(data);
    const state = await storage.getOnboardingState(param(req, "id"));
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.competency = "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ nurseId: param(req, "id"), action: "competency_declared", agentName: agentFor(req), detail: { domain: result.domain, competency: result.competencyName, level: result.selfAssessedLevel } });
    res.status(201).json(result);
  });

  app.patch("/api/competency-declarations/:id", async (req, res) => {
    const result = await storage.updateCompetencyDeclaration(param(req, "id"), req.body);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  });

  app.get("/api/candidates/:id/documents", async (req, res) => {
    const result = await storage.getDocuments(param(req, "id"));
    res.json(result);
  });

  app.post("/api/candidates/:id/documents", async (req, res) => {
    const data = { ...req.body, nurseId: param(req, "id") };
    const result = await storage.createDocument(data);
    if (data.category === "right_to_work") {
      const state = await storage.getOnboardingState(param(req, "id"));
      if (state) {
        const statuses = (state.stepStatuses as Record<string, string>) || {};
        statuses.right_to_work = "in_progress";
        await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
      }
    }
    await storage.createAuditLog({ nurseId: param(req, "id"), action: "document_uploaded", agentName: agentFor(req), detail: { type: result.type, filename: result.filename } });
    if (result.filePath) {
      triggerSharePointUpload(result.id, result.nurseId, result.filePath, result.originalFilename || result.filename, result.category || 'general');
      triggerEmailNotification(result.nurseId, result.filePath, result.originalFilename || result.filename, result.category || 'general', 'admin', result.mimeType || undefined);
    }
    res.status(201).json(result);
  });

  app.get("/api/candidates/:id/employment-history", async (req, res) => {
    const result = await storage.getEmploymentHistory(param(req, "id"));
    res.json(result);
  });

  app.get("/api/candidates/:id/education-history", async (req, res) => {
    const result = await storage.getEducationHistory(param(req, "id"));
    res.json(result);
  });

  app.get("/api/candidates/:id/references", async (req, res) => {
    const result = await storage.getReferences(param(req, "id"));
    res.json(result);
  });

  app.post("/api/candidates/:id/references/draft-email", async (req, res) => {
    const { refereeName, refereeEmail, refereeOrg, refereeRole, relationshipToCandidate } = req.body;
    if (!refereeName || !refereeEmail) {
      return res.status(400).json({ message: "refereeName and refereeEmail are required" });
    }

    const candidate = await storage.getCandidate(param(req, "id"));
    if (!candidate) return res.status(404).json({ message: "Candidate not found" });

    const candidateName = candidate.fullName || "the candidate";
    const candidateRole = candidate.band ? `Band ${candidate.band} Nurse` : "Nurse";

    try {
      const draft = await draftReferenceRequestEmail({
        candidateName,
        candidateRole,
        candidateSpecialisms: candidate.specialisms as string[] | undefined,
        refereeName,
        refereeRole,
        refereeOrg,
        relationshipToCandidate,
        refereeFormUrl: "[FORM_URL]",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      res.json({ subject: draft.subject, body: draft.body, aiGenerated: true });
    } catch (err: any) {
      console.error("[Reference AI] Draft failed, using fallback template:", err?.message || err);
      const fallbackBody = getDefaultReferenceEmailBody(refereeName, candidateName);
      const fallbackSubject = `Livaware Ltd — Reference Request for ${candidateName}`;
      res.json({ subject: fallbackSubject, body: fallbackBody, aiGenerated: false });
    }
  });

  app.post("/api/candidates/:id/references", async (req, res) => {
    const { emailSubject, emailBody, ...referenceData } = req.body;
    if (emailSubject && emailSubject.length > 500) return res.status(400).json({ message: "Subject too long" });
    if (emailBody && emailBody.length > 10000) return res.status(400).json({ message: "Email body too long" });
    const data = { ...referenceData, nurseId: param(req, "id") };
    const result = await storage.createReference(data);
    const state = await storage.getOnboardingState(param(req, "id"));
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.references = "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }

    let emailSent = false;
    if (result.refereeEmail) {
      try {
        const refereeToken = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await storage.createRefereeToken({ referenceId: result.id, nurseId: param(req, "id"), token: refereeToken, expiresAt });

        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers["host"] || "localhost:5000";
        const refereeFormUrl = `${protocol}://${host}/referee/${refereeToken}`;

        const candidate = await storage.getCandidate(param(req, "id"));
        const candidateName = candidate?.fullName || "the candidate";

        await sendReferenceRequestEmail(result.refereeEmail, result.refereeName, candidateName, refereeFormUrl, expiresAt, emailSubject, emailBody);
        emailSent = true;

        await storage.updateReference(result.id, { outcome: "sent", emailSentAt: new Date() } as any);
        await storage.createAuditLog({ nurseId: param(req, "id"), action: "reference_email_sent", agentName: agentFor(req), detail: { refereeEmail: result.refereeEmail, refereeName: result.refereeName, expiresAt: expiresAt.toISOString() } });
      } catch (err: any) {
        console.error("Failed to send reference request email:", err?.message || err);
        await storage.createAuditLog({ nurseId: param(req, "id"), action: "reference_email_failed", agentName: agentFor(req), detail: { error: err?.message || "Unknown error", refereeEmail: result.refereeEmail } });
      }
    }

    await storage.createAuditLog({ nurseId: param(req, "id"), action: "reference_requested", agentName: agentFor(req), detail: { refereeName: result.refereeName, refereeEmail: result.refereeEmail, emailSent } });
    res.status(201).json({ ...result, emailSent });
  });

  app.patch("/api/references/:id", async (req, res) => {
    const result = await storage.updateReference(param(req, "id"), req.body);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  });

  app.get("/api/candidates/:id/mandatory-training", async (req, res) => {
    const result = await storage.getMandatoryTraining(param(req, "id"));
    res.json(result);
  });

  app.post("/api/candidates/:id/mandatory-training", async (req, res) => {
    const data = { ...req.body, nurseId: param(req, "id") };
    const result = await storage.createMandatoryTraining(data);
    const state = await storage.getOnboardingState(param(req, "id"));
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.training = "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ nurseId: param(req, "id"), action: "training_recorded", agentName: agentFor(req), detail: { module: result.moduleName } });
    res.status(201).json(result);
  });

  app.post("/api/candidates/:id/training-cert-upload", uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      const nurseId = param(req, "id");
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
        uploadedBy: "admin",
      });
      triggerSharePointUpload(doc.id, nurseId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'training_certificate');
      triggerEmailNotification(nurseId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'training_certificate', 'admin', req.file.mimetype);

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

      const state = await storage.getOnboardingState(nurseId);
      if (state) {
        const statuses = (state.stepStatuses as Record<string, string>) || {};
        statuses.training = "in_progress";
        await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
      }

      await storage.createAuditLog({
        nurseId,
        action: "training_cert_uploaded",
        agentName: agentFor(req),
        detail: { matches: parseResult.matches.map(m => m.moduleName), autoRecorded, documentId: doc.id },
      });

      res.json({
        document: doc,
        matches: parseResult.matches,
        autoRecorded,
        totalModulesMatched: parseResult.matches.length,
      });
    } catch (err: any) {
      console.error("[Training Cert Upload] Error:", err.message);
      res.status(500).json({ message: "Failed to parse training certificate" });
    }
  });

  app.post("/api/candidates/:id/smart-document-upload", uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      const nurseId = param(req, "id");
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const supportedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!supportedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Only PDF and image files are accepted" });
      }

      const filePath = `/api/uploads/${req.file.filename}`;
      const absolutePath = path.join(uploadsDir, req.file.filename);
      const moduleNames = MANDATORY_TRAINING_MODULES.map(m => m.name);

      const classification = await classifyDocumentSmart(absolutePath, req.file.mimetype, moduleNames);

      const doc = await storage.createDocument({
        nurseId,
        type: classification.detectedType,
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        filePath,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        category: classification.detectedCategory,
        uploadedBy: "admin",
      });

      triggerSharePointUpload(doc.id, nurseId, filePath, req.file.originalname, classification.detectedCategory);
      triggerEmailNotification(nurseId, filePath, req.file.originalname, classification.detectedCategory, 'admin', req.file.mimetype);

      const autoRecorded: string[] = [];
      if (classification.matchedTrainingModules.length > 0) {
        const existing = await storage.getMandatoryTraining(nurseId);
        for (const moduleName of classification.matchedTrainingModules) {
          const alreadyDone = existing.find((t: any) => t.moduleName === moduleName);
          if (!alreadyDone) {
            const modDef = MANDATORY_TRAINING_MODULES.find(m => m.name === moduleName);
            const renewalFreq = modDef?.renewalFrequency || "Annual";
            await storage.createMandatoryTraining({
              nurseId,
              moduleName,
              renewalFrequency: renewalFreq,
              completedDate: new Date().toISOString().split("T")[0],
              expiryDate: renewalFreq === "Annual"
                ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
                : new Date(Date.now() + 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
              issuingBody: "Auto-detected from document",
              certificateUploaded: true,
              certificateDocumentId: doc.id,
              status: "completed",
            });
            autoRecorded.push(moduleName);
          }
        }
      }

      await storage.createAuditLog({
        nurseId,
        action: "smart_document_uploaded",
        agentName: agentFor(req),
        detail: {
          detectedCategory: classification.detectedCategory,
          detectedType: classification.detectedType,
          matchedTrainingModules: classification.matchedTrainingModules,
          autoRecorded,
          confidence: classification.confidence,
          documentId: doc.id,
        },
      });

      res.json({
        document: doc,
        classification,
        autoRecorded,
      });
    } catch (err: any) {
      console.error("[Smart Document Upload] Error:", err.message);
      res.status(500).json({ message: "Failed to process document" });
    }
  });

  app.patch("/api/mandatory-training/:id", async (req, res) => {
    const result = await storage.updateMandatoryTraining(param(req, "id"), req.body);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  });

  app.get("/api/candidates/:id/health-declaration", async (req, res) => {
    const result = await storage.getHealthDeclaration(param(req, "id"));
    res.json(result || null);
  });

  app.post("/api/candidates/:id/health-declaration", async (req, res) => {
    const data = { ...req.body, nurseId: param(req, "id") };
    const result = await storage.createHealthDeclaration(data);
    const state = await storage.getOnboardingState(param(req, "id"));
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.health = result.completed ? "completed" : "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ nurseId: param(req, "id"), action: "health_declaration_submitted", agentName: agentFor(req), detail: { ohReferral: result.ohReferralRequired } });
    res.status(201).json(result);

    triageHealthDeclarationInBackground(result);
  });

  app.get("/api/candidates/:id/induction-policies", async (req, res) => {
    const result = await storage.getInductionPolicies(param(req, "id"));
    res.json(result);
  });

  app.post("/api/candidates/:id/induction-policies", async (req, res) => {
    const data = { ...req.body, nurseId: param(req, "id") };
    const result = await storage.createInductionPolicy(data);
    const state = await storage.getOnboardingState(param(req, "id"));
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.induction = "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ nurseId: param(req, "id"), action: "policy_acknowledged", agentName: agentFor(req), detail: { policy: result.policyName } });
    res.status(201).json(result);
  });

  app.patch("/api/induction-policies/:id", async (req, res) => {
    const result = await storage.updateInductionPolicy(param(req, "id"), req.body);
    if (!result) return res.status(404).json({ message: "Not found" });
    res.json(result);
  });

  app.get("/api/candidates/:id/professional-indemnity", async (req, res) => {
    const result = await storage.getProfessionalIndemnity(param(req, "id"));
    res.json(result || null);
  });

  app.post("/api/candidates/:id/professional-indemnity", async (req, res) => {
    const data = { ...req.body, nurseId: param(req, "id") };
    const result = await storage.createProfessionalIndemnity(data);
    const state = await storage.getOnboardingState(param(req, "id"));
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.indemnity = result.verified ? "completed" : "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ nurseId: param(req, "id"), action: "indemnity_recorded", agentName: agentFor(req), detail: { provider: result.provider } });
    res.status(201).json(result);
  });

  app.get("/api/candidates/:id/onboarding-state", async (req, res) => {
    let result = await storage.getOnboardingState(param(req, "id"));
    if (!result) {
      const candidate = await storage.getCandidate(param(req, "id"));
      if (candidate) {
        result = await storage.createOnboardingState({
          nurseId: candidate.id,
          currentStep: 1,
          stepStatuses: { identity: "in_progress", nmc: "pending", dbs: "pending", right_to_work: "pending", profile: "pending", competency: "pending", training: "pending", health: "pending", references: "pending", induction: "pending", indemnity: "pending", equal_opportunities: "pending" },
        });
      }
    }
    res.json(result || null);
  });

  app.get("/api/candidates/:id/audit-log", async (req, res) => {
    const result = await storage.getAuditLogs(param(req, "id"));
    res.json(result);
  });

  app.get("/api/audit-logs", async (_req, res) => {
    const result = await storage.getAuditLogs();
    res.json(result);
  });

  app.get("/api/dashboard/stats", async (_req, res) => {
    const stats = await storage.getDashboardStats();
    res.json(stats);
  });

  app.get("/api/dashboard/summary", async (_req, res) => {
    try {
      const { generateDashboardSummary } = await import("../dashboard-ai");
      const summary = await generateDashboardSummary();
      res.json({ summary });
    } catch (err: any) {
      console.error("[Dashboard AI] Summary generation failed:", err?.message || err);
      res.status(500).json({ message: "Failed to generate summary" });
    }
  });

  app.post("/api/upload", uploadLimiter, upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    res.json({
      filename: req.file.filename,
      originalFilename: req.file.originalname,
      filePath: `/api/uploads/${req.file.filename}`,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });
  });

  app.get("/api/uploads/:filename", (req, res) => {
    const filename = param(req, "filename");
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({ message: "Invalid filename" });
    }
    const isAdmin = req.session?.isAuthenticated === true;
    const referer = req.headers.referer || req.headers.referrer || "";
    const isPortalAccess = referer.includes("/portal/") || referer.includes("/referee/");
    if (!isAdmin && !isPortalAccess) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found" });
    res.sendFile(filePath);
  });

  app.post("/api/candidates/:id/magic-link", requireAdmin, magicLinkLimiter, async (req, res) => {
    const candidate = await storage.getCandidate(param(req, "id"));
    if (!candidate) return res.status(404).json({ message: "Candidate not found" });
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const link = await storage.createMagicLink({ nurseId: candidate.id, token, expiresAt, module: "onboard" });

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["host"] || "localhost:5000";
    const portalUrl = `${protocol}://${host}/portal/${link.token}`;

    const stage = (candidate.currentStage === "skills_arcade" ? "skills_arcade" : candidate.currentStage === "onboard" ? "onboard" : "preboard") as "preboard" | "onboard" | "skills_arcade";

    let emailSent = false;
    if (candidate.email) {
      try {
        await sendPortalInviteEmail(candidate.email, candidate.fullName, portalUrl, expiresAt, stage);
        emailSent = true;
        await storage.createAuditLog({ nurseId: candidate.id, action: "portal_invite_emailed", agentName: agentFor(req), detail: { recipientEmail: candidate.email, expiresAt: expiresAt.toISOString() } });
      } catch (err: any) {
        console.error("Failed to send portal invite email:", err?.message || err);
        await storage.createAuditLog({ nurseId: candidate.id, action: "portal_invite_email_failed", agentName: agentFor(req), detail: { error: err?.message || "Unknown error", recipientEmail: candidate.email } });
      }
    }

    await storage.createAuditLog({ nurseId: candidate.id, action: "magic_link_generated", agentName: agentFor(req), detail: { expiresAt: expiresAt.toISOString(), emailSent } });
    res.status(201).json({ token: link.token, expiresAt: link.expiresAt, url: `/portal/${link.token}`, emailSent });
  });

  app.get("/api/candidates/:id/magic-links", async (req, res) => {
    const links = await storage.getMagicLinksForCandidate(param(req, "id"));
    res.json(links);
  });

  app.post("/api/candidates/:id/audit-summary", requireAdmin, async (req, res) => {
    try {
      if (!isAuditSummaryAvailable()) {
        return res.status(503).json({ error: "AI summarisation is not configured" });
      }
      const candidateId = param(req, "id");
      const candidate = await storage.getCandidate(candidateId);
      if (!candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }
      const logs = await storage.getAuditLogs(candidateId);
      const candidateName = candidate.fullName;
      const summary = await generateAuditSummary(candidateName, logs);
      res.json({ summary });
    } catch (error: any) {
      console.error("[Audit Summary] Error generating summary:", error);
      res.status(500).json({ error: "Failed to generate audit summary" });
    }
  });

  app.get("/api/candidates/:id/pdf-report", async (req, res) => {
    try {
      const candidateId = param(req, "id");
      const candidate = await storage.getCandidate(candidateId);
      if (!candidate) return res.status(404).json({ error: "Candidate not found" });

      const pdfBuffer = await generateCandidatePDF(candidateId);
      const safeName = candidate.fullName.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "_");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="NurseOnboard_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf"`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("[PDF Report] Error:", error);
      res.status(500).json({ error: "Failed to generate PDF report" });
    }
  });

  app.post("/api/candidates/:id/compliance-check", requireAdmin, async (req, res) => {
    try {
      if (!isComplianceCheckAvailable()) {
        return res.status(503).json({ error: "AI compliance check is not configured" });
      }
      const nurseIdVal = param(req, "id");
      const candidate = await storage.getCandidate(nurseIdVal);
      if (!candidate) return res.status(404).json({ error: "Candidate not found" });

      const result = await runComplianceCheck(nurseIdVal);
      await storage.createAuditLog({
        nurseId: nurseIdVal,
        action: "compliance_check_generated",
        agentName: agentFor(req),
        detail: { generatedAt: new Date().toISOString() },
      });
      res.json({ result });
    } catch (error: any) {
      console.error("[Compliance Check] Error:", error);
      res.status(500).json({ error: "Failed to run compliance check" });
    }
  });

  app.get("/api/admin/equal-opportunities-report", requireAdmin, async (_req, res) => {
    const aggregate = await storage.getEqualOpportunitiesAggregate();
    res.json(aggregate);
  });
}
