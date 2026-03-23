import type { Express } from "express";
import { db } from "../db";
import { preboardAssessments } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { logAction } from "../services/audit";

export function registerPreboardRoutes(app: Express) {
  app.get("/api/preboard/assessments", async (_req, res) => {
    const result = await db.select().from(preboardAssessments).orderBy(desc(preboardAssessments.completedAt));
    res.json(result);
  });

  app.get("/api/preboard/assessments/:id", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid assessment ID" });
    const [assessment] = await db.select().from(preboardAssessments).where(eq(preboardAssessments.id, id));
    if (!assessment) return res.status(404).json({ message: "Assessment not found" });
    res.json(assessment);
  });

  app.post("/api/assessments", async (req, res) => {
    const { nurseName, nurseEmail, nursePhone, responses } = req.body;
    if (!nurseName || !nurseEmail || !responses || !Array.isArray(responses)) {
      return res.status(400).json({ message: "nurseName, nurseEmail, and responses are required" });
    }
    const [assessment] = await db.insert(preboardAssessments).values({
      nurseName, nurseEmail, nursePhone: nursePhone || null, responses,
    }).returning();

    await logAction(null, "preboard", "preboard_completed_standalone", "system", { assessmentId: assessment.id, nurseEmail });
    res.status(201).json(assessment);
  });

  app.patch("/api/preboard/assessments/:id/analysis", async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid assessment ID" });
    const { aiAnalysis } = req.body;
    const [updated] = await db.update(preboardAssessments).set({ aiAnalysis }).where(eq(preboardAssessments.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Assessment not found" });
    res.json(updated);
  });

  app.get("/api/nurses/:id/preboard", async (req, res) => {
    const assessments = await db.select().from(preboardAssessments)
      .where(eq(preboardAssessments.nurseId, req.params.id))
      .orderBy(desc(preboardAssessments.completedAt));
    res.json(assessments);
  });
}
