import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CalendarCheck, Check, CloudUpload, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PendingItem {
  allocationId: string;
  patientId: string;
  patientName: string;
  nurseId: string;
  nurseName: string;
  nurseLinked: boolean;
  bookedAsName: string | null;
  date: string;
  slotKey: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  status: "pending" | "failed" | "booked";
  sembleBookingId: string | null;
  error: string | null;
}

interface PendingResponse {
  from: string;
  to: string;
  configured: boolean;
  settingsComplete: boolean;
  items: PendingItem[];
  counts: { pending: number; failed: number; booked: number };
}

interface PushResultRow {
  allocationId: string;
  status: "created" | "failed" | "skipped";
  bookingId?: string;
  error?: string;
  skippedReason?: string;
}

function dayLabel(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

/**
 * Confirm-and-push dialog: lists roster shifts for Semble-linked patients in
 * the given range, lets the admin tick which ones to send, pushes them in one
 * confirmed action and shows a per-shift success/failure result.
 */
export function SemblePushDialog({
  open, onClose, from, to, patientId,
}: {
  open: boolean;
  onClose: () => void;
  from: string;
  to: string;
  patientId?: string;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Map<string, PushResultRow> | null>(null);

  const pendingUrl = `/api/admin/semble/pending-bookings?from=${from}&to=${to}${patientId ? `&patientId=${patientId}` : ""}`;
  const { data, isLoading } = useQuery<PendingResponse>({
    queryKey: [pendingUrl],
    queryFn: async () => (await apiRequest("GET", pendingUrl)).json(),
    enabled: open,
  });

  // Default selection: everything pending or failed (failed = retry).
  useEffect(() => {
    if (!data || results) return;
    setSelected(new Set(data.items.filter((i) => i.status !== "booked").map((i) => i.allocationId)));
  }, [data, results]);

  useEffect(() => {
    if (!open) {
      setResults(null);
      setSelected(new Set());
    }
  }, [open]);

  const push = useMutation({
    mutationFn: async (allocationIds: string[]) => {
      const res = await apiRequest("POST", "/api/admin/semble/push-bookings", { allocationIds });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message || `Push failed (${res.status})`);
      }
      return res.json() as Promise<{ results: PushResultRow[]; summary: { pushed: number; failed: number; skipped: number } }>;
    },
    onSuccess: ({ results: rows, summary }) => {
      setResults(new Map(rows.map((r) => [r.allocationId, r])));
      queryClient.invalidateQueries({ queryKey: [pendingUrl] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rostering/rota"] });
      queryClient.invalidateQueries({
        predicate: (q) => String(q.queryKey[0] ?? "").startsWith("/api/admin/rostering/patients/"),
      });
      if (summary.failed === 0 && summary.skipped === 0) {
        toast({ title: `${summary.pushed} booking${summary.pushed === 1 ? "" : "s"} created in Semble` });
      } else {
        toast({
          title: `${summary.pushed} created · ${summary.failed} failed${summary.skipped ? ` · ${summary.skipped} skipped` : ""}`,
          variant: summary.pushed === 0 ? "destructive" : undefined,
        });
      }
    },
    onError: (e: any) => toast({ title: "Push to Semble failed", description: e?.message, variant: "destructive" }),
  });

  const selectable = useMemo(() => (data?.items ?? []).filter((i) => i.status !== "booked"), [data]);
  const allSelected = selectable.length > 0 && selectable.every((i) => selected.has(i.allocationId));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusBadge = (item: PendingItem) => {
    const r = results?.get(item.allocationId);
    if (r) {
      if (r.status === "created") {
        return (
          <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
            <Check className="h-2.5 w-2.5 mr-0.5" /> Booked
          </Badge>
        );
      }
      if (r.status === "failed") {
        return (
          <Badge variant="secondary" className="text-[10px] bg-rose-500/15 text-rose-600 dark:text-rose-400" title={r.error}>
            <X className="h-2.5 w-2.5 mr-0.5" /> Failed
          </Badge>
        );
      }
      return <Badge variant="outline" className="text-[10px]" title={r.skippedReason}>Skipped</Badge>;
    }
    if (item.status === "booked") {
      return (
        <Badge variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <CalendarCheck className="h-2.5 w-2.5 mr-0.5" /> In Semble
        </Badge>
      );
    }
    if (item.status === "failed") {
      return (
        <Badge variant="secondary" className="text-[10px] bg-rose-500/15 text-rose-600 dark:text-rose-400" title={item.error ?? undefined}>
          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Failed — retry
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400">
        Pending
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-serif font-light flex items-center gap-2">
            <CloudUpload className="h-4 w-4" /> Push confirmed shifts to Semble
          </DialogTitle>
          <DialogDescription>
            {dayLabel(from)} – {dayLabel(to)} · shifts for Semble-linked patients. Tick the shifts to
            book, then confirm — each becomes a booking in the Semble diary.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <Skeleton className="h-40 w-full" />}

        {data && !data.configured && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-muted-foreground">
            Semble is not configured — add the API token in Settings first.
          </div>
        )}
        {data && data.configured && !data.settingsComplete && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-muted-foreground">
            Booking defaults (location, booking type and clinician) must be saved in Settings before
            bookings can be pushed.
          </div>
        )}

        {data && data.items.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8" data-testid="text-no-semble-shifts">
            No shifts for Semble-linked patients in this range.
            {!patientId && " Link a patient to Semble from the patient dialog first."}
          </p>
        )}

        {data && data.items.length > 0 && (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={allSelected}
                  disabled={selectable.length === 0 || !!results}
                  onCheckedChange={(c) => {
                    setSelected(c ? new Set(selectable.map((i) => i.allocationId)) : new Set());
                  }}
                  data-testid="checkbox-select-all"
                />
                Select all outstanding
              </label>
              <span>
                {data.counts.pending} pending · {data.counts.failed} failed · {data.counts.booked} already booked
              </span>
            </div>
            <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1">
              {data.items.map((item) => {
                const done = item.status === "booked" && !results?.get(item.allocationId);
                return (
                  <label
                    key={item.allocationId}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm",
                      done ? "opacity-60" : "cursor-pointer hover:border-primary/50",
                      selected.has(item.allocationId) && !done && "border-primary/50 bg-primary/5",
                    )}
                    data-testid={`row-push-${item.allocationId}`}
                  >
                    <Checkbox
                      checked={selected.has(item.allocationId)}
                      disabled={done || !!results || push.isPending}
                      onCheckedChange={() => toggle(item.allocationId)}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{dayLabel(item.date)}</span>
                      <span className="text-muted-foreground"> · {item.slotLabel} ({item.startTime}–{item.endTime})</span>
                      <div className="text-xs text-muted-foreground truncate">
                        {item.patientName} → {item.nurseName}
                        <span className="text-muted-foreground/60">
                          {item.nurseLinked
                            ? ` · books as ${item.bookedAsName || item.nurseName}`
                            : " · books as default clinician"}
                        </span>
                      </div>
                      {(results?.get(item.allocationId)?.error || (!results && item.status === "failed" && item.error)) && (
                        <div className="text-[11px] text-rose-500 truncate" title={results?.get(item.allocationId)?.error ?? item.error ?? undefined}>
                          {results?.get(item.allocationId)?.error ?? item.error}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">{statusBadge(item)}</div>
                  </label>
                );
              })}
            </div>
          </>
        )}

        <DialogFooter>
          {results ? (
            <Button onClick={onClose} data-testid="button-push-done">Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                disabled={
                  selected.size === 0 ||
                  push.isPending ||
                  !data?.configured ||
                  !data?.settingsComplete
                }
                onClick={() => push.mutate(Array.from(selected))}
                data-testid="button-confirm-push"
              >
                {push.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create {selected.size} booking{selected.size === 1 ? "" : "s"} in Semble
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
