import type { Express, Request } from "express";
import { db } from "../db";
import { nurses, portalLinks, auditLogs, preboardAssessments, nmcVerifications, dbsVerifications } from "@shared/schema";
import { eq, desc, and, gt } from "drizzle-orm";
import { logAction } from "../services/audit";
import { storage } from "../storage";
import { sendPortalInviteEmail, isOutlookConfigured } from "../outlook";
import crypto from "crypto";

type PortalModule = "preboard" | "onboard" | "skills_arcade" | "hub";
function moduleForStage(stage: string | null | undefined): PortalModule {
  if (stage === "onboard") return "onboard";
  if (stage === "skills_arcade") return "skills_arcade";
  if (stage === "completed") return "hub";
  return "preboard";
}

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

  // Bulk-generate portal links for every nurse on the system. Designed for the
  // one-shot "open up portals for everyone already loaded" admin operation.
  // - Reuses the most recent active (non-expired) link per nurse if one exists.
  // - Otherwise creates a fresh link for the nurse's current stage.
  // - Optionally sends the portal invite email (default true) when Outlook is configured.
  // - Returns counts plus a per-nurse summary so the admin can see what happened.
  app.post("/api/admin/portal-links/bulk", async (req, res) => {
    const sendEmail = req.body?.sendEmail !== false; // default true
    const forceRegenerate = req.body?.forceRegenerate === true;
    const stageFilter: string | undefined = typeof req.body?.stage === "string" ? req.body.stage : undefined;

    const allNurses = await db.select().from(nurses).orderBy(desc(nurses.createdAt));
    const targetNurses = stageFilter
      ? allNurses.filter((n) => n.currentStage === stageFilter)
      : allNurses;

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["host"] || "localhost:5000";
    const outlookReady = isOutlookConfigured();

    let generated = 0;
    let reused = 0;
    let emailsSent = 0;
    let emailsFailed = 0;
    let emailsSkipped = 0;
    const results: Array<{
      nurseId: string;
      name: string;
      email: string;
      module: PortalModule;
      url: string;
      action: "generated" | "reused";
      emailStatus: "sent" | "failed" | "skipped";
      emailError?: string;
    }> = [];

    for (const nurse of targetNurses) {
      const module = moduleForStage(nurse.currentStage);

      let token: string;
      let expiresAt: Date;
      let action: "generated" | "reused";

      const existingActive = forceRegenerate
        ? []
        : await db
            .select()
            .from(portalLinks)
            .where(
              and(
                eq(portalLinks.nurseId, nurse.id),
                eq(portalLinks.module, module),
                gt(portalLinks.expiresAt, new Date()),
              ),
            )
            .orderBy(desc(portalLinks.createdAt))
            .limit(1);

      if (existingActive.length > 0) {
        token = existingActive[0].token;
        expiresAt = existingActive[0].expiresAt;
        action = "reused";
        reused += 1;
      } else {
        token = crypto.randomBytes(32).toString("hex");
        expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await db.insert(portalLinks).values({
          nurseId: nurse.id,
          token,
          module,
          expiresAt,
          createdBy: agentFor(req),
        });
        await logAction(nurse.id, "admin", "portal_link_generated", agentFor(req), {
          module,
          expiresAt: expiresAt.toISOString(),
          bulk: true,
        });
        action = "generated";
        generated += 1;
      }

      const portalUrl = `${protocol}://${host}/portal/${token}`;

      let emailStatus: "sent" | "failed" | "skipped" = "skipped";
      let emailError: string | undefined;
      if (sendEmail && nurse.email && outlookReady) {
        try {
          await sendPortalInviteEmail(nurse.email, nurse.fullName, portalUrl, expiresAt, module);
          emailStatus = "sent";
          emailsSent += 1;
          await logAction(nurse.id, "admin", "portal_invite_emailed", agentFor(req), {
            recipientEmail: nurse.email,
            expiresAt: expiresAt.toISOString(),
            bulk: true,
          });
        } catch (err: any) {
          emailStatus = "failed";
          emailError = err?.message || "Unknown error";
          emailsFailed += 1;
          await logAction(nurse.id, "admin", "portal_invite_email_failed", agentFor(req), {
            recipientEmail: nurse.email,
            error: emailError,
            bulk: true,
          });
        }
      } else {
        emailsSkipped += 1;
      }

      results.push({
        nurseId: nurse.id,
        name: nurse.fullName,
        email: nurse.email,
        module,
        url: portalUrl,
        action,
        emailStatus,
        emailError,
      });
    }

    res.json({
      total: targetNurses.length,
      generated,
      reused,
      emailsSent,
      emailsFailed,
      emailsSkipped,
      outlookConfigured: outlookReady,
      results,
    });
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

    const expectedFrom = req.body?.expectedFromStage;
    if (expectedFrom && nurse.currentStage !== expectedFrom) {
      return res.status(409).json({ message: `Nurse is no longer in ${expectedFrom} stage (currently ${nurse.currentStage})` });
    }

    const nextStage = stageOrder[currentIdx + 1];
    const statusUpdates: Record<string, string> = {};
    if (nurse.currentStage === "preboard") statusUpdates.preboardStatus = "completed";
    if (nurse.currentStage === "onboard") statusUpdates.onboardStatus = "cleared";

    const [updated] = await db.update(nurses).set({
      currentStage: nextStage, ...statusUpdates, updatedAt: new Date(),
    }).where(eq(nurses.id, req.params.id)).returning();

    if (nurse.currentStage === "preboard" && nextStage === "onboard") {
      const existing = await storage.getOnboardingState(nurse.id);
      if (!existing) {
        await storage.createOnboardingState({
          nurseId: nurse.id,
          currentStep: 1,
          stepStatuses: { identity: "in_progress", nmc: "pending", dbs: "pending", right_to_work: "pending", profile: "pending", competency: "pending", training: "pending", health: "pending", references: "pending", induction: "pending", indemnity: "pending", equal_opportunities: "pending" },
        });
      }
    }

    await logAction(nurse.id, "admin", "stage_advanced", agentFor(req), { from: nurse.currentStage, to: nextStage });
    res.json(updated);
  });

  app.post("/api/admin/backfill-preboard-completions", async (req, res) => {
    try {
      const allPreboard = await db.select().from(nurses).where(eq(nurses.currentStage, "preboard"));
      const allAssessments = await db.select().from(preboardAssessments);
      const assessedNurseIds = new Set(allAssessments.filter(a => a.nurseId).map(a => a.nurseId));

      const toAdvance = allPreboard.filter(n => assessedNurseIds.has(n.id));
      const advanced: string[] = [];

      for (const nurse of toAdvance) {
        await db.update(nurses).set({
          currentStage: "onboard",
          preboardStatus: "completed",
          updatedAt: new Date(),
        }).where(eq(nurses.id, nurse.id));

        const existing = await storage.getOnboardingState(nurse.id);
        if (!existing) {
          await storage.createOnboardingState({
            nurseId: nurse.id,
            currentStep: 1,
            stepStatuses: { identity: "in_progress", nmc: "pending", dbs: "pending", right_to_work: "pending", profile: "pending", competency: "pending", training: "pending", health: "pending", references: "pending", induction: "pending", indemnity: "pending", equal_opportunities: "pending" },
          });
        }

        await logAction(nurse.id, "system", "stage_advanced", agentFor(req), { from: "preboard", to: "onboard", trigger: "admin_backfill" });
        advanced.push(nurse.fullName || nurse.id);
      }

      console.log(`[Backfill] Advanced ${advanced.length} nurses from preboard to onboard`);
      res.json({ advanced: advanced.length, names: advanced });
    } catch (err: any) {
      console.error("[Backfill] Error:", err.message);
      res.status(500).json({ message: "Failed to run backfill" });
    }
  });

  app.get("/api/portal/:token", async (req, res) => {
    try {
      const [link] = await db.select().from(portalLinks).where(
        and(eq(portalLinks.token, req.params.token), gt(portalLinks.expiresAt, new Date()))
      );
      if (!link) return res.status(404).json({ message: "Invalid or expired portal link" });

      const [nurse] = await db.select().from(nurses).where(eq(nurses.id, link.nurseId));
      if (!nurse) return res.status(404).json({ message: "Nurse not found" });

      const isFirstVisit = !link.usedAt;
      if (isFirstVisit) {
        await db.update(portalLinks).set({ usedAt: new Date() }).where(eq(portalLinks.id, link.id));
        await logAction(nurse.id, "portal", "portal_accessed", "nurse_portal", { module: link.module });
      }

      // Completion is based purely on the underlying status fields, not on
      // whether the nurse has been advanced to a later stage. This keeps the
      // assessment visible as still-to-do even after an admin manually
      // advances the nurse to onboarding.
      const preboardDone = nurse.preboardStatus === "completed";
      const onboardDone = nurse.onboardStatus === "cleared" || nurse.currentStage === "completed";
      const arcadeDone = nurse.arcadeStatus === "competent" || nurse.currentStage === "completed";

      // All three lanes are accessible at the same time. The hub no longer
      // gates onboarding or the skills arcade behind the assessment — the
      // candidate can work through any of them in parallel and finish the
      // assessment when convenient.
      const journey = {
        preboard: {
          status: preboardDone ? "completed" : "in_progress",
          actionUrl: `/preboard/assessment?token=${link.token}`,
          label: preboardDone ? "Update Details" : "Start Assessment",
        },
        onboard: {
          status: onboardDone ? "completed" : "in_progress",
          actionUrl: onboardDone ? `/portal/page/${link.token}` : `/portal/page/${link.token}`,
          label: onboardDone ? "Update Documents" : "Continue Onboarding",
        },
        skillsArcade: {
          status: arcadeDone ? "completed" : "in_progress",
          actionUrl: arcadeDone ? `/arcade?token=${link.token}` : `/arcade?token=${link.token}`,
          label: arcadeDone ? "Review Modules" : "Start Skills Arcade",
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
        firstVisit: isFirstVisit,
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
