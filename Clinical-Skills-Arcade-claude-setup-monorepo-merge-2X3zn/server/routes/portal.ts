import type { Express } from "express";
import { validatePortalToken } from "../middleware";
import { db } from "../db";
import { portalLinks, nurses, preboardAssessments, onboardingStates, documents, references, competencyDeclarations, mandatoryTraining, healthDeclarations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logAction } from "../services/audit";

export function registerPortalRoutes(app: Express) {
  // Verify portal token and return nurse + module info
  app.get("/api/portal/verify/:token", validatePortalToken, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const link = (req as any).portalLink;

    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });

    // Mark as used
    if (!link.usedAt) {
      await db.update(portalLinks).set({ usedAt: new Date() }).where(eq(portalLinks.id, link.id));
    }

    await logAction(nurseId, "portal", "portal_accessed", "portal", { module: link.module });
    res.json({ nurse, module: link.module, expiresAt: link.expiresAt });
  });

  // Get nurse info via portal token
  app.get("/api/portal/:token/nurse", validatePortalToken, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    res.json(nurse);
  });

  // Update nurse info via portal
  app.patch("/api/portal/:token/nurse", validatePortalToken, async (req, res) => {
    const nurseId = (req as any).nurseId;
    const [updated] = await db.update(nurses).set({ ...req.body, updatedAt: new Date() }).where(eq(nurses.id, nurseId)).returning();
    if (!updated) return res.status(404).json({ message: "Nurse not found" });
    await logAction(nurseId, "portal", "portal_nurse_updated", "portal", req.body);
    res.json(updated);
  });

  // POST /api/portal/:token/preboard - submit preboard assessment via portal
  app.post("/api/portal/:token/preboard", validatePortalToken, async (req, res) => {
    const nurseId = (req as any).nurseId as string;
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });

    const { responses } = req.body;
    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({ message: "responses array is required" });
    }

    const [assessment] = await db.insert(preboardAssessments).values({
      nurseId,
      nurseName: nurse.fullName,
      nurseEmail: nurse.email,
      nursePhone: nurse.phone || null,
      responses,
    }).returning();

    await db.update(nurses).set({ preboardStatus: "completed", updatedAt: new Date() }).where(eq(nurses.id, nurseId));
    await logAction(nurseId, "portal", "preboard_submitted", "portal", { assessmentId: assessment.id });

    res.status(201).json({ id: assessment.id, status: "received" });
  });

  // GET /api/portal/:token/onboard/status - get onboarding progress
  app.get("/api/portal/:token/onboard/status", validatePortalToken, async (req, res) => {
    const nurseId = (req as any).nurseId as string;

    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });

    const [state] = await db.select().from(onboardingStates).where(eq(onboardingStates.nurseId, nurseId));
    const docs = await db.select().from(documents).where(eq(documents.nurseId, nurseId));
    const refs = await db.select().from(references).where(eq(references.nurseId, nurseId));
    const competencies = await db.select().from(competencyDeclarations).where(eq(competencyDeclarations.nurseId, nurseId));
    const training = await db.select().from(mandatoryTraining).where(eq(mandatoryTraining.nurseId, nurseId));
    const [health] = await db.select().from(healthDeclarations).where(eq(healthDeclarations.nurseId, nurseId));

    res.json({
      nurse: { id: nurse.id, fullName: nurse.fullName, currentStage: nurse.currentStage, onboardStatus: nurse.onboardStatus },
      onboardingState: state || null,
      documents: docs,
      references: refs,
      competencyDeclarations: competencies,
      mandatoryTraining: training,
      healthDeclaration: health || null,
    });
  });
}
