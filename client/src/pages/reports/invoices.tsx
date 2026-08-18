import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Download, Check, Loader2, X } from "lucide-react";
import { useAuthRole } from "@/lib/use-auth-role";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type Status = "submitted" | "approved" | "paid" | "reconciled" | "rejected";
type StatusFilter = Status | "";
type StageFilter = "completed" | "all";
interface StatusPatchBody {
  status: Status;
  paymentReference?: string;
  paymentDate?: string;
  rejectedReason?: string;
}

interface InvoiceRow {
  id: string; nurseId: string;
  invoiceNumber: string;
  fullName: string;
  status: Status; submittedAt: string;
  rateType?: string; // "hourly" | "day_shift" (absent on old rows = hourly)
  totalAmount: number; totalHours: number; additionalCostsTotal: number;
  entryCount?: number; // days of service for day/shift invoices
  paymentReference?: string | null; paymentDate?: string | null; rejectedReason?: string | null;
  patientInitials?: string[];
  locations?: string[];
}
interface NurseRow { id: string; fullName: string; email: string; currentStage: string }

const STATUS_BADGE: Record<Status, string> = {
  submitted: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  approved: "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200",
  paid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
  reconciled: "bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200",
  rejected: "bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200",
};
const STATUSES: Status[] = ["submitted", "approved", "paid", "reconciled", "rejected"];
function gbp(p: number): string { return `£${(p / 100).toFixed(2)}`; }
function hoursLabel(m: number): string { return `${(m / 60).toFixed(2)} h`; }

interface FullInvoice extends InvoiceRow {
  fullName: string; email: string; address: string; phoneNumber: string;
  ltdCompany: string | null; utr: string | null;
  accountType: string; accountName: string; bankName: string; sortCode: string; accountNumber: string;
  rateType: string; hourlyRate: number; paymentNotes: string | null;
  attachmentUrl?: string | null; attachmentFilename?: string | null;
  timesheetEntries: { id: string; date: string; startTime: string | null; endTime: string | null; patientInitials: string; location: string; dayType?: string | null; hoursMinutes: number; amountPence: number }[];
  additionalCosts: { id: string; description: string; amountPence: number; receiptImageUrl: string | null }[];
}

function StatusActions({ inv, onClose }: { inv: FullInvoice; onClose: () => void }) {
  const { toast } = useToast();
  const { isSuperAdmin } = useAuthRole();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [paymentReference, setPaymentReference] = useState(inv.paymentReference || inv.invoiceNumber || "");
  const [paymentDate, setPaymentDate] = useState(inv.paymentDate || new Date().toISOString().slice(0, 10));
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const patch = useMutation({
    mutationFn: async (body: StatusPatchBody) => (await apiRequest("PATCH", `/api/admin/invoices/${inv.id}/status`, body)).json(),
    onSuccess: () => {
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 1800);
      queryClient.invalidateQueries({ queryKey: [`/api/admin/invoices`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/invoices/${inv.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/invoices/stats`] });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/invoices/by-nurse/${inv.nurseId}`] });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });
  const del = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", `/api/admin/invoices/${inv.id}`)).json(),
    onSuccess: () => {
      toast({ title: "Invoice deleted" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/invoices`] });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const can = (target: Status): boolean => {
    if (inv.status === "submitted") return target === "approved" || target === "rejected";
    if (inv.status === "approved") return target === "paid" || target === "rejected";
    if (inv.status === "paid") return target === "reconciled";
    return false;
  };

  return (
    <div className="flex flex-wrap gap-2 items-center pt-3 border-t">
      <span className="h-5 flex items-center text-xs">
        {patch.isPending && <span className="text-muted-foreground inline-flex items-center gap-1" data-testid="indicator-saving"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>}
        {!patch.isPending && savedAt && <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1" data-testid="indicator-saved"><Check className="h-3 w-3" /> Saved</span>}
      </span>
      {can("approved") && <Button size="sm" onClick={() => patch.mutate({ status: "approved" })} data-testid="button-approve">Approve</Button>}
      {can("paid") && <Button size="sm" variant="default" onClick={() => patch.mutate({ status: "paid" })} data-testid="button-mark-paid">Mark paid</Button>}
      {can("reconciled") && <Button size="sm" onClick={() => setReconcileOpen(true)} data-testid="button-reconcile">Reconcile…</Button>}
      {can("rejected") && <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)} data-testid="button-reject">Reject…</Button>}
      {isSuperAdmin && <Button size="sm" variant="ghost" className="text-rose-600 ml-auto" onClick={() => { if (confirm("Delete this invoice?")) del.mutate(); }} data-testid="button-delete">Delete</Button>}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject invoice</DialogTitle></DialogHeader>
          <Label>Reason</Label>
          <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} data-testid="input-reject-reason" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button onClick={() => { patch.mutate({ status: "rejected", rejectedReason: rejectReason }); setRejectOpen(false); }} disabled={!rejectReason.trim()} data-testid="button-confirm-reject">Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reconcileOpen} onOpenChange={setReconcileOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reconcile payment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Payment reference</Label><Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} data-testid="input-payment-reference" /></div>
            <div><Label>Payment date</Label><Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} data-testid="input-payment-date" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReconcileOpen(false)}>Cancel</Button>
            <Button onClick={() => { patch.mutate({ status: "reconciled", paymentReference, paymentDate }); setReconcileOpen(false); }} disabled={!paymentReference.trim() || !paymentDate} data-testid="button-confirm-reconcile">Reconcile</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvoiceSidePanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, isError, error } = useQuery<FullInvoice>({
    queryKey: [`/api/admin/invoices/${id}`],
    queryFn: async () => (await apiRequest("GET", `/api/admin/invoices/${id}`)).json(),
  });
  if (isLoading) return <Card className="sticky top-4"><CardContent className="p-4"><Skeleton className="h-72 w-full" /></CardContent></Card>;
  if (isError || !data) {
    const msg = error instanceof Error ? error.message : "Invoice not found";
    const isMissing = msg.startsWith("404");
    return (
      <Card className="sticky top-4"><CardContent className="p-6 space-y-3 text-sm" data-testid="side-panel-error">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-base font-light">{isMissing ? "Invoice no longer exists" : "Could not load invoice"}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-panel"><X className="h-4 w-4" /></Button>
        </div>
        <p className="text-muted-foreground text-xs">
          {isMissing
            ? "It looks like this invoice was withdrawn or deleted. Refresh the matrix to update the list."
            : msg}
        </p>
        <Button
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/invoices/stats"] });
            onClose();
          }}
          data-testid="button-refresh-matrix"
        >
          Refresh matrix
        </Button>
      </CardContent></Card>
    );
  }
  return (
    <Card className="sticky top-4"><CardContent className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono" data-testid="text-side-invoice-number">{data.invoiceNumber}</p>
          <h3 className="font-serif text-base font-light" data-testid="text-side-name">{data.fullName}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATUS_BADGE[data.status]}>{data.status}</Badge>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/admin/invoices/${data.id}/pdf`, "_blank")} data-testid="button-side-download-pdf"><Download className="h-4 w-4 mr-1" /> PDF</Button>
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-panel"><X className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {data.rateType === "day_shift" ? (
          <div><div className="text-muted-foreground">Days of service</div><div className="font-medium" data-testid="text-side-days">{data.timesheetEntries.length}</div></div>
        ) : (
          <div><div className="text-muted-foreground">Hours</div><div className="font-medium">{hoursLabel(data.totalHours)}</div></div>
        )}
        <div><div className="text-muted-foreground">Total</div><div className="font-medium">{gbp(data.totalAmount + data.additionalCostsTotal)}</div></div>
        <div><div className="text-muted-foreground">{data.rateType === "day_shift" ? "Day/shift rate" : "Hourly rate"}</div><div>{gbp(data.hourlyRate)}</div></div>
        <div><div className="text-muted-foreground">Costs</div><div>{gbp(data.additionalCostsTotal)}</div></div>
      </div>
      <div className="text-xs text-muted-foreground">
        <div>{data.email} · {data.phoneNumber}</div>
        <div>{data.bankName} · {data.sortCode} · {data.accountNumber} ({data.accountType})</div>
        {data.utr && <div>UTR: {data.utr}</div>}
        {data.ltdCompany && <div>Ltd: {data.ltdCompany}</div>}
      </div>
      {data.attachmentUrl && <a href={data.attachmentUrl} target="_blank" rel="noreferrer" className="text-xs underline text-primary" data-testid="link-side-attachment">{data.attachmentFilename || "Attachment"}</a>}
      <div className="text-xs">
        <div className="font-medium mb-1">{data.rateType === "day_shift" ? "Days of service" : "Timesheet entries"} ({data.timesheetEntries.length})</div>
        <div className="border rounded divide-y max-h-40 overflow-y-auto">
          {data.timesheetEntries.map((e) => (
            <div key={e.id} className="p-1.5 grid grid-cols-3 gap-2"><span>{e.date}</span><span>{data.rateType === "day_shift" ? `${e.patientInitials} · ${e.location}${e.dayType === "deployment" ? " · Deployment 50%" : ""}` : `${e.startTime}–${e.endTime}`}</span><span className="text-right">{gbp(e.amountPence)}</span></div>
          ))}
        </div>
      </div>
      {data.rejectedReason && <div className="text-xs p-2 rounded bg-rose-50 dark:bg-rose-950/20 text-rose-900 dark:text-rose-200">Rejected: {data.rejectedReason}</div>}
      {data.paymentReference && <div className="text-xs text-muted-foreground">Reconciled — {data.paymentReference} · {data.paymentDate}</div>}
      <StatusActions inv={data} onClose={onClose} />
    </CardContent></Card>
  );
}

export default function InvoicesReportPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [stage, setStage] = useState<StageFilter>("completed");
  const [activeId, setActiveId] = useState<string | null>(null);

  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (statusFilter) sp.set("status", statusFilter);
    if (search.trim()) sp.set("search", search.trim());
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    sp.set("stage", stage);
    return sp.toString();
  }, [statusFilter, search, from, to, stage]);

  const { data, isLoading } = useQuery<{ invoices: InvoiceRow[]; nurses: NurseRow[] }>({
    queryKey: [`/api/admin/invoices`, params],
    queryFn: async () => (await apiRequest("GET", `/api/admin/invoices?${params}`)).json(),
    // Always refetch when this page is mounted so admins don't see stale
    // ghost rows for invoices that have been withdrawn or deleted in
    // another tab/session (the global default is staleTime: Infinity).
    refetchOnMount: "always",
  });
  // Stats use the same active filter set as the matrix list so the totals
  // strip stays in sync with the rows the admin is actually looking at.
  const { data: stats } = useQuery<{ byStatus: Record<Status, { count: number; totalPence: number }> }>({
    queryKey: [`/api/admin/invoices/stats`, params],
    queryFn: async () => (await apiRequest("GET", `/api/admin/invoices/stats?${params}`)).json(),
    refetchOnMount: "always",
  });

  const nurseById = useMemo(() => new Map((data?.nurses || []).map((n) => [n.id, n])), [data]);

  return (
    <AppLayout>
      <div className="px-6 py-6 space-y-5 animate-fade-in-up">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Finance</p>
            <h1 className="font-serif text-3xl font-light tracking-tight" data-testid="heading-invoices">Invoices</h1>
            <p className="text-sm text-muted-foreground mt-1">Approve, mark paid, and reconcile nurse-submitted invoices.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/admin/invoices/export.csv?${params}`, "_blank")} data-testid="button-export-csv"><Download className="h-4 w-4 mr-1.5" /> CSV</Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {STATUSES.map((s) => (
            <Card key={s}><CardContent className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s}</div>
              <div className="font-serif text-2xl font-light" data-testid={`stat-count-${s}`}>{stats?.byStatus?.[s]?.count ?? 0}</div>
              <div className="text-xs text-muted-foreground">{gbp(stats?.byStatus?.[s]?.totalPence ?? 0)}</div>
            </CardContent></Card>
          ))}
        </div>

        <Card><CardContent className="p-3 flex flex-wrap items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="h-9 rounded-md border bg-background px-2 text-sm" data-testid="select-status-filter">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={stage} onChange={(e) => setStage(e.target.value as StageFilter)} className="h-9 rounded-md border bg-background px-2 text-sm" data-testid="select-stage-filter">
            <option value="completed">Nurse (completed)</option>
            <option value="all">All stages</option>
          </select>
          <Input placeholder="Search nurses…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-56" data-testid="input-search" />
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" data-testid="input-from" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" data-testid="input-to" />
        </CardContent></Card>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-5">
          <Card className="overflow-hidden"><CardContent className="p-0 overflow-x-auto">
            {isLoading && <Skeleton className="h-96 w-full" />}
            {data && (
              <table className="w-full text-sm" data-testid="table-invoices">
                <thead className="border-b bg-card">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Number</th>
                    <th className="px-3 py-2">Submitted</th>
                    <th className="px-3 py-2">Nurse</th>
                    <th className="px-3 py-2">Patients</th>
                    <th className="px-3 py-2">Address</th>
                    <th className="px-3 py-2">Hours / Days</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No invoices match these filters.</td></tr>}
                  {data.invoices.map((inv) => {
                    const n = nurseById.get(inv.nurseId);
                    const patients = inv.patientInitials ?? [];
                    const locations = inv.locations ?? [];
                    return (
                      <tr key={inv.id} onClick={() => setActiveId(inv.id)} className={`border-b hover:bg-muted/30 cursor-pointer ${activeId === inv.id ? "bg-muted/40" : ""}`} data-testid={`row-${inv.id}`}>
                        <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]" data-testid={`cell-invoice-number-${inv.id}`}>{inv.invoiceNumber}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{new Date(inv.submittedAt).toLocaleDateString("en-GB")}</td>
                        <td className="px-3 py-2"><div className="font-medium">{n?.fullName || inv.fullName}</div><div className="text-[10px] text-muted-foreground">{n?.email}</div></td>
                        <td className="px-3 py-2 text-[11px]" data-testid={`cell-patients-${inv.id}`}>{patients.length ? patients.join(", ") : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2 text-[11px] max-w-[220px] truncate" title={locations.join(" · ")} data-testid={`cell-locations-${inv.id}`}>{locations.length ? locations.join(" · ") : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2">{inv.rateType === "day_shift" ? `${inv.entryCount ?? 0} ${(inv.entryCount ?? 0) === 1 ? "day" : "days"}` : hoursLabel(inv.totalHours)}</td>
                        <td className="px-3 py-2">{gbp(inv.totalAmount + inv.additionalCostsTotal)}</td>
                        <td className="px-3 py-2"><Badge className={STATUS_BADGE[inv.status]}>{inv.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent></Card>
          <div>
            {activeId ? <InvoiceSidePanel id={activeId} onClose={() => setActiveId(null)} /> : <Card><CardContent className="p-6 text-sm text-muted-foreground text-center">Click any invoice row to open the editor.</CardContent></Card>}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
