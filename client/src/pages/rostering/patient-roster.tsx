import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { SEMBLE_PUSH_ENABLED } from "@shared/schema";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, CalendarCheck, Check, ChevronLeft, ChevronRight, CloudUpload, Loader2, ShieldCheck, Trash2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SemblePushDialog } from "@/components/rostering/semble-push-dialog";
import type { RosterSlot } from "@shared/schema";

interface RosterData {
  patient: { id: string; name: string; carePattern: string; notes: string | null; sembleId: string | null };
  from: string;
  to: string;
  slots: RosterSlot[];
  days: { date: string; inEngagement: boolean }[];
  allocations: {
    id: string; date: string; slotKey: string; nurseId: string;
    slotLabel: string; startTime: string; endTime: string;
    sembleBookingId: string | null; sembleBookingError: string | null;
  }[];
  nurses: { id: string; fullName: string }[];
}

interface NurseOption {
  id: string;
  fullName: string;
  email: string | null;
  currentStage: string;
  compliance: { nmc: boolean; dbs: boolean; competency: boolean };
  availability: string | null;
  conflicts: { patientName: string; date: string; slotLabel: string; startTime: string; endTime: string }[];
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

function Tick({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded",
      ok ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
      {ok ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}{label}
    </span>
  );
}

function NursePicker({
  patientId, date, slot, currentNurseId, onClose,
}: {
  patientId: string;
  date: string;
  slot: RosterSlot;
  currentNurseId: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [pendingOverride, setPendingOverride] = useState<{ nurseId: string; conflicts: any[] } | null>(null);

  const { data, isLoading } = useQuery<{ nurses: NurseOption[]; shift: string }>({
    queryKey: ["/api/admin/rostering/nurse-options", date, slot.key, slot.startTime, slot.endTime],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/admin/rostering/nurse-options?date=${date}&startTime=${slot.startTime}&endTime=${slot.endTime}`,
      );
      return res.json();
    },
  });

  const allocate = useMutation({
    mutationFn: async ({ nurseId, override }: { nurseId: string; override?: boolean }) => {
      const res = await apiRequest("POST", `/api/admin/rostering/patients/${patientId}/allocations`, {
        date, slotKey: slot.key, nurseId, override,
      });
      if (res.status === 409) {
        const body = await res.json();
        throw Object.assign(new Error("crossover"), { conflicts: body.conflicts, nurseId });
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/rostering/patients/${patientId}/roster`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/rota"] });
      toast({ title: "Nurse allocated" });
      onClose();
    },
    onError: (e: any) => {
      if (e?.message === "crossover" && e.conflicts) {
        setPendingOverride({ nurseId: e.nurseId, conflicts: e.conflicts });
      } else {
        toast({ title: "Allocation failed", description: e?.message, variant: "destructive" });
      }
    },
  });

  const filtered = useMemo(
    () =>
      (data?.nurses ?? []).filter(
        (n) =>
          n.fullName.toLowerCase().includes(search.toLowerCase()) ||
          (n.email ?? "").toLowerCase().includes(search.toLowerCase()),
      ),
    [data, search],
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-serif font-light">
            Assign nurse — {dayLabel(date)} · {slot.label} ({slot.startTime}–{slot.endTime})
          </DialogTitle>
        </DialogHeader>

        {pendingOverride ? (
          <div className="space-y-4">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" /> Crossover detected
              </p>
              <p className="mt-1 text-muted-foreground">
                This nurse is already rostered during an overlapping window:
              </p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {pendingOverride.conflicts.map((c: any, i: number) => (
                  <li key={i}>
                    {c.patientName} — {dayLabel(c.date)} · {c.slotLabel} ({c.startTime}–{c.endTime})
                  </li>
                ))}
              </ul>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingOverride(null)}>Back</Button>
              <Button
                variant="destructive"
                onClick={() => allocate.mutate({ nurseId: pendingOverride.nurseId, override: true })}
                disabled={allocate.isPending}
                data-testid="button-override-allocate"
              >
                {allocate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Allocate anyway
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <Input
              placeholder="Search nurses…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-nurse-search"
            />
            <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1.5">
              {isLoading && <Skeleton className="h-32 w-full" />}
              {filtered.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={cn(
                    "w-full text-left rounded-md border p-2.5 hover:border-primary/50 transition-colors",
                    n.id === currentNurseId && "border-primary bg-primary/5",
                  )}
                  onClick={() => allocate.mutate({ nurseId: n.id })}
                  disabled={allocate.isPending}
                  data-testid={`option-nurse-${n.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {n.fullName}
                      {n.email && (
                        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{n.email}</span>
                      )}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {n.availability === "available" || n.availability === "preferred" ? (
                        <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          {n.availability === "preferred" ? "Prefers this shift" : "Available"}
                        </Badge>
                      ) : n.availability === "unavailable" || n.availability === "working_elsewhere" ? (
                        <Badge variant="secondary" className="text-[10px] bg-rose-500/15 text-rose-600 dark:text-rose-400">
                          {n.availability === "working_elsewhere" ? "Working elsewhere" : "Unavailable"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">No availability set</Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                    <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                    <Tick ok={n.compliance.nmc} label="NMC" />
                    <Tick ok={n.compliance.dbs} label="DBS" />
                    <Tick ok={n.compliance.competency} label="Competency" />
                    {n.conflicts.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-2.5 w-2.5" />
                        Already rostered: {n.conflicts[0].patientName} {n.conflicts[0].startTime}–{n.conflicts[0].endTime}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {!isLoading && filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No nurses match.</p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function PatientRosterPage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const { toast } = useToast();
  const [from, setFrom] = useState(todayIso());
  const days = 14;
  const to = addDays(from, days - 1);
  const [picker, setPicker] = useState<{ date: string; slot: RosterSlot; currentNurseId: string | null } | null>(null);
  const [pushOpen, setPushOpen] = useState(false);

  const queryKey = [`/api/admin/rostering/patients/${patientId}/roster`, from];
  const { data, isLoading } = useQuery<RosterData>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/rostering/patients/${patientId}/roster?from=${from}&to=${to}`);
      return res.json();
    },
  });

  const unassign = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/rostering/allocations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/rostering/patients/${patientId}/roster`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/rota"] });
      toast({ title: "Allocation removed" });
    },
    onError: (e: any) => toast({ title: "Remove failed", description: e?.message, variant: "destructive" }),
  });

  const nurseById = useMemo(() => new Map((data?.nurses ?? []).map((n) => [n.id, n.fullName])), [data]);
  const allocByCell = useMemo(() => {
    const m = new Map<string, RosterData["allocations"][number]>();
    for (const a of data?.allocations ?? []) m.set(`${a.date}|${a.slotKey}`, a);
    return m;
  }, [data]);

  return (
    <div className="p-6 space-y-6 animate-fade-in-up">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
            <Link href="/rostering/patients" className="hover:text-foreground">Rostering / Patients</Link>
          </p>
          <h1 className="font-serif text-3xl font-light tracking-tight" data-testid="heading-patient-roster">
            {data?.patient.name ?? "Roster"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Click a cell to assign a nurse. Compliance ticks, availability and crossover warnings appear in the picker.
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
          <Button variant="outline" size="sm" onClick={() => setFrom(todayIso())}>Today</Button>
          {data?.patient.sembleId && (
            <Button
              size="sm"
              disabled={!SEMBLE_PUSH_ENABLED}
              title={SEMBLE_PUSH_ENABLED ? undefined : "Temporarily disabled while rostering is bedded in"}
              onClick={() => setPushOpen(true)}
              data-testid="button-push-semble"
            >
              <CloudUpload className="h-4 w-4 mr-2" /> Push to Semble
            </Button>
          )}
        </div>
      </div>

      {isLoading && <Skeleton className="h-72 w-full" />}

      {data && (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left p-2.5 font-medium text-xs text-muted-foreground w-32">Date</th>
                  {data.slots.map((s) => (
                    <th key={s.key} className="text-left p-2.5 font-medium text-xs text-muted-foreground">
                      {s.label}
                      <span className="block font-normal text-[10px]">{s.startTime}–{s.endTime}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={d.date} className={cn("border-b last:border-0", !d.inEngagement && "opacity-40")}>
                    <td className="p-2.5 text-xs whitespace-nowrap">{dayLabel(d.date)}</td>
                    {data.slots.map((s) => {
                      const alloc = allocByCell.get(`${d.date}|${s.key}`);
                      return (
                        <td key={s.key} className="p-1.5">
                          {alloc ? (
                            <div className="group flex items-center justify-between gap-1 rounded-md bg-primary/10 border border-primary/30 px-2 py-1.5">
                              <button
                                type="button"
                                className="text-left text-xs font-medium truncate hover:underline"
                                onClick={() => d.inEngagement && setPicker({ date: d.date, slot: s, currentNurseId: alloc.nurseId })}
                                data-testid={`cell-${d.date}-${s.key}`}
                              >
                                {nurseById.get(alloc.nurseId) ?? "Unknown"}
                              </button>
                              {data.patient.sembleId && (
                                alloc.sembleBookingId ? (
                                  <CalendarCheck
                                    className="h-3 w-3 shrink-0 text-emerald-500"
                                    aria-label="Booked in Semble"
                                    data-testid={`semble-status-booked-${d.date}-${s.key}`}
                                  />
                                ) : alloc.sembleBookingError ? (
                                  <AlertTriangle
                                    className="h-3 w-3 shrink-0 text-rose-500"
                                    aria-label={`Semble push failed: ${alloc.sembleBookingError}`}
                                    data-testid={`semble-status-failed-${d.date}-${s.key}`}
                                  />
                                ) : (
                                  <span
                                    className="h-2 w-2 shrink-0 rounded-full bg-amber-400/80"
                                    title="Not yet pushed to Semble"
                                    aria-label="Not yet pushed to Semble"
                                    data-testid={`semble-status-pending-${d.date}-${s.key}`}
                                  />
                                )
                              )}
                              <button
                                type="button"
                                className="opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => unassign.mutate(alloc.id)}
                                title="Remove allocation"
                                data-testid={`button-unassign-${d.date}-${s.key}`}
                              >
                                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className={cn(
                                "w-full rounded-md border border-dashed px-2 py-1.5 text-xs text-muted-foreground",
                                d.inEngagement ? "hover:border-primary/50 hover:text-foreground" : "cursor-not-allowed",
                              )}
                              disabled={!d.inEngagement}
                              onClick={() => setPicker({ date: d.date, slot: s, currentNurseId: null })}
                              data-testid={`cell-${d.date}-${s.key}`}
                            >
                              {d.inEngagement ? "Assign" : "—"}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {picker && (
        <NursePicker
          patientId={patientId}
          date={picker.date}
          slot={picker.slot}
          currentNurseId={picker.currentNurseId}
          onClose={() => setPicker(null)}
        />
      )}

      <SemblePushDialog
        open={pushOpen}
        onClose={() => setPushOpen(false)}
        from={from}
        to={to}
        patientId={patientId}
      />
    </div>
  );
}
