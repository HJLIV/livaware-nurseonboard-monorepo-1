import type { Express, Request } from "express";
import { db } from "../db";
import { nurses, portalLinks, auditLogs } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { logAction } from "../services/audit";
import crypto from "crypto";

function agentFor(req: Request): string {
  return req.session?.username || "system";
}

export function registerNurseRoutes(app: Express) {
  // GET /api/nurses - list all nurses
  app.get("/api/nurses", async (_req, res) => {
    const result = await db.select().from(nurses).orderBy(desc(nurses.createdAt));
    res.json(result);
  });

  // POST /api/nurses - create nurse
  app.post("/api/nurses", async (req, res) => {
    const { fullName, email, phone, dateOfBirth, address } = req.body;
    if (!fullName || !email) return res.status(400).json({ message: "fullName and email are required" });

    const [nurse] = await db.insert(nurses).values({
      fullName, email, phone, dateOfBirth, address,
      currentStage: "preboard",
      preboardStatus: "not_started",
      onboardStatus: "not_started",
      arcadeStatus: "not_started",
    }).returning();

    await logAction(nurse.id, "admin", "nurse_created", agentFor(req), { name: fullName, email });
    res.status(201).json(nurse);
  });

  // GET /api/nurses/:id - get nurse detail
  app.get("/api/nurses/:id", async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    res.json(nurse);
  });

  // PATCH /api/nurses/:id - update nurse
  app.patch("/api/nurses/:id", async (req, res) => {
    const [updated] = await db.update(nurses).set({ ...req.body, updatedAt: new Date() }).where(eq(nurses.id, req.params.id)).returning();
    if (!updated) return res.status(404).json({ message: "Nurse not found" });
    await logAction(updated.id, "admin", "nurse_updated", agentFor(req), req.body);
    res.json(updated);
  });

  // POST /api/nurses/:id/portal-link - generate portal link for a module
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
      nurseId: nurse.id,
      token,
      module,
      expiresAt,
      createdBy: agentFor(req),
    }).returning();

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["host"] || "localhost:5000";
    const portalUrl = `${protocol}://${host}/portal/${link.token}`;

    await logAction(nurse.id, "admin", "portal_link_generated", agentFor(req), { module, expiresAt: expiresAt.toISOString() });
    res.status(201).json({ token: link.token, expiresAt: link.expiresAt, url: portalUrl, module });
  });

  // GET /api/nurses/:id/portal-links - list all portal links for a nurse
  app.get("/api/nurses/:id/portal-links", async (req, res) => {
    const links = await db.select().from(portalLinks).where(eq(portalLinks.nurseId, req.params.id)).orderBy(desc(portalLinks.createdAt));
    res.json(links);
  });

  // GET /api/nurses/:id/audit-log - get audit logs for a nurse
  app.get("/api/nurses/:id/audit-log", async (req, res) => {
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.nurseId, req.params.id)).orderBy(desc(auditLogs.timestamp));
    res.json(logs);
  });

  // POST /api/nurses/:id/advance-stage - advance nurse to next stage
  app.post("/api/nurses/:id/advance-stage", async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });

    const stageOrder = ["preboard", "onboard", "skills_arcade", "completed"] as const;
    const currentIdx = stageOrder.indexOf(nurse.currentStage as any);
    if (currentIdx === -1 || currentIdx >= stageOrder.length - 1) {
      return res.status(400).json({ message: "Nurse is already at the final stage" });
    }

    const nextStage = stageOrder[currentIdx + 1];
    const [updated] = await db.update(nurses).set({ currentStage: nextStage, updatedAt: new Date() }).where(eq(nurses.id, req.params.id)).returning();

    await logAction(nurse.id, "admin", "stage_advanced", agentFor(req), { from: nurse.currentStage, to: nextStage });
    res.json(updated);
  });
}
