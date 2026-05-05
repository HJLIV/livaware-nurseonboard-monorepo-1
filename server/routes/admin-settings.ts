// Admin-only routes for tunable platform settings.
//
// Currently exposes one settings group: the scheduled training-chase jobs
// (weekly bulk chase + mailbox reply scan). Both jobs are toggleable from
// /settings in the admin UI; their actual execution lives in
// training-chase-scheduler.ts.

import type { Express, Request } from "express";
import type { TrainingChaseScheduleSettings } from "@shared/schema";
import { requireAdmin } from "../middleware";
import {
  getTrainingChaseScheduleSettings,
  saveTrainingChaseScheduleSettings,
  runWeeklyTrainingChase,
} from "../training-chase-scheduler";
import { isOutlookConfigured } from "../outlook";
import { storage } from "../storage";

function portalBaseUrlFromReq(req: Request): string {
  const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["host"] as string) || "localhost:5000";
  return `${protocol}://${host}`;
}

function agentNameFor(req: Request): string {
  return req.session?.username || "admin";
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
  app.put("/api/admin/settings/training-chase-schedule", requireAdmin, async (req, res) => {
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

      const settings = await saveTrainingChaseScheduleSettings(patch, agentNameFor(req));
      await storage.createAuditLog({
        action: "training_chase_schedule_updated",
        agentName: agentNameFor(req),
        detail: { patch, resulting: settings },
      });
      res.json({ outlookConfigured: isOutlookConfigured(), settings });
    } catch (err: any) {
      console.error("[admin-settings] put training-chase-schedule failed:", err);
      res.status(500).json({ message: err?.message || "Failed to save settings" });
    }
  });

  // POST — fire the weekly chase manually (regardless of schedule). Same
  // exact code path the scheduled tick uses, so admins can verify the job
  // works without waiting for Monday.
  app.post("/api/admin/settings/training-chase-schedule/run-weekly-now", requireAdmin, async (req, res) => {
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
