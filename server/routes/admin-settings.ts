// Admin-only routes for tunable platform settings.
//
// Currently exposes one settings group: the scheduled training-chase jobs
// (weekly bulk chase + mailbox reply scan). Both jobs are toggleable from
// /settings in the admin UI; their actual execution lives in
// training-chase-scheduler.ts.

import type { Express, Request } from "express";
import {
  type TrainingChaseScheduleSettings,
  type ScheduledJobRun,
  type PreboardIntegritySettings,
  SUSPECT_BURST_CHAR_THRESHOLD_MIN,
  SUSPECT_BURST_CHAR_THRESHOLD_MAX,
} from "@shared/schema";
import {
  requireAdmin,
  requireSuperAdmin,
} from "../middleware";
import {
  getTrainingChaseScheduleSettings,
  saveTrainingChaseScheduleSettings,
  runWeeklyTrainingChase,
  TrainingChaseSettingsValidationError,
} from "../training-chase-scheduler";
import {
  getPreboardIntegritySettings,
  savePreboardIntegritySettings,
} from "../preboard-integrity-settings";
import { isOutlookConfigured } from "../outlook";
import { storage } from "../storage";

// Whitelist of jobType values accepted by the run-history endpoints. Keeps
// the route from blowing up on a typo'd query param and produces a clear
// 400 instead.
const VALID_JOB_TYPES: ReadonlyArray<ScheduledJobRun["jobType"]> = ["weekly_chase", "reply_scan"];

function portalBaseUrlFromReq(req: Request): string {
  const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["host"] as string) || "localhost:5000";
  return `${protocol}://${host}`;
}

function agentNameFor(req: Request): string {
  const u = req.session?.username;
  const r = req.session?.role;
  if (!u) return "admin";
  return r ? `${u} (${r})` : u;
}

export function registerAdminSettingsRoutes(app: Express): void {
  // GET — current scheduled-chase settings + last-run timestamps. Used by
  // the /settings admin page to seed the form.
  app.get("/api/admin/settings/training-chase-schedule", requireAdmin, async (_req, res) => {
    try {
      const settings = await getTrainingChaseScheduleSettings();
      res.json({
        outlookConfigured: isOutlookConfigured(),
        settings,
      });
    } catch (err: any) {
      console.error("[admin-settings] get training-chase-schedule failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load settings" });
    }
  });

  // PUT — update the editable subset of the schedule settings. last*RunAt
  // are server-managed and not accepted from the request body.
  app.put("/api/admin/settings/training-chase-schedule", requireSuperAdmin, async (req, res) => {
    try {
      const body = (req.body || {}) as Partial<Record<keyof TrainingChaseScheduleSettings, unknown>>;
      const patch: Partial<TrainingChaseScheduleSettings> = {};
      if (typeof body.weeklyChaseEnabled === "boolean") patch.weeklyChaseEnabled = body.weeklyChaseEnabled;
      if (typeof body.weeklyChaseDayOfWeek === "number") patch.weeklyChaseDayOfWeek = body.weeklyChaseDayOfWeek;
      if (typeof body.weeklyChaseHour === "number") patch.weeklyChaseHour = body.weeklyChaseHour;
      if (typeof body.weeklyChaseTimeZone === "string") patch.weeklyChaseTimeZone = body.weeklyChaseTimeZone;
      if (typeof body.weeklyChaseMinGapDays === "number") patch.weeklyChaseMinGapDays = body.weeklyChaseMinGapDays;
      if (typeof body.replyScanEnabled === "boolean") patch.replyScanEnabled = body.replyScanEnabled;
      if (typeof body.replyScanIntervalMinutes === "number") patch.replyScanIntervalMinutes = body.replyScanIntervalMinutes;
      // The two summary-recipient lists arrive as arrays (or strings, for
      // forgiveness); normalize+validate happens inside
      // saveTrainingChaseScheduleSettings. They're independent so an admin
      // can configure one without touching the other.
      if (body.weeklyChaseSummaryRecipients !== undefined) {
        patch.weeklyChaseSummaryRecipients = body.weeklyChaseSummaryRecipients as string[];
      }
      if (body.replyScanSummaryRecipients !== undefined) {
        patch.replyScanSummaryRecipients = body.replyScanSummaryRecipients as string[];
      }

      const settings = await saveTrainingChaseScheduleSettings(patch, agentNameFor(req));
      await storage.createAuditLog({
        action: "training_chase_schedule_updated",
        agentName: agentNameFor(req),
        detail: { patch, resulting: settings },
      });
      res.json({ outlookConfigured: isOutlookConfigured(), settings });
    } catch (err: any) {
      if (err instanceof TrainingChaseSettingsValidationError) {
        res.status(400).json({ message: err.message });
        return;
      }
      console.error("[admin-settings] put training-chase-schedule failed:", err);
      res.status(500).json({ message: err?.message || "Failed to save settings" });
    }
  });

  // GET — recent run history for a single scheduled job. Returns a small
  // summary row per run (status + counters) so the /settings UI can show a
  // "Recent runs" table without having to load every run's full detail.
  app.get("/api/admin/settings/scheduled-job-runs", requireAdmin, async (req, res) => {
    try {
      const jobTypeRaw = String(req.query.jobType || "");
      if (!VALID_JOB_TYPES.includes(jobTypeRaw as ScheduledJobRun["jobType"])) {
        return res.status(400).json({
          message: `Invalid jobType. Expected one of: ${VALID_JOB_TYPES.join(", ")}.`,
        });
      }
      const jobType = jobTypeRaw as ScheduledJobRun["jobType"];
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.round(limitRaw))) : 10;
      const runs = await storage.listScheduledJobRuns(jobType, limit);
      // Strip `detail` from list responses — it can be large, and the table
      // view doesn't need it. Detail is fetched lazily via the per-run GET.
      const summaries = runs.map(({ detail: _detail, ...rest }) => rest);
      res.json({ jobType, runs: summaries });
    } catch (err: any) {
      console.error("[admin-settings] list scheduled-job-runs failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load run history" });
    }
  });

  // GET — full per-run payload (including the detail blob the run produced).
  // Used by the per-run modal on /settings to show the per-nurse breakdown.
  app.get("/api/admin/settings/scheduled-job-runs/:id", requireAdmin, async (req, res) => {
    try {
      const run = await storage.getScheduledJobRun(String(req.params.id));
      if (!run) return res.status(404).json({ message: "Run not found" });
      res.json(run);
    } catch (err: any) {
      console.error("[admin-settings] get scheduled-job-run failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load run" });
    }
  });

  // GET — current preboard integrity settings (suspect-typing burst
  // threshold). Available to any admin so the /preboard and candidate
  // detail pages can render the live threshold in their badges.
  app.get("/api/admin/settings/preboard-integrity", requireAdmin, async (_req, res) => {
    try {
      const settings = await getPreboardIntegritySettings();
      res.json({
        settings,
        bounds: {
          min: SUSPECT_BURST_CHAR_THRESHOLD_MIN,
          max: SUSPECT_BURST_CHAR_THRESHOLD_MAX,
        },
      });
    } catch (err: any) {
      console.error("[admin-settings] get preboard-integrity failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load settings" });
    }
  });

  // PUT — super-admin gated: update the preboard integrity threshold.
  app.put("/api/admin/settings/preboard-integrity", requireSuperAdmin, async (req, res) => {
    try {
      const body = (req.body || {}) as Partial<Record<keyof PreboardIntegritySettings, unknown>>;
      const patch: Partial<PreboardIntegritySettings> = {};
      if (body.suspectBurstCharThreshold !== undefined) {
        patch.suspectBurstCharThreshold = body.suspectBurstCharThreshold as number;
      }
      const settings = await savePreboardIntegritySettings(patch, agentNameFor(req));
      await storage.createAuditLog({
        action: "preboard_integrity_settings_updated",
        agentName: agentNameFor(req),
        detail: { patch, resulting: settings },
      });
      res.json({
        settings,
        bounds: {
          min: SUSPECT_BURST_CHAR_THRESHOLD_MIN,
          max: SUSPECT_BURST_CHAR_THRESHOLD_MAX,
        },
      });
    } catch (err: any) {
      if (err && err.name === "PreboardIntegritySettingsValidationError") {
        res.status(400).json({ message: err.message });
        return;
      }
      console.error("[admin-settings] put preboard-integrity failed:", err);
      res.status(500).json({ message: err?.message || "Failed to save settings" });
    }
  });

  app.post("/api/admin/settings/training-chase-schedule/run-weekly-now", requireSuperAdmin, async (req, res) => {
    try {
      const settings = await getTrainingChaseScheduleSettings();
      const result = await runWeeklyTrainingChase({
        triggeredBy: `Manual run by ${agentNameFor(req)}`,
        minGapDays: settings.weeklyChaseMinGapDays,
        portalBaseUrl: portalBaseUrlFromReq(req),
      });
      // Update last-run so the next scheduled tick respects the manual run,
      // BUT only when we actually tried to send. If Outlook wasn't
      // configured the manual run was a no-op and shouldn't suppress the
      // next scheduled attempt.
      if (!result.skippedOutlookNotConfigured) {
        const lastRunPatch: Partial<TrainingChaseScheduleSettings> = {
          lastWeeklyChaseRunAt: result.finishedAt,
        };
        await saveTrainingChaseScheduleSettings(lastRunPatch, agentNameFor(req));
      }
      res.json(result);
    } catch (err: any) {
      console.error("[admin-settings] manual weekly chase failed:", err);
      res.status(500).json({ message: err?.message || "Failed to run weekly chase" });
    }
  });
}
