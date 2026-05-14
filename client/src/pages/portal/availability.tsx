import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  PortalShell,
  buildPortalGroups,
  type PortalSidebarGroup,
} from "@/components/layout/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHIFT_LABELS, type Shift, type AvailabilityStatus } from "@shared/schema";

type CellStatus = AvailabilityStatus | "unset";

const STATUSES: { key: CellStatus; label: string; cls: string }[] = [
  { key: "available", label: "Available", cls: "bg-emerald-500 text-white" },
  { key: "preferred", label: "Preferred", cls: "bg-primary text-primary-foreground" },
  { key: "unavailable", label: "Unavailable", cls: "bg-rose-500 text-white" },
  { key: "unset", label: "Clear", cls: "bg-muted text-muted-foreground" },
];

interface RangeData {
  nurseId: string;
  month: string;
  from: string;
  to: string;
  windowMonths: { min: string; max: string };
  shifts: Shift[];
  entries: { date: string; shift: Shift; status: AvailabilityStatus }[];
}

interface PortalShape {
  nurse: { id: string; fullName: string; currentStage: string };
  journey: any;
  gate?: any;
}

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function todayMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${pad2(i + 1)}`);
}
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric" });
}
const SHIFT_KEYS: Shift[] = ["am", "pm", "night"];

export default function PortalAvailabilityPage() {
  const [, navigate] = useLocation();
  const [month, setMonth] = useState(todayMonth());
  const [activeStatus, setActiveStatus] = useState<CellStatus>("available");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const { data: portal, error: portalError, isLoading: portalLoading } = useQuery<PortalShape>({
    queryKey: [`/api/portal/me`],
    queryFn: async () => {
      const res = await fetch("/api/portal/me", { credentials: "include" });
      if (res.status === 401) throw new Error("not_signed_in");
      if (!res.ok) throw new Error("Portal not available");
      return res.json();
    },
    retry: false,
  });
  const notSignedIn = (portalError as Error | null)?.message === "not_signed_in";

  const queryKey = useMemo(() => [`/api/portal/me/availability`, month] as const, [month]);
  const { data, isLoading, error } = useQuery<RangeData>({
    queryKey,
    enabled: !!portal && !notSignedIn,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/portal/me/availability?month=${month}`);
      return res.json();
    },
  });

  const lookup = useMemo(() => {
    const m: Record<string, Partial<Record<Shift, CellStatus>>> = {};
    if (data) for (const e of data.entries) (m[e.date] ??= {})[e.shift] = e.status;
    return m;
  }, [data]);

  const days = useMemo(() => monthDays(month), [month]);
  const minMonth = data?.windowMonths.min ?? todayMonth();
  const maxMonth = data?.windowMonths.max ?? addMonths(todayMonth(), 6);

  const flashSaved = () => {
    setSavedAt(Date.now());
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedAt(null), 1800);
  };
  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); }, []);

  const writeMutation = useMutation({
    mutationFn: async (cells: { date: string; shift: Shift; status: CellStatus }[]) => {
      const res = await apiRequest("PUT", `/api/portal/me/availability`, { cells });
      return res.json();
    },
    // Optimistic per-cell save: patch the cached range immediately so the
    // table reflects the change before the round-trip resolves.
    onMutate: async (cells) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<RangeData>(queryKey);
      if (prev) {
        const map = new Map<string, { date: string; shift: Shift; status: AvailabilityStatus }>();
        for (const e of prev.entries) map.set(`${e.date}|${e.shift}`, e);
        for (const c of cells) {
          const key = `${c.date}|${c.shift}`;
          if (c.status === "unset") map.delete(key);
          else map.set(key, { date: c.date, shift: c.shift, status: c.status });
        }
        queryClient.setQueryData<RangeData>(queryKey, { ...prev, entries: Array.from(map.values()) });
      }
      return { prev };
    },
    onError: (e: any, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast({ title: "Could not save", description: e?.message, variant: "destructive" });
    },
    onSuccess: () => {
      flashSaved();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const inWindow = (date: string) => {
    const minDate = `${minMonth}-01`;
    const maxParts = maxMonth.split("-").map(Number);
    const maxLast = new Date(Date.UTC(maxParts[0], maxParts[1], 0));
    const maxDate = `${maxLast.getUTCFullYear()}-${pad2(maxLast.getUTCMonth() + 1)}-${pad2(maxLast.getUTCDate())}`;
    return date >= minDate && date <= maxDate;
  };

  const setCell = (date: string, shift: Shift) => {
    writeMutation.mutate([{ date, shift, status: activeStatus }]);
  };
  const setDayAll = (date: string) => {
    writeMutation.mutate(SHIFT_KEYS.map((s) => ({ date, shift: s, status: activeStatus })));
  };

  // ── Week grouping ────────────────────────────────────────────────────────
  // Group days into ISO weeks (Monday-start) for per-week bulk actions.
  // We only include days that fall within the visible month + the editable
  // window so the server never 400s on the bulk PUT.
  const weeks = useMemo(() => {
    const out: { weekStart: string; days: string[] }[] = [];
    let current: string[] = [];
    let weekStart: string | null = null;
    for (const d of days) {
      const dow = new Date(d + "T00:00:00.000Z").getUTCDay(); // 0=Sun..6=Sat
      const monOffset = dow === 0 ? -6 : 1 - dow;             // shift to Monday
      const monday = addDaysIso(d, monOffset);
      if (weekStart !== monday) {
        if (current.length) out.push({ weekStart: weekStart!, days: current });
        current = [];
        weekStart = monday;
      }
      current.push(d);
    }
    if (current.length && weekStart) out.push({ weekStart, days: current });
    return out;
  }, [days]);

  // ── Bulk actions ─────────────────────────────────────────────────────────
  // Per-week "mark available" — applied to a specific week row in the table.
  const markWeekAvailable = (weekDays: string[]) => {
    const cells: { date: string; shift: Shift; status: CellStatus }[] = [];
    for (const d of weekDays) {
      if (!inWindow(d)) continue;
      for (const s of SHIFT_KEYS) cells.push({ date: d, shift: s, status: "available" });
    }
    if (cells.length) writeMutation.mutate(cells);
  };

  // True cross-month "Copy last week" — for each day of the visible month,
  // copy from (date - 7 days). When source dates fall in the previous month
  // we transparently fetch that month so the copy is reliable across
  // boundaries (e.g. copying into the 1st-3rd of the month).
  const copyLastWeekMutation = useMutation({
    mutationFn: async () => {
      const prevMonth = addMonths(month, -1);
      const needsPrev = days.some((d) => addDaysIso(d, -7) < `${month}-01`);
      let prevLookup: Record<string, Partial<Record<Shift, CellStatus>>> = {};
      if (needsPrev) {
        try {
          const res = await apiRequest("GET", `/api/portal/me/availability?month=${prevMonth}`);
          const prevData: RangeData = await res.json();
          for (const e of prevData.entries) (prevLookup[e.date] ??= {})[e.shift] = e.status;
        } catch {
          // If the previous month is outside the editable window the server
          // returns 400 — that's fine, we just won't have any source rows
          // from that month and the copy degrades gracefully for the days
          // whose source falls in-month.
        }
      }
      const cells: { date: string; shift: Shift; status: CellStatus }[] = [];
      for (const d of days) {
        if (!inWindow(d)) continue;
        const src = addDaysIso(d, -7);
        const srcEntries = src < `${month}-01` ? prevLookup[src] : lookup[src];
        if (!srcEntries) continue;
        for (const s of SHIFT_KEYS) {
          const status = srcEntries[s];
          if (status) cells.push({ date: d, shift: s, status });
        }
      }
      if (!cells.length) return { updated: 0, entries: [] };
      const res = await apiRequest("PUT", `/api/portal/me/availability`, { cells });
      return res.json();
    },
    onSuccess: (result) => {
      if (!result || result.updated === 0) {
        toast({ title: "Nothing to copy", description: "No entries from the previous 7 days were found." });
        return;
      }
      flashSaved();
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast({ title: "Copy failed", description: e?.message, variant: "destructive" }),
  });

  const clearMonth = () => {
    if (!confirm(`Clear all availability for ${monthLabel(month)}?`)) return;
    const cells: { date: string; shift: Shift; status: CellStatus }[] = [];
    for (const d of days) {
      if (!inWindow(d)) continue;
      for (const s of SHIFT_KEYS) cells.push({ date: d, shift: s, status: "unset" });
    }
    if (cells.length) writeMutation.mutate(cells);
  };

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal) return [];
    return buildPortalGroups({
      token: "me",
      journey: portal.journey,
      stepStatuses: {},
      gate: portal.gate ?? null,
      availabilityEnabled: portal.nurse.currentStage === "completed",
      selectOverview: () => navigate(`/portal`),
      selectOnboardingStep: (k) => navigate(`/portal/page?step=${k}`),
      selectAvailability: () => {},
      selectPolicies: () => navigate(`/portal/policies`),
      selectInduction: () => navigate(`/portal/induction`),
      selectSopComprehension: () => navigate(`/portal/sop-comprehension`),
    });
  }, [portal, navigate]);

  const ineligible = portal && portal.nurse.currentStage !== "completed";

  return (
    <PortalShell
      token="me"
      candidateName={portal?.nurse.fullName || ""}
      groups={groups}
      activeKey="rostering:availability"
    >
      <div className="space-y-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Rostering</p>
          <h1 className="font-serif text-2xl font-light tracking-tight" data-testid="heading-availability">
            My Availability
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set AM, PM and Night availability for each day. You can edit the current month and the next 6 months.
          </p>
        </div>

        {portalLoading && !portal && (
          <Card><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
        )}

        {notSignedIn && (
          <Card>
            <CardContent className="p-6 text-sm space-y-3">
              <p className="text-muted-foreground">You need to sign in to your nurse portal to set availability.</p>
              <Button size="sm" onClick={() => (window.location.href = "/portal/sign-in")} data-testid="button-portal-sign-in">
                Sign in to portal
              </Button>
            </CardContent>
          </Card>
        )}

        {ineligible && !notSignedIn && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              The availability calendar opens once you've completed onboarding. Your coordinator will let you know when it's available.
            </CardContent>
          </Card>
        )}

        {!notSignedIn && !ineligible && portal && (
          <>
            <Card>
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline" size="sm"
                    disabled={month <= minMonth}
                    onClick={() => setMonth(addMonths(month, -1))}
                    data-testid="button-prev-month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="font-serif text-lg w-44 text-center" data-testid="text-current-month">
                    {monthLabel(month)}
                  </div>
                  <Button
                    variant="outline" size="sm"
                    disabled={month >= maxMonth}
                    onClick={() => setMonth(addMonths(month, 1))}
                    data-testid="button-next-month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground mr-1">Painting:</span>
                  {STATUSES.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => setActiveStatus(s.key)}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium border transition",
                        activeStatus === s.key ? s.cls + " border-transparent" : "bg-card text-foreground border-border hover:bg-muted",
                      )}
                      data-testid={`button-paint-${s.key}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Month bulk:</span>
                <Button size="sm" variant="outline" onClick={() => copyLastWeekMutation.mutate()} disabled={writeMutation.isPending || copyLastWeekMutation.isPending} data-testid="button-bulk-copy-last-week">
                  Copy last week
                </Button>
                <Button size="sm" variant="outline" onClick={clearMonth} disabled={writeMutation.isPending} data-testid="button-bulk-clear-month">
                  Clear month
                </Button>
                <span className="text-[11px] text-muted-foreground ml-2">
                  Per-week "Mark available" buttons sit beside each week in the table below.
                </span>
                <div className="ml-auto h-5 flex items-center text-xs">
                  {(writeMutation.isPending || copyLastWeekMutation.isPending) && (
                    <span className="text-muted-foreground inline-flex items-center gap-1" data-testid="indicator-saving">
                      <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                    </span>
                  )}
                  {!writeMutation.isPending && !copyLastWeekMutation.isPending && savedAt && (
                    <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1" data-testid="indicator-saved">
                      <Check className="h-3 w-3" /> Saved
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>

            {isLoading && <Skeleton className="h-96 w-full" />}
            {error && <p className="text-sm text-destructive">Failed to load: {(error as Error).message}</p>}

            {data && (
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm" data-testid="table-availability">
                    <thead>
                      <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Date</th>
                        {SHIFT_KEYS.map((s) => (
                          <th key={s} className="px-3 py-2 font-medium text-center">{SHIFT_LABELS[s]}</th>
                        ))}
                        <th className="px-3 py-2 font-medium text-center">All</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeks.map((wk) => (
                        <Fragment key={wk.weekStart}>
                          <tr className="bg-muted/40 border-b">
                            <td colSpan={5} className="px-3 py-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                                  Week of {new Date(wk.weekStart).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
                                </span>
                                <Button
                                  size="sm" variant="outline"
                                  onClick={() => markWeekAvailable(wk.days)}
                                  disabled={writeMutation.isPending}
                                  className="h-6 text-[11px]"
                                  data-testid={`button-mark-week-available-${wk.weekStart}`}
                                >
                                  Mark whole week available
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {wk.days.map((d) => {
                            const dateObj = new Date(d);
                            const dow = dateObj.toLocaleString("en-GB", { weekday: "short", timeZone: "UTC" });
                            const dn = dateObj.getUTCDate();
                            const isWeekend = dateObj.getUTCDay() === 0 || dateObj.getUTCDay() === 6;
                            return (
                              <tr key={d} className={cn("border-b last:border-0", isWeekend && "bg-muted/20")}>
                                <td className="px-3 py-1.5 whitespace-nowrap">
                                  <div className="font-medium">{dn} {dow}</div>
                                </td>
                                {SHIFT_KEYS.map((s) => {
                                  const cur: CellStatus = lookup[d]?.[s] ?? "unset";
                                  const meta = STATUSES.find((x) => x.key === cur)!;
                                  return (
                                    <td key={s} className="px-3 py-1.5 text-center">
                                      <button
                                        onClick={() => setCell(d, s)}
                                        className={cn(
                                          "inline-flex h-7 w-20 items-center justify-center rounded-md text-[11px] font-medium transition",
                                          cur === "unset" ? "bg-muted/50 text-muted-foreground/60 hover:bg-muted" : meta.cls,
                                        )}
                                        data-testid={`cell-${d}-${s}`}
                                      >
                                        {cur === "unset" ? "—" : meta.label}
                                      </button>
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-1.5 text-center">
                                  <Button
                                    size="sm" variant="ghost"
                                    onClick={() => setDayAll(d)}
                                    className="h-7 text-[11px]"
                                    data-testid={`button-day-all-${d}`}
                                  >
                                    Apply
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </PortalShell>
  );
}
