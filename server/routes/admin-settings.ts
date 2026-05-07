// Admin-only routes for tunable platform settings.
//
// Currently exposes one settings group: the scheduled training-chase jobs
// (weekly bulk chase + mailbox reply scan). Both jobs are toggleable from
// /settings in the admin UI; their actual execution lives in
// training-chase-scheduler.ts.

import type { Express, Request } from "express";
import {
  POLICY_READ_BEHAVIOUR_PERMISSIONS_KEY,
  DEFAULT_POLICY_READ_BEHAVIOUR_PERMISSIONS,
  type PolicyReadBehaviourPermissions,
  type TrainingChaseScheduleSettings,
  type ScheduledJobRun,
} from "@shared/schema";
import {
  requireAdmin,
  requireSuperAdmin,
  requireTopLevelAdmin,
  getTopLevelAdminUsername,
} from "../middleware";
import {
  getTrainingChaseScheduleSettings,
  saveTrainingChaseScheduleSettings,
  runWeeklyTrainingChase,
  TrainingChaseSettingsValidationError,
} from "../training-chase-scheduler";
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

  // ─── Policy reading-behaviour permission allowlist ───────────────
  // GET — readable by any admin so the /settings page can render the
  // current state (and hide the editor for non-top-level admins).
  app.get("/api/admin/settings/policy-read-behaviour", requireAdmin, async (_req, res) => {
    try {
      const stored = await storage.getAppSetting<PolicyReadBehaviourPermissions>(
        POLICY_READ_BEHAVIOUR_PERMISSIONS_KEY,
      );
      const allowedIdentifiers = Array.isArray(stored?.allowedIdentifiers)
        ? stored!.allowedIdentifiers.filter((s): s is string => typeof s === "string")
        : DEFAULT_POLICY_READ_BEHAVIOUR_PERMISSIONS.allowedIdentifiers;
      res.json({
        allowedIdentifiers,
        topLevelAdminUsername: getTopLevelAdminUsername(),
      });
    } catch (err: any) {
      console.error("[admin-settings] get policy-read-behaviour failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load permissions" });
    }
  });

  // PUT — only the top-level admin can grant/revoke. Body is
  // `{ allowedIdentifiers: string[] }` of usernames or emails.
  app.put("/api/admin/settings/policy-read-behaviour", requireTopLevelAdmin, async (req, res) => {
    try {
      const raw = (req.body || {}) as { allowedIdentifiers?: unknown };
      if (raw.allowedIdentifiers !== undefined && !Array.isArray(raw.allowedIdentifiers)) {
        return res.status(400).json({ message: "allowedIdentifiers must be an array of strings." });
      }
      const list = Array.isArray(raw.allowedIdentifiers) ? raw.allowedIdentifiers : [];
      // Normalize: trim, lowercase, dedupe, drop empties + obviously-bad
      // entries. Cap at a reasonable size to avoid runaway settings.
      const seen = new Set<string>();
      const cleaned: string[] = [];
      for (const entry of list) {
        if (typeof entry !== "string") continue;
        const v = entry.trim().toLowerCase();
        if (!v || v.length > 200) continue;
        if (seen.has(v)) continue;
        seen.add(v);
        cleaned.push(v);
        if (cleaned.length >= 100) break;
      }
      const next: PolicyReadBehaviourPermissions = { allowedIdentifiers: cleaned };
      await storage.setAppSetting(POLICY_READ_BEHAVIOUR_PERMISSIONS_KEY, next, agentNameFor(req));
      await storage.createAuditLog({
        action: "policy_read_behaviour_permissions_updated",
        agentName: agentNameFor(req),
        detail: { allowedIdentifiers: cleaned },
      });
      res.json({ allowedIdentifiers: cleaned, topLevelAdminUsername: getTopLevelAdminUsername() });
    } catch (err: any) {
      console.error("[admin-settings] put policy-read-behaviour failed:", err);
      res.status(500).json({ message: err?.message || "Failed to save permissions" });
    }
  });

  // POST — fire the weekly chase manually (regardless of schedule). Same
  // exact code path the scheduled tick uses, so admins can verify the job
  // works without waiting for Monday.
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
