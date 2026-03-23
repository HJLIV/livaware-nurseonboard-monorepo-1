import type { Express } from "express";
import { storage } from "../storage";
import { upload, validatePortalToken, uploadLimiter } from "../middleware";
import { sendReferenceRequestEmail } from "../outlook";
import { parseNmcPdfWithFallback, NmcVerificationError } from "../nmc-service";
import { parseTrainingCertificate } from "../training-cert-service";
import { triggerSharePointUpload, triggerEmailNotification } from "../sharepoint-helper";
import { parsePassportImage } from "../passport-parser";
import { analyzeCertificateWithAI, generateCompetencyGuidance } from "../certificate-ai";
import { triageHealthDeclaration, isTriageAvailable } from "../health-triage-ai";
import { analyzeDocumentCompleteness } from "../document-ai";
import { MANDATORY_TRAINING_MODULES } from "@shared/schema";
import type { HealthDeclaration } from "@shared/schema";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { uploadsDir } from "../middleware";

const ANALYZABLE_CATEGORIES = ["dbs", "indemnity", "right_to_work", "identity", "nmc", "health", "competency_evidence"];

function triggerDocumentAnalysis(documentId: string, filePath: string, mimeType: string, category: string, documentType: string) {
  const analyzable = ANALYZABLE_CATEGORIES.includes(category);
  if (!analyzable) return;

  const supportedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
  if (!supportedTypes.includes(mimeType)) return;

  storage.updateDocument(documentId, { aiStatus: "pending" } as any).catch(() => {});

  let resolvedPath = filePath;
  if (filePath.startsWith("/api/uploads/")) {
    resolvedPath = path.join(uploadsDir, path.basename(filePath));
  } else {
    resolvedPath = path.resolve(filePath);
  }

  setImmediate(async () => {
    try {
      const result = await analyzeDocumentCompleteness(resolvedPath, mimeType, category, documentType);
      await storage.updateDocument(documentId, {
        aiStatus: result.status,
        aiIssues: result.issues,
        aiAnalyzedAt: new Date(),
      } as any);
      console.log(`[Document AI] Analyzed doc ${documentId}: ${result.status} (${result.issues.length} issues)`);
    } catch (err: any) {
      console.error(`[Document AI] Failed to analyze doc ${documentId}:`, err.message);
      await storage.updateDocument(documentId, {
        aiStatus: null,
        aiIssues: null,
        aiAnalyzedAt: null,
      } as any).catch(() => {});
    }
  });
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

export function registerPortalRoutes(app: Express) {
  app.get("/api/portal/verify/:token", async (req, res) => {
    const link = await storage.getMagicLinkByToken(req.params.token);
    if (!link) return res.status(404).json({ message: "Invalid portal link" });
    if (new Date() > link.expiresAt) return res.status(410).json({ message: "Portal link has expired" });
    const candidate = await storage.getCandidate(link.candidateId);
    if (!candidate) return res.status(404).json({ message: "Candidate not found" });
    if (!link.usedAt) {
      await storage.markMagicLinkUsed(link.id);
      await storage.createAuditLog({ candidateId: candidate.id, action: "portal_accessed", agentName: "nurse_portal", detail: {} });
    }
    res.json({ candidate, token: link.token });
  });

  app.get("/api/portal/:token/candidate", validatePortalToken, async (req, res) => {
    const candidate = await storage.getCandidate((req as any).candidateId);
    res.json(candidate);
  });

  app.patch("/api/portal/:token/candidate", validatePortalToken, async (req, res) => {
    const candidateId = (req as any).candidateId;
    const candidate = await storage.updateCandidate(candidateId, req.body);
    const state = await storage.getOnboardingState(candidateId);
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      if (req.body.fullName || req.body.email || req.body.phone || req.body.address) statuses.identity = "in_progress";
      if (req.body.nmcPin) statuses.nmc = "in_progress";
      if (req.body.dbsNumber) statuses.dbs = "in_progress";
      if (req.body.currentEmployer || req.body.yearsQualified || req.body.specialisms) statuses.profile = "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ candidateId, action: "portal_candidate_updated", agentName: "nurse_portal", detail: { fields: Object.keys(req.body) } });
    res.json(candidate);
  });

  app.get("/api/portal/:token/onboarding-state", validatePortalToken, async (req, res) => {
    const state = await storage.getOnboardingState((req as any).candidateId);
    res.json(state || null);
  });

  app.get("/api/portal/:token/employment-history", validatePortalToken, async (req, res) => {
    const result = await storage.getEmploymentHistory((req as any).candidateId);
    res.json(result);
  });

  app.post("/api/portal/:token/employment-history", validatePortalToken, async (req, res) => {
    const candidateId = (req as any).candidateId;
    const { employer, jobTitle, startDate } = req.body;
    if (!employer || !jobTitle || !startDate) {
      return res.status(400).json({ message: "Employer, job title, and start date are required" });
    }
    const data = { ...req.body, candidateId };
    const result = await storage.createEmploymentHistory(data);
    const state = await storage.getOnboardingState(candidateId);
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.profile = "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ candidateId, action: "portal_employment_added", agentName: "nurse_portal", detail: { employer: result.employer, jobTitle: result.jobTitle } });
    res.status(201).json(result);
  });

  app.delete("/api/portal/:token/employment-history/:id", validatePortalToken, async (req, res) => {
    const candidateId = (req as any).candidateId;
    const deleted = await storage.deleteEmploymentHistory(req.params.id, candidateId);
    if (!deleted) return res.status(404).json({ message: "Entry not found" });
    await storage.createAuditLog({ candidateId, action: "portal_employment_deleted", agentName: "nurse_portal", detail: { id: req.params.id } });
    res.json({ success: true });
  });

  app.get("/api/portal/:token/education-history", validatePortalToken, async (req, res) => {
    const result = await storage.getEducationHistory((req as any).candidateId);
    res.json(result);
  });

  app.post("/api/portal/:token/education-history", validatePortalToken, async (req, res) => {
    const candidateId = (req as any).candidateId;
    const { institution, qualification } = req.body;
    if (!institution || !qualification) {
      return res.status(400).json({ message: "Institution and qualification are required" });
    }
    const data = { ...req.body, candidateId };
    const result = await storage.createEducationHistory(data);
    const state = await storage.getOnboardingState(candidateId);
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.profile = "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ candidateId, action: "portal_education_added", agentName: "nurse_portal", detail: { institution: result.institution, qualification: result.qualification } });
    res.status(201).json(result);
  });

  app.delete("/api/portal/:token/education-history/:id", validatePortalToken, async (req, res) => {
    const candidateId = (req as any).candidateId;
    const deleted = await storage.deleteEducationHistory(req.params.id, candidateId);
    if (!deleted) return res.status(404).json({ message: "Entry not found" });
    await storage.createAuditLog({ candidateId, action: "portal_education_deleted", agentName: "nurse_portal", detail: { id: req.params.id } });
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

  app.get("/api/portal/:token/documents", validatePortalToken, async (req, res) => {
    const docs = await storage.getDocuments((req as any).candidateId);
    res.json(docs);
  });

  app.post("/api/portal/:token/documents", validatePortalToken, async (req, res) => {
    const candidateId = (req as any).candidateId;
    const data = { ...req.body, candidateId, uploadedBy: "nurse" };
    const result = await storage.createDocument(data);
    const state = await storage.getOnboardingState(candidateId);
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      if (data.category === "right_to_work") statuses.right_to_work = "in_progress";
      if (data.category === "identity") statuses.identity = "in_progress";
      if (data.category === "dbs") statuses.dbs = "in_progress";
      if (data.category === "indemnity") statuses.indemnity = "in_progress";
      if (data.category === "profile") statuses.profile = "in_progress";
      if (data.category === "competency_evidence") statuses.competency = "in_progress";
      if (data.category === "training_certificate") statuses.training = "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ candidateId, action: "portal_document_uploaded", agentName: "nurse_portal", detail: { type: result.type, category: data.category, filename: result.filename } });
    if (result.filePath) {
      triggerSharePointUpload(result.id, result.candidateId, result.filePath, result.originalFilename || result.filename, result.category || 'general');
      triggerEmailNotification(result.candidateId, result.filePath, result.originalFilename || result.filename, result.category || 'general', 'nurse', result.mimeType || undefined);
      triggerDocumentAnalysis(result.id, result.filePath, result.mimeType || '', data.category || '', result.type);
    }
    res.status(201).json(result);
  });

  app.get("/api/portal/:token/competency-declarations", validatePortalToken, async (req, res) => {
    const result = await storage.getCompetencyDeclarations((req as any).candidateId);
    res.json(result);
  });

  app.post("/api/portal/:token/competency-declarations", validatePortalToken, async (req, res) => {
    const candidateId = (req as any).candidateId;
    const data = { ...req.body, candidateId };
    const result = await storage.createCompetencyDeclaration(data);
    const state = await storage.getOnboardingState(candidateId);
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.competency = "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ candidateId, action: "portal_competency_declared", agentName: "nurse_portal", detail: { domain: result.domain, competency: result.competencyName, level: result.selfAssessedLevel } });
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
    const result = await storage.getMandatoryTraining((req as any).candidateId);
    res.json(result);
  });

  app.post("/api/portal/:token/mandatory-training", validatePortalToken, async (req, res) => {
    const candidateId = (req as any).candidateId;
    const data = { ...req.body, candidateId };
    const result = await storage.createMandatoryTraining(data);
    const state = await storage.getOnboardingState(candidateId);
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.training = "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ candidateId, action: "portal_training_recorded", agentName: "nurse_portal", detail: { module: result.moduleName, certificateDocumentId: result.certificateDocumentId } });
    res.status(201).json(result);
  });

  app.post("/api/portal/:token/training-cert-upload", validatePortalToken, uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      const candidateId = (req as any).candidateId;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      if (req.file.mimetype !== "application/pdf") return res.status(400).json({ message: "Only PDF files are accepted" });

      const buffer = fs.readFileSync(req.file.path);
      const parseResult = await parseTrainingCertificate(buffer);

      const doc = await storage.createDocument({
        candidateId,
        type: "Training Certificate Bundle",
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        filePath: `/api/uploads/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        category: "training_certificate",
        uploadedBy: "nurse",
      });
      triggerSharePointUpload(doc.id, candidateId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'training_certificate');
      triggerEmailNotification(candidateId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'training_certificate', 'nurse', req.file.mimetype);

      const autoRecorded: string[] = [];
      for (const match of parseResult.matches) {
        const existing = await storage.getMandatoryTraining(candidateId);
        const alreadyDone = existing.find((t: any) => t.moduleName === match.moduleName);
        if (!alreadyDone) {
          const mod = { name: match.moduleName, renewalFrequency: match.renewalFrequency };
          await storage.createMandatoryTraining({
            candidateId,
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

      const state = await storage.getOnboardingState(candidateId);
      if (state) {
        const statuses = (state.stepStatuses as Record<string, string>) || {};
        statuses.training = "in_progress";
        await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
      }

      await storage.createAuditLog({
        candidateId,
        action: "portal_training_cert_uploaded",
        agentName: "nurse_portal",
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

  app.post("/api/portal/:token/training-cert-ai", validatePortalToken, uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      const candidateId = (req as any).candidateId;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Please upload a PDF or image of your training certificate" });
      }

      const doc = await storage.createDocument({
        candidateId,
        type: "Training Certificate",
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        filePath: `/api/uploads/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        category: "training_certificate",
        uploadedBy: "nurse",
      });
      triggerSharePointUpload(doc.id, candidateId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'training_certificate');
      triggerEmailNotification(candidateId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'training_certificate', 'nurse', req.file.mimetype);

      const aiResult = await analyzeCertificateWithAI(req.file.path, req.file.mimetype);

      const autoRecorded: string[] = [];
      const safeDate = (dateStr: string | null): string | null => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
      };

      for (const mod of aiResult.modules) {
        if (!mod.matchedModule) continue;
        const existing = await storage.getMandatoryTraining(candidateId);
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
          candidateId,
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

      const state = await storage.getOnboardingState(candidateId);
      if (state) {
        const statuses = (state.stepStatuses as Record<string, string>) || {};
        statuses.training = "in_progress";
        await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
      }

      await storage.createAuditLog({
        candidateId,
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
      res.status(500).json({ message: "Failed to analyze certificate with AI. Please try again or enter details manually." });
    }
  });

  app.post("/api/portal/:token/nmc-parse-pdf", validatePortalToken, uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      const candidateId = (req as any).candidateId;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      if (req.file.mimetype !== "application/pdf") return res.status(400).json({ message: "Only PDF files are accepted" });

      const buffer = fs.readFileSync(req.file.path);
      const result = await parseNmcPdfWithFallback(buffer);

      const doc = await storage.createDocument({
        candidateId,
        type: "NMC Register PDF",
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        filePath: `/api/uploads/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        category: "nmc",
        uploadedBy: "nurse",
      });
      triggerSharePointUpload(doc.id, candidateId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'nmc');
      triggerEmailNotification(candidateId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'nmc', 'nurse', req.file.mimetype);

      await storage.createAuditLog({
        candidateId,
        action: "portal_nmc_pdf_parsed",
        agentName: "nurse_portal",
        detail: { registeredName: result.registeredName, status: result.registrationStatus, extractionMethod: result.extractionMethod },
      });

      res.json({
        ...result,
        uploadedFilename: req.file.filename,
        originalFilename: req.file.originalname,
        documentId: doc.id,
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

  app.post("/api/portal/:token/passport-parse", validatePortalToken, uploadLimiter, upload.single("file"), async (req, res) => {
    try {
      const candidateId = (req as any).candidateId;
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Please upload an image (JPEG, PNG, or WebP) of your passport photo page" });
      }

      const result = await parsePassportImage(req.file.path);

      const doc = await storage.createDocument({
        candidateId,
        type: "Passport",
        filename: req.file.filename,
        originalFilename: req.file.originalname,
        filePath: `/api/uploads/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        category: "identity",
        uploadedBy: "nurse",
      });
      triggerSharePointUpload(doc.id, candidateId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'identity');
      triggerEmailNotification(candidateId, `/api/uploads/${req.file.filename}`, req.file.originalname, 'identity', 'nurse', req.file.mimetype);

      if (result.passportNumber) {
        await storage.updateCandidate(candidateId, { passportNumber: result.passportNumber });
      }

      await storage.createAuditLog({
        candidateId,
        action: "passport_uploaded",
        agentName: "nurse_portal",
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
    const result = await storage.getHealthDeclaration((req as any).candidateId);
    res.json(result || null);
  });

  app.post("/api/portal/:token/health-declaration", validatePortalToken, async (req, res) => {
    const candidateId = (req as any).candidateId;
    const data = { ...req.body, candidateId };
    const result = await storage.createHealthDeclaration(data);
    const state = await storage.getOnboardingState(candidateId);
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.health = result.completed ? "completed" : "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ candidateId, action: "portal_health_declared", agentName: "nurse_portal", detail: { ohReferral: result.ohReferralRequired } });
    res.status(201).json(result);

    triageHealthDeclarationInBackground(result);
  });

  app.get("/api/portal/:token/references", validatePortalToken, async (req, res) => {
    const result = await storage.getReferences((req as any).candidateId);
    res.json(result);
  });

  app.post("/api/portal/:token/references", validatePortalToken, async (req, res) => {
    const candidateId = (req as any).candidateId;
    const data = { ...req.body, candidateId };
    const result = await storage.createReference(data);
    const state = await storage.getOnboardingState(candidateId);
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
        await storage.createRefereeToken({ referenceId: result.id, candidateId, token: refereeToken, expiresAt });

        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers["host"] || "localhost:5000";
        const refereeFormUrl = `${protocol}://${host}/referee/${refereeToken}`;

        const candidate = await storage.getCandidate(candidateId);
        const candidateName = candidate?.fullName || "the candidate";

        await sendReferenceRequestEmail(result.refereeEmail, result.refereeName, candidateName, refereeFormUrl, expiresAt);
        emailSent = true;

        await storage.updateReference(result.id, { outcome: "sent", emailSentAt: new Date() } as any);
        await storage.createAuditLog({ candidateId, action: "reference_email_sent", agentName: "nurse_portal", detail: { refereeEmail: result.refereeEmail, refereeName: result.refereeName } });
      } catch (err: any) {
        console.error("Failed to send reference request email:", err?.message || err);
        await storage.createAuditLog({ candidateId, action: "reference_email_failed", agentName: "nurse_portal", detail: { error: err?.message || "Unknown error", refereeEmail: result.refereeEmail } });
      }
    }

    await storage.createAuditLog({ candidateId, action: "portal_reference_added", agentName: "nurse_portal", detail: { refereeName: result.refereeName, emailSent } });
    res.status(201).json({ ...result, emailSent });
  });

  app.get("/api/portal/:token/induction-policies", validatePortalToken, async (req, res) => {
    const result = await storage.getInductionPolicies((req as any).candidateId);
    res.json(result);
  });

  app.post("/api/portal/:token/induction-policies", validatePortalToken, async (req, res) => {
    const candidateId = (req as any).candidateId;
    const data = { ...req.body, candidateId };
    const result = await storage.createInductionPolicy(data);
    const state = await storage.getOnboardingState(candidateId);
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.induction = "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ candidateId, action: "portal_policy_acknowledged", agentName: "nurse_portal", detail: { policy: result.policyName } });
    res.status(201).json(result);
  });

  app.get("/api/portal/:token/professional-indemnity", validatePortalToken, async (req, res) => {
    const result = await storage.getProfessionalIndemnity((req as any).candidateId);
    res.json(result || null);
  });

  app.post("/api/portal/:token/professional-indemnity", validatePortalToken, async (req, res) => {
    const candidateId = (req as any).candidateId;
    const data = { ...req.body, candidateId };
    const result = await storage.createProfessionalIndemnity(data);
    const state = await storage.getOnboardingState(candidateId);
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.indemnity = result.verified ? "completed" : "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ candidateId, action: "portal_indemnity_recorded", agentName: "nurse_portal", detail: { provider: result.provider } });
    res.status(201).json(result);
  });

  app.get("/api/portal/:token/dbs-verification", validatePortalToken, async (req, res) => {
    const result = await storage.getDbsVerification((req as any).candidateId);
    res.json(result || null);
  });

  app.post("/api/portal/:token/dbs-verification", validatePortalToken, async (req, res) => {
    const candidateId = (req as any).candidateId;
    const { certificateNumber, issueDate, certificateType, updateServiceSubscribed } = req.body;
    if (!certificateNumber) {
      return res.status(400).json({ message: "certificateNumber is required" });
    }
    const data = {
      candidateId,
      certificateNumber,
      issueDate: issueDate || null,
      certificateType: certificateType || null,
      updateServiceSubscribed: !!updateServiceSubscribed,
      status: "pending" as const,
    };
    const result = await storage.createDbsVerification(data);
    const state = await storage.getOnboardingState(candidateId);
    if (state) {
      const statuses = (state.stepStatuses as Record<string, string>) || {};
      statuses.dbs = result.status === "verified" ? "completed" : result.status === "failed" ? "failed" : "in_progress";
      await storage.updateOnboardingState(state.id, { stepStatuses: statuses });
    }
    await storage.createAuditLog({ candidateId, action: "portal_dbs_recorded", agentName: "nurse_portal", detail: { certificateNumber: result.certificateNumber } });
    res.status(201).json(result);
  });
}
