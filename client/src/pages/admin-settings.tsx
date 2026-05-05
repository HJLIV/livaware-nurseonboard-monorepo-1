import { useEffect, useState } from "react";
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
import { Loader2, Mail, Inbox, AlertCircle, PlayCircle, Save, Send, History } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

interface TrainingChaseScheduleSettings {
  weeklyChaseEnabled: boolean;
  weeklyChaseDayOfWeek: number;
  weeklyChaseHour: number;
  weeklyChaseTimeZone: string;
  weeklyChaseMinGapDays: number;
  replyScanEnabled: boolean;
  replyScanIntervalMinutes: number;
  summaryRecipients: string[];
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

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TrainingChaseScheduleSettings | null>(null);
  const [recipientsText, setRecipientsText] = useState<string>("");
  const [openRunId, setOpenRunId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<SettingsResponse>({
    queryKey: ["/api/admin/settings/training-chase-schedule"],
  });

  // Sync the editable form copy when the server settings load/refetch.
  useEffect(() => {
    if (data?.settings) {
      setDraft({ ...data.settings });
      setRecipientsText((data.settings.summaryRecipients ?? []).join("\n"));
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
  const parsedRecipients = parseRecipientsText(recipientsText);
  const invalidRecipients = parsedRecipients.filter((e) => !EMAIL_REGEX.test(e));
  const recipientsValid = invalidRecipients.length === 0;
  const dirty =
    JSON.stringify({
      weeklyChaseEnabled: draft.weeklyChaseEnabled,
      weeklyChaseDayOfWeek: draft.weeklyChaseDayOfWeek,
      weeklyChaseHour: draft.weeklyChaseHour,
      weeklyChaseTimeZone: draft.weeklyChaseTimeZone,
      weeklyChaseMinGapDays: draft.weeklyChaseMinGapDays,
      replyScanEnabled: draft.replyScanEnabled,
      replyScanIntervalMinutes: draft.replyScanIntervalMinutes,
      summaryRecipients: parsedRecipients,
    }) !==
    JSON.stringify({
      weeklyChaseEnabled: data.settings.weeklyChaseEnabled,
      weeklyChaseDayOfWeek: data.settings.weeklyChaseDayOfWeek,
      weeklyChaseHour: data.settings.weeklyChaseHour,
      weeklyChaseTimeZone: data.settings.weeklyChaseTimeZone,
      weeklyChaseMinGapDays: data.settings.weeklyChaseMinGapDays,
      replyScanEnabled: data.settings.replyScanEnabled,
      replyScanIntervalMinutes: data.settings.replyScanIntervalMinutes,
      summaryRecipients: data.settings.summaryRecipients ?? [],
    });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Platform Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure scheduled background jobs and platform behaviour. Changes apply to all admins.
        </p>
      </div>

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
            <Button
              variant="outline"
              size="sm"
              disabled={runNowMutation.isPending || !outlookConfigured}
              onClick={() => runNowMutation.mutate()}
              data-testid="button-run-weekly-now"
            >
              {runNowMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Running…</>
              ) : (
                <><PlayCircle className="h-4 w-4 mr-2" /> Run weekly chase now</>
              )}
            </Button>
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
                Where the weekly-chase and mailbox-scan summary emails ("47 nurses chased, 2 failures") are
                delivered. Usually your compliance team. Leave blank to fall back to the shared sender mailbox.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="summary-recipients" className="text-xs uppercase tracking-wide text-muted-foreground">
            Email addresses (one per line, or comma-separated)
          </Label>
          <Textarea
            id="summary-recipients"
            rows={4}
            placeholder="compliance@example.com&#10;manager@example.com"
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            className="font-mono text-sm"
            data-testid="textarea-summary-recipients"
          />
          {invalidRecipients.length > 0 ? (
            <p className="text-xs text-destructive" data-testid="text-recipients-error">
              Invalid {invalidRecipients.length === 1 ? "address" : "addresses"}: {invalidRecipients.join(", ")}
            </p>
          ) : parsedRecipients.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Summaries will be sent to {parsedRecipients.length} recipient
              {parsedRecipients.length === 1 ? "" : "s"}.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No recipients configured — summaries will fall back to the shared sender mailbox.
            </p>
          )}
        </CardContent>
      </Card>

      <RunDetailDialog runId={openRunId} onClose={() => setOpenRunId(null)} />

      <div className="flex items-center justify-end gap-3 pt-2">
        {dirty && <p className="text-xs text-amber-400">Unsaved changes</p>}
        <Button
          disabled={!dirty || !recipientsValid || saveMutation.isPending}
          onClick={() =>
            saveMutation.mutate({
              weeklyChaseEnabled: draft.weeklyChaseEnabled,
              weeklyChaseDayOfWeek: draft.weeklyChaseDayOfWeek,
              weeklyChaseHour: draft.weeklyChaseHour,
              weeklyChaseTimeZone: draft.weeklyChaseTimeZone,
              weeklyChaseMinGapDays: draft.weeklyChaseMinGapDays,
              replyScanEnabled: draft.replyScanEnabled,
              replyScanIntervalMinutes: draft.replyScanIntervalMinutes,
              summaryRecipients: parsedRecipients,
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
      </div>
    </div>
  );
}
