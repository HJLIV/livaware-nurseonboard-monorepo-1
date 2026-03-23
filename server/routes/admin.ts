import type { Express, Request } from "express";
import { db } from "../db";
import { nurses, portalLinks, auditLogs, preboardAssessments, nmcVerifications, dbsVerifications } from "@shared/schema";
import { eq, desc, and, gt } from "drizzle-orm";
import { logAction } from "../services/audit";
import crypto from "crypto";

function agentFor(req: Request): string {
  return req.session?.username || "system";
}

export function registerNurseRoutes(app: Express) {
  app.get("/api/nurses", async (_req, res) => {
    const result = await db.select().from(nurses).orderBy(desc(nurses.createdAt));
    res.json(result);
  });

  app.post("/api/nurses", async (req, res) => {
    const { fullName, firstName, lastName, email, phone, dateOfBirth, address } = req.body;
    const name = fullName || (firstName && lastName ? `${firstName} ${lastName}`.trim() : firstName || "");
    if (!name || !email) return res.status(400).json({ message: "Name and email are required" });

    const [nurse] = await db.insert(nurses).values({
      fullName: name, email, phone, dateOfBirth, address,
      currentStage: "preboard",
      preboardStatus: "not_started",
      onboardStatus: "not_started",
      arcadeStatus: "not_started",
    }).returning();

    await logAction(nurse.id, "admin", "nurse_created", agentFor(req), { name, email });

    let portalUrl = null;
    try {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await db.insert(portalLinks).values({
        nurseId: nurse.id, token, module: "preboard", expiresAt, createdBy: agentFor(req),
      });
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["host"] || "localhost:5000";
      portalUrl = `${protocol}://${host}/portal/${token}`;
      await logAction(nurse.id, "admin", "portal_link_generated", agentFor(req), { module: "preboard", expiresAt: expiresAt.toISOString() });
    } catch (e) {
      console.error("Failed to generate preboard link:", e);
    }

    res.status(201).json({ ...nurse, preboardInviteUrl: portalUrl });
  });

  app.get("/api/nurses/:id", async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    res.json(nurse);
  });

  app.patch("/api/nurses/:id", async (req, res) => {
    const [updated] = await db.update(nurses).set({ ...req.body, updatedAt: new Date() }).where(eq(nurses.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ message: "Nurse not found" });
    await logAction(updated.id, "admin", "nurse_updated", agentFor(req), req.body);
    res.json(updated);
  });

  app.delete("/api/nurses/:id", async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    await db.delete(portalLinks).where(eq(portalLinks.nurseId, req.params.id));
    await db.delete(auditLogs).where(eq(auditLogs.nurseId, req.params.id));
    await db.delete(nurses).where(eq(nurses.id, req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/nurses/:id/portal-link", async (req, res) => {
    const { module } = req.body;
    if (!module || !["preboard", "onboard", "skills_arcade", "hub"].includes(module)) {
      return res.status(400).json({ message: "Valid module required: preboard, onboard, skills_arcade, hub" });
    }
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [link] = await db.insert(portalLinks).values({
      nurseId: nurse.id, token, module, expiresAt, createdBy: agentFor(req),
    }).returning();

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["host"] || "localhost:5000";
    const portalUrl = `${protocol}://${host}/portal/${link.token}`;

    await logAction(nurse.id, "admin", "portal_link_generated", agentFor(req), { module, expiresAt: expiresAt.toISOString() });
    res.status(201).json({ token: link.token, expiresAt: link.expiresAt, url: portalUrl, module });
  });

  app.get("/api/nurses/:id/portal-links", async (req, res) => {
    const links = await db.select().from(portalLinks).where(eq(portalLinks.nurseId, req.params.id)).orderBy(desc(portalLinks.createdAt));
    res.json(links);
  });

  app.get("/api/nurses/:id/audit-log", async (req, res) => {
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.nurseId, req.params.id)).orderBy(desc(auditLogs.timestamp));
    res.json(logs);
  });

  app.get("/api/nurses/:id/preboard", async (req, res) => {
    const results = await db.select().from(preboardAssessments).where(eq(preboardAssessments.nurseId, req.params.id));
    res.json(results.map(r => ({
      id: r.id,
      status: r.aiAnalysis ? "completed" : "pending",
      score: r.aiAnalysis ? extractScore(r.aiAnalysis) : undefined,
      aiAnalysis: r.aiAnalysis,
      completedAt: r.completedAt?.toISOString(),
    })));
  });

  app.get("/api/nurses/:id/onboard", async (req, res) => {
    const [nmc] = await db.select().from(nmcVerifications).where(eq(nmcVerifications.nurseId, req.params.id)).orderBy(desc(nmcVerifications.createdAt)).limit(1);
    const [dbs] = await db.select().from(dbsVerifications).where(eq(dbsVerifications.nurseId, req.params.id)).orderBy(desc(dbsVerifications.createdAt)).limit(1);

    const steps = [
      { id: 1, name: "Identity Verification", status: "pending" as string, completedAt: undefined as string | undefined },
      { id: 2, name: "NMC PIN Verification", status: nmc ? (nmc.status === "verified" ? "completed" : nmc.status) : "pending", completedAt: nmc?.verifiedAt?.toISOString() },
      { id: 3, name: "DBS Check", status: dbs ? (dbs.status === "verified" ? "completed" : dbs.status) : "pending", completedAt: dbs?.verifiedAt?.toISOString() },
      { id: 4, name: "Competency Declarations", status: "pending" },
      { id: 5, name: "Mandatory Training", status: "pending" },
      { id: 6, name: "Health Declaration", status: "pending" },
      { id: 7, name: "References", status: "pending" },
      { id: 8, name: "Induction Policies", status: "pending" },
    ];
    res.json(steps);
  });

  app.get("/api/nurses/:id/arcade", async (req, res) => {
    res.json([]);
  });

  app.post("/api/nurses/:id/advance-stage", async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });

    const stageOrder = ["preboard", "onboard", "skills_arcade", "completed"] as const;
    const currentIdx = stageOrder.indexOf(nurse.currentStage as any);
    if (currentIdx === -1 || currentIdx >= stageOrder.length - 1) {
      return res.status(400).json({ message: "Nurse is already at the final stage" });
    }

    const nextStage = stageOrder[currentIdx + 1];
    const statusUpdates: Record<string, string> = {};
    if (nurse.currentStage === "preboard") statusUpdates.preboardStatus = "completed";
    if (nurse.currentStage === "onboard") statusUpdates.onboardStatus = "cleared";

    const [updated] = await db.update(nurses).set({
      currentStage: nextStage, ...statusUpdates, updatedAt: new Date(),
    }).where(eq(nurses.id, req.params.id)).returning();

    await logAction(nurse.id, "admin", "stage_advanced", agentFor(req), { from: nurse.currentStage, to: nextStage });
    res.json(updated);
  });

  app.get("/api/portal/:token", async (req, res) => {
    try {
      const [link] = await db.select().from(portalLinks).where(
        and(eq(portalLinks.token, req.params.token), gt(portalLinks.expiresAt, new Date()))
      );
      if (!link) return res.status(404).json({ message: "Invalid or expired portal link" });

      const [nurse] = await db.select().from(nurses).where(eq(nurses.id, link.nurseId));
      if (!nurse) return res.status(404).json({ message: "Nurse not found" });

      if (!link.usedAt) {
        await db.update(portalLinks).set({ usedAt: new Date() }).where(eq(portalLinks.id, link.id));
        await logAction(nurse.id, "portal", "portal_accessed", "nurse_portal", { module: link.module });
      }

      const preboardDone = nurse.preboardStatus === "completed" || nurse.currentStage !== "preboard";
      const onboardDone = nurse.onboardStatus === "cleared" || nurse.currentStage === "skills_arcade" || nurse.currentStage === "completed";
      const arcadeDone = nurse.arcadeStatus === "competent" || nurse.currentStage === "completed";

      const journey = {
        preboard: {
          status: preboardDone ? "completed" : nurse.currentStage === "preboard" ? "in_progress" : "not_started",
          actionUrl: !preboardDone && nurse.currentStage === "preboard" ? `/preboard/assessment?token=${link.token}` : undefined,
          label: preboardDone ? "Completed" : "Start Assessment",
        },
        onboard: {
          status: onboardDone ? "completed" : nurse.currentStage === "onboard" ? "in_progress" : "not_started",
          actionUrl: !onboardDone && nurse.currentStage === "onboard" ? `/portal/page/${link.token}` : undefined,
          label: onboardDone ? "Completed" : "Continue Onboarding",
        },
        skillsArcade: {
          status: arcadeDone ? "completed" : nurse.currentStage === "skills_arcade" ? "in_progress" : "not_started",
          actionUrl: !arcadeDone && nurse.currentStage === "skills_arcade" ? `/arcade?token=${link.token}` : undefined,
          label: arcadeDone ? "Completed" : "Start Skills Arcade",
        },
      };

      res.json({
        nurse: {
          id: nurse.id,
          fullName: nurse.fullName,
          email: nurse.email,
          currentStage: nurse.currentStage,
        },
        journey,
        token: link.token,
      });
    } catch (err) {
      console.error("Portal token error:", err);
      res.status(500).json({ message: "Failed to load portal" });
    }
  });
}

function extractScore(analysis: string): number | undefined {
  const match = analysis.match(/(\d{1,3})(?:\s*\/\s*100|\s*%)/);
  return match ? parseInt(match[1], 10) : undefined;
}
