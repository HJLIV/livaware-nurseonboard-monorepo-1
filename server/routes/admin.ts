import type { Express, Request } from "express";
import { db } from "../db";
import { nurses, portalLinks, auditLogs, preboardAssessments, nmcVerifications, dbsVerifications } from "@shared/schema";
import { eq, desc, and, gt, isNull, isNotNull } from "drizzle-orm";
import { logAction } from "../services/audit";
import { storage } from "../storage";
import { sendApplicantWelcomeEmail, isOutlookConfigured } from "../outlook";
import { requireAdmin, requireSuperAdmin } from "../middleware";
import { getGateState, maybeAutoUnlock } from "../services/onboarding-gate";
import crypto from "crypto";

type PortalModule = "preboard" | "onboard" | "skills_arcade" | "hub";
function moduleForStage(stage: string | null | undefined): PortalModule {
  if (stage === "onboard") return "onboard";
  if (stage === "skills_arcade") return "skills_arcade";
  if (stage === "completed") return "hub";
  return "preboard";
}

function agentFor(req: Request): string {
  const u = req.session?.username;
  const r = req.session?.role;
  if (!u) return "system";
  return r ? `${u} (${r})` : u;
}

export function registerNurseRoutes(app: Express) {
  app.get("/api/nurses", async (req, res) => {
    const status = String(req.query.status || "active").toLowerCase();
    const includeArchived = req.query.includeArchived === "true" || status === "all";
    const archivedOnly = status === "archived";
    let query = db.select().from(nurses).$dynamic();
    if (archivedOnly) {
      query = query.where(isNotNull(nurses.archivedAt));
    } else if (!includeArchived) {
      query = query.where(isNull(nurses.archivedAt));
    }
    const result = await query.orderBy(desc(nurses.createdAt));
    res.json(result);
  });

  app.post("/api/nurses", async (req, res) => {
    const { fullName, firstName, lastName, email, phone, dateOfBirth, address, sendWelcomeEmail } = req.body;
    const name = fullName || (firstName && lastName ? `${firstName} ${lastName}`.trim() : firstName || "");
    if (!name || !email) return res.status(400).json({ message: "Name and email are required" });
    // Default true for backwards-compat with any caller that omits the flag.
    const shouldSendWelcomeEmail = sendWelcomeEmail !== false;

    const [nurse] = await db.insert(nurses).values({
      fullName: name, email, phone, dateOfBirth, address,
      currentStage: "preboard",
      preboardStatus: "not_started",
      onboardStatus: "not_started",
      arcadeStatus: "not_started",
    }).returning();

    await logAction(nurse.id, "admin", "nurse_created", agentFor(req), { name, email });

    let portalUrl: string | null = null;
    let emailSent = false;
    let portalExpiresAt: Date | null = null;
    try {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      portalExpiresAt = expiresAt;
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

    // Auto-send the warm welcome email to the new applicant. Admin can
    // opt out via `sendWelcomeEmail: false` (e.g. when they want to brief
    // the candidate themselves first); the default remains "send" so we
    // mirror POST /api/candidates and never silently skip the first-touch.
    if (shouldSendWelcomeEmail && portalUrl && portalExpiresAt && nurse.email) {
      if (!isOutlookConfigured()) {
        console.warn("[nurses.create] Outlook not configured — invite email skipped");
        await logAction(nurse.id, "admin", "portal_invite_email_failed", agentFor(req), {
          recipientEmail: nurse.email,
          error: "Outlook is not configured (missing AZURE_AD_* env vars)",
        });
      } else {
        try {
          await sendApplicantWelcomeEmail(nurse.email, nurse.fullName, portalUrl, portalExpiresAt);
          emailSent = true;
          await logAction(nurse.id, "admin", "portal_invite_emailed", agentFor(req), {
            recipientEmail: nurse.email,
            expiresAt: portalExpiresAt.toISOString(),
          });
        } catch (err: any) {
          console.error("[nurses.create] Auto-invite email failed:", err?.message || err);
          await logAction(nurse.id, "admin", "portal_invite_email_failed", agentFor(req), {
            recipientEmail: nurse.email,
            error: err?.message || "Unknown error",
          });
        }
      }
    }

    res.status(201).json({ ...nurse, preboardInviteUrl: portalUrl, emailSent });
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
    if (nurse.archivedAt) {
      return res.json({ ok: true, alreadyArchived: true, nurse });
    }
    const [updated] = await db.update(nurses)
      .set({ archivedAt: new Date(), archivedBy: agentFor(req), updatedAt: new Date() })
      .where(eq(nurses.id, req.params.id))
      .returning();
    await logAction(nurse.id, "admin", "nurse_archived", agentFor(req), {
      name: nurse.fullName,
      email: nurse.email,
    });
    res.json({ ok: true, nurse: updated });
  });

  app.post("/api/nurses/:id/restore", async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    if (!nurse.archivedAt) {
      return res.status(400).json({ message: "Nurse is not archived" });
    }
    const [updated] = await db.update(nurses)
      .set({ archivedAt: null, archivedBy: null, updatedAt: new Date() })
      .where(eq(nurses.id, req.params.id))
      .returning();
    await logAction(nurse.id, "admin", "nurse_restored", agentFor(req), {
      name: nurse.fullName,
      previouslyArchivedAt: nurse.archivedAt?.toISOString?.() || null,
      previouslyArchivedBy: nurse.archivedBy || null,
    });
    res.json({ ok: true, nurse: updated });
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

  // ─── Portal passwordless auth admin (task 107) ──────────────────────
  // Read: 10 most recent portal sessions + last sign-in summary.
  app.get("/api/nurses/:id/portal-sessions", requireSuperAdmin, async (req, res) => {
    const nurseId = req.params.id;
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    const { listRecentSessionsForNurse } = await import("../services/portal-auth");
    const sessions = await listRecentSessionsForNurse(nurseId, 10);
    const lastSignIn = sessions.find((s) => !s.revokedAt) ?? sessions[0] ?? null;
    res.json({
      nurseId,
      lastSignIn: lastSignIn
        ? {
            issuedAt: lastSignIn.issuedAt,
            issuedVia: lastSignIn.issuedVia,
            ip: lastSignIn.ip,
            userAgent: lastSignIn.userAgent,
            revokedAt: lastSignIn.revokedAt,
          }
        : null,
      sessions,
    });
  });

  // Send a sign-in code now on the nurse's behalf (admin help-desk action).
  app.post("/api/nurses/:id/portal-auth/send-code", requireSuperAdmin, async (req, res) => {
    const nurseId = req.params.id;
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    if (!nurse.email) return res.status(400).json({ message: "Nurse has no email on file" });

    const { createPortalAuthCode } = await import("../services/portal-auth");
    const { code, expiresAt } = await createPortalAuthCode(req, nurse.id);

    let emailSent = false;
    let emailError: string | undefined;
    if (isOutlookConfigured()) {
      try {
        const { sendPortalSignInCodeEmail } = await import("../outlook");
        await sendPortalSignInCodeEmail(nurse.email, nurse.fullName, code, expiresAt);
        emailSent = true;
      } catch (err: any) {
        emailError = err?.message || String(err);
      }
    }
    await logAction(nurse.id, "portal_auth", "portal_code_sent_by_admin", agentFor(req), {
      emailSent,
      emailError: emailError || null,
      expiresAt: expiresAt.toISOString(),
    });
    const exposeCode = !isOutlookConfigured() || process.env.NODE_ENV !== "production";
    res.json({
      ok: true,
      emailSent,
      emailError,
      expiresAt: expiresAt.toISOString(),
      ...(exposeCode ? { devCode: code } : {}),
    });
  });

  // Force sign-out of every active portal session for this nurse.
  app.post("/api/nurses/:id/portal-auth/revoke-all", requireSuperAdmin, async (req, res) => {
    const nurseId = req.params.id;
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    const reason = String(req.body?.reason || "admin_force_signout");
    const { revokeAllPortalSessionsForNurse } = await import("../services/portal-auth");
    const revoked = await revokeAllPortalSessionsForNurse(nurseId, reason, agentFor(req));
    res.json({ ok: true, revoked });
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
      // `module` not used for templating — bulk invites now use the
      // warm Livaware welcome template for parity with single-send.
      void module;
      if (sendEmail && nurse.email && outlookReady) {
        try {
          await sendApplicantWelcomeEmail(nurse.email, nurse.fullName, portalUrl, expiresAt);
          emailStatus = "sent";
          emailsSent += 1;
          await logAction(nurse.id, "admin", "portal_invite_emailed", agentFor(req), {
            recipientEmail: nurse.email,
            expiresAt: expiresAt.toISOString(),
            bulk: true,
            template: "applicant_welcome",
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

  // Bulk AI document scan across every candidate. Re-analyses each
  // candidate's existing uploaded documents, extracts work history from
  // any CVs, and records mandatory training certificates that haven't yet
  // been logged. Skips the markdown report (the per-candidate check still
  // runs that on demand) so this stays fast over large rosters.
  app.post("/api/admin/compliance-check/bulk", async (req, res) => {
    const { scanCandidateDocuments } = await import("../document-extractor");
    const { stage } = (req.body || {}) as { stage?: string };

    let allNurses = await db.select().from(nurses).orderBy(desc(nurses.createdAt));
    if (stage) {
      allNurses = allNurses.filter((n) => n.currentStage === stage);
    }

    const results: Array<{
      nurseId: string;
      name: string;
      documentsScanned: number;
      documentsReclassified: number;
      cvEntriesAdded: number;
      cvEducationAdded: number;
      trainingModulesAdded: number;
      errors: string[];
      status: "ok" | "skipped" | "failed";
      message?: string;
    }> = [];

    let totalDocuments = 0;
    let totalReclassified = 0;
    let totalCvEntriesAdded = 0;
    let totalCvEducationAdded = 0;
    let totalTrainingAdded = 0;
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    // Run with bounded concurrency so we don't hammer the AI provider.
    const CONCURRENCY = 3;
    let cursor = 0;
    const worker = async () => {
      while (cursor < allNurses.length) {
        const idx = cursor++;
        const nurse = allNurses[idx];
        try {
          const docs = await storage.getDocuments(nurse.id);
          if (docs.length === 0) {
            skipped += 1;
            results.push({
              nurseId: nurse.id,
              name: nurse.fullName,
              documentsScanned: 0,
              documentsReclassified: 0,
              cvEntriesAdded: 0,
              cvEducationAdded: 0,
              trainingModulesAdded: 0,
              errors: [],
              status: "skipped",
              message: "No documents on file",
            });
            continue;
          }
          const scan = await scanCandidateDocuments(nurse.id);
          totalDocuments += scan.documentsScanned;
          totalReclassified += scan.documentsReclassified;
          totalCvEntriesAdded += scan.cvEntriesAdded;
          totalCvEducationAdded += scan.cvEducationAdded;
          totalTrainingAdded += scan.trainingModulesAdded;
          succeeded += 1;
          results.push({
            nurseId: nurse.id,
            name: nurse.fullName,
            documentsScanned: scan.documentsScanned,
            documentsReclassified: scan.documentsReclassified,
            cvEntriesAdded: scan.cvEntriesAdded,
            cvEducationAdded: scan.cvEducationAdded,
            trainingModulesAdded: scan.trainingModulesAdded,
            errors: scan.errors,
            status: "ok",
          });
          // Audit logging is best-effort and must not flip a successful scan
          // into a failure (which would double-count the nurse).
          try {
            await logAction(nurse.id, "admin", "bulk_compliance_scan", agentFor(req), {
              documentsScanned: scan.documentsScanned,
              documentsReclassified: scan.documentsReclassified,
              cvEntriesAdded: scan.cvEntriesAdded,
              cvEducationAdded: scan.cvEducationAdded,
              trainingModulesAdded: scan.trainingModulesAdded,
              errorCount: scan.errors.length,
            });
          } catch (logErr) {
            console.error("[Bulk Compliance Scan] Audit log failed:", logErr);
          }
        } catch (err: any) {
          failed += 1;
          results.push({
            nurseId: nurse.id,
            name: nurse.fullName,
            documentsScanned: 0,
            documentsReclassified: 0,
            cvEntriesAdded: 0,
            cvEducationAdded: 0,
            trainingModulesAdded: 0,
            errors: [err.message || String(err)],
            status: "failed",
            message: err.message || "Scan failed",
          });
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    res.json({
      total: allNurses.length,
      succeeded,
      skipped,
      failed,
      totalDocumentsScanned: totalDocuments,
      totalDocumentsReclassified: totalReclassified,
      totalCvEntriesAdded,
      totalCvEducationAdded,
      totalTrainingAdded,
      results,
    });
  });

  app.get("/api/nurses/:id/audit-log", async (req, res) => {
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.nurseId, req.params.id)).orderBy(desc(auditLogs.timestamp));
    const { enrichAuditLogs } = await import("../services/audit-enrich");
    const enriched = await enrichAuditLogs(logs);
    res.json(enriched);
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
      // "me" / "session" → resolve via the portal session cookie (task 107).
      let link: typeof portalLinks.$inferSelect | undefined;
      let nurse: typeof nurses.$inferSelect | undefined;
      let bootstrappedSessionId: string | null = null;

      const tokenParam = req.params.token;
      const { loadPortalSessionFromRequest, claimBootstrapLink } = await import("../services/portal-auth");

      if (tokenParam === "me" || tokenParam === "session") {
        const loaded = await loadPortalSessionFromRequest(req);
        if (!loaded) return res.status(401).json({ message: "Portal sign-in required" });
        nurse = loaded.nurse;
      } else {
        const [foundLink] = await db.select().from(portalLinks).where(eq(portalLinks.token, tokenParam));
        if (!foundLink) return res.status(404).json({ message: "Invalid or expired portal link" });
        if (foundLink.expiresAt.getTime() <= Date.now()) {
          // Try to fall back to an existing session before refusing.
          const loaded = await loadPortalSessionFromRequest(req);
          if (loaded) {
            nurse = loaded.nurse;
            link = foundLink;
          } else {
            const [n] = await db.select().from(nurses).where(eq(nurses.id, foundLink.nurseId));
            return res.status(410).json({
              error: "link_expired",
              message: "This portal link has expired. Please sign in with the code we email you.",
              redirect: "/portal/sign-in",
              email: n?.email,
            });
          }
        } else if (foundLink.claimedAt) {
          // Link was already used to bootstrap a session. If the current
          // browser still holds a valid cookie we render the hub; if
          // not, we ask the client to redirect to /portal/sign-in with
          // the nurse's email pre-filled.
          const loaded = await loadPortalSessionFromRequest(req);
          if (loaded) {
            nurse = loaded.nurse;
            link = foundLink;
          } else {
            const [n] = await db.select().from(nurses).where(eq(nurses.id, foundLink.nurseId));
            return res.status(410).json({
              error: "link_consumed",
              message: "This portal link has already been used. Please sign in with the code we email you.",
              redirect: "/portal/sign-in",
              email: n?.email,
            });
          }
        } else {
          // Fresh link — claim it & issue a 7-day portal session cookie.
          const claim = await claimBootstrapLink(req, res, tokenParam);
          if ("error" in claim) {
            return res.status(claim.error === "expired" ? 410 : 404).json({
              error: claim.error,
              message: "Invalid or expired portal link",
            });
          }
          nurse = claim.nurse;
          bootstrappedSessionId = claim.sessionId;
          link = foundLink;
        }
      }

      if (!nurse) return res.status(404).json({ message: "Nurse not found" });

      const isFirstVisit = !!bootstrappedSessionId;
      if (isFirstVisit && link) {
        // Mark legacy usedAt (kept for backwards-compat with audit + UI).
        await db.update(portalLinks).set({ usedAt: link.usedAt ?? new Date() }).where(eq(portalLinks.id, link.id));
        await logAction(nurse.id, "portal", "portal_accessed", `nurse_portal:${nurse.fullName}`, { module: link.module });
      }
      // Completion is based purely on the underlying status fields, not on
      // whether the nurse has been advanced to a later stage. This keeps the
      // assessment visible as still-to-do even after an admin manually
      // advances the nurse to onboarding.
      const preboardDone = nurse.preboardStatus === "completed";
      const onboardDone = nurse.onboardStatus === "cleared" || nurse.currentStage === "completed";
      const arcadeDone = nurse.arcadeStatus === "competent" || nurse.currentStage === "completed";

      // Resolve each lane's status from the actual DB enum so the hub
      // reflects whether the candidate has truly started a stage. Without
      // this, every not-yet-started lane was shown as "In Progress" in
      // the sidebar / hub — which misled candidates into thinking they'd
      // begun something they hadn't.
      const preboardStatus = preboardDone
        ? "completed"
        : nurse.preboardStatus === "in_progress"
        ? "in_progress"
        : nurse.preboardStatus === "flagged"
        ? "in_progress"
        : "not_started";
      const onboardStatus = onboardDone
        ? "completed"
        : nurse.onboardStatus === "in_progress" ||
          nurse.onboardStatus === "escalated" ||
          nurse.onboardStatus === "blocked"
        ? "in_progress"
        : "not_started";
      const arcadeStatus = arcadeDone
        ? "completed"
        : nurse.arcadeStatus === "in_progress" || nurse.arcadeStatus === "remediation"
        ? "in_progress"
        : "not_started";

      // All three lanes are accessible at the same time. The hub no longer
      // gates onboarding or the skills arcade behind the assessment — the
      // candidate can work through any of them in parallel and finish the
      // assessment when convenient.
      // Cookie carries the identity, so action URLs are tokenless.
      const journey = {
        preboard: {
          status: preboardStatus,
          actionUrl: `/preboard/assessment`,
          label: preboardDone
            ? "Update Details"
            : preboardStatus === "in_progress"
            ? "Continue Assessment"
            : "Start Assessment",
        },
        onboard: {
          status: onboardStatus,
          actionUrl: `/portal/page`,
          label: onboardDone
            ? "Update Documents"
            : onboardStatus === "in_progress"
            ? "Continue Onboarding"
            : "Start Onboarding",
        },
        skillsArcade: {
          status: arcadeStatus,
          actionUrl: `/portal/arcade`,
          label: arcadeDone
            ? "Review Modules"
            : arcadeStatus === "in_progress"
            ? "Continue Skills Arcade"
            : "Start Skills Arcade",
        },
      };

      const gate = await getGateState(nurse.id);

      // Induction gate (task 114) — surfaced on the hub so the sidebar
      // can render the Induction group + lock the Skills Arcade item
      // until every induction item has been acknowledged.
      const { getInductionGateState } = await import("../services/induction-gate");
      const inductionGate = await getInductionGateState(nurse.id);

      // Service Agreement gate (task 170) — the first, blocking portal step.
      // Surfaced so the sidebar can show it first + lock everything else
      // until the agreement is signed.
      const { buildServiceAgreementState } = await import("./service-agreement");
      const serviceAgreement = await buildServiceAgreementState(nurse.id);

      // Individual agreements (task 191) — count block so the hub/sidebar can
      // surface pending ad-hoc agreements without an extra request.
      const { buildAgreementsSummary } = await import("./individual-agreements");
      const agreementsSummary = await buildAgreementsSummary(nurse.id);

      // Assigned actions (task 212) — outstanding count powers the glowing
      // "Action required" widget in the portal shell + the hub To Do card.
      const outstandingAssignedActions = await storage.countOutstandingAssignedActions(nurse.id);

      res.json({
        nurse: {
          id: nurse.id,
          fullName: nurse.fullName,
          email: nurse.email,
          currentStage: nurse.currentStage,
        },
        journey,
        gate,
        induction: inductionGate,
        serviceAgreement,
        agreements: agreementsSummary,
        assignedActions: { outstanding: outstandingAssignedActions },
        token: "me",
        firstVisit: isFirstVisit,
        sessionIssued: !!bootstrappedSessionId,
      });
    } catch (err) {
      console.error("Portal token error:", err);
      res.status(500).json({ message: "Failed to load portal" });
    }
  });

  // ─── Diagnostic: what SharePoint target are we hitting? ─────────────
  app.get("/api/admin/sharepoint-target", requireSuperAdmin, async (_req, res) => {
    try {
      const { describeSharepointTarget } = await import("../sharepoint");
      const target = await describeSharepointTarget();
      res.json(target);
    } catch (err: any) {
      console.error("[SharePoint] target diagnostic failed:", err);
      res.status(500).json({ message: err?.message || "Diagnostic failed" });
    }
  });

  // ─── Document Recovery: pull historic files back from SharePoint ────
  // One-off recovery for files that were lost off ephemeral container
  // disk before the Object Storage layer existed. Walks the documents
  // table, finds any whose file is missing from BOTH local disk and the
  // bucket, and re-downloads them from the SharePoint archive copy.
  // Idempotent — safe to re-run.
  app.post("/api/admin/recover-from-sharepoint", requireSuperAdmin, async (_req, res) => {
    try {
      const { recoverMissingFilesFromSharePoint } = await import("../object-storage");
      const result = await recoverMissingFilesFromSharePoint();
      console.log("[object-storage] SharePoint recovery complete:", result);
      res.json(result);
    } catch (err: any) {
      console.error("[object-storage] SharePoint recovery failed:", err);
      res.status(500).json({ message: err?.message || "Recovery failed" });
    }
  });

  // ─── Document Recovery: pull historic files back from mailbox ───────
  // Last-resort recovery for files that aren't in disk, the bucket, or
  // SharePoint — every upload also fired a notification email to the
  // sender mailbox with the file as an attachment. Walks those messages
  // and matches them to documents by candidate name + category +
  // original filename, then writes them back into both stores.
  // Idempotent — safe to re-run.
  app.post("/api/admin/recover-from-mailbox", requireSuperAdmin, async (_req, res) => {
    try {
      const { recoverMissingFilesFromMailbox } = await import("../object-storage");
      const result = await recoverMissingFilesFromMailbox();
      console.log("[object-storage] Mailbox recovery complete:", result);
      res.json(result);
    } catch (err: any) {
      console.error("[object-storage] Mailbox recovery failed:", err);
      res.status(500).json({ message: err?.message || "Recovery failed" });
    }
  });

  // ─── Document Recovery: orphan files ────────────────────────────────
  app.get("/api/admin/orphan-uploads", requireAdmin, async (_req, res) => {
    try {
      const { listOrphanUploads } = await import("../document-recovery");
      const orphans = await listOrphanUploads();
      res.json({ orphans });
    } catch (err: any) {
      console.error("[Orphan Scan] Failed:", err);
      res.status(500).json({ message: err.message || "Failed to scan orphan uploads" });
    }
  });

  // ─── Onboarding access gate (task 94) ──────────────────────────────
  app.get("/api/nurses/:id/onboarding-access", requireAdmin, async (req, res) => {
    const state = await getGateState(req.params.id);
    if (!state) return res.status(404).json({ message: "Nurse not found" });
    res.json(state);
  });

  app.post("/api/nurses/:id/onboarding-access/unlock", requireAdmin, async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    const now = new Date();
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;
    // Conditional update: only this request wins the locked→unlocked
    // transition. Prevents racing the auto-unlocker into a double email.
    const updated = await db
      .update(nurses)
      .set({
        onboardingUnlockedAt: now,
        onboardingUnlockedBy: agentFor(req),
        onboardingLockedReason: null,
        updatedAt: now,
      })
      .where(and(eq(nurses.id, req.params.id), isNull(nurses.onboardingUnlockedAt)))
      .returning({ id: nurses.id });
    await logAction(nurse.id, "admin", "onboarding_unlocked", agentFor(req), {
      mode: "manual_admin",
      previouslyUnlocked: !!nurse.onboardingUnlockedAt,
      note,
    });
    // Only fire the notification email if THIS request was the one that
    // actually flipped the gate. If auto-unlock or another admin won the
    // race, the email has already gone (or is going) from there.
    if (updated.length > 0) {
      const { notifyOnboardingUnlocked } = await import("../services/onboarding-gate");
      void notifyOnboardingUnlocked(nurse.id, "manual_admin").catch((err) => {
        console.error("[admin] notifyOnboardingUnlocked (manual) failed:", err.message);
      });
    }
    const state = await getGateState(req.params.id);
    res.json(state);
  });

  app.post("/api/nurses/:id/onboarding-access/relock", requireAdmin, async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) return res.status(400).json({ message: "A reason is required to re-lock onboarding" });
    const alreadyLocked =
      (nurse.onboardingUnlockMode || "auto") === "manual" && !nurse.onboardingUnlockedAt;
    if (alreadyLocked) {
      return res.status(409).json({ message: "Nurse onboarding is already locked" });
    }
    const now = new Date();
    // Re-locking now also flips the nurse to "manual" mode — that's the
    // only way the gate stays closed under the post-Task-94 always-open
    // default. Without this, relock would clear unlockedAt but the gate
    // would immediately be re-evaluated as open.
    await db.update(nurses).set({
      onboardingUnlockedAt: null,
      onboardingUnlockedBy: null,
      onboardingUnlockMode: "manual",
      onboardingLockedReason: reason,
      updatedAt: now,
    }).where(eq(nurses.id, req.params.id));
    await logAction(nurse.id, "admin", "onboarding_relocked", agentFor(req), {
      reason,
      previouslyUnlockedAt: nurse.onboardingUnlockedAt?.toISOString?.() || null,
      previouslyUnlockedBy: nurse.onboardingUnlockedBy || null,
    });
    const state = await getGateState(req.params.id);
    res.json(state);
  });

  app.put("/api/nurses/:id/onboarding-access/mode", requireAdmin, async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    const mode = req.body?.mode;
    if (mode !== "auto" && mode !== "manual") {
      return res.status(400).json({ message: "mode must be 'auto' or 'manual'" });
    }
    const previous = nurse.onboardingUnlockMode || "auto";
    if (previous === mode) {
      const state = await getGateState(req.params.id);
      return res.json(state);
    }
    await db.update(nurses).set({
      onboardingUnlockMode: mode,
      updatedAt: new Date(),
    }).where(eq(nurses.id, req.params.id));
    await logAction(nurse.id, "admin", "unlock_mode_changed", agentFor(req), {
      from: previous,
      to: mode,
    });
    if (mode === "auto") {
      // Switching back to auto-mode may immediately satisfy the gate.
      await maybeAutoUnlock(req.params.id, agentFor(req));
    }
    const state = await getGateState(req.params.id);
    res.json(state);
  });

  // Compliance-approval gate: admin clicks "Approve compliance" once
  // every Compliance-group questionnaire has been completed and checked.
  // Setting the timestamp unlocks the Induction & Training group for
  // the nurse; the DELETE clears it (re-locks).
  app.post("/api/nurses/:id/compliance-approval", requireAdmin, async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    const note = typeof req.body?.note === "string" ? req.body.note : undefined;
    if (nurse.complianceApprovedAt) {
      const state = await getGateState(req.params.id);
      return res.json(state);
    }
    const now = new Date();
    await db.update(nurses).set({
      complianceApprovedAt: now,
      complianceApprovedBy: agentFor(req),
      updatedAt: now,
    }).where(eq(nurses.id, req.params.id));
    await logAction(nurse.id, "admin", "compliance_approved", agentFor(req), { note });
    const state = await getGateState(req.params.id);
    res.json(state);
  });

  app.delete("/api/nurses/:id/compliance-approval", requireAdmin, async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    if (!nurse.complianceApprovedAt) {
      const state = await getGateState(req.params.id);
      return res.json(state);
    }
    const reason = typeof req.body?.reason === "string" ? req.body.reason : undefined;
    const now = new Date();
    await db.update(nurses).set({
      complianceApprovedAt: null,
      complianceApprovedBy: null,
      updatedAt: now,
    }).where(eq(nurses.id, req.params.id));
    await logAction(nurse.id, "admin", "compliance_approval_revoked", agentFor(req), { reason });
    const state = await getGateState(req.params.id);
    res.json(state);
  });

  // ─── Grace early-access toggle ──────────────────────────────────────
  // Opens the Training section (Mandatory Training, Internal Training,
  // Clinical Skills Arcade), Invoicing and Availability for this nurse
  // before the normal compliance-approval / induction / completed-stage
  // gates are satisfied. Per-nurse override.
  app.put("/api/nurses/:id/grace-access", requireAdmin, async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    const enabled = req.body?.enabled === true;
    if (nurse.graceAccessEnabled === enabled) {
      const state = await getGateState(req.params.id);
      return res.json(state);
    }
    const now = new Date();
    await db.update(nurses).set({
      graceAccessEnabled: enabled,
      graceAccessUpdatedAt: now,
      graceAccessUpdatedBy: agentFor(req),
      updatedAt: now,
    }).where(eq(nurses.id, req.params.id));
    await logAction(
      nurse.id,
      "admin",
      enabled ? "grace_access_granted" : "grace_access_revoked",
      agentFor(req),
      {},
    );
    const state = await getGateState(req.params.id);
    res.json(state);
  });

  app.post("/api/nurses/:id/cv-review", requireAdmin, async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    const now = new Date();
    await db.update(nurses).set({
      cvReviewedAt: now,
      cvReviewedBy: agentFor(req),
      updatedAt: now,
    }).where(eq(nurses.id, req.params.id));
    await logAction(nurse.id, "admin", "cv_marked_reviewed", agentFor(req), {
      previouslyReviewedAt: nurse.cvReviewedAt?.toISOString?.() || null,
    });
    // CV review is one of the auto-unlock prerequisites — try now.
    await maybeAutoUnlock(req.params.id, agentFor(req));
    const state = await getGateState(req.params.id);
    res.json(state);
  });

  app.delete("/api/nurses/:id/cv-review", requireAdmin, async (req, res) => {
    const [nurse] = await db.select().from(nurses).where(eq(nurses.id, req.params.id));
    if (!nurse) return res.status(404).json({ message: "Nurse not found" });
    if (!nurse.cvReviewedAt) {
      const state = await getGateState(req.params.id);
      return res.json(state);
    }
    await db.update(nurses).set({
      cvReviewedAt: null,
      cvReviewedBy: null,
      updatedAt: new Date(),
    }).where(eq(nurses.id, req.params.id));
    await logAction(nurse.id, "admin", "cv_review_reopened", agentFor(req), {
      previouslyReviewedAt: nurse.cvReviewedAt?.toISOString?.() || null,
      previouslyReviewedBy: nurse.cvReviewedBy || null,
    });
    const state = await getGateState(req.params.id);
    res.json(state);
  });

  // ─── Uniform sizing (task 153) ───────────────────────────────────
  // Admin can set or update the nurse's uniform sizes from the
  // profile page. Length is an enum (short|regular|long); top &
  // trouser are short free text so the office can pencil in "M
  // 40-42" or similar. Always overwrites — sizes change, and the
  // admin always knows the latest figure.
  app.put("/api/nurses/:id/uniform-sizing", requireAdmin, async (req, res) => {
    const result = await applyUniformSizingUpdate({
      nurseId: req.params.id,
      body: req.body,
      updatedBy: agentFor(req),
      module: "admin",
      action: "uniform_sizing_updated",
    });
    if ("error" in result) return res.status(result.status).json({ message: result.error });
    res.json(result.nurse);
  });

  // One-off backfill for the nine named nurses whose sizes were
  // collected over WhatsApp before this feature existed. Idempotent
  // — running twice is fine, the second run is a no-op per nurse
  // whose sizes already match.
  app.post("/api/admin/uniform-sizing/backfill", requireSuperAdmin, async (req, res) => {
    const result = await runUniformSizingBackfill(agentFor(req));
    res.json(result);
  });

  // CSV export of every active nurse with their uniform sizes for
  // the office to bulk-order. Three new columns: top, trouser,
  // trouser length.
  app.get("/api/admin/uniform-sizing.csv", requireAdmin, async (_req, res) => {
    const rows = await db
      .select()
      .from(nurses)
      .where(isNull(nurses.archivedAt))
      .orderBy(nurses.fullName);
    const header = ["Full Name", "Email", "Phone", "Stage", "Uniform Top", "Uniform Trouser", "Uniform Trouser Length", "Sizing Updated At", "Sizing Updated By"];
    const csv = [header.join(",")];
    for (const n of rows) {
      csv.push([
        n.fullName,
        n.email || "",
        n.phone || "",
        n.currentStage || "",
        n.uniformTopSize || "",
        n.uniformTrouserSize || "",
        n.uniformTrouserLength || "",
        n.uniformSizingUpdatedAt ? n.uniformSizingUpdatedAt.toISOString() : "",
        n.uniformSizingUpdatedBy || "",
      ].map(csvCell).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="uniform-sizing-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv.join("\n"));
  });

  app.post("/api/admin/orphan-uploads/link", requireAdmin, async (req, res) => {
    try {
      const { filename, nurseId } = req.body || {};
      if (!filename || !nurseId) return res.status(400).json({ message: "filename and nurseId are required" });
      const { linkOrphanUpload } = await import("../document-recovery");
      const result = await linkOrphanUpload(String(filename), String(nurseId));
      res.json(result);
    } catch (err: any) {
      console.error("[Orphan Link] Failed:", err);
      res.status(500).json({ message: err.message || "Failed to link orphan file" });
    }
  });

  app.post("/api/admin/orphan-uploads/discard", requireAdmin, async (req, res) => {
    try {
      const { filename } = req.body || {};
      if (!filename) return res.status(400).json({ message: "filename is required" });
      const { discardOrphanUpload } = await import("../document-recovery");
      discardOrphanUpload(String(filename));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to discard file" });
    }
  });

  // ─── Document Recovery: SharePoint pull-back ────────────────────────
  app.post("/api/admin/sharepoint-pull/:nurseId", requireAdmin, async (req, res) => {
    try {
      const { pullSharePointForCandidate } = await import("../document-recovery");
      const summary = await pullSharePointForCandidate(String(req.params.nurseId));
      res.json(summary);
    } catch (err: any) {
      console.error("[SharePoint Pull] Failed:", err);
      res.status(500).json({ message: err.message || "SharePoint pull failed" });
    }
  });

  app.post("/api/admin/sharepoint-pull/bulk", requireAdmin, async (_req, res) => {
    try {
      const { pullSharePointForAll } = await import("../document-recovery");
      const result = await pullSharePointForAll();
      res.json(result);
    } catch (err: any) {
      console.error("[SharePoint Pull Bulk] Failed:", err);
      res.status(500).json({ message: err.message || "SharePoint bulk pull failed" });
    }
  });

  // ─── Document Recovery: Mailbox scan ────────────────────────────────
  app.post("/api/admin/mailbox-scan/:nurseId", requireAdmin, async (req, res) => {
    try {
      const { scanMailboxForCandidate } = await import("../document-recovery");
      const summary = await scanMailboxForCandidate(String(req.params.nurseId));
      res.json(summary);
    } catch (err: any) {
      console.error("[Mailbox Scan] Failed:", err);
      res.status(500).json({ message: err.message || "Mailbox scan failed" });
    }
  });

  app.post("/api/admin/mailbox-scan/bulk", requireAdmin, async (_req, res) => {
    try {
      const { scanMailboxForAll } = await import("../document-recovery");
      const result = await scanMailboxForAll();
      res.json(result);
    } catch (err: any) {
      console.error("[Mailbox Scan Bulk] Failed:", err);
      res.status(500).json({ message: err.message || "Mailbox bulk scan failed" });
    }
  });
}

function extractScore(analysis: string): number | undefined {
  const match = analysis.match(/(\d{1,3})(?:\s*\/\s*100|\s*%)/);
  return match ? parseInt(match[1], 10) : undefined;
}

// ─── Uniform sizing helpers (task 153) ──────────────────────────────
// Shared between the admin PUT and the portal PUT so both surfaces
// run the same validation + write + audit. See `portal-admin-parity`.
const UNIFORM_LENGTHS = new Set(["short", "regular", "long"]);

function normalizeUniformField(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (!t) return null;
  if (t.length > 80) return undefined;
  return t;
}

export type UniformLength = "short" | "regular" | "long";

export interface UniformSizingPatchInput {
  uniformTopSize?: string | null;
  uniformTrouserSize?: string | null;
  uniformTrouserLength?: UniformLength | null | "";
}

type UniformSizingDbPatch = {
  uniformTopSize?: string | null;
  uniformTrouserSize?: string | null;
  uniformTrouserLength?: UniformLength | null;
  uniformSizingUpdatedAt?: Date;
  uniformSizingUpdatedBy?: string;
  updatedAt?: Date;
};

export type ApplyUniformSizingResult =
  | { nurse: typeof nurses.$inferSelect }
  | { error: string; status: number };

export async function applyUniformSizingUpdate(opts: {
  nurseId: string;
  body: UniformSizingPatchInput | null | undefined;
  updatedBy: string;
  module: "admin" | "portal";
  action: string;
}): Promise<ApplyUniformSizingResult> {
  const { nurseId, body, updatedBy, module, action } = opts;
  const [nurse] = await db.select().from(nurses).where(eq(nurses.id, nurseId));
  if (!nurse) return { error: "Nurse not found", status: 404 };

  const src = (body ?? {}) as Record<string, unknown>;
  const patch: UniformSizingDbPatch = {};
  if ("uniformTopSize" in src) {
    const v = normalizeUniformField(src.uniformTopSize);
    if (v === undefined) return { error: "uniformTopSize must be a string up to 80 chars", status: 400 };
    patch.uniformTopSize = v;
  }
  if ("uniformTrouserSize" in src) {
    const v = normalizeUniformField(src.uniformTrouserSize);
    if (v === undefined) return { error: "uniformTrouserSize must be a string up to 80 chars", status: 400 };
    patch.uniformTrouserSize = v;
  }
  if ("uniformTrouserLength" in src) {
    const raw = src.uniformTrouserLength;
    if (raw === null || raw === "") {
      patch.uniformTrouserLength = null;
    } else if (typeof raw === "string" && UNIFORM_LENGTHS.has(raw)) {
      patch.uniformTrouserLength = raw as UniformLength;
    } else {
      return { error: "uniformTrouserLength must be one of: short, regular, long", status: 400 };
    }
  }
  if (Object.keys(patch).length === 0) {
    return { error: "No uniform sizing fields provided", status: 400 };
  }

  const now = new Date();
  patch.uniformSizingUpdatedAt = now;
  patch.uniformSizingUpdatedBy = updatedBy;
  patch.updatedAt = now;

  const [updated] = await db.update(nurses).set(patch).where(eq(nurses.id, nurseId)).returning();
  await logAction(nurseId, module, action, updatedBy, {
    fields: Object.keys(patch).filter(k => k !== "updatedAt" && k !== "uniformSizingUpdatedAt" && k !== "uniformSizingUpdatedBy"),
    top: updated.uniformTopSize,
    trouser: updated.uniformTrouserSize,
    length: updated.uniformTrouserLength,
  });
  return { nurse: updated };
}

// Names supplied in task #153 — sizes were collected over WhatsApp
// before the form existed. Length intentionally null where the nurse
// didn't specify one.
const UNIFORM_BACKFILL: Array<{ name: string; top: string; trouser: string; length: string | null }> = [
  { name: "Roderick Cabbab", top: "M 40-42", trouser: "M 34-35", length: null },
  { name: "Meseret Tsegay", top: "M 40-42", trouser: "M 34-35", length: null },
  { name: "Shafiq Kusi", top: "M 40-42", trouser: "L 36-38", length: null },
  { name: "Ricardo Roxo", top: "M 40-42", trouser: "M 34-35", length: null },
  { name: "Joriza Monforte", top: "M 10-12", trouser: "M 10-12", length: "regular" },
  { name: "Bisrat Haile", top: "M 10-12", trouser: "M 10-12", length: "short" },
  { name: "Maica Sanca", top: "S 6-8", trouser: "S 6-8", length: "short" },
  { name: "Naresh Kaur", top: "L 14", trouser: "L 14", length: "long" },
  { name: "Ruth Bobiles", top: "L 14", trouser: "L 14", length: "short" },
];

export async function runUniformSizingBackfill(actor: string) {
  const all = await db.select().from(nurses);
  const byNameLower = new Map(all.map(n => [n.fullName.trim().toLowerCase(), n]));
  const applied: Array<{ name: string; nurseId: string; changed: boolean }> = [];
  const missing: string[] = [];
  for (const row of UNIFORM_BACKFILL) {
    const match = byNameLower.get(row.name.toLowerCase());
    if (!match) { missing.push(row.name); continue; }
    const sameTop = (match.uniformTopSize || "") === row.top;
    const sameTrouser = (match.uniformTrouserSize || "") === row.trouser;
    const sameLength = (match.uniformTrouserLength || null) === row.length;
    if (sameTop && sameTrouser && sameLength) {
      applied.push({ name: row.name, nurseId: match.id, changed: false });
      continue;
    }
    const now = new Date();
    await db.update(nurses).set({
      uniformTopSize: row.top,
      uniformTrouserSize: row.trouser,
      uniformTrouserLength: row.length,
      uniformSizingUpdatedAt: now,
      uniformSizingUpdatedBy: actor,
      updatedAt: now,
    }).where(eq(nurses.id, match.id));
    await logAction(match.id, "admin", "uniform_sizing_backfilled", actor, {
      top: row.top, trouser: row.trouser, length: row.length, source: "whatsapp",
    });
    applied.push({ name: row.name, nurseId: match.id, changed: true });
  }
  return { applied, missing, total: applied.length };
}

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
