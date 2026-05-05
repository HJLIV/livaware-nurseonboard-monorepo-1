// Background scheduler for the two automated training-chase jobs:
//
//   1. Weekly bulk chase email — fires once a week (default Mondays 09:00
//      server local time) and sends the same chase email the admin would
//      send manually from the Mandatory Training Matrix to every nurse who
//      has outstanding mandatory training and hasn't been chased in the
//      last `weeklyChaseMinGapDays` days.
//
//   2. Mailbox reply scan — periodically scans the shared mailbox for
//      attachments returned by nurses in response to a chase email. It
//      reuses scanMailboxForChaseRepliesAll so the same auto-attach +
//      flag-for-review behaviour and admin summary email are produced.
//
// Both jobs are toggleable via /api/admin/settings/training-chase-schedule
// (persisted in app_settings). The scheduler ticks every minute, reads the
// latest settings on each tick, and uses an in-memory mutex per job so
// long-running runs can't overlap themselves.

import {
  TRAINING_CHASE_SCHEDULE_SETTING_KEY,
  DEFAULT_TRAINING_CHASE_SCHEDULE,
  type TrainingChaseScheduleSettings,
} from "@shared/schema";
import { storage } from "./storage";
import { isOutlookConfigured, getGraphClient } from "./outlook";
import {
  computeOutstandingTrainingForNurse,
  sendTrainingChaseEmail,
  scanMailboxForChaseRepliesAll,
  resolveChaseSummaryRecipients,
  TRAINING_CHASE_DEFAULT_SUBJECT,
  TRAINING_CHASE_DEFAULT_BODY,
  type OutstandingModule,
  type BulkChaseReplyScanSummary,
} from "./training-notifications";

const SENDER_EMAIL = process.env.AZURE_AD_SENDER_EMAIL || "onboarding@livaware.co.uk";
const TICK_INTERVAL_MS = 60 * 1000; // 1 minute master tick

// In-memory mutexes prevent one tick's run from overlapping the next.
let weeklyChaseRunning = false;
let replyScanRunning = false;
let schedulerStarted = false;

export async function getTrainingChaseScheduleSettings(): Promise<TrainingChaseScheduleSettings> {
  const stored = await storage.getAppSetting<Partial<TrainingChaseScheduleSettings>>(
    TRAINING_CHASE_SCHEDULE_SETTING_KEY,
  );
  return { ...DEFAULT_TRAINING_CHASE_SCHEDULE, ...(stored ?? {}) };
}

export async function saveTrainingChaseScheduleSettings(
  patch: Partial<TrainingChaseScheduleSettings>,
  updatedBy?: string,
): Promise<TrainingChaseScheduleSettings> {
  const current = await getTrainingChaseScheduleSettings();
  const merged: TrainingChaseScheduleSettings = { ...current, ...patch };
  // Clamp/validate user-editable fields. We deliberately don't expose
  // last*RunAt to PUT validation — it's overwritten by the scheduler.
  merged.weeklyChaseDayOfWeek = clampInt(merged.weeklyChaseDayOfWeek, 0, 6, 1);
  merged.weeklyChaseHour = clampInt(merged.weeklyChaseHour, 0, 23, 9);
  merged.weeklyChaseTimeZone = sanitizeTimeZone(merged.weeklyChaseTimeZone, "Europe/London");
  merged.weeklyChaseMinGapDays = clampInt(merged.weeklyChaseMinGapDays, 1, 90, 14);
  merged.replyScanIntervalMinutes = clampInt(merged.replyScanIntervalMinutes, 5, 24 * 60, 30);
  // Validate the configurable summary-email recipient list. An invalid
  // address throws a TrainingChaseSettingsValidationError so the route
  // layer can surface it as a 400 instead of a 500.
  merged.summaryRecipients = normalizeSummaryRecipients(merged.summaryRecipients);
  await storage.setAppSetting(TRAINING_CHASE_SCHEDULE_SETTING_KEY, merged, updatedBy);
  return merged;
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.round(n);
  return Math.min(max, Math.max(min, i));
}

// Validate the configured IANA zone by handing it to Intl.DateTimeFormat
// (which throws on unknown zones). Unknown / non-string values fall back
// to the default so a typo in the admin UI can't break the scheduler.
function sanitizeTimeZone(v: unknown, fallback: string): string {
  if (typeof v !== "string" || !v.trim()) return fallback;
  const candidate = v.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return fallback;
  }
}

// Read the weekday (0=Sun..6=Sat) and hour-of-day (0..23) of `date` as
// they would appear on a wall clock in `timeZone`. Used by the scheduler
// to decide whether the current minute matches the configured slot in
// the admin's chosen zone (rather than the server's UTC clock).
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};
function getZonedDayHour(date: Date, timeZone: string): { day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  // Intl can emit "24" for midnight in some locales/configs; normalise.
  const hourNum = Number(hourStr);
  const hour = Number.isFinite(hourNum) ? hourNum % 24 : 0;
  return { day: WEEKDAY_INDEX[weekday] ?? 0, hour };
}

// Thrown by saveTrainingChaseScheduleSettings when the recipients list is
// malformed. Callers (the admin-settings route) catch this and translate it
// to a 400 response instead of a generic 500.
export class TrainingChaseSettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainingChaseSettingsValidationError";
  }
}

// Reasonable, deliberately-strict-enough RFC-5321-ish check. We're not
// trying to cover every legal email — just catch obvious typos like
// "compliance@" or "compliance" before they get persisted.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeSummaryRecipients(input: unknown): string[] {
  // Accept either an array of strings (preferred from the UI) or a single
  // comma/semicolon/newline-separated string for forgiveness.
  let raw: string[];
  if (Array.isArray(input)) {
    raw = input.map((x) => (typeof x === "string" ? x : String(x ?? "")));
  } else if (typeof input === "string") {
    raw = input.split(/[\s,;]+/);
  } else if (input == null) {
    return [];
  } else {
    throw new TrainingChaseSettingsValidationError(
      "summaryRecipients must be an array of email addresses",
    );
  }
  const cleaned: string[] = [];
  for (const entry of raw) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (!EMAIL_REGEX.test(trimmed)) {
      throw new TrainingChaseSettingsValidationError(
        `"${trimmed}" is not a valid email address`,
      );
    }
    // De-dupe case-insensitively but preserve the user's casing on first
    // occurrence so display in the UI matches what was typed.
    if (!cleaned.some((e) => e.toLowerCase() === trimmed.toLowerCase())) {
      cleaned.push(trimmed);
    }
  }
  return cleaned;
}

// Resolve the public base URL the scheduler should mint portal upload links
// against. Unlike the manual matrix flow we have no incoming Request, so we
// fall back through env vars in explicit order:
//   1. PORTAL_BASE_URL — operator-set canonical URL (preferred in prod)
//   2. PUBLIC_APP_URL  — generic public URL the app may already use
//   3. REPLIT_DEV_DOMAIN — dev-preview hostname (Replit auto-sets this)
//   4. http://localhost:5000 — local fallback
// Each candidate is checked individually so an empty/undefined earlier var
// does NOT cause us to silently fall through to a stringified "undefined".
function resolveSchedulerPortalBaseUrl(): string {
  const portalBaseUrl = process.env.PORTAL_BASE_URL;
  if (portalBaseUrl && portalBaseUrl.trim()) return portalBaseUrl.trim();
  const publicAppUrl = process.env.PUBLIC_APP_URL;
  if (publicAppUrl && publicAppUrl.trim()) return publicAppUrl.trim();
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain && devDomain.trim()) return `https://${devDomain.trim()}`;
  return "http://localhost:5000";
}

// ─────────────────────────────────────────────────────────────────────────
// Weekly bulk chase
// ─────────────────────────────────────────────────────────────────────────

export interface WeeklyChaseResult {
  triggeredBy: string;
  startedAt: string;
  finishedAt: string;
  candidatesConsidered: number;
  candidatesEligible: number;
  candidatesSkippedRecentlyChased: number;
  candidatesSkippedNoEmail: number;
  candidatesSkippedNoOutstanding: number;
  succeeded: number;
  failed: number;
  // True when the run aborted before doing any work because the platform
  // can't actually send mail (Outlook integration not configured). The
  // scheduler uses this to avoid suppressing the next scheduled attempt.
  skippedOutlookNotConfigured: boolean;
  results: Array<{
    nurseId: string;
    name: string;
    email: string | null;
    ok: boolean;
    moduleCount: number;
    error?: string;
  }>;
  errors: string[];
}

/**
 * Send chase emails to every nurse with outstanding mandatory training who
 * hasn't been chased in the last `minGapDays` days. Used by both the
 * scheduled weekly job and the admin "Run now" button.
 */
export async function runWeeklyTrainingChase(opts: {
  triggeredBy: string;
  minGapDays: number;
  portalBaseUrl: string;
}): Promise<WeeklyChaseResult> {
  const startedAt = new Date();
  const result: WeeklyChaseResult = {
    triggeredBy: opts.triggeredBy,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    candidatesConsidered: 0,
    candidatesEligible: 0,
    candidatesSkippedRecentlyChased: 0,
    candidatesSkippedNoEmail: 0,
    candidatesSkippedNoOutstanding: 0,
    succeeded: 0,
    failed: 0,
    skippedOutlookNotConfigured: false,
    results: [],
    errors: [],
  };

  if (!isOutlookConfigured()) {
    result.errors.push("Outlook integration not configured.");
    result.skippedOutlookNotConfigured = true;
    result.finishedAt = new Date().toISOString();
    return result;
  }

  const template = {
    subject: TRAINING_CHASE_DEFAULT_SUBJECT,
    body: TRAINING_CHASE_DEFAULT_BODY,
  };

  const candidates = await storage.getCandidates();
  const lastByNurse = await storage.getLatestTrainingNotifications();
  const minGapMs = Math.max(1, opts.minGapDays) * 24 * 60 * 60 * 1000;
  const now = Date.now();

  result.candidatesConsidered = candidates.length;

  for (const n of candidates) {
    if (!n.email) {
      result.candidatesSkippedNoEmail += 1;
      continue;
    }
    const last = lastByNurse.get(n.id);
    if (last?.sentAt && now - new Date(last.sentAt).getTime() < minGapMs) {
      result.candidatesSkippedRecentlyChased += 1;
      continue;
    }
    let modules: OutstandingModule[];
    try {
      modules = await computeOutstandingTrainingForNurse(n.id);
    } catch (e: any) {
      result.errors.push(`${n.fullName}: outstanding-training computation failed: ${e?.message || String(e)}`);
      continue;
    }
    if (modules.length === 0) {
      result.candidatesSkippedNoOutstanding += 1;
      continue;
    }
    result.candidatesEligible += 1;
    try {
      const r = await sendTrainingChaseEmail({
        nurse: n,
        template,
        modules,
        sentBy: opts.triggeredBy,
        portalBaseUrl: opts.portalBaseUrl,
      });
      result.succeeded += 1;
      result.results.push({
        nurseId: n.id,
        name: n.fullName,
        email: n.email,
        ok: true,
        moduleCount: r.modulesIncluded.length,
      });
    } catch (e: any) {
      result.failed += 1;
      const msg = e?.message || String(e);
      result.results.push({
        nurseId: n.id,
        name: n.fullName,
        email: n.email,
        ok: false,
        moduleCount: modules.length,
        error: msg,
      });
    }
  }

  result.finishedAt = new Date().toISOString();

  // Admin summary email — only when there's something worth reporting.
  if (result.succeeded > 0 || result.failed > 0 || result.errors.length > 0) {
    try {
      await sendWeeklyChaseAdminSummary(result);
    } catch (e: any) {
      console.warn("[training-chase-scheduler] weekly summary email failed:", e?.message || e);
    }
  }

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendWeeklyChaseAdminSummary(r: WeeklyChaseResult): Promise<void> {
  const client = await getGraphClient();
  const failedRows = r.results
    .filter((x) => !x.ok)
    .map(
      (x) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(x.name)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(x.email || "(no email)")}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#b91c1c;">${escapeHtml(x.error || "")}</td>
        </tr>`,
    )
    .join("");
  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="color:#020121;">Weekly training chase complete</h2>
      <p>Triggered by <strong>${escapeHtml(r.triggeredBy)}</strong> on ${new Date(r.startedAt).toLocaleString("en-GB")}.</p>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;">
        <tr><td style="padding:4px 8px;color:#555;">Candidates considered</td><td style="padding:4px 8px;">${r.candidatesConsidered}</td></tr>
        <tr><td style="padding:4px 8px;color:#555;">Skipped — recently chased</td><td style="padding:4px 8px;">${r.candidatesSkippedRecentlyChased}</td></tr>
        <tr><td style="padding:4px 8px;color:#555;">Skipped — no outstanding training</td><td style="padding:4px 8px;">${r.candidatesSkippedNoOutstanding}</td></tr>
        <tr><td style="padding:4px 8px;color:#555;">Skipped — no email on file</td><td style="padding:4px 8px;">${r.candidatesSkippedNoEmail}</td></tr>
        <tr><td style="padding:4px 8px;color:#555;">Chase emails sent</td><td style="padding:4px 8px;color:#16a34a;font-weight:600;">${r.succeeded}</td></tr>
        <tr><td style="padding:4px 8px;color:#555;">Failed</td><td style="padding:4px 8px;color:#b91c1c;font-weight:600;">${r.failed}</td></tr>
      </table>
      ${
        failedRows.length
          ? `
        <h3 style="margin-top:20px;color:#b91c1c;">Failures</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f3f4f6;text-align:left;">
            <th style="padding:6px 8px;">Candidate</th>
            <th style="padding:6px 8px;">Email</th>
            <th style="padding:6px 8px;">Error</th>
          </tr></thead>
          <tbody>${failedRows}</tbody>
        </table>`
          : `<p style="color:#16a34a;">No send failures.</p>`
      }
    </div>
  `;
  const recipients = await resolveChaseSummaryRecipients();
  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject: `Weekly training chase — ${r.succeeded} sent, ${r.failed} failed`,
      body: { contentType: "HTML", content: html },
      toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
    },
    saveToSentItems: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Scheduler tick
// ─────────────────────────────────────────────────────────────────────────

function shouldRunWeeklyChase(
  settings: TrainingChaseScheduleSettings,
  now: Date,
): boolean {
  if (!settings.weeklyChaseEnabled) return false;
  // Compare day/hour in the admin's configured zone (not the server's UTC
  // clock) so e.g. "Monday 09:00 Europe/London" stays correct across BST.
  const tz = sanitizeTimeZone(settings.weeklyChaseTimeZone, "Europe/London");
  const { day, hour } = getZonedDayHour(now, tz);
  if (day !== settings.weeklyChaseDayOfWeek) return false;
  if (hour !== settings.weeklyChaseHour) return false;
  // Already ran today within the configured hour? Skip — using a 6-day
  // floor to absorb any DST / clock drift while still firing once per week.
  if (settings.lastWeeklyChaseRunAt) {
    const lastMs = new Date(settings.lastWeeklyChaseRunAt).getTime();
    if (Number.isFinite(lastMs) && now.getTime() - lastMs < 6 * 24 * 60 * 60 * 1000) {
      return false;
    }
  }
  return true;
}

function shouldRunReplyScan(
  settings: TrainingChaseScheduleSettings,
  now: Date,
): boolean {
  if (!settings.replyScanEnabled) return false;
  const intervalMs = Math.max(5, settings.replyScanIntervalMinutes) * 60 * 1000;
  if (!settings.lastReplyScanRunAt) return true;
  const lastMs = new Date(settings.lastReplyScanRunAt).getTime();
  if (!Number.isFinite(lastMs)) return true;
  return now.getTime() - lastMs >= intervalMs;
}

// Public tick — exported for tests / manual triggers, but normally driven
// by setInterval inside startTrainingChaseScheduler.
export async function tickTrainingChaseScheduler(now: Date = new Date()): Promise<void> {
  let settings: TrainingChaseScheduleSettings;
  try {
    settings = await getTrainingChaseScheduleSettings();
  } catch (e: any) {
    console.warn("[training-chase-scheduler] failed to load settings:", e?.message || e);
    return;
  }

  // Weekly chase
  if (!weeklyChaseRunning && shouldRunWeeklyChase(settings, now)) {
    weeklyChaseRunning = true;
    try {
      const r = await runWeeklyTrainingChase({
        triggeredBy: "Scheduled weekly chase",
        minGapDays: settings.weeklyChaseMinGapDays,
        portalBaseUrl: resolveSchedulerPortalBaseUrl(),
      });
      console.log(
        `[training-chase-scheduler] weekly chase: considered=${r.candidatesConsidered} sent=${r.succeeded} failed=${r.failed} skippedRecent=${r.candidatesSkippedRecentlyChased}${r.skippedOutlookNotConfigured ? " [skipped: outlook not configured]" : ""}`,
      );
      // Only mark last-run when we actually attempted to send. If Outlook
      // wasn't configured the run was a no-op, so let the next tick retry
      // instead of waiting another full week.
      if (!r.skippedOutlookNotConfigured) {
        await saveLastRun({ lastWeeklyChaseRunAt: new Date().toISOString() });
      }
    } catch (e: any) {
      console.warn("[training-chase-scheduler] weekly chase failed:", e?.message || e);
    } finally {
      weeklyChaseRunning = false;
    }
  }

  // Reply scan
  if (!replyScanRunning && shouldRunReplyScan(settings, now)) {
    replyScanRunning = true;
    try {
      if (isOutlookConfigured()) {
        const r: BulkChaseReplyScanSummary = await scanMailboxForChaseRepliesAll(
          "Scheduled mailbox scanner",
        );
        if (r.totalAttachmentsProcessed > 0 || r.errors.length > 0) {
          console.log(
            `[training-chase-scheduler] reply scan: nurses=${r.scannedNurses} processed=${r.totalAttachmentsProcessed} autoAttached=${r.totalAutoAttached} needsReview=${r.totalNeedsReview} errors=${r.errors.length}`,
          );
        }
      }
      await saveLastRun({ lastReplyScanRunAt: new Date().toISOString() });
    } catch (e: any) {
      console.warn("[training-chase-scheduler] reply scan failed:", e?.message || e);
    } finally {
      replyScanRunning = false;
    }
  }
}

async function saveLastRun(patch: Partial<TrainingChaseScheduleSettings>): Promise<void> {
  // Merge into the persisted settings so the next tick can read updated
  // last-run timestamps.
  const current = await getTrainingChaseScheduleSettings();
  const merged: TrainingChaseScheduleSettings = { ...current, ...patch };
  await storage.setAppSetting(TRAINING_CHASE_SCHEDULE_SETTING_KEY, merged, "scheduler");
}

export function startTrainingChaseScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  // Stagger the first run a few seconds after boot so we don't compete with
  // app startup, then tick every minute.
  setTimeout(() => { void tickTrainingChaseScheduler(); }, 30 * 1000);
  setInterval(() => { void tickTrainingChaseScheduler(); }, TICK_INTERVAL_MS);
}
