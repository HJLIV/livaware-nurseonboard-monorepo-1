import type { Express } from "express";
import { requireAdmin } from "../middleware";
import { storage } from "../preboard-storage";
import { storage as appStorage } from "../storage";
import { insertAssessmentSchema, assessmentResponseSchema, portalLinks, nurses } from "@shared/schema";
import { runAssessmentDeliveryPipeline, runAiStep, runEmailStep } from "../preboard-delivery";
import { logAction } from "../services/audit";
import { db } from "../db";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";

const submitSchema = z.object({
  nurseName: z.string().min(2, "Name must be at least 2 characters"),
  nurseEmail: z.string().email("Invalid email address"),
  nursePhone: z.string().nullable().optional(),
  responses: z.array(assessmentResponseSchema).min(1, "At least one response required"),
  portalToken: z.string().optional(),
});

export async function registerRoutes(
  app: Express
): Promise<void> {

  app.get("/api/preboard/assessments", async (req, res) => {
    if (!req.session?.isAuthenticated) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const all = await storage.getAllAssessments();
      res.json(all);
    } catch (err) {
      console.error("Error fetching assessments:", err);
      res.status(500).json({ error: "Failed to fetch assessments" });
    }
  });

  app.get("/api/preboard/assessments/by-nurse/:nurseId", async (req, res) => {
    if (!req.session?.isAuthenticated) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    try {
      const assessment = await storage.getAssessmentByNurseId(req.params.nurseId);
      if (!assessment) {
        return res.status(404).json({ message: "No assessment found" });
      }
      res.json(assessment);
    } catch (err) {
      console.error("Error fetching assessment by nurse ID:", err);
      res.status(500).json({ error: "Failed to fetch assessment" });
    }
  });

  app.post("/api/assessments", async (req, res) => {
    try {
      const parsed = submitSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid data", details: parsed.error.issues });
      }

      let nurseId: string | null = null;
      if (parsed.data.portalToken === "me" || parsed.data.portalToken === "session") {
        // Cookie-authenticated portal session (task 107).
        try {
          const { loadPortalSessionFromRequest } = await import("../services/portal-auth");
          const loaded = await loadPortalSessionFromRequest(req);
          if (loaded) nurseId = loaded.nurse.id;
        } catch (sessErr) {
          console.error("Failed to load portal session:", sessErr);
        }
      } else if (parsed.data.portalToken) {
        try {
          const [link] = await db.select().from(portalLinks).where(
            and(eq(portalLinks.token, parsed.data.portalToken), gt(portalLinks.expiresAt, new Date()))
          );
          if (link) {
            nurseId = link.nurseId;
          }
        } catch (linkErr) {
          console.error("Failed to look up portal token:", linkErr);
        }
      }
      // Fallback: even without portalToken in body, accept the portal cookie.
      if (!nurseId) {
        try {
          const { loadPortalSessionFromRequest } = await import("../services/portal-auth");
          const loaded = await loadPortalSessionFromRequest(req);
          if (loaded) nurseId = loaded.nurse.id;
        } catch {}
      }

      const assessmentData = nurseId
        ? { ...parsed.data, nurseId }
        : parsed.data;
      const assessment = await storage.createAssessment(assessmentData);

      if (nurseId) {
        try {
          await logAction(nurseId, "preboard", "assessment_submitted", parsed.data.nurseName, {
            assessmentId: assessment.id,
          });
        } catch (auditErr) {
          console.error("Failed to log assessment audit:", auditErr);
        }

        try {
          const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
          if (nurse && nurse.currentStage === "preboard") {
            await db.update(nurses).set({
              currentStage: "onboard",
              preboardStatus: "completed",
              updatedAt: new Date(),
            }).where(eq(nurses.id, nurseId));

            const existing = await appStorage.getOnboardingState(nurseId);
            if (!existing) {
              await appStorage.createOnboardingState({
                nurseId,
                currentStep: 1,
                stepStatuses: { identity: "in_progress", nmc: "pending", dbs: "pending", right_to_work: "pending", profile: "pending", competency: "pending", training: "pending", health: "pending", references: "pending", induction: "pending", indemnity: "pending", equal_opportunities: "pending" },
              });
            }

            await logAction(nurseId, "system", "stage_advanced", "assessment_auto", { from: "preboard", to: "onboard", trigger: "assessment_completed" });
            console.log(`[Preboard] Auto-advanced nurse ${nurseId} to onboard after assessment completion`);
          }
        } catch (advanceErr) {
          console.error("Failed to auto-advance nurse after assessment:", advanceErr);
        }

        try {
          const { maybeAutoUnlock } = await import("../services/onboarding-gate");
          await maybeAutoUnlock(nurseId, "assessment_auto");
        } catch (unlockErr) {
          console.error("Auto-unlock check after assessment failed:", unlockErr);
        }
      }

      res.json({ id: assessment.id, status: "received" });

      // Fire-and-forget delivery pipeline. All terminal outcomes
      // (success / AI failed / email failed / skipped no recipient)
      // are persisted to the assessment row + audit log inside the
      // pipeline itself, so admins can recover via the rerun-ai /
      // resend-email endpoints without re-submission.
      void runAssessmentDeliveryPipeline(assessment.id);

    } catch (err) {
      console.error("Error creating assessment:", err);
      res.status(500).json({ error: "Failed to submit assessment" });
    }
  });

  // Admin: re-run AI analysis for an existing assessment (task 111).
  // AI-only — to resend the email use POST .../resend-email.
  // Admin / super-admin only.
  app.post("/api/preboard/assessments/:id/rerun-ai", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid assessment id" });
    const existing = await storage.getAssessment(id);
    if (!existing) return res.status(404).json({ error: "Assessment not found" });
    try {
      const updated = await runAiStep(id);
      await logAction(existing.nurseId ?? null, "preboard", "assessment_ai_rerun",
        req.session?.username ? (req.session?.role ? `${req.session.username} (${req.session.role})` : req.session.username) : "admin",
        { assessmentId: id, nurseName: existing.nurseName });
      res.json({ status: "ok", assessment: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ status: "failed", error: message });
    }
  });

  // Admin: resend the report email for an existing assessment (task 111).
  // Admin / super-admin only.
  app.post("/api/preboard/assessments/:id/resend-email", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid assessment id" });
    if (!process.env.REPORT_EMAIL) {
      return res.status(400).json({
        error: "REPORT_EMAIL is not configured — set the REPORT_EMAIL environment variable to enable report emails.",
      });
    }
    const existing = await storage.getAssessment(id);
    if (!existing) return res.status(404).json({ error: "Assessment not found" });
    try {
      const updated = await runEmailStep(id);
      await logAction(existing.nurseId ?? null, "preboard", "assessment_email_resent",
        req.session?.username ? (req.session?.role ? `${req.session.username} (${req.session.role})` : req.session.username) : "admin",
        { assessmentId: id, nurseName: existing.nurseName });
      res.json({ status: "ok", assessment: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ status: "failed", error: message });
    }
  });
}
