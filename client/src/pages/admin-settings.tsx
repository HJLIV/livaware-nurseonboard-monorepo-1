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
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail, Inbox, AlertCircle, PlayCircle, Save, Send } from "lucide-react";

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

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TrainingChaseScheduleSettings | null>(null);
  const [recipientsText, setRecipientsText] = useState<string>("");

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
