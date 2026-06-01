import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Inbox, AlertCircle, PlayCircle, Save, Send, History, Activity, FileSignature } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { SuperAdminViewOnlyBanner, SuperAdminGate } from "@/components/super-admin-only";
import { useAuth } from "@/lib/auth";
import {
  SUSPECT_BURST_CHAR_THRESHOLD,
  SUSPECT_BURST_CHAR_THRESHOLD_MIN,
  SUSPECT_BURST_CHAR_THRESHOLD_MAX,
  type PreboardIntegritySettings,
} from "@shared/schema";

interface TrainingChaseScheduleSettings {
  weeklyChaseEnabled: boolean;
  weeklyChaseDayOfWeek: number;
  weeklyChaseHour: number;
  weeklyChaseTimeZone: string;
  weeklyChaseMinGapDays: number;
  replyScanEnabled: boolean;
  replyScanIntervalMinutes: number;
  // Independent recipient lists for the two scheduled-job admin summary
  // emails. Each falls back to the shared sender mailbox when empty.
  weeklyChaseSummaryRecipients: string[];
  replyScanSummaryRecipients: string[];
  lastWeeklyChaseRunAt?: string | null;
  lastReplyScanRunAt?: string | null;
}

// Curated list of IANA zones for the dropdown. Anything else (a typo, an
// older value already in storage) falls through to a free-text input so
// admins can still type an exotic zone if they need to.
const COMMON_TIME_ZONES = [
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

interface SettingsResponse {
  outlookConfigured: boolean;
  settings: TrainingChaseScheduleSettings;
}

interface WeeklyChaseRunResult {
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
  errors: string[];
  results?: Array<{
    nurseId: string;
    name: string;
    email: string | null;
    ok: boolean;
    moduleCount: number;
    error?: string;
  }>;
}

type ScheduledJobType = "weekly_chase" | "reply_scan";
type ScheduledJobStatus = "success" | "partial_failure" | "failure" | "skipped";

interface ScheduledJobRunSummary {
  id: string;
  jobType: ScheduledJobType;
  triggeredBy: string;
  status: ScheduledJobStatus;
  startedAt: string;
  finishedAt: string;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  needsReviewCount: number;
  errorMessage: string | null;
  createdAt: string;
}

interface ScheduledJobRunDetail extends ScheduledJobRunSummary {
  detail: unknown;
}

interface RunsResponse {
  jobType: ScheduledJobType;
  runs: ScheduledJobRunSummary[];
}

interface ReplyScanPerNurse {
  candidateName: string;
  attachmentsProcessed: number;
  autoAttachedCount: number;
  needsReviewCount: number;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function formatDuration(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 100) / 10;
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = Math.round(sec - min * 60);
  return `${min}m ${remSec}s`;
}

function statusBadge(status: ScheduledJobStatus): { label: string; className: string } {
  switch (status) {
    case "success":
      return { label: "Success", className: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" };
    case "partial_failure":
      return { label: "Partial", className: "bg-amber-500/15 text-amber-300 border border-amber-500/30" };
    case "failure":
      return { label: "Failure", className: "bg-rose-500/15 text-rose-300 border border-rose-500/30" };
    case "skipped":
      return { label: "Skipped", className: "bg-slate-500/15 text-slate-300 border border-slate-500/30" };
  }
}

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
  const hourNum = Number(hourStr);
  const hour = Number.isFinite(hourNum) ? hourNum % 24 : 0;
  return { day: WEEKDAY_INDEX[weekday] ?? 0, hour };
}

// Find the next instant after `now` whose wall-clock time in the chosen
// zone is the very start (minute 0) of the configured day-of-week + hour.
//
// We do this in two passes so half-/quarter-hour-offset zones (Asia/Kolkata,
// Australia/Adelaide, Pacific/Chatham) display an accurate minute:
//   1. Walk forward by UTC hours until the zoned weekday+hour first match.
//   2. Step back minute-by-minute (within 60 minutes) to find the earliest
//      instant that still falls inside that target zoned hour — i.e. the
//      moment the wall clock in the target zone strikes hh:00.
function nextWeeklyRun(s: TrainingChaseScheduleSettings, now: Date = new Date()): Date | null {
  const tz = s.weeklyChaseTimeZone && isValidTimeZone(s.weeklyChaseTimeZone)
    ? s.weeklyChaseTimeZone
    : "Europe/London";
  const targetDay = s.weeklyChaseDayOfWeek;
  const targetHour = s.weeklyChaseHour;

  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);

  let hourMatch: Date | null = null;
  for (let i = 1; i <= 24 * 8; i++) {
    const candidate = new Date(start.getTime() + i * 60 * 60 * 1000);
    if (candidate.getTime() <= now.getTime()) continue;
    const { day, hour } = getZonedDayHour(candidate, tz);
    if (day === targetDay && hour === targetHour) {
      hourMatch = candidate;
      break;
    }
  }
  if (!hourMatch) return null;

  let firstMatch = hourMatch;
  for (let m = 1; m <= 60; m++) {
    const candidate = new Date(hourMatch.getTime() - m * 60 * 1000);
    if (candidate.getTime() <= now.getTime()) break;
    const { day, hour } = getZonedDayHour(candidate, tz);
    if (day === targetDay && hour === targetHour) {
      firstMatch = candidate;
    } else {
      break;
    }
  }
  return firstMatch;
}

function formatZonedDateTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Unknown";
  const tz = isValidTimeZone(timeZone) ? timeZone : "Europe/London";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  });
}

// Bare-minimum email check to keep client-side feedback fast and aligned
// with the server's regex. The server is authoritative on validation.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Split the textarea blob (newlines, commas, semicolons, or whitespace)
// into a clean, de-duped, trimmed list of email candidates.
function parseRecipientsText(text: string): string[] {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function RecentRunsPanel({
  jobType,
  emptyMessage,
  onRowClick,
}: {
  jobType: ScheduledJobType;
  emptyMessage: string;
  onRowClick: (runId: string) => void;
}) {
  const { data, isLoading } = useQuery<RunsResponse>({
    queryKey: ["/api/admin/settings/scheduled-job-runs", { jobType, limit: 10 }],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/settings/scheduled-job-runs?jobType=${encodeURIComponent(jobType)}&limit=10`,
      );
      return (await res.json()) as RunsResponse;
    },
  });

  const isReplyScan = jobType === "reply_scan";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Recent runs</h3>
        <span className="text-xs text-muted-foreground">(last {data?.runs?.length || 0})</span>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading run history…
        </div>
      ) : !data || data.runs.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3">{emptyMessage}</p>
      ) : (
        <div className="rounded-md border border-border/60 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="h-9">When</TableHead>
                <TableHead className="h-9">Status</TableHead>
                <TableHead className="h-9 text-right">{isReplyScan ? "Auto-attached" : "Sent"}</TableHead>
                <TableHead className="h-9 text-right">{isReplyScan ? "Errors" : "Failed"}</TableHead>
                <TableHead className="h-9 text-right">{isReplyScan ? "Needs review" : "Skipped"}</TableHead>
                <TableHead className="h-9">Triggered by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.runs.map((run) => {
                const badge = statusBadge(run.status);
                return (
                  <TableRow
                    key={run.id}
                    className="cursor-pointer hover:bg-muted/40 text-sm"
                    onClick={() => onRowClick(run.id)}
                    data-testid={`row-run-${jobType}-${run.id}`}
                  >
                    <TableCell className="font-mono text-xs">
                      <div>{formatDateTime(run.startedAt)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatDuration(run.startedAt, run.finishedAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={badge.className} variant="outline">
                        {badge.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-300">{run.sentCount}</TableCell>
                    <TableCell className={`text-right tabular-nums ${run.failedCount > 0 ? "text-rose-300" : "text-muted-foreground"}`}>
                      {run.failedCount}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${
                      isReplyScan
                        ? (run.needsReviewCount > 0 ? "text-amber-300" : "text-muted-foreground")
                        : "text-muted-foreground"
                    }`}>
                      {isReplyScan ? run.needsReviewCount : run.skippedCount}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {run.triggeredBy}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function RunDetailDialog({
  runId,
  onClose,
}: {
  runId: string | null;
  onClose: () => void;
}) {
  const open = !!runId;
  const { data, isLoading } = useQuery<ScheduledJobRunDetail>({
    queryKey: ["/api/admin/settings/scheduled-job-runs", runId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/settings/scheduled-job-runs/${runId}`);
      return (await res.json()) as ScheduledJobRunDetail;
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scheduled run detail</DialogTitle>
          <DialogDescription>
            Per-nurse breakdown of what this run produced.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <RunDetailBody run={data} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RunDetailBody({ run }: { run: ScheduledJobRunDetail }) {
  const badge = statusBadge(run.status);
  const isWeekly = run.jobType === "weekly_chase";
  const detail = (run.detail || {}) as Record<string, unknown>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
          <Badge className={`mt-1 ${badge.className}`} variant="outline">{badge.label}</Badge>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Started</p>
          <p className="mt-1 font-mono text-xs">{formatDateTime(run.startedAt)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Duration</p>
          <p className="mt-1 font-mono text-xs">{formatDuration(run.startedAt, run.finishedAt)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Triggered by</p>
          <p className="mt-1 text-xs">{run.triggeredBy}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="rounded-md border border-border/60 px-3 py-2">
          <p className="text-xs text-muted-foreground">{isWeekly ? "Sent" : "Auto-attached"}</p>
          <p className="text-lg font-semibold text-emerald-300 tabular-nums">{run.sentCount}</p>
        </div>
        <div className="rounded-md border border-border/60 px-3 py-2">
          <p className="text-xs text-muted-foreground">{isWeekly ? "Failed" : "Errors"}</p>
          <p className="text-lg font-semibold text-rose-300 tabular-nums">{run.failedCount}</p>
        </div>
        <div className="rounded-md border border-border/60 px-3 py-2">
          <p className="text-xs text-muted-foreground">{isWeekly ? "Skipped" : "Needs review"}</p>
          <p className="text-lg font-semibold text-amber-300 tabular-nums">
            {isWeekly ? run.skippedCount : run.needsReviewCount}
          </p>
        </div>
        <div className="rounded-md border border-border/60 px-3 py-2">
          <p className="text-xs text-muted-foreground">Run ID</p>
          <p className="text-[10px] font-mono break-all text-muted-foreground">{run.id}</p>
        </div>
      </div>

      {run.errorMessage && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-200">
          <span className="font-semibold">Error:</span> {run.errorMessage}
        </div>
      )}

      {isWeekly ? (
        <WeeklyRunRows detail={detail} />
      ) : (
        <ReplyScanRows detail={detail} />
      )}
    </div>
  );
}

function WeeklyRunRows({ detail }: { detail: Record<string, unknown> }) {
  const results = (detail.results as WeeklyChaseRunResult["results"]) || [];
  if (results.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No per-nurse outcomes were recorded for this run.</p>
    );
  }
  return (
    <div>
      <h4 className="text-sm font-medium mb-2">Per-nurse outcome</h4>
      <div className="rounded-md border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead className="h-9">Nurse</TableHead>
              <TableHead className="h-9">Email</TableHead>
              <TableHead className="h-9 text-right">Modules</TableHead>
              <TableHead className="h-9">Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((r) => (
              <TableRow key={r.nurseId} className="text-sm">
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.email || "(no email)"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.moduleCount}</TableCell>
                <TableCell className="text-xs">
                  {r.ok ? (
                    <span className="text-emerald-300">Sent</span>
                  ) : (
                    <span className="text-rose-300" title={r.error}>
                      Failed{r.error ? ` — ${r.error}` : ""}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ReplyScanRows({ detail }: { detail: Record<string, unknown> }) {
  const perNurse = (detail.perNurse as ReplyScanPerNurse[]) || [];
  const errors = (detail.errors as string[]) || [];
  if (perNurse.length === 0 && errors.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nothing to ingest — no chase replies were waiting in the mailbox at the time of this scan.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {perNurse.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Per-nurse outcome</h4>
          <div className="rounded-md border border-border/60 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="h-9">Nurse</TableHead>
                  <TableHead className="h-9 text-right">Processed</TableHead>
                  <TableHead className="h-9 text-right">Auto-attached</TableHead>
                  <TableHead className="h-9 text-right">Needs review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perNurse.map((r, i) => (
                  <TableRow key={`${r.candidateName}-${i}`} className="text-sm">
                    <TableCell className="font-medium">{r.candidateName}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.attachmentsProcessed}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-300">{r.autoAttachedCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-300">{r.needsReviewCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
      {errors.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2 text-rose-300">Errors</h4>
          <ul className="space-y-1 text-xs text-rose-200 list-disc pl-5">
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

interface PreboardIntegrityResponse {
  settings: PreboardIntegritySettings;
  bounds: { min: number; max: number };
}

function PreboardIntegrityCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<PreboardIntegrityResponse>({
    queryKey: ["/api/admin/settings/preboard-integrity"],
  });
  const [draftValue, setDraftValue] = useState<string>("");

  useEffect(() => {
    if (data?.settings?.suspectBurstCharThreshold !== undefined) {
      setDraftValue(String(data.settings.suspectBurstCharThreshold));
    }
  }, [data?.settings?.suspectBurstCharThreshold]);

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<PreboardIntegritySettings>) => {
      const res = await apiRequest("PUT", "/api/admin/settings/preboard-integrity", patch);
      return (await res.json()) as PreboardIntegrityResponse;
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(["/api/admin/settings/preboard-integrity"], resp);
      toast({
        title: "Threshold saved",
        description: `Suspect typing burst threshold is now ${resp.settings.suspectBurstCharThreshold} characters.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const min = data?.bounds?.min ?? SUSPECT_BURST_CHAR_THRESHOLD_MIN;
  const max = data?.bounds?.max ?? SUSPECT_BURST_CHAR_THRESHOLD_MAX;
  const current = data?.settings?.suspectBurstCharThreshold ?? SUSPECT_BURST_CHAR_THRESHOLD;
  const parsed = Number(draftValue);
  const valid =
    Number.isFinite(parsed) &&
    Math.round(parsed) === parsed &&
    parsed >= min &&
    parsed <= max;
  const dirty = valid && parsed !== current;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <Activity className="h-5 w-5 text-[#C8A96E] mt-1" />
          <div>
            <CardTitle>Preboard suspect-typing sensitivity</CardTitle>
            <CardDescription className="mt-1">
              Flags an answer when a single chunk of this many characters appears at once between
              keystrokes — usually a sign of bypassed paste, voice input, or scripted entry. Lower the
              threshold to catch more cases (risk: more false positives from fast typists or dictation
              users); raise it to be more lenient.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="suspect-burst-threshold"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Burst threshold (characters)
                </Label>
                <Input
                  id="suspect-burst-threshold"
                  type="number"
                  min={min}
                  max={max}
                  step={1}
                  value={draftValue}
                  onChange={(e) => setDraftValue(e.target.value)}
                  data-testid="input-suspect-burst-threshold"
                />
                <p className="text-xs text-muted-foreground">
                  Allowed range: {min}–{max}. Default is {SUSPECT_BURST_CHAR_THRESHOLD}.
                </p>
                {!valid && draftValue !== "" && (
                  <p className="text-xs text-destructive" data-testid="text-suspect-burst-error">
                    Enter a whole number between {min} and {max}.
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Current value</p>
                <p
                  className="mt-1 font-mono text-sm"
                  data-testid="text-suspect-burst-current"
                >
                  {current} characters
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              {dirty && <p className="text-xs text-amber-400">Unsaved changes</p>}
              <SuperAdminGate>
                <Button
                  size="sm"
                  disabled={!dirty || !valid || saveMutation.isPending}
                  onClick={() =>
                    saveMutation.mutate({ suspectBurstCharThreshold: parsed })
                  }
                  data-testid="button-save-suspect-burst-threshold"
                  tooltip="Save the new suspect-typing burst threshold for all future preboard assessments."
                >
                  {saveMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" /> Save threshold</>
                  )}
                </Button>
              </SuperAdminGate>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface ServiceAgreementConfig {
  recoveryFee: string;
  countersignatoryName: string;
  countersignatoryPosition: string;
}

function ServiceAgreementConfigCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<{
    config: ServiceAgreementConfig;
    defaults: ServiceAgreementConfig;
  }>({
    queryKey: ["/api/admin/settings/service-agreement"],
  });

  const [recoveryFee, setRecoveryFee] = useState("");
  const [countersignatoryName, setCountersignatoryName] = useState("");
  const [countersignatoryPosition, setCountersignatoryPosition] = useState("");

  useEffect(() => {
    if (data?.config) {
      setRecoveryFee(data.config.recoveryFee ?? "");
      setCountersignatoryName(data.config.countersignatoryName ?? "");
      setCountersignatoryPosition(data.config.countersignatoryPosition ?? "");
    }
  }, [data?.config]);

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<ServiceAgreementConfig>) => {
      const res = await apiRequest("PUT", "/api/admin/settings/service-agreement", patch);
      return (await res.json()) as { ok: boolean; config: ServiceAgreementConfig };
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(["/api/admin/settings/service-agreement"], {
        config: resp.config,
        defaults: data?.defaults,
      });
      toast({ title: "Service Agreement settings saved" });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const dirty =
    !!data?.config &&
    (recoveryFee !== (data.config.recoveryFee ?? "") ||
      countersignatoryName !== (data.config.countersignatoryName ?? "") ||
      countersignatoryPosition !== (data.config.countersignatoryPosition ?? ""));
  const valid =
    recoveryFee.trim().length > 0 &&
    countersignatoryName.trim().length > 0 &&
    countersignatoryPosition.trim().length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <FileSignature className="h-5 w-5 text-[#C8A96E] mt-1" />
          <div>
            <CardTitle>Service Agreement settings</CardTitle>
            <CardDescription className="mt-1">
              Controls the Recovery Fee printed in clause 12.1 and the Livaware countersignatory shown
              in the execution block and countersigned PDF. Applies to agreements signed from now on.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading || !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label
                  htmlFor="sa-recovery-fee"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Recovery Fee (£)
                </Label>
                <Input
                  id="sa-recovery-fee"
                  value={recoveryFee}
                  onChange={(e) => setRecoveryFee(e.target.value)}
                  data-testid="input-sa-recovery-fee"
                />
                <p className="text-xs text-muted-foreground">
                  Default: {data.defaults?.recoveryFee}
                </p>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="sa-countersignatory-name"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Countersignatory name
                </Label>
                <Input
                  id="sa-countersignatory-name"
                  value={countersignatoryName}
                  onChange={(e) => setCountersignatoryName(e.target.value)}
                  data-testid="input-sa-countersignatory-name"
                />
                <p className="text-xs text-muted-foreground">
                  Default: {data.defaults?.countersignatoryName}
                </p>
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="sa-countersignatory-position"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  Countersignatory position
                </Label>
                <Input
                  id="sa-countersignatory-position"
                  value={countersignatoryPosition}
                  onChange={(e) => setCountersignatoryPosition(e.target.value)}
                  data-testid="input-sa-countersignatory-position"
                />
                <p className="text-xs text-muted-foreground">
                  Default: {data.defaults?.countersignatoryPosition}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              {dirty && <p className="text-xs text-amber-400">Unsaved changes</p>}
              <SuperAdminGate>
                <Button
                  size="sm"
                  disabled={!dirty || !valid || saveMutation.isPending}
                  onClick={() =>
                    saveMutation.mutate({
                      recoveryFee: recoveryFee.trim(),
                      countersignatoryName: countersignatoryName.trim(),
                      countersignatoryPosition: countersignatoryPosition.trim(),
                    })
                  }
                  data-testid="button-save-service-agreement-config"
                  tooltip="Save the Recovery Fee and countersignatory used in future Service Agreements."
                >
                  {saveMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" /> Save settings</>
                  )}
                </Button>
              </SuperAdminGate>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface AnnouncementPreview {
  subject: string;
  html: string;
  text: string;
  recipientCount: number;
  portalUrl?: string;
}

interface LaunchAnnouncementPreview extends AnnouncementPreview {
  videoUrl: string | null;
  portalUrl: string;
}

interface AnnouncementSendResult {
  attempted: number;
  sent: number;
  failed: { nurseId: string; email: string; error: string }[];
}

interface TemplateField {
  name: string;
  label: string;
  kind: "text" | "textarea" | "list";
  default: string;
  help?: string;
  rows?: number;
}
interface TemplateTokenDef {
  name: string;
  description: string;
}
interface EmailTemplateDetail {
  key: string;
  label: string;
  description: string;
  category: "nurse" | "internal" | "broadcast";
  tokens: TemplateTokenDef[];
  defaultSubject: string;
  fields: TemplateField[];
  current: {
    subject: string;
    fields: Record<string, string>;
    updatedAt: string | null;
    updatedBy: string | null;
  };
  defaults: { subject: string; fields: Record<string, string> };
}
interface EmailTemplateListItem extends Omit<EmailTemplateDetail, "defaults"> {}

function EmailTemplateEditor({
  templateKey,
  open,
  onOpenChange,
  previewQueryKey,
  tokensHelp,
}: {
  templateKey: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  previewQueryKey?: string;
  tokensHelp?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: tpl, isLoading } = useQuery<EmailTemplateDetail>({
    queryKey: [`/api/admin/email-templates/${templateKey}`],
    enabled: open,
  });
  const [subject, setSubject] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  useEffect(() => {
    if (tpl) {
      setSubject(tpl.current.subject);
      setFields({ ...tpl.current.fields });
    }
  }, [tpl]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/email-templates/${templateKey}`, {
        subject,
        fields,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Template saved", description: "Future sends will use the updated wording." });
      qc.invalidateQueries({ queryKey: [`/api/admin/email-templates/${templateKey}`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/email-templates"] });
      if (previewQueryKey) qc.invalidateQueries({ queryKey: [previewQueryKey] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const resetToDefault = () => {
    if (!tpl) return;
    setSubject(tpl.defaults.subject);
    setFields({ ...tpl.defaults.fields });
  };

  const loadPreview = async () => {
    try {
      const res = await apiRequest("GET", `/api/admin/email-templates/${templateKey}/preview`);
      const data = await res.json();
      setPreviewHtml(data.html as string);
    } catch (err: any) {
      toast({ title: "Preview failed", description: err?.message || "Unknown error", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tpl?.label || "Edit email template"}</DialogTitle>
          <DialogDescription>
            {tpl?.description || tokensHelp ||
              "Edit the wording below. Each section is plain text — the platform handles the layout, colours, and buttons for you."}
          </DialogDescription>
        </DialogHeader>
        {isLoading || !tpl ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {tpl.tokens.length > 0 && (
              <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs">
                <p className="font-medium mb-1.5">Tokens you can use anywhere</p>
                <ul className="space-y-1 text-muted-foreground">
                  {tpl.tokens.map((t) => (
                    <li key={t.name}>
                      <code className="px-1 py-0.5 rounded bg-muted text-[#C8A96E]">{t.name}</code> — {t.description}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="tpl-subject">Subject line</Label>
              <Input
                id="tpl-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                data-testid="input-template-subject"
              />
            </div>
            {tpl.fields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={`tpl-field-${f.name}`}>{f.label}</Label>
                {f.kind === "text" ? (
                  <Input
                    id={`tpl-field-${f.name}`}
                    value={fields[f.name] ?? ""}
                    onChange={(e) => setFields((p) => ({ ...p, [f.name]: e.target.value }))}
                    data-testid={`input-template-field-${f.name}`}
                  />
                ) : (
                  <Textarea
                    id={`tpl-field-${f.name}`}
                    value={fields[f.name] ?? ""}
                    onChange={(e) => setFields((p) => ({ ...p, [f.name]: e.target.value }))}
                    rows={f.rows || (f.kind === "list" ? 6 : 5)}
                    data-testid={`textarea-template-field-${f.name}`}
                  />
                )}
                {f.help && <p className="text-[11px] text-muted-foreground">{f.help}</p>}
                {f.kind === "list" && (
                  <p className="text-[11px] text-muted-foreground">
                    One bullet point per line. Use "Title — body" to get a bold title before the dash.
                  </p>
                )}
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Last updated by <strong>{tpl.current.updatedBy || "—"}</strong>
              {tpl.current.updatedAt ? ` at ${new Date(tpl.current.updatedAt).toLocaleString()}` : ""}
            </p>
            {previewHtml && (
              <div className="rounded border border-border/60 overflow-hidden">
                <iframe title="Email preview" srcDoc={previewHtml} className="w-full h-[50vh] bg-white" />
              </div>
            )}
            <div className="flex justify-between gap-2 pt-2 flex-wrap">
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={resetToDefault}
                  disabled={save.isPending}
                  tooltip="Reload the built-in default wording into these fields (does not save until you press Save)."
                >
                  Reset to default
                </Button>
                <Button
                  variant="outline"
                  onClick={loadPreview}
                  disabled={save.isPending}
                  data-testid="button-preview-template"
                >
                  <Mail className="h-4 w-4 mr-2" /> Preview
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
                  Cancel
                </Button>
                <Button
                  onClick={() => save.mutate()}
                  disabled={save.isPending || !subject.trim()}
                  data-testid="button-save-template"
                >
                  {save.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" /> Save template</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AllEmailTemplatesCard() {
  const { data, isLoading, error, refetch } = useQuery<{ items: EmailTemplateListItem[] }>({
    queryKey: ["/api/admin/email-templates"],
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  });
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const out: Record<string, EmailTemplateListItem[]> = { nurse: [], internal: [], broadcast: [] };
    for (const t of data?.items || []) {
      (out[t.category] ||= []).push(t);
    }
    return out;
  }, [data]);

  const sectionLabel: Record<string, string> = {
    nurse: "Nurse-facing emails",
    internal: "Internal notifications",
    broadcast: "Broadcast announcements",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <Mail className="h-5 w-5 text-[#C8A96E] mt-1" />
          <div>
            <CardTitle>Editable email templates</CardTitle>
            <CardDescription className="mt-1">
              Every transactional email the platform sends. Edit the wording — section by section, in
              plain English — and the design wraps around it automatically. Tokens like{" "}
              <code className="px-1 py-0.5 rounded bg-muted text-[#C8A96E] text-[11px]">{"{{NAME}}"}</code>{" "}
              are filled in per recipient.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
          </div>
        ) : error ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200 flex items-center justify-between gap-3">
            <span>
              Could not load templates ({(error as Error).message || "request failed"}).
            </span>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !data?.items?.length ? (
          <div className="rounded-md border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            No editable templates registered.
          </div>
        ) : (
          (["nurse", "internal", "broadcast"] as const).map((cat) =>
            grouped[cat] && grouped[cat].length > 0 ? (
              <div key={cat} className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                  {sectionLabel[cat]}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {grouped[cat].map((t) => (
                    <div
                      key={t.key}
                      className="rounded-md border border-border/60 bg-muted/20 p-3 flex flex-col justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-medium">{t.label}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                          {t.description}
                        </p>
                      </div>
                      <div className="flex justify-between items-center">
                        <p className="text-[10px] text-muted-foreground/80">
                          {t.current.updatedBy
                            ? `Last edited by ${t.current.updatedBy}`
                            : "Using built-in default wording"}
                        </p>
                        <SuperAdminGate>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingKey(t.key)}
                            data-testid={`button-edit-template-${t.key}`}
                          >
                            <Save className="h-3.5 w-3.5 mr-1.5" /> Edit
                          </Button>
                        </SuperAdminGate>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null
          )
        )}
        {editingKey && (
          <EmailTemplateEditor
            templateKey={editingKey}
            open={!!editingKey}
            onOpenChange={(v) => !v && setEditingKey(null)}
          />
        )}
      </CardContent>
    </Card>
  );
}

function PlatformAnnouncementCard({ outlookConfigured }: { outlookConfigured: boolean }) {
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [lastResult, setLastResult] = useState<AnnouncementSendResult | null>(null);

  const previewQueryKey = "/api/admin/announcements/platform-update/preview";
  const { data: preview, isLoading: previewLoading } = useQuery<AnnouncementPreview>({
    queryKey: [previewQueryKey],
    enabled: previewOpen,
    refetchOnMount: "always",
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/announcements/platform-update/send");
      return (await res.json()) as AnnouncementSendResult;
    },
    onSuccess: (r) => {
      setLastResult(r);
      setConfirmOpen(false);
      toast({
        title: "Announcement broadcast",
        description: `${r.sent}/${r.attempted} sent · ${r.failed.length} failed`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Send failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Platform update announcement</CardTitle>
            <CardDescription className="mt-1">
              Broadcast a one-off email to every active nurse explaining the recent changes
              (Skills Arcade, Policies &amp; SOPs, Availability, and the new invoicing flow).
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen(true)} data-testid="button-preview-announcement" tooltip="Preview the announcement email before sending it to anyone.">
            <Mail className="h-4 w-4 mr-2" /> Preview email
          </Button>
          <SuperAdminGate>
            <Button
              variant="outline"
              onClick={() => setEditOpen(true)}
              data-testid="button-edit-platform-update-template"
              tooltip="Edit the subject and body of this email. Changes are saved and used the next time you send."
            >
              <Save className="h-4 w-4 mr-2" /> Edit template
            </Button>
          </SuperAdminGate>
          <SuperAdminGate>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!outlookConfigured || sendMutation.isPending}
              data-testid="button-send-announcement"
              tooltip="Open the confirmation dialog to broadcast this announcement to every active nurse."
            >
              <Send className="h-4 w-4 mr-2" /> Send to all nurses…
            </Button>
          </SuperAdminGate>
        </div>
        <EmailTemplateEditor
          templateKey="platform_update_announcement"
          open={editOpen}
          onOpenChange={setEditOpen}
          previewQueryKey={previewQueryKey}
          tokensHelp="You can use {{NAME}} anywhere you want the nurse's full name to appear, and {{PORTAL_URL}} for the portal sign-in link. Save your changes and the next send will use the new wording."
        />
        {!outlookConfigured && (
          <p className="text-xs text-amber-300">
            Outlook is not configured — connect Microsoft Graph credentials before sending.
          </p>
        )}
        {lastResult && (
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
            <p>
              Last broadcast: <strong>{lastResult.sent}</strong> sent of {lastResult.attempted} ·{" "}
              <strong>{lastResult.failed.length}</strong> failed
            </p>
            {lastResult.failed.length > 0 && (
              <ul className="mt-2 list-disc list-inside text-xs text-muted-foreground space-y-1">
                {lastResult.failed.slice(0, 5).map((f) => (
                  <li key={f.nurseId}>
                    {f.email}: {f.error}
                  </li>
                ))}
                {lastResult.failed.length > 5 && <li>… and {lastResult.failed.length - 5} more</li>}
              </ul>
            )}
          </div>
        )}

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{preview?.subject || "Platform update announcement"}</DialogTitle>
              <DialogDescription>
                Will be sent to {preview?.recipientCount ?? "…"} active nurse(s) via the system mailbox.
              </DialogDescription>
            </DialogHeader>
            {previewLoading || !preview ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded border border-border/60 overflow-hidden">
                <iframe
                  title="Email preview"
                  srcDoc={preview.html}
                  className="w-full h-[55vh] bg-white"
                />
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send platform update to all nurses?</DialogTitle>
              <DialogDescription>
                This will email every active nurse on file using the system mailbox. This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={sendMutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                data-testid="button-confirm-send-announcement"
                tooltip="Send the announcement email to every active nurse right now. Cannot be undone."
              >
                {sendMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Send now</>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function LaunchAnnouncementCard({ outlookConfigured }: { outlookConfigured: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [lastResult, setLastResult] = useState<AnnouncementSendResult | null>(null);

  const previewQueryKey = "/api/admin/announcements/launch/preview";
  const { data: preview, isLoading: previewLoading } = useQuery<LaunchAnnouncementPreview>({
    queryKey: [previewQueryKey],
    refetchOnMount: "always",
    staleTime: 0,
  });

  const openPreview = () => {
    qc.invalidateQueries({ queryKey: [previewQueryKey] });
    setPreviewOpen(true);
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/announcements/launch/send");
      return (await res.json()) as AnnouncementSendResult;
    },
    onSuccess: (r) => {
      setLastResult(r);
      setConfirmOpen(false);
      toast({
        title: "Launch announcement broadcast",
        description: `${r.sent}/${r.attempted} sent · ${r.failed.length} failed`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Send failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Platform launch &amp; invoicing announcement</CardTitle>
            <CardDescription className="mt-1">
              One-off launch email introducing every active nurse to the new NurseOnboard portal,
              embedding the explainer video, and informing them that all invoices must be submitted
              through this platform from <strong>1 June 2026</strong>.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
          <p>
            <strong>Recipients:</strong>{" "}
            {preview?.recipientCount ?? "…"} active nurse(s) with email
          </p>
          <p>
            <strong>Portal URL:</strong>{" "}
            <a href={preview?.portalUrl} className="text-primary underline" target="_blank" rel="noreferrer">
              {preview?.portalUrl ?? "…"}
            </a>
          </p>
          <p>
            <strong>Video URL:</strong>{" "}
            {preview?.videoUrl ? (
              <a href={preview.videoUrl} className="text-primary underline" target="_blank" rel="noreferrer">
                {preview.videoUrl}
              </a>
            ) : (
              <span className="text-amber-300">Not configured (PLATFORM_VIDEO_URL) — video block will be hidden.</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={openPreview}
            data-testid="button-preview-launch-announcement"
            tooltip="Preview the launch &amp; invoicing email before sending it to anyone."
          >
            <Mail className="h-4 w-4 mr-2" /> Preview email
          </Button>
          <SuperAdminGate>
            <Button
              variant="outline"
              onClick={() => setEditOpen(true)}
              data-testid="button-edit-launch-template"
              tooltip="Edit the subject and body of the launch announcement. Changes are saved and used the next time you send."
            >
              <Save className="h-4 w-4 mr-2" /> Edit template
            </Button>
          </SuperAdminGate>
          <SuperAdminGate>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!outlookConfigured || sendMutation.isPending}
              data-testid="button-send-launch-announcement"
              tooltip="Open the confirmation dialog to broadcast the launch announcement to every active nurse."
            >
              <Send className="h-4 w-4 mr-2" /> Send to all nurses…
            </Button>
          </SuperAdminGate>
        </div>
        <EmailTemplateEditor
          templateKey="launch_announcement"
          open={editOpen}
          onOpenChange={setEditOpen}
          previewQueryKey={previewQueryKey}
          tokensHelp="You can use {{NAME}} anywhere you want the nurse's full name to appear, {{PORTAL_URL}} for the portal sign-in link, and {{VIDEO_URL}} for the explainer video link (when one's been set up). To make a section that only shows up when there is a video link, wrap it in {{#VIDEO_URL}} … {{/VIDEO_URL}}. Save your changes and the next send will use the new wording."
        />
        {!outlookConfigured && (
          <p className="text-xs text-amber-300">
            Outlook is not configured — connect Microsoft Graph credentials before sending.
          </p>
        )}
        {lastResult && (
          <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
            <p>
              Last broadcast: <strong>{lastResult.sent}</strong> sent of {lastResult.attempted} ·{" "}
              <strong>{lastResult.failed.length}</strong> failed
            </p>
            {lastResult.failed.length > 0 && (
              <ul className="mt-2 list-disc list-inside text-xs text-muted-foreground space-y-1">
                {lastResult.failed.slice(0, 5).map((f) => (
                  <li key={f.nurseId}>
                    {f.email}: {f.error}
                  </li>
                ))}
                {lastResult.failed.length > 5 && <li>… and {lastResult.failed.length - 5} more</li>}
              </ul>
            )}
          </div>
        )}

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{preview?.subject || "Platform launch & invoicing announcement"}</DialogTitle>
              <DialogDescription>
                Will be sent to {preview?.recipientCount ?? "…"} active nurse(s) via the system mailbox.
              </DialogDescription>
            </DialogHeader>
            {previewLoading || !preview ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded border border-border/60 overflow-hidden">
                <iframe
                  title="Launch email preview"
                  srcDoc={preview.html}
                  className="w-full h-[55vh] bg-white"
                />
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send launch &amp; invoicing announcement to all nurses?</DialogTitle>
              <DialogDescription>
                This will email {preview?.recipientCount ?? "every"} active nurse on file using the system
                mailbox. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={sendMutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                data-testid="button-confirm-send-launch-announcement"
                tooltip="Send the launch announcement email to every active nurse right now. Cannot be undone."
              >
                {sendMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Send now</>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

interface HbcStatusResponse {
  configured: boolean;
  courseCount: number;
  linkedCandidateCount: number;
  lastCatalogSync: string | null;
}

interface HbcCourseRow {
  id: string;
  courseId: string;
  courseName: string;
  groupTitle: string | null;
  notes: string | null;
  syncedAt: string;
}

function HbcTrainingSyncCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["/api/admin/hbc/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/hbc/status");
      return (await res.json()) as HbcStatusResponse;
    },
  });

  const { data: courses } = useQuery({
    queryKey: ["/api/admin/hbc/courses"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/hbc/courses");
      return (await res.json()) as HbcCourseRow[];
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/hbc/test-connection");
      return await res.json();
    },
    onSuccess: () => toast({ title: "Connection OK", description: "Successfully authenticated with Healthier Business Group." }),
    onError: (err: any) =>
      toast({ title: "Connection failed", description: err?.message || "Could not reach HBC.", variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/hbc/courses/sync");
      return (await res.json()) as { count: number };
    },
    onSuccess: (data) => {
      toast({ title: "Catalogue synced", description: `${data.count} course(s) pulled from HBC.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hbc/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hbc/courses"] });
    },
    onError: (err: any) =>
      toast({ title: "Sync failed", description: err?.message || "Could not sync the catalogue.", variant: "destructive" }),
  });

  const configured = status?.configured ?? false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Healthier Business Group (HBC) training sync
            </CardTitle>
            <CardDescription>
              Sync mandatory training courses and per-nurse completion records with the Healthier Business Group
              compliance portal.
            </CardDescription>
          </div>
          <Badge variant={configured ? "default" : "secondary"}>
            {statusLoading ? "Checking…" : configured ? "Connected" : "Not configured"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!configured && (
          <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-amber-200/90">
              <p className="font-medium text-amber-200">Credentials not set.</p>
              <p className="mt-1">
                Set <code className="mx-1 px-1 py-0.5 rounded bg-amber-500/10">HBC_CLIENT_ID</code>,
                <code className="mx-1 px-1 py-0.5 rounded bg-amber-500/10">HBC_API_KEY</code> and
                <code className="mx-1 px-1 py-0.5 rounded bg-amber-500/10">HBC_API_BASE_URL</code>
                (optionally <code className="mx-1 px-1 py-0.5 rounded bg-amber-500/10">HBC_API_VERSION</code>) to enable syncing.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-serif font-light">{status?.courseCount ?? 0}</div>
            <div className="text-xs text-muted-foreground">Courses cached</div>
          </div>
          <div>
            <div className="text-2xl font-serif font-light">{status?.linkedCandidateCount ?? 0}</div>
            <div className="text-xs text-muted-foreground">Linked nurses</div>
          </div>
          <div>
            <div className="text-sm">{status?.lastCatalogSync ? formatDateTime(status.lastCatalogSync) : "—"}</div>
            <div className="text-xs text-muted-foreground">Last catalogue sync</div>
          </div>
        </div>

        <SuperAdminGate>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!configured || testMutation.isPending}
              onClick={() => testMutation.mutate()}
            >
              {testMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              Test connection
            </Button>
            <Button
              size="sm"
              disabled={!configured || syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              Sync course catalogue
            </Button>
          </div>
        </SuperAdminGate>

        {courses && courses.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>HB course ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.courseName}</TableCell>
                    <TableCell className="text-muted-foreground">{c.groupTitle || "—"}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{c.courseId}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TrainingChaseScheduleSettings | null>(null);
  const [weeklyRecipientsText, setWeeklyRecipientsText] = useState<string>("");
  const [scanRecipientsText, setScanRecipientsText] = useState<string>("");
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<SettingsResponse>({
    queryKey: ["/api/admin/settings/training-chase-schedule"],
  });

  // Sync the editable form copy when the server settings load/refetch.
  useEffect(() => {
    if (data?.settings) {
      setDraft({ ...data.settings });
      setWeeklyRecipientsText((data.settings.weeklyChaseSummaryRecipients ?? []).join("\n"));
      setScanRecipientsText((data.settings.replyScanSummaryRecipients ?? []).join("\n"));
    }
  }, [data?.settings]);

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<TrainingChaseScheduleSettings>) => {
      const res = await apiRequest("PUT", "/api/admin/settings/training-chase-schedule", patch);
      return (await res.json()) as SettingsResponse;
    },
    onSuccess: (resp) => {
      queryClient.setQueryData(["/api/admin/settings/training-chase-schedule"], resp);
      toast({ title: "Settings saved", description: "Scheduled chase preferences updated." });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/settings/training-chase-schedule/run-weekly-now");
      return (await res.json()) as WeeklyChaseRunResult;
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/training-chase-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/scheduled-job-runs"] });
      toast({
        title: "Weekly chase complete",
        description: `${r.succeeded} sent · ${r.failed} failed · ${r.candidatesSkippedRecentlyChased} skipped (recently chased) · ${r.candidatesSkippedNoOutstanding} with nothing outstanding.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Run failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  if (isLoading || !draft || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const outlookConfigured = data.outlookConfigured;
  const parsedWeeklyRecipients = parseRecipientsText(weeklyRecipientsText);
  const parsedScanRecipients = parseRecipientsText(scanRecipientsText);
  const invalidWeeklyRecipients = parsedWeeklyRecipients.filter((e) => !EMAIL_REGEX.test(e));
  const invalidScanRecipients = parsedScanRecipients.filter((e) => !EMAIL_REGEX.test(e));
  const recipientsValid =
    invalidWeeklyRecipients.length === 0 && invalidScanRecipients.length === 0;
  const dirty =
    JSON.stringify({
      weeklyChaseEnabled: draft.weeklyChaseEnabled,
      weeklyChaseDayOfWeek: draft.weeklyChaseDayOfWeek,
      weeklyChaseHour: draft.weeklyChaseHour,
      weeklyChaseTimeZone: draft.weeklyChaseTimeZone,
      weeklyChaseMinGapDays: draft.weeklyChaseMinGapDays,
      replyScanEnabled: draft.replyScanEnabled,
      replyScanIntervalMinutes: draft.replyScanIntervalMinutes,
      weeklyChaseSummaryRecipients: parsedWeeklyRecipients,
      replyScanSummaryRecipients: parsedScanRecipients,
    }) !==
    JSON.stringify({
      weeklyChaseEnabled: data.settings.weeklyChaseEnabled,
      weeklyChaseDayOfWeek: data.settings.weeklyChaseDayOfWeek,
      weeklyChaseHour: data.settings.weeklyChaseHour,
      weeklyChaseTimeZone: data.settings.weeklyChaseTimeZone,
      weeklyChaseMinGapDays: data.settings.weeklyChaseMinGapDays,
      replyScanEnabled: data.settings.replyScanEnabled,
      replyScanIntervalMinutes: data.settings.replyScanIntervalMinutes,
      weeklyChaseSummaryRecipients: data.settings.weeklyChaseSummaryRecipients ?? [],
      replyScanSummaryRecipients: data.settings.replyScanSummaryRecipients ?? [],
    });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure scheduled background jobs and platform behaviour. Changes apply to all admins.
        </p>
      </div>

      <SuperAdminViewOnlyBanner />

      <AllEmailTemplatesCard />

      <HbcTrainingSyncCard />

      <PlatformAnnouncementCard outlookConfigured={outlookConfigured} />

      <LaunchAnnouncementCard outlookConfigured={outlookConfigured} />

      {!outlookConfigured && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-200">Outlook integration is not configured.</p>
              <p className="text-amber-200/80 mt-1">
                The scheduled jobs below will not be able to send chase emails or scan the shared mailbox until
                <code className="mx-1 px-1 py-0.5 rounded bg-amber-500/10">AZURE_AD_TENANT_ID</code>,
                <code className="mx-1 px-1 py-0.5 rounded bg-amber-500/10">AZURE_AD_CLIENT_ID</code>, and
                <code className="mx-1 px-1 py-0.5 rounded bg-amber-500/10">AZURE_AD_CLIENT_SECRET</code> are set.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-[#C8A96E] mt-1" />
            <div>
              <CardTitle>Weekly training chase</CardTitle>
              <CardDescription className="mt-1">
                Automatically email every nurse with outstanding mandatory training. Skips anyone chased recently so
                the same nurse doesn't receive duplicate emails week after week.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-md border border-border/60 px-4 py-3">
            <div>
              <Label htmlFor="weekly-enabled" className="text-sm font-medium">Enable scheduled weekly chase</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                When off, the job is paused — no emails will be sent automatically.
              </p>
            </div>
            <Switch
              id="weekly-enabled"
              checked={draft.weeklyChaseEnabled}
              onCheckedChange={(v) => setDraft({ ...draft, weeklyChaseEnabled: v })}
              data-testid="switch-weekly-chase-enabled"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Day of week</Label>
              <Select
                value={String(draft.weeklyChaseDayOfWeek)}
                onValueChange={(v) => setDraft({ ...draft, weeklyChaseDayOfWeek: Number(v) })}
              >
                <SelectTrigger data-testid="select-weekly-day"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((name, i) => (
                    <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Hour (0–23, in chosen zone)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={draft.weeklyChaseHour}
                onChange={(e) => setDraft({ ...draft, weeklyChaseHour: Number(e.target.value) })}
                data-testid="input-weekly-hour"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Skip if chased within N days</Label>
              <Input
                type="number"
                min={1}
                max={90}
                value={draft.weeklyChaseMinGapDays}
                onChange={(e) => setDraft({ ...draft, weeklyChaseMinGapDays: Number(e.target.value) })}
                data-testid="input-weekly-gap"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Time zone</Label>
              {(() => {
                // We treat "in custom mode" as: the value is missing OR isn't
                // one of the curated zones in the dropdown. That keeps the
                // free-text Input visible after the user picks "Custom…" and
                // before they've typed anything (where the value is "").
                const tzValue = draft.weeklyChaseTimeZone ?? "";
                const inList = tzValue !== "" && COMMON_TIME_ZONES.includes(tzValue);
                const selectValue = inList ? tzValue : "__custom__";
                return (
                  <>
                    <Select
                      value={selectValue}
                      onValueChange={(v) => {
                        if (v === "__custom__") {
                          // Clear the value so the free-text Input appears
                          // empty and ready for typing. (Save will reject an
                          // empty value via sanitizeTimeZone on the server.)
                          setDraft({ ...draft, weeklyChaseTimeZone: "" });
                        } else {
                          setDraft({ ...draft, weeklyChaseTimeZone: v });
                        }
                      }}
                    >
                      <SelectTrigger data-testid="select-weekly-timezone"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COMMON_TIME_ZONES.map((z) => (
                          <SelectItem key={z} value={z}>{z}</SelectItem>
                        ))}
                        <SelectItem value="__custom__">Custom IANA zone…</SelectItem>
                      </SelectContent>
                    </Select>
                    {!inList && (
                      <Input
                        placeholder="e.g. Pacific/Auckland"
                        value={tzValue}
                        onChange={(e) => setDraft({ ...draft, weeklyChaseTimeZone: e.target.value })}
                        data-testid="input-weekly-timezone-custom"
                      />
                    )}
                    {tzValue !== "" && !isValidTimeZone(tzValue) && (
                      <p className="text-xs text-amber-400">
                        "{tzValue}" isn't a recognised IANA zone — it'll fall back to Europe/London on save.
                      </p>
                    )}
                  </>
                );
              })()}
              <p className="text-xs text-muted-foreground">
                The day and hour above are interpreted in this zone, so DST shifts don't move the send time.
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Last run</p>
              <p className="mt-1 font-mono text-sm" data-testid="text-weekly-last-run">
                {formatZonedDateTime(data.settings.lastWeeklyChaseRunAt, draft.weeklyChaseTimeZone)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Next scheduled run
              </p>
              <p className="mt-1 font-mono text-sm" data-testid="text-weekly-next-run">
                {(() => {
                  if (!draft.weeklyChaseEnabled) return "— (job disabled)";
                  const next = nextWeeklyRun(draft);
                  return next
                    ? formatZonedDateTime(next.toISOString(), draft.weeklyChaseTimeZone)
                    : "—";
                })()}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <SuperAdminGate>
              <Button
                variant="outline"
                size="sm"
                disabled={runNowMutation.isPending || !outlookConfigured}
                onClick={() => runNowMutation.mutate()}
                data-testid="button-run-weekly-now"
                tooltip="Run the weekly training chase now across every nurse with outstanding modules."
              >
                {runNowMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running…</>
                ) : (
                  <><PlayCircle className="h-4 w-4 mr-2" /> Run weekly chase now</>
                )}
              </Button>
            </SuperAdminGate>
            <p className="text-xs text-muted-foreground">
              "Run now" uses the same logic as the scheduled job and respects the recently-chased gap.
            </p>
          </div>

          <Separator />

          <RecentRunsPanel
            jobType="weekly_chase"
            emptyMessage="No weekly chase runs yet — runs will appear here after the next scheduled tick or a manual 'Run now'."
            onRowClick={setOpenRunId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <Inbox className="h-5 w-5 text-[#C8A96E] mt-1" />
            <div>
              <CardTitle>Mailbox reply scan</CardTitle>
              <CardDescription className="mt-1">
                Periodically scans the shared inbox for certificates returned by nurses. Confident matches are auto-attached;
                low-confidence files land in the Documents to Review queue. An admin summary email is sent after each scan
                that finds activity.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-md border border-border/60 px-4 py-3">
            <div>
              <Label htmlFor="scan-enabled" className="text-sm font-medium">Enable scheduled reply scan</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Runs in the background at the configured interval. Admins can also scan manually from the Training Matrix.
              </p>
            </div>
            <Switch
              id="scan-enabled"
              checked={draft.replyScanEnabled}
              onCheckedChange={(v) => setDraft({ ...draft, replyScanEnabled: v })}
              data-testid="switch-reply-scan-enabled"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Interval (minutes)</Label>
              <Input
                type="number"
                min={5}
                max={1440}
                value={draft.replyScanIntervalMinutes}
                onChange={(e) => setDraft({ ...draft, replyScanIntervalMinutes: Number(e.target.value) })}
                data-testid="input-scan-interval"
              />
              <p className="text-xs text-muted-foreground">
                A short interval (≈30 min) catches replies within hours of each weekly chase. Minimum 5, maximum 1440 (24h).
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Last run</p>
              <p className="mt-1 font-mono text-sm" data-testid="text-scan-last-run">
                {formatDateTime(data.settings.lastReplyScanRunAt)}
              </p>
            </div>
          </div>

          <Separator />

          <RecentRunsPanel
            jobType="reply_scan"
            emptyMessage="No reply scans recorded yet — only scans that ingest attachments or hit errors are kept (no-op ticks are skipped to avoid noise)."
            onRowClick={setOpenRunId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <Send className="h-5 w-5 text-[#C8A96E] mt-1" />
            <div>
              <CardTitle>Summary email recipients</CardTitle>
              <CardDescription className="mt-1">
                Each scheduled job has its own recipient list, so the weekly digest and the mailbox-scan
                alerts can go to different people (e.g. compliance vs. on-call admin). Leave a list blank to
                fall back to the shared sender mailbox for that job.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label
              htmlFor="weekly-summary-recipients"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Weekly chase summary — recipients (one per line, or comma-separated)
            </Label>
            <Textarea
              id="weekly-summary-recipients"
              rows={4}
              placeholder="compliance@example.com&#10;manager@example.com"
              value={weeklyRecipientsText}
              onChange={(e) => setWeeklyRecipientsText(e.target.value)}
              className="font-mono text-sm"
              data-testid="textarea-weekly-summary-recipients"
            />
            {invalidWeeklyRecipients.length > 0 ? (
              <p className="text-xs text-destructive" data-testid="text-weekly-recipients-error">
                Invalid {invalidWeeklyRecipients.length === 1 ? "address" : "addresses"}:{" "}
                {invalidWeeklyRecipients.join(", ")}
              </p>
            ) : parsedWeeklyRecipients.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Weekly chase summaries will be sent to {parsedWeeklyRecipients.length} recipient
                {parsedWeeklyRecipients.length === 1 ? "" : "s"}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No recipients configured — weekly chase summaries will fall back to the shared sender mailbox.
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <Label
              htmlFor="scan-summary-recipients"
              className="text-xs uppercase tracking-wide text-muted-foreground"
            >
              Mailbox reply-scan summary — recipients (one per line, or comma-separated)
            </Label>
            <Textarea
              id="scan-summary-recipients"
              rows={4}
              placeholder="oncall@example.com&#10;admin@example.com"
              value={scanRecipientsText}
              onChange={(e) => setScanRecipientsText(e.target.value)}
              className="font-mono text-sm"
              data-testid="textarea-scan-summary-recipients"
            />
            {invalidScanRecipients.length > 0 ? (
              <p className="text-xs text-destructive" data-testid="text-scan-recipients-error">
                Invalid {invalidScanRecipients.length === 1 ? "address" : "addresses"}:{" "}
                {invalidScanRecipients.join(", ")}
              </p>
            ) : parsedScanRecipients.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Reply-scan summaries will be sent to {parsedScanRecipients.length} recipient
                {parsedScanRecipients.length === 1 ? "" : "s"}.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                No recipients configured — reply-scan summaries will fall back to the shared sender mailbox.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <PreboardIntegrityCard />

      <ServiceAgreementConfigCard />

      <RunDetailDialog runId={openRunId} onClose={() => setOpenRunId(null)} />

      <div className="flex items-center justify-end gap-3 pt-2">
        {dirty && <p className="text-xs text-amber-400">Unsaved changes</p>}
        <SuperAdminGate>
          <Button
            disabled={!dirty || !recipientsValid || saveMutation.isPending}
            tooltip="Save all scheduled-job and recipient changes on this page."
            onClick={() =>
              saveMutation.mutate({
                weeklyChaseEnabled: draft.weeklyChaseEnabled,
                weeklyChaseDayOfWeek: draft.weeklyChaseDayOfWeek,
                weeklyChaseHour: draft.weeklyChaseHour,
                weeklyChaseTimeZone: draft.weeklyChaseTimeZone,
                weeklyChaseMinGapDays: draft.weeklyChaseMinGapDays,
                replyScanEnabled: draft.replyScanEnabled,
                replyScanIntervalMinutes: draft.replyScanIntervalMinutes,
                weeklyChaseSummaryRecipients: parsedWeeklyRecipients,
                replyScanSummaryRecipients: parsedScanRecipients,
              })
            }
            data-testid="button-save-settings"
          >
            {saveMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
            ) : (
              <><Save className="h-4 w-4 mr-2" /> Save settings</>
            )}
          </Button>
        </SuperAdminGate>
      </div>
    </div>
  );
}
