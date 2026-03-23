import type { Express } from "express";
import { db } from "../db";
import {
  nurses, onboardingStates, nmcVerifications, dbsVerifications,
  competencyDeclarations, documents, references, mandatoryTraining,
  healthDeclarations, inductionPolicies, professionalIndemnity,
  employmentHistory, educationHistory, refereeTokens,
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { logAction } from "../services/audit";
import { upload } from "../middleware";
import crypto from "crypto";

function agentFor(req: any): string {
  return req.session?.username || "system";
}

export function registerOnboardRoutes(app: Express) {
  // Onboarding State
  app.get("/api/nurses/:id/onboard/status", async (req, res) => {
    const [state] = await db.select().from(onboardingStates).where(eq(onboardingStates.nurseId, req.params.id));
    res.json(state || { nurseId: req.params.id, currentStep: 1, stepStatuses: {} });
  });

  app.post("/api/nurses/:id/onboard/init", async (req, res) => {
    const nurseId = req.params.id;
    const [existing] = await db.select().from(onboardingStates).where(eq(onboardingStates.nurseId, nurseId));
    if (existing) return res.json(existing);
    const [state] = await db.insert(onboardingStates).values({ nurseId, currentStep: 1, stepStatuses: {} }).returning();
    await db.update(nurses).set({ onboardStatus: "in_progress", updatedAt: new Date() }).where(eq(nurses.id, nurseId));
    await logAction(nurseId, "onboard", "onboarding_started", agentFor(req), {});
    res.status(201).json(state);
  });

  app.patch("/api/nurses/:id/onboard/step", async (req, res) => {
    const { currentStep, stepStatuses } = req.body;
    const updates: any = {};
    if (currentStep !== undefined) updates.currentStep = currentStep;
    if (stepStatuses !== undefined) updates.stepStatuses = stepStatuses;
    const [updated] = await db.update(onboardingStates).set(updates).where(eq(onboardingStates.nurseId, req.params.id)).returning();
    if (!updated) return res.status(404).json({ message: "Onboarding state not found" });
    await logAction(req.params.id, "onboard", "step_updated", agentFor(req), updates);
    res.json(updated);
  });

  // NMC
  app.get("/api/nurses/:id/nmc", async (req, res) => {
    const result = await db.select().from(nmcVerifications).where(eq(nmcVerifications.nurseId, req.params.id)).orderBy(desc(nmcVerifications.createdAt));
    res.json(result);
  });
  app.post("/api/nurses/:id/nmc", async (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ message: "NMC PIN required" });
    const [v] = await db.insert(nmcVerifications).values({ nurseId: req.params.id, pin, status: "pending" }).returning();
    await logAction(req.params.id, "onboard", "nmc_verification_submitted", agentFor(req), { pin });
    res.status(201).json(v);
  });

  // DBS
  app.get("/api/nurses/:id/dbs", async (req, res) => {
    const result = await db.select().from(dbsVerifications).where(eq(dbsVerifications.nurseId, req.params.id)).orderBy(desc(dbsVerifications.createdAt));
    res.json(result);
  });
  app.post("/api/nurses/:id/dbs", async (req, res) => {
    const { certificateNumber } = req.body;
    if (!certificateNumber) return res.status(400).json({ message: "DBS certificate number required" });
    const [v] = await db.insert(dbsVerifications).values({ nurseId: req.params.id, certificateNumber, status: "pending" }).returning();
    await logAction(req.params.id, "onboard", "dbs_verification_submitted", agentFor(req), { certificateNumber });
    res.status(201).json(v);
  });

  // Competencies
  app.get("/api/nurses/:id/competencies", async (req, res) => {
    res.json(await db.select().from(competencyDeclarations).where(eq(competencyDeclarations.nurseId, req.params.id)));
  });
  app.post("/api/nurses/:id/competencies", async (req, res) => {
    const { domain, competencyName, selfAssessedLevel, mandatory } = req.body;
    if (!domain || !competencyName) return res.status(400).json({ message: "domain and competencyName required" });
    const [d] = await db.insert(competencyDeclarations).values({
      nurseId: req.params.id, domain, competencyName, selfAssessedLevel: selfAssessedLevel || "not_declared", mandatory: mandatory || false,
    }).returning();
    await logAction(req.params.id, "onboard", "competency_declared", agentFor(req), { domain, competencyName });
    res.status(201).json(d);
  });

  // Documents
  app.get("/api/nurses/:id/documents", async (req, res) => {
    res.json(await db.select().from(documents).where(eq(documents.nurseId, req.params.id)).orderBy(desc(documents.uploadedAt)));
  });
  app.post("/api/nurses/:id/documents", upload.single("file"), async (req, res) => {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "File is required" });
    const nurseId = req.params.id as string;
    const { type, category, expiryDate } = req.body;
    const [doc] = await db.insert(documents).values({
      nurseId, type: type || "general", filename: file.filename,
      originalFilename: file.originalname, filePath: file.path, fileSize: file.size,
      mimeType: file.mimetype, category: category || null, expiryDate: expiryDate || null,
    }).returning();
    await logAction(nurseId, "onboard", "document_uploaded", agentFor(req), { type, filename: file.originalname });
    res.status(201).json(doc);
  });

  // References
  app.get("/api/nurses/:id/references", async (req, res) => {
    res.json(await db.select().from(references).where(eq(references.nurseId, req.params.id)).orderBy(desc(references.createdAt)));
  });
  app.post("/api/nurses/:id/references", async (req, res) => {
    const { refereeName, refereeEmail, refereeOrg, refereeRole, relationshipToCandidate } = req.body;
    if (!refereeName || !refereeEmail) return res.status(400).json({ message: "refereeName and refereeEmail required" });
    const [ref] = await db.insert(references).values({
      nurseId: req.params.id, refereeName, refereeEmail, refereeOrg, refereeRole, relationshipToCandidate,
    }).returning();
    const token = crypto.randomBytes(32).toString("hex");
    await db.insert(refereeTokens).values({
      referenceId: ref.id, nurseId: req.params.id, token,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    await logAction(req.params.id, "onboard", "reference_added", agentFor(req), { refereeName, refereeEmail });
    res.status(201).json(ref);
  });

  // Training
  app.get("/api/nurses/:id/training", async (req, res) => {
    res.json(await db.select().from(mandatoryTraining).where(eq(mandatoryTraining.nurseId, req.params.id)));
  });
  app.post("/api/nurses/:id/training", async (req, res) => {
    const { moduleName, completedDate, expiryDate, issuingBody, renewalFrequency } = req.body;
    if (!moduleName) return res.status(400).json({ message: "moduleName required" });
    const [t] = await db.insert(mandatoryTraining).values({
      nurseId: req.params.id, moduleName, completedDate, expiryDate, issuingBody, renewalFrequency,
    }).returning();
    await logAction(req.params.id, "onboard", "training_recorded", agentFor(req), { moduleName });
    res.status(201).json(t);
  });

  // Health
  app.get("/api/nurses/:id/health", async (req, res) => {
    const [r] = await db.select().from(healthDeclarations).where(eq(healthDeclarations.nurseId, req.params.id));
    res.json(r || null);
  });
  app.post("/api/nurses/:id/health", async (req, res) => {
    const nurseId = req.params.id;
    const [existing] = await db.select().from(healthDeclarations).where(eq(healthDeclarations.nurseId, nurseId));
    if (existing) {
      const [u] = await db.update(healthDeclarations).set({ ...req.body, completed: true }).where(eq(healthDeclarations.nurseId, nurseId)).returning();
      await logAction(nurseId, "onboard", "health_declaration_updated", agentFor(req), {});
      return res.json(u);
    }
    const [d] = await db.insert(healthDeclarations).values({ nurseId, ...req.body, completed: true }).returning();
    await logAction(nurseId, "onboard", "health_declaration_submitted", agentFor(req), {});
    res.status(201).json(d);
  });

  // Policies
  app.get("/api/nurses/:id/policies", async (req, res) => {
    res.json(await db.select().from(inductionPolicies).where(eq(inductionPolicies.nurseId, req.params.id)));
  });
  app.post("/api/nurses/:id/policies/acknowledge", async (req, res) => {
    const { policyName } = req.body;
    if (!policyName) return res.status(400).json({ message: "policyName required" });
    const [p] = await db.insert(inductionPolicies).values({
      nurseId: req.params.id, policyName, acknowledged: true, acknowledgedAt: new Date(),
    }).returning();
    await logAction(req.params.id, "onboard", "policy_acknowledged", agentFor(req), { policyName });
    res.status(201).json(p);
  });

  // Indemnity
  app.get("/api/nurses/:id/indemnity", async (req, res) => {
    res.json(await db.select().from(professionalIndemnity).where(eq(professionalIndemnity.nurseId, req.params.id)));
  });
  app.post("/api/nurses/:id/indemnity", async (req, res) => {
    const [i] = await db.insert(professionalIndemnity).values({ nurseId: req.params.id, ...req.body }).returning();
    await logAction(req.params.id, "onboard", "indemnity_submitted", agentFor(req), {});
    res.status(201).json(i);
  });

  // Employment
  app.get("/api/nurses/:id/employment", async (req, res) => {
    res.json(await db.select().from(employmentHistory).where(eq(employmentHistory.nurseId, req.params.id)).orderBy(desc(employmentHistory.createdAt)));
  });
  app.post("/api/nurses/:id/employment", async (req, res) => {
    const [e] = await db.insert(employmentHistory).values({ nurseId: req.params.id, ...req.body }).returning();
    await logAction(req.params.id, "onboard", "employment_added", agentFor(req), { employer: req.body.employer });
    res.status(201).json(e);
  });

  // Education
  app.get("/api/nurses/:id/education", async (req, res) => {
    res.json(await db.select().from(educationHistory).where(eq(educationHistory.nurseId, req.params.id)).orderBy(desc(educationHistory.createdAt)));
  });
  app.post("/api/nurses/:id/education", async (req, res) => {
    const [e] = await db.insert(educationHistory).values({ nurseId: req.params.id, ...req.body }).returning();
    await logAction(req.params.id, "onboard", "education_added", agentFor(req), { institution: req.body.institution });
    res.status(201).json(e);
  });
}
