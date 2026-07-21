import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronLeft, ChevronRight, CloudUpload } from "lucide-react";
import { SEMBLE_PUSH_ENABLED } from "@shared/schema";
import { cn } from "@/lib/utils";
import { SemblePushDialog } from "@/components/rostering/semble-push-dialog";
import type { RosterSlot } from "@shared/schema";

interface RotaData {
  from: string;
  to: string;
  days: string[];
  patients: { id: string; name: string; slots: RosterSlot[] }[];
  allocations: {
    id: string; patientId: string; patientName: string; nurseId: string;
    date: string; slotKey: string; slotLabel: string; startTime: string; endTime: string;
  }[];
  nurses: { id: string; fullName: string }[];
  staffTotals: { nurseId: string; nurseName: string; shifts: number; minutes: number; hours: number }[];
  coverage: { patientId: string; patientName: string; totalSlots: number; filled: number; gaps: number }[];
  conflicts: { nurseId: string; nurseName: string; a: any; b: any }[];
}

function pad2(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function todayIso() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function dayLabel(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

export default function RotaPage() {
  const [from, setFrom] = useState(todayIso());
  const days = 7;
  const to = addDays(from, days - 1);
  const [pushOpen, setPushOpen] = useState(false);

  const { data, isLoading } = useQuery<RotaData>({
    queryKey: ["/api/admin/rostering/rota", from],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/rostering/rota?from=${from}&to=${to}`);
      return res.json();
    },
  });

  const allocByCell = useMemo(() => {
    const m = new Map<string, RotaData["allocations"]>();
    for (const a of data?.allocations ?? []) {
      const k = `${a.patientId}|${a.date}`;
      const list = m.get(k) ?? [];
      list.push(a);
      m.set(k, list);
    }
    m.forEach((list) => list.sort((x, y) => x.startTime.localeCompare(y.startTime)));
    return m;
  }, [data]);

  const nurseById = useMemo(() => new Map((data?.nurses ?? []).map((n) => [n.id, n.fullName])), [data]);
  const conflictAllocIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of data?.conflicts ?? []) { s.add(c.a.allocationId); s.add(c.b.allocationId); }
    return s;
  }, [data]);

  return (
    <div className="p-6 space-y-6 animate-fade-in-up">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Rostering</p>
          <h1 className="font-serif text-3xl font-light tracking-tight" data-testid="heading-rota">Patient Rota</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Consolidated week view across all patients — coverage gaps, staff totals and double-booking alerts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setFrom(addDays(from, -days))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-40 text-center">
            {dayLabel(from)} – {dayLabel(to)}
          </span>
          <Button variant="outline" size="icon" onClick={() => setFrom(addDays(from, days))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFrom(todayIso())}>This week</Button>
          <Button
            size="sm"
            disabled={!SEMBLE_PUSH_ENABLED}
            title={SEMBLE_PUSH_ENABLED ? undefined : "Temporarily disabled while rostering is bedded in"}
            onClick={() => setPushOpen(true)}
            data-testid="button-push-semble"
          >
            <CloudUpload className="h-4 w-4 mr-2" /> Push to Semble
          </Button>
        </div>
      </div>

      <SemblePushDialog open={pushOpen} onClose={() => setPushOpen(false)} from={from} to={to} />

      {isLoading && <Skeleton className="h-72 w-full" />}

      {data && (
        <>
          {data.conflicts.length > 0 && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="p-4 space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" /> Double-booking alerts ({data.conflicts.length})
                </p>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {data.conflicts.map((c, i) => (
                    <li key={i} data-testid={`conflict-${i}`}>
                      <span className="font-medium text-foreground">{c.nurseName}</span>:{" "}
                      {c.a.patientName} {dayLabel(c.a.date)} {c.a.startTime}–{c.a.endTime} overlaps{" "}
                      {c.b.patientName} {dayLabel(c.b.date)} {c.b.startTime}–{c.b.endTime}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left p-2.5 font-medium text-xs text-muted-foreground min-w-36">Patient</th>
                    {data.days.map((d) => (
                      <th key={d} className="text-left p-2.5 font-medium text-xs text-muted-foreground whitespace-nowrap">
                        {dayLabel(d)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.patients.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 align-top">
                      <td className="p-2.5">
                        <Link href={`/rostering/patients/${p.id}`} className="text-xs font-medium hover:underline">
                          {p.name}
                        </Link>
                      </td>
                      {data.days.map((d) => {
                        const cell = allocByCell.get(`${p.id}|${d}`) ?? [];
                        const expected = p.slots.length;
                        return (
                          <td key={d} className="p-1.5 space-y-1">
                            {cell.map((a) => (
                              <div
                                key={a.id}
                                className={cn(
                                  "rounded px-1.5 py-1 text-[11px] leading-tight border",
                                  conflictAllocIds.has(a.id)
                                    ? "bg-amber-500/15 border-amber-500/40"
                                    : "bg-primary/10 border-primary/30",
                                )}
                              >
                                <span className="font-medium">{nurseById.get(a.nurseId) ?? "Unknown"}</span>
                                <span className="block text-muted-foreground">{a.startTime}–{a.endTime}</span>
                              </div>
                            ))}
                            {cell.length < expected && (
                              <div className="rounded px-1.5 py-1 text-[11px] border border-dashed text-muted-foreground">
                                {expected - cell.length} gap{expected - cell.length === 1 ? "" : "s"}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {data.patients.length === 0 && (
                    <tr>
                      <td colSpan={data.days.length + 1} className="p-8 text-center text-sm text-muted-foreground">
                        No active patients. <Link href="/rostering/patients" className="underline">Create one</Link> to start rostering.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="p-4 space-y-3">
                <h2 className="font-serif text-lg font-light">Staff totals</h2>
                {data.staffTotals.length === 0 && (
                  <p className="text-sm text-muted-foreground">No allocations in this window.</p>
                )}
                <div className="space-y-1.5">
                  {data.staffTotals.map((t) => (
                    <div key={t.nurseId} className="flex items-center justify-between text-sm" data-testid={`staff-total-${t.nurseId}`}>
                      <span className="truncate">{t.nurseName}</span>
                      <span className="text-muted-foreground shrink-0">
                        {t.shifts} shift{t.shifts === 1 ? "" : "s"} · <span className="font-serif">{t.hours}</span> hrs
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-3">
                <h2 className="font-serif text-lg font-light">Coverage</h2>
                <div className="space-y-1.5">
                  {data.coverage.map((c) => (
                    <div key={c.patientId} className="flex items-center justify-between text-sm">
                      <span className="truncate">{c.patientName}</span>
                      <span className="shrink-0">
                        {c.gaps > 0 ? (
                          <Badge variant="secondary" className="bg-rose-500/15 text-rose-600 dark:text-rose-400">
                            {c.filled}/{c.totalSlots} · {c.gaps} gap{c.gaps === 1 ? "" : "s"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            Fully covered
                          </Badge>
                        )}
                      </span>
                    </div>
                  ))}
                  {data.coverage.length === 0 && (
                    <p className="text-sm text-muted-foreground">No active patients.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
