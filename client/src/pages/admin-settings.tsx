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
import { Loader2, Mail, Inbox, AlertCircle, PlayCircle, Save } from "lucide-react";

interface TrainingChaseScheduleSettings {
  weeklyChaseEnabled: boolean;
  weeklyChaseDayOfWeek: number;
  weeklyChaseHour: number;
  weeklyChaseMinGapDays: number;
  replyScanEnabled: boolean;
  replyScanIntervalMinutes: number;
  lastWeeklyChaseRunAt?: string | null;
  lastReplyScanRunAt?: string | null;
}

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

function nextWeeklyRun(s: TrainingChaseScheduleSettings, now: Date = new Date()): Date {
  const target = new Date(now);
  target.setHours(s.weeklyChaseHour, 0, 0, 0);
  const dayDiff = (s.weeklyChaseDayOfWeek - now.getDay() + 7) % 7;
  target.setDate(now.getDate() + dayDiff);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 7);
  }
  return target;
}

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<TrainingChaseScheduleSettings | null>(null);

  const { data, isLoading } = useQuery<SettingsResponse>({
    queryKey: ["/api/admin/settings/training-chase-schedule"],
  });

  // Sync the editable form copy when the server settings load/refetch.
  useEffect(() => {
    if (data?.settings) setDraft({ ...data.settings });
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
  const dirty =
    JSON.stringify({
      weeklyChaseEnabled: draft.weeklyChaseEnabled,
      weeklyChaseDayOfWeek: draft.weeklyChaseDayOfWeek,
      weeklyChaseHour: draft.weeklyChaseHour,
      weeklyChaseMinGapDays: draft.weeklyChaseMinGapDays,
      replyScanEnabled: draft.replyScanEnabled,
      replyScanIntervalMinutes: draft.replyScanIntervalMinutes,
    }) !==
    JSON.stringify({
      weeklyChaseEnabled: data.settings.weeklyChaseEnabled,
      weeklyChaseDayOfWeek: data.settings.weeklyChaseDayOfWeek,
      weeklyChaseHour: data.settings.weeklyChaseHour,
      weeklyChaseMinGapDays: data.settings.weeklyChaseMinGapDays,
      replyScanEnabled: data.settings.replyScanEnabled,
      replyScanIntervalMinutes: data.settings.replyScanIntervalMinutes,
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
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Hour (server time, 0–23)</Label>
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

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Last run</p>
              <p className="mt-1 font-mono text-sm" data-testid="text-weekly-last-run">
                {formatDateTime(data.settings.lastWeeklyChaseRunAt)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Next scheduled run</p>
              <p className="mt-1 font-mono text-sm">
                {draft.weeklyChaseEnabled
                  ? formatDateTime(nextWeeklyRun(draft).toISOString())
                  : "— (job disabled)"}
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

      <div className="flex items-center justify-end gap-3 pt-2">
        {dirty && <p className="text-xs text-amber-400">Unsaved changes</p>}
        <Button
          disabled={!dirty || saveMutation.isPending}
          onClick={() =>
            saveMutation.mutate({
              weeklyChaseEnabled: draft.weeklyChaseEnabled,
              weeklyChaseDayOfWeek: draft.weeklyChaseDayOfWeek,
              weeklyChaseHour: draft.weeklyChaseHour,
              weeklyChaseMinGapDays: draft.weeklyChaseMinGapDays,
              replyScanEnabled: draft.replyScanEnabled,
              replyScanIntervalMinutes: draft.replyScanIntervalMinutes,
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
