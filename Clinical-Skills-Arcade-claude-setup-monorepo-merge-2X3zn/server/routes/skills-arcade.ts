import type { Express } from "express";
import { db } from "../db";
import {
  arcadeModules, moduleVersions, scenarios, assignments, attempts,
  remediationCases, remediationNotes, clearances, arcadeUsers
} from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { logAction } from "../services/audit";

export function registerSkillsArcadeRoutes(app: Express) {
  // === Modules ===
  app.get("/api/arcade/modules", async (_req, res) => {
    const result = await db.select().from(arcadeModules);
    res.json(result);
  });

  app.post("/api/arcade/modules", async (req, res) => {
    const [result] = await db.insert(arcadeModules).values(req.body).returning();
    res.status(201).json(result);
  });

  app.get("/api/arcade/modules/:id", async (req, res) => {
    const [result] = await db.select().from(arcadeModules).where(eq(arcadeModules.id, req.params.id));
    if (!result) return res.status(404).json({ message: "Module not found" });
    res.json(result);
  });

  // === Module Versions ===
  app.get("/api/arcade/modules/:id/versions", async (req, res) => {
    const result = await db.select().from(moduleVersions).where(eq(moduleVersions.moduleId, req.params.id)).orderBy(desc(moduleVersions.publishedAt));
    res.json(result);
  });

  app.post("/api/arcade/modules/:id/versions", async (req, res) => {
    const [result] = await db.insert(moduleVersions).values({ ...req.body, moduleId: req.params.id }).returning();
    res.status(201).json(result);
  });

  // === Scenarios ===
  app.get("/api/arcade/versions/:versionId/scenarios", async (req, res) => {
    const result = await db.select().from(scenarios).where(eq(scenarios.moduleVersionId, req.params.versionId));
    res.json(result);
  });

  app.post("/api/arcade/scenarios", async (req, res) => {
    const [result] = await db.insert(scenarios).values(req.body).returning();
    res.status(201).json(result);
  });

  // === Assignments ===
  app.get("/api/arcade/assignments", async (req, res) => {
    const userId = req.query.userId as string;
    if (userId) {
      const result = await db.select().from(assignments).where(eq(assignments.userId, userId));
      return res.json(result);
    }
    const result = await db.select().from(assignments);
    res.json(result);
  });

  app.post("/api/arcade/assignments", async (req, res) => {
    const [result] = await db.insert(assignments).values(req.body).returning();
    res.status(201).json(result);
  });

  // === Attempts ===
  app.get("/api/arcade/attempts", async (req, res) => {
    const userId = req.query.userId as string;
    if (userId) {
      const result = await db.select().from(attempts).where(eq(attempts.userId, userId)).orderBy(desc(attempts.startedAt));
      return res.json(result);
    }
    const result = await db.select().from(attempts).orderBy(desc(attempts.startedAt));
    res.json(result);
  });

  app.post("/api/arcade/attempts", async (req, res) => {
    const [result] = await db.insert(attempts).values(req.body).returning();
    if (req.body.nurseId) {
      await logAction(req.body.nurseId, "skills_arcade", "scenario_attempted", "system", { attemptId: result.id, scenarioId: result.scenarioId });
    }
    res.status(201).json(result);
  });

  app.patch("/api/arcade/attempts/:id", async (req, res) => {
    const [result] = await db.update(attempts).set(req.body).where(eq(attempts.id, req.params.id)).returning();
    if (!result) return res.status(404).json({ message: "Attempt not found" });
    res.json(result);
  });

  // === Remediation ===
  app.get("/api/arcade/remediation", async (_req, res) => {
    const result = await db.select().from(remediationCases).orderBy(desc(remediationCases.lockedAt));
    res.json(result);
  });

  app.post("/api/arcade/remediation", async (req, res) => {
    const [result] = await db.insert(remediationCases).values(req.body).returning();
    res.status(201).json(result);
  });

  app.get("/api/arcade/remediation/:id/notes", async (req, res) => {
    const result = await db.select().from(remediationNotes).where(eq(remediationNotes.remediationCaseId, req.params.id)).orderBy(desc(remediationNotes.createdAt));
    res.json(result);
  });

  app.post("/api/arcade/remediation/:id/notes", async (req, res) => {
    const [result] = await db.insert(remediationNotes).values({ ...req.body, remediationCaseId: req.params.id }).returning();
    res.status(201).json(result);
  });

  // === Clearances ===
  app.get("/api/arcade/clearances", async (_req, res) => {
    const result = await db.select().from(clearances);
    res.json(result);
  });

  // === Arcade Users ===
  app.get("/api/arcade/users", async (_req, res) => {
    const result = await db.select().from(arcadeUsers);
    res.json(result);
  });
}
