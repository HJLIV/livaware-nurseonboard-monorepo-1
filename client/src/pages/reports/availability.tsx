import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Check, ChevronLeft, ChevronRight, Download, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHIFT_LABELS, VISIBLE_SHIFTS, type Shift, type AvailabilityStatus } from "@shared/schema";

type CellStatus = AvailabilityStatus | "unset";

interface MatrixTotals { all: number; completed: number }
interface MatrixData {
  month: string;
  from: string;
  to: string;
  days: string[];
  shifts: Shift[];
  nurses: { id: string; fullName: string; email: string }[];
  matrix: Record<string, Record<string, Record<Shift, AvailabilityStatus>>>;
  totals?: MatrixTotals;
  stage?: string;
  windowMonths: { min: string; max: string };
}

const STATUS_DOT: Record<CellStatus, string> = {
  available: "bg-emerald-500",
  preferred: "bg-primary",
  unavailable: "bg-rose-500",
  working_elsewhere: "bg-violet-500",
  unset: "bg-muted",
};

const STATUS_OPTIONS: { key: CellStatus; label: string; cls: string }[] = [
  { key: "available", label: "Available", cls: "bg-emerald-500 text-white" },
  { key: "preferred", label: "Preferred", cls: "bg-primary text-primary-foreground" },
  { key: "unavailable", label: "Unavailable", cls: "bg-rose-500 text-white" },
  { key: "working_elsewhere", label: "Working elsewhere", cls: "bg-violet-500 text-white" },
  { key: "unset", label: "Clear", cls: "bg-muted text-muted-foreground" },
];

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function todayMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric" });
}

interface EditorRangeData {
  nurseId: string;
  nurseName: string;
  entries: { date: string; shift: Shift; status: AvailabilityStatus }[];
  shifts: Shift[];
}

function NurseEditor({ nurseId, month, onClose }: { nurseId: string; month: string; onClose: () => void }) {
  const { toast } = useToast();
  const [paint, setPaint] = useState<CellStatus>("available");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current); }, []);
  const flashSaved = () => {
    setSavedAt(Date.now());
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedAt(null), 1800);
  };

  const queryKey = useMemo(() => [`/api/admin/nurses/${nurseId}/availability`, month] as const, [nurseId, month]);
  const { data, isLoading } = useQuery<EditorRangeData>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/nurses/${nurseId}/availability?month=${month}`);
      return res.json();
    },
  });
  const lookup = useMemo(() => {
    const m: Record<string, Partial<Record<Shift, CellStatus>>> = {};
    if (data) for (const e of data.entries) (m[e.date] ??= {})[e.shift] = e.status;
    return m;
  }, [data]);

  const writeMutation = useMutation({
    mutationFn: async (cells: { date: string; shift: Shift; status: CellStatus }[]) => {
      const res = await apiRequest("PUT", `/api/admin/nurses/${nurseId}/availability`, { cells });
      return res.json();
    },
    onMutate: async (cells) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<EditorRangeData>(queryKey);
      if (prev) {
        const map = new Map<string, { date: string; shift: Shift; status: AvailabilityStatus }>();
        for (const e of prev.entries) map.set(`${e.date}|${e.shift}`, e);
        for (const c of cells) {
          const k = `${c.date}|${c.shift}`;
          if (c.status === "unset") map.delete(k);
          else map.set(k, { date: c.date, shift: c.shift, status: c.status });
        }
        queryClient.setQueryData<EditorRangeData>(queryKey, { ...prev, entries: Array.from(map.values()) });
      }
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    },
    onSuccess: () => flashSaved(),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/availability/matrix`, month] });
    },
  });

  const setCell = (date: string, shift: Shift) => {
    writeMutation.mutate([{ date, shift, status: paint }]);
  };

  const days = useMemo(() => {
    if (!data) return [];
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: last }, (_, i) => `${month}-${pad2(i + 1)}`);
  }, [data, month]);

  return (
    <Card className="sticky top-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Editor</p>
            <h3 className="font-serif text-base font-light" data-testid="text-editor-nurse-name">
              {data?.nurseName || "Loading..."}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-5 flex items-center text-xs">
              {writeMutation.isPending && (
                <span className="text-muted-foreground inline-flex items-center gap-1" data-testid="indicator-editor-saving">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              )}
              {!writeMutation.isPending && savedAt && (
                <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1" data-testid="indicator-editor-saved">
                  <Check className="h-3 w-3" /> Saved
                </span>
              )}
            </span>
            <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-editor" tooltip="Close the availability editor.">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setPaint(s.key)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[11px] border",
                paint === s.key ? s.cls + " border-transparent" : "bg-card border-border hover:bg-muted",
              )}
              data-testid={`button-editor-paint-${s.key}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-1.5">Date</th>
                  {VISIBLE_SHIFTS.map((s) => (
                    <th key={s} className="px-1 py-1.5 text-center">{SHIFT_LABELS[s]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const dn = new Date(d).getUTCDate();
                  const dow = new Date(d).toLocaleString("en-GB", { weekday: "short", timeZone: "UTC" });
                  return (
                    <tr key={d} className="border-b last:border-0">
                      <td className="px-2 py-1 whitespace-nowrap">{dn} {dow}</td>
                      {VISIBLE_SHIFTS.map((s) => {
                        const cur = lookup[d]?.[s] || "unset";
                        const meta = STATUS_OPTIONS.find((x) => x.key === cur)!;
                        return (
                          <td key={s} className="px-1 py-1 text-center">
                            <button
                              onClick={() => setCell(d, s)}
                              className={cn(
                                "h-6 w-16 rounded text-[10px]",
                                cur === "unset" ? "bg-muted/50 text-muted-foreground/60 hover:bg-muted" : meta.cls,
                              )}
                              data-testid={`editor-cell-${d}-${s}`}
                            >
                              {cur === "unset" ? "—" : meta.label}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AvailabilityMatrixPage() {
  const [month, setMonth] = useState(todayMonth());
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<"completed" | "all">("completed");
  const [selectedNurse, setSelectedNurse] = useState<string | null>(null);

  const { data, isLoading } = useQuery<MatrixData>({
    queryKey: [`/api/admin/availability/matrix`, month, search, stage],
    queryFn: async () => {
      const params = new URLSearchParams({ month, stage });
      if (search.trim()) params.set("search", search.trim());
      const res = await apiRequest("GET", `/api/admin/availability/matrix?${params}`);
      return res.json();
    },
  });

  const minMonth = data?.windowMonths.min ?? todayMonth();
  const maxMonth = data?.windowMonths.max ?? addMonths(todayMonth(), 6);

  const downloadCsv = () => {
    const params = new URLSearchParams({ month, stage });
    if (search.trim()) params.set("search", search.trim());
    window.open(`/api/admin/availability/export.csv?${params}`, "_blank");
  };

  return (
    <AppLayout>
      <div className="px-6 py-6 space-y-5 animate-fade-in-up">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Rostering</p>
            <h1 className="font-serif text-3xl font-light tracking-tight" data-testid="heading-availability-matrix">
              Availability Matrix
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Whole-roster view of nurse availability by day and shift. Click a row to edit.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as "completed" | "all")}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              data-testid="select-stage-filter"
            >
              <option value="completed">Nurse (completed)</option>
              <option value="all">All stages</option>
            </select>
            <Input
              placeholder="Search nurses…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-56"
              data-testid="input-search-nurses"
            />
            <Button variant="outline" size="sm" onClick={downloadCsv} data-testid="button-export-csv" tooltip="Download the current availability view as a CSV file.">
              <Download className="h-4 w-4 mr-1.5" /> CSV
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              disabled={month <= minMonth}
              onClick={() => setMonth(addMonths(month, -1))}
              data-testid="button-matrix-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="font-serif text-lg w-44 text-center" data-testid="text-matrix-month">
              {monthLabel(month)}
            </div>
            <Button
              variant="outline" size="sm"
              disabled={month >= maxMonth}
              onClick={() => setMonth(addMonths(month, 1))}
              data-testid="button-matrix-next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className={cn("h-2 w-2 rounded-full", STATUS_DOT.available)} />Available</span>
              <span className="inline-flex items-center gap-1"><span className={cn("h-2 w-2 rounded-full", STATUS_DOT.preferred)} />Preferred</span>
              <span className="inline-flex items-center gap-1"><span className={cn("h-2 w-2 rounded-full", STATUS_DOT.unavailable)} />Unavailable</span>
              <span className="inline-flex items-center gap-1"><span className={cn("h-2 w-2 rounded-full", STATUS_DOT.working_elsewhere)} />Working elsewhere</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-5">
          <Card className="overflow-hidden">
            <CardContent className="p-0 overflow-x-auto">
              {isLoading && <Skeleton className="h-96 w-full" />}
              {data && (
                <table className="text-xs" data-testid="table-availability-matrix">
                  <thead className="sticky top-0 bg-card border-b z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-[10px] uppercase tracking-wider text-muted-foreground sticky left-0 bg-card z-10 min-w-[12rem]">Nurse</th>
                      {data.days.map((d) => (
                        <th key={d} className="px-1 py-2 text-center font-medium text-[10px] text-muted-foreground border-l">
                          {new Date(d).getUTCDate()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.nurses.length === 0 && (
                      <tr><td colSpan={data.days.length + 1} className="px-3 py-10 text-center text-muted-foreground">
                        {(() => {
                          const totals = data.totals;
                          if (!totals || totals.all === 0) {
                            return "No nurses exist yet. Register a nurse from the Nurses page to get started.";
                          }
                          if (stage === "completed" && totals.completed === 0) {
                            return (
                              <>
                                You have <span className="font-medium text-foreground">{totals.all}</span> nurse{totals.all === 1 ? "" : "s"}, but none are at the <span className="font-medium text-foreground">Nurse (completed)</span> stage yet — only fully-onboarded nurses can save availability.
                                {" "}
                                <button
                                  onClick={() => setStage("all")}
                                  className="underline text-foreground hover:text-primary"
                                  data-testid="button-switch-all-stages"
                                >
                                  Switch to All stages
                                </button>{" "}to view them.
                              </>
                            );
                          }
                          if (search.trim()) {
                            return `No nurses match "${search.trim()}".`;
                          }
                          return "No nurses match this view.";
                        })()}
                      </td></tr>
                    )}
                    {data.nurses.map((n) => (
                      <tr
                        key={n.id}
                        className={cn("border-b hover:bg-muted/30 cursor-pointer", selectedNurse === n.id && "bg-muted/40")}
                        onClick={() => setSelectedNurse(n.id)}
                        data-testid={`matrix-row-${n.id}`}
                      >
                        <td className="px-3 py-2 sticky left-0 bg-card group-hover:bg-muted/30 z-[1] min-w-[12rem]">
                          <div className="font-medium truncate">{n.fullName}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{n.email}</div>
                        </td>
                        {data.days.map((d) => {
                          const cell = data.matrix[n.id]?.[d] || ({} as Record<Shift, AvailabilityStatus>);
                          return (
                            <td key={d} className="px-1 py-2 text-center border-l align-middle">
                              <div className="flex items-center justify-center gap-0.5">
                                {VISIBLE_SHIFTS.map((s) => (
                                  <span
                                    key={s}
                                    className={cn("h-2 w-2 rounded-full", STATUS_DOT[cell[s] || "unset"])}
                                    title={`${SHIFT_LABELS[s]}: ${cell[s] || "unset"}`}
                                  />
                                ))}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <div>
            {selectedNurse ? (
              <NurseEditor nurseId={selectedNurse} month={month} onClose={() => setSelectedNurse(null)} />
            ) : (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground text-center">
                  Click any nurse row to open the editor.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
