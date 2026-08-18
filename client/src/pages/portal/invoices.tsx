import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  PortalShell,
  buildPortalGroups,
  type PortalSidebarGroup,
  type PortalGateInfo,
  type JourneyData,
} from "@/components/layout/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, FileText, Upload, ArrowLeft, Download } from "lucide-react";

type Status = "submitted" | "approved" | "paid" | "reconciled" | "rejected";

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  fullName: string;
  status: Status;
  rateType?: string; // "hourly" | "day_shift" (absent on old rows = hourly)
  totalAmount: number; // pence
  totalHours: number; // minutes (0 for day/shift invoices)
  entryCount?: number; // days of service for day/shift invoices
  additionalCostsTotal: number;
  submittedAt: string;
  paymentReference?: string | null;
  paymentDate?: string | null;
  rejectedReason?: string | null;
  attachmentUrl?: string | null;
  attachmentFilename?: string | null;
}

interface FullInvoice extends InvoiceRow {
  ltdCompany: string | null; utr: string | null;
  address: string; email: string; phoneNumber: string;
  accountType: string; accountName: string; bankName: string; sortCode: string; accountNumber: string;
  rateType: string; hourlyRate: number; paymentNotes: string | null;
  timesheetEntries: { id: string; date: string; startTime: string | null; endTime: string | null; patientInitials: string; location: string; dayType?: string | null; hoursMinutes: number; amountPence: number }[];
  additionalCosts: { id: string; description: string; amountPence: number; receiptImageUrl: string | null }[];
}

interface PortalShellData {
  nurse: { id: string; fullName: string; email: string; phone?: string | null; address?: string | null; currentStage: string };
  journey: JourneyData;
  gate?: PortalGateInfo | null;
}

const STATUS_BADGE: Record<Status, string> = {
  submitted: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  approved: "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200",
  paid: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
  reconciled: "bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200",
  rejected: "bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200",
};

function gbp(pence: number): string { return `£${(pence / 100).toFixed(2)}`; }
function hoursLabel(mins: number): string { return `${(mins / 60).toFixed(2)} h`; }

function parseHHMM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

interface DraftEntry { date: string; startTime: string; endTime: string; patientInitials: string; location: string; dayType?: "service" | "deployment" }
interface DraftCost { description: string; amountGbp: string; receiptImageUrl?: string | null; receiptUploading?: boolean }

interface BillingProfile {
  personalDetails?: { fullName?: string; ltdCompany?: string | null; utr?: string | null; address?: string; email?: string; phoneNumber?: string };
  bankDetails?: { accountType?: "personal" | "business"; accountName?: string; bankName?: string; sortCode?: string; accountNumber?: string };
  rateType?: "hourly" | "day_shift";
  hourlyRatePence?: number;
  paymentNotes?: string | null;
  updatedAt?: string;
}

function NewInvoiceForm({ onCancel, onSubmitted, prefillNurse, lastInvoice, billingProfile }: {
  onCancel: () => void;
  onSubmitted: () => void;
  prefillNurse: PortalShellData["nurse"];
  lastInvoice?: FullInvoice | null;
  billingProfile?: BillingProfile | null;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  // Prefill priority: most recent invoice → stored billing profile →
  // nurse account defaults. The stored profile means the nurse never has
  // to retype bank / personal details, even on their very first invoice
  // after an admin has imported them, or after deleting old invoices.
  const bp = billingProfile ?? null;
  const [personal, setPersonal] = useState({
    fullName: lastInvoice?.fullName ?? bp?.personalDetails?.fullName ?? prefillNurse.fullName,
    ltdCompany: lastInvoice?.ltdCompany ?? bp?.personalDetails?.ltdCompany ?? "",
    utr: lastInvoice?.utr ?? bp?.personalDetails?.utr ?? "",
    address: lastInvoice?.address ?? bp?.personalDetails?.address ?? prefillNurse.address ?? "",
    email: lastInvoice?.email ?? bp?.personalDetails?.email ?? prefillNurse.email,
    phoneNumber: lastInvoice?.phoneNumber ?? bp?.personalDetails?.phoneNumber ?? prefillNurse.phone ?? "",
  });
  const [bank, setBank] = useState({
    accountType: (lastInvoice?.accountType as "personal" | "business") ?? bp?.bankDetails?.accountType ?? "personal",
    accountName: lastInvoice?.accountName ?? bp?.bankDetails?.accountName ?? "",
    bankName: lastInvoice?.bankName ?? bp?.bankDetails?.bankName ?? "",
    sortCode: lastInvoice?.sortCode ?? bp?.bankDetails?.sortCode ?? "",
    accountNumber: lastInvoice?.accountNumber ?? bp?.bankDetails?.accountNumber ?? "",
  });
  const initialRateType = (lastInvoice?.rateType as "hourly" | "day_shift" | undefined) ?? bp?.rateType ?? "hourly";
  const initialRatePence = lastInvoice?.hourlyRate ?? bp?.hourlyRatePence ?? null;
  const [rateType, setRateType] = useState<"hourly" | "day_shift">(initialRateType);
  const [hourlyRateGbp, setHourlyRateGbp] = useState<string>(initialRatePence != null ? (initialRatePence / 100).toFixed(2) : "");
  const [entries, setEntries] = useState<DraftEntry[]>([{ date: "", startTime: "", endTime: "", patientInitials: "", location: "" }]);
  const [costs, setCosts] = useState<DraftCost[]>([]);
  const [paymentNotes, setPaymentNotes] = useState("");

  const totals = useMemo(() => {
    const ratePence = Math.round(parseFloat(hourlyRateGbp || "0") * 100) || 0;
    let mins = 0;
    let amount = 0;
    let days = 0;
    let deploymentDays = 0;
    for (const e of entries) {
      if (rateType === "day_shift") {
        // Whole days: no times, each dated entry is charged the flat rate.
        // Deployment/travel days are paid at 50% of the day rate.
        if (!e.date) continue;
        days += 1;
        if (e.dayType === "deployment") {
          deploymentDays += 1;
          amount += Math.round(ratePence / 2);
        } else {
          amount += ratePence;
        }
        continue;
      }
      if (!e.startTime || !e.endTime) continue;
      let m = parseHHMM(e.endTime) - parseHHMM(e.startTime);
      if (m < 0) m += 24 * 60;
      mins += m;
      amount += Math.round((m / 60) * ratePence);
    }
    const addl = costs.reduce((s, c) => s + Math.round(parseFloat(c.amountGbp || "0") * 100), 0);
    return { mins, days, deploymentDays, amount, addl, grandTotal: amount + addl, ratePence };
  }, [entries, costs, hourlyRateGbp, rateType]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const ratePence = totals.ratePence;
      const body = {
        personalDetails: {
          fullName: personal.fullName,
          ltdCompany: personal.ltdCompany || null,
          utr: personal.utr || null,
          address: personal.address,
          email: personal.email,
          phoneNumber: personal.phoneNumber,
        },
        bankDetails: bank,
        timesheetEntries: rateType === "day_shift"
          ? entries.filter((e) => e.date).map((e) => ({ date: e.date, patientInitials: e.patientInitials, location: e.location, dayType: e.dayType ?? "service" }))
          : entries.filter((e) => e.date && e.startTime && e.endTime).map(({ dayType: _dayType, ...e }) => e),
        rateType,
        hourlyRatePence: ratePence,
        additionalCosts: costs
          .filter((c) => c.description && c.amountGbp)
          .map((c) => ({ description: c.description, amountPence: Math.round(parseFloat(c.amountGbp) * 100), receiptImageUrl: c.receiptImageUrl || null })),
        paymentNotes: paymentNotes || null,
      };
      const res = await apiRequest("POST", `/api/portal/me/invoices`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice submitted" });
      queryClient.invalidateQueries({ queryKey: [`/api/portal/me/invoices`] });
      onSubmitted();
    },
    onError: (e: Error) => toast({ title: "Submission failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="animate-fade-in-up">
      <CardContent className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-new-invoice"><ArrowLeft className="h-4 w-4 mr-1" /> Back to invoices</Button>
          <div className="text-xs text-muted-foreground">Step {step} of 5</div>
        </div>
        <h2 className="font-serif text-2xl font-light tracking-tight">New invoice</h2>

        {step === 1 && (
          <div className="space-y-3" data-testid="step-personal">
            <h3 className="font-medium text-sm">Your details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Full name</Label><Input value={personal.fullName} onChange={(e) => setPersonal({ ...personal, fullName: e.target.value })} data-testid="input-full-name" /></div>
              <div><Label>Email</Label><Input value={personal.email} onChange={(e) => setPersonal({ ...personal, email: e.target.value })} data-testid="input-email" /></div>
              <div><Label>Phone</Label><Input value={personal.phoneNumber} onChange={(e) => setPersonal({ ...personal, phoneNumber: e.target.value })} data-testid="input-phone" /></div>
              <div><Label>Ltd company (optional)</Label><Input value={personal.ltdCompany} onChange={(e) => setPersonal({ ...personal, ltdCompany: e.target.value })} data-testid="input-ltd" /></div>
              <div><Label>UTR (optional)</Label><Input value={personal.utr} onChange={(e) => setPersonal({ ...personal, utr: e.target.value })} data-testid="input-utr" /></div>
              <div className="sm:col-span-2"><Label>Address</Label><Textarea rows={2} value={personal.address} onChange={(e) => setPersonal({ ...personal, address: e.target.value })} data-testid="input-address" /></div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3" data-testid="step-bank">
            <h3 className="font-medium text-sm">Bank details</h3>
            <div className="flex gap-2 text-xs">
              {(["personal", "business"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setBank({ ...bank, accountType: t })} className={`px-3 py-1 rounded-full border ${bank.accountType === t ? "bg-primary text-primary-foreground border-transparent" : "bg-card"}`} data-testid={`button-account-${t}`}>{t}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Account name</Label><Input value={bank.accountName} onChange={(e) => setBank({ ...bank, accountName: e.target.value })} data-testid="input-account-name" /></div>
              <div><Label>Bank name</Label><Input value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} data-testid="input-bank-name" /></div>
              <div><Label>Sort code</Label><Input value={bank.sortCode} onChange={(e) => setBank({ ...bank, sortCode: e.target.value })} data-testid="input-sort-code" /></div>
              <div><Label>Account number</Label><Input value={bank.accountNumber} onChange={(e) => setBank({ ...bank, accountNumber: e.target.value })} data-testid="input-account-number" /></div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3" data-testid="step-timesheets">
            <div className="flex gap-2 text-xs">
              {(["hourly", "day_shift"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setRateType(t)} className={`px-3 py-1 rounded-full border ${rateType === t ? "bg-primary text-primary-foreground border-transparent" : "bg-card"}`} data-testid={`button-rate-type-${t}`}>
                  {t === "hourly" ? "Hourly rate" : "Day/Shift rate"}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1"><Label>{rateType === "day_shift" ? "Day/shift rate (£)" : "Hourly rate (£)"}</Label><Input type="number" step="0.01" value={hourlyRateGbp} onChange={(e) => setHourlyRateGbp(e.target.value)} data-testid="input-hourly-rate" /></div>
              <div className="text-sm text-muted-foreground pb-2" data-testid="text-running-total">Total: <span className="font-medium text-foreground">{rateType === "day_shift" ? `${totals.days} ${totals.days === 1 ? "day" : "days"}` : hoursLabel(totals.mins)}</span> · <span className="font-medium text-foreground">{gbp(totals.amount)}</span></div>
            </div>
            {rateType === "day_shift" && (
              <p className="text-xs text-muted-foreground">Each entry is one day of service charged at the day/shift rate — no start/end times needed. Tick deployment/travel days to bill them at 50% of the day rate.</p>
            )}
            <div className="space-y-2">
              {entries.map((e, idx) => (
                <Card key={idx}><CardContent className={`p-3 grid grid-cols-2 gap-2 items-end ${rateType === "day_shift" ? "sm:grid-cols-5" : "sm:grid-cols-6"}`}>
                  <div className="col-span-2 sm:col-span-1"><Label className="text-[10px]">Date</Label><Input type="date" value={e.date} onChange={(ev) => { const c = [...entries]; c[idx] = { ...c[idx], date: ev.target.value }; setEntries(c); }} data-testid={`input-date-${idx}`} /></div>
                  {rateType !== "day_shift" && (
                    <>
                      <div><Label className="text-[10px]">Start</Label><Input type="time" value={e.startTime} onChange={(ev) => { const c = [...entries]; c[idx] = { ...c[idx], startTime: ev.target.value }; setEntries(c); }} data-testid={`input-start-${idx}`} /></div>
                      <div><Label className="text-[10px]">End</Label><Input type="time" value={e.endTime} onChange={(ev) => { const c = [...entries]; c[idx] = { ...c[idx], endTime: ev.target.value }; setEntries(c); }} data-testid={`input-end-${idx}`} /></div>
                    </>
                  )}
                  <div><Label className="text-[10px]">Patient initials</Label><Input value={e.patientInitials} onChange={(ev) => { const c = [...entries]; c[idx] = { ...c[idx], patientInitials: ev.target.value }; setEntries(c); }} data-testid={`input-initials-${idx}`} /></div>
                  <div><Label className="text-[10px]">Location</Label><Input value={e.location} onChange={(ev) => { const c = [...entries]; c[idx] = { ...c[idx], location: ev.target.value }; setEntries(c); }} data-testid={`input-location-${idx}`} /></div>
                  {rateType === "day_shift" && (
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none pb-2.5">
                      <input type="checkbox" className="accent-primary" checked={e.dayType === "deployment"} onChange={(ev) => { const c = [...entries]; c[idx] = { ...c[idx], dayType: ev.target.checked ? "deployment" : "service" }; setEntries(c); }} data-testid={`checkbox-deployment-${idx}`} />
                      <span>Deployment/travel <span className="text-muted-foreground">(50%)</span></span>
                    </label>
                  )}
                  <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => setEntries(entries.filter((_, i) => i !== idx))} disabled={entries.length === 1} data-testid={`button-remove-entry-${idx}`}><Trash2 className="h-4 w-4" /></Button></div>
                </CardContent></Card>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setEntries([...entries, { date: "", startTime: "", endTime: "", patientInitials: "", location: "" }])} data-testid="button-add-entry"><Plus className="h-4 w-4 mr-1" /> {rateType === "day_shift" ? "Add day" : "Add timesheet entry"}</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3" data-testid="step-costs">
            <h3 className="font-medium text-sm">Additional costs (optional)</h3>
            {costs.map((c, idx) => (
              <Card key={idx}><CardContent className="p-3 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                  <div className="sm:col-span-2"><Label className="text-[10px]">Description</Label><Input value={c.description} onChange={(ev) => { const cp = [...costs]; cp[idx] = { ...cp[idx], description: ev.target.value }; setCosts(cp); }} data-testid={`input-cost-desc-${idx}`} /></div>
                  <div><Label className="text-[10px]">Amount (£)</Label><Input type="number" step="0.01" value={c.amountGbp} onChange={(ev) => { const cp = [...costs]; cp[idx] = { ...cp[idx], amountGbp: ev.target.value }; setCosts(cp); }} data-testid={`input-cost-amount-${idx}`} /></div>
                  <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={() => setCosts(costs.filter((_, i) => i !== idx))} data-testid={`button-remove-cost-${idx}`}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {c.receiptImageUrl ? (
                    <a href={c.receiptImageUrl} target="_blank" rel="noreferrer" className="underline text-primary inline-flex items-center gap-1" data-testid={`link-cost-receipt-${idx}`}><FileText className="h-3.5 w-3.5" /> Receipt attached</a>
                  ) : (
                    <label className={`cursor-pointer inline-flex items-center gap-1 px-2 py-1 rounded border hover:bg-muted ${c.receiptUploading ? "opacity-60 pointer-events-none" : ""}`} data-testid={`label-cost-receipt-${idx}`}>
                      {c.receiptUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      <span>{c.receiptUploading ? "Uploading…" : "Attach receipt image (optional)"}</span>
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (ev) => {
                        const f = ev.target.files?.[0]; if (!f) return;
                        const cp = [...costs]; cp[idx] = { ...cp[idx], receiptUploading: true }; setCosts(cp);
                        try {
                          const fd = new FormData(); fd.append("file", f);
                          const res = await fetch(`/api/portal/me/invoices/cost-receipt`, { method: "POST", body: fd, credentials: "include" });
                          if (!res.ok) throw new Error((await res.json()).message || "Upload failed");
                          const body = await res.json();
                          const cp2 = [...costs]; cp2[idx] = { ...cp2[idx], receiptImageUrl: body.url, receiptUploading: false }; setCosts(cp2);
                        } catch (err) {
                          const cp2 = [...costs]; cp2[idx] = { ...cp2[idx], receiptUploading: false }; setCosts(cp2);
                          toast({ title: "Upload failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
                        }
                      }} data-testid={`input-cost-receipt-${idx}`} />
                    </label>
                  )}
                </div>
              </CardContent></Card>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setCosts([...costs, { description: "", amountGbp: "" }])} data-testid="button-add-cost"><Plus className="h-4 w-4 mr-1" /> Add cost</Button>
            <div className="pt-3"><Label>Payment notes (optional)</Label><Textarea rows={2} value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} data-testid="input-notes" /></div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3" data-testid="step-review">
            <h3 className="font-medium text-sm">Review & submit</h3>
            <Card><CardContent className="p-4 text-sm space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">{rateType === "day_shift" ? "Day/shift rate" : "Hourly rate"}</span><span>{gbp(totals.ratePence)}</span></div>
              {rateType === "day_shift" ? (
                <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Days of service</span><span data-testid="text-review-days">{totals.days}</span></div>
                  {totals.deploymentDays > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">incl. deployment/travel @ 50%</span><span data-testid="text-review-deployment-days">{totals.deploymentDays}</span></div>
                  )}
                </>
              ) : (
                <div className="flex justify-between"><span className="text-muted-foreground">Total hours</span><span>{hoursLabel(totals.mins)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Timesheet total</span><span>{gbp(totals.amount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Additional costs</span><span>{gbp(totals.addl)}</span></div>
              <div className="flex justify-between font-medium pt-2 border-t"><span>Grand total</span><span data-testid="text-grand-total">{gbp(totals.grandTotal)}</span></div>
            </CardContent></Card>
          </div>
        )}

        <div className="flex justify-between pt-3 border-t">
          <Button variant="outline" disabled={step === 1} onClick={() => setStep(Math.max(1, step - 1))} data-testid="button-prev-step">Previous</Button>
          {step < 5 ? (
            <Button onClick={() => setStep(step + 1)} data-testid="button-next-step">Next</Button>
          ) : (
            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || totals.amount === 0} data-testid="button-submit-invoice">
              {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Submit invoice
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InvoiceDetailView({ id, onBack }: { id: string; onBack: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<FullInvoice>({
    queryKey: [`/api/portal/me/invoices/${id}`],
    queryFn: async () => (await apiRequest("GET", `/api/portal/me/invoices/${id}`)).json(),
  });

  const withdrawMutation = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", `/api/portal/me/invoices/${id}`)).json(),
    onSuccess: () => { toast({ title: "Invoice withdrawn" }); queryClient.invalidateQueries({ queryKey: [`/api/portal/me/invoices`] }); onBack(); },
    onError: (e: Error) => toast({ title: "Withdraw failed", description: e.message, variant: "destructive" }),
  });

  const uploadAttachment = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/portal/me/invoices/${id}/attachment`, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message || "Upload failed");
      return res.json();
    },
    onSuccess: () => { toast({ title: "Attachment uploaded" }); queryClient.invalidateQueries({ queryKey: [`/api/portal/me/invoices/${id}`] }); },
    onError: (e: Error) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;
  return (
    <Card><CardContent className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-list"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground" data-testid="text-detail-invoice-number">{data.invoiceNumber}</span>
          <Badge className={STATUS_BADGE[data.status]} data-testid="badge-detail-status">{data.status}</Badge>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/portal/me/invoices/${id}/pdf`, "_blank")} data-testid="button-download-pdf">
            <Download className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        {data.rateType === "day_shift" ? (
          <div><div className="text-[10px] uppercase text-muted-foreground">Days</div><div className="font-serif text-xl" data-testid="text-detail-days">{data.timesheetEntries.length}</div></div>
        ) : (
          <div><div className="text-[10px] uppercase text-muted-foreground">Hours</div><div className="font-serif text-xl">{hoursLabel(data.totalHours)}</div></div>
        )}
        <div><div className="text-[10px] uppercase text-muted-foreground">Timesheet</div><div className="font-serif text-xl">{gbp(data.totalAmount)}</div></div>
        <div><div className="text-[10px] uppercase text-muted-foreground">Costs</div><div className="font-serif text-xl">{gbp(data.additionalCostsTotal)}</div></div>
        <div><div className="text-[10px] uppercase text-muted-foreground">Total</div><div className="font-serif text-xl">{gbp(data.totalAmount + data.additionalCostsTotal)}</div></div>
      </div>
      {data.rejectedReason && (
        <div className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/20 text-sm">
          <div className="font-medium text-rose-900 dark:text-rose-200">Rejected</div>
          <div className="text-rose-800 dark:text-rose-300">{data.rejectedReason}</div>
        </div>
      )}
      {data.paymentReference && (
        <div className="text-sm text-muted-foreground">Reconciled — ref <span className="font-mono">{data.paymentReference}</span> · {data.paymentDate}</div>
      )}
      <div>
        <h4 className="text-sm font-medium mb-2">{data.rateType === "day_shift" ? "Days of service" : "Timesheet entries"}</h4>
        <div className="rounded border divide-y text-sm">
          {data.timesheetEntries.map((e) => (
            data.rateType === "day_shift" ? (
              <div key={e.id} className="p-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>{e.date}{e.dayType === "deployment" && <span className="ml-1 text-[10px] uppercase tracking-wide text-muted-foreground">· Deployment 50%</span>}</div>
                <div>{e.patientInitials}</div><div>{e.location}</div>
                <div className="text-right">{gbp(e.amountPence)}</div>
              </div>
            ) : (
              <div key={e.id} className="p-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div>{e.date}</div><div>{e.startTime}–{e.endTime}</div>
                <div>{e.patientInitials}</div><div>{e.location}</div>
                <div className="text-right">{hoursLabel(e.hoursMinutes)} · {gbp(e.amountPence)}</div>
              </div>
            )
          ))}
        </div>
      </div>
      {data.additionalCosts.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Additional costs</h4>
          <div className="rounded border divide-y text-sm">
            {data.additionalCosts.map((c) => (
              <div key={c.id} className="p-2 flex justify-between"><div>{c.description}</div><div>{gbp(c.amountPence)}</div></div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 pt-3 border-t">
        {data.attachmentUrl ? (
          <a href={data.attachmentUrl} target="_blank" rel="noreferrer" className="text-sm underline text-primary" data-testid="link-attachment"><FileText className="h-4 w-4 inline mr-1" />{data.attachmentFilename}</a>
        ) : (
          <label className="text-sm cursor-pointer inline-flex items-center gap-1 px-3 py-1 rounded border hover:bg-muted" data-testid="label-upload-attachment">
            <Upload className="h-4 w-4" /> Attach receipt or signed timesheet
            <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAttachment.mutate(f); }} data-testid="input-attachment-file" />
          </label>
        )}
        {data.status === "submitted" && (
          <Button variant="outline" size="sm" onClick={() => withdrawMutation.mutate()} disabled={withdrawMutation.isPending} className="ml-auto" data-testid="button-withdraw">Withdraw</Button>
        )}
      </div>
    </CardContent></Card>
  );
}

export default function PortalInvoicesPage() {
  const [, navigate] = useLocation();
  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: portal } = useQuery<PortalShellData>({ queryKey: [`/api/portal/me`], queryFn: async () => (await apiRequest("GET", "/api/portal/me")).json() });
  const { data, isLoading, error } = useQuery<{ invoices: InvoiceRow[]; lastInvoice: FullInvoice | null; billingProfile: BillingProfile | null }>({
    queryKey: [`/api/portal/me/invoices`],
    queryFn: async () => (await apiRequest("GET", "/api/portal/me/invoices")).json(),
  });

  // Server returns the most recent invoice as a fully-hydrated FullInvoice
  // so personal/bank/rate prefill is always reliable. The stored
  // billingProfile is used as a fallback when there's no prior invoice.
  const lastInvoice: FullInvoice | null = data?.lastInvoice ?? null;
  const billingProfile: BillingProfile | null = data?.billingProfile ?? null;

  // Mirror the Availability portal pattern: build the same sidebar groups
  // PortalShell expects, surfacing Finance > Invoices only when this
  // nurse is at the completed stage.
  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal) return [];
    const isCompleted =
      portal.nurse.currentStage === "completed" || portal.gate?.graceAccess === true;
    return buildPortalGroups({
      token: "me",
      serviceAgreementSigned: (portal as any)?.serviceAgreement?.signed,
      selectServiceAgreement: () => navigate(`/portal/service-agreement`),
      agreementsSummary: (portal as any)?.agreements ?? null,
      selectAgreements: () => navigate(`/portal/agreements`),
      journey: portal.journey,
      stepStatuses: {},
      gate: portal.gate ?? null,
      availabilityEnabled: isCompleted,
      invoicesEnabled: isCompleted,
      selectOverview: () => navigate(`/portal`),
      selectOnboardingStep: (k) => navigate(`/portal/page?step=${k}`),
      selectAvailability: () => navigate(`/portal/availability`),
      selectInvoices: () => {},
      selectPolicies: () => navigate(`/portal/policies`),
      selectInduction: () => navigate(`/portal/induction`),
      selectSopComprehension: () => navigate(`/portal/sop-comprehension`),
      selectCompetency: () => navigate(`/portal/page?step=competency`),
      selectCvUpload: () => navigate(`/portal/page?step=cv`),
      selectDeclaration: (k) => navigate(`/portal/declaration/${k}`),
    });
  }, [portal, navigate]);

  const renderBody = () => {
    if (error) {
      return (
        <Card><CardContent className="p-6 text-center">
          <h2 className="font-serif text-2xl font-light mb-2">Invoices unavailable</h2>
          <p className="text-sm text-muted-foreground">Locked — available once you're confirmed as a Nurse.</p>
        </CardContent></Card>
      );
    }
    if (view === "new" && portal) {
      return <NewInvoiceForm prefillNurse={portal.nurse} lastInvoice={lastInvoice} billingProfile={billingProfile} onCancel={() => setView("list")} onSubmitted={() => setView("list")} />;
    }
    if (view === "detail" && activeId) {
      return <InvoiceDetailView id={activeId} onBack={() => setView("list")} />;
    }
    return (
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Finance</p>
            <h1 className="font-serif text-3xl font-light tracking-tight" data-testid="heading-portal-invoices">My Invoices</h1>
            <p className="text-sm text-muted-foreground mt-1">Submit timesheet invoices and track approval & payment.</p>
          </div>
          <Button onClick={() => setView("new")} data-testid="button-new-invoice"><Plus className="h-4 w-4 mr-1" /> New invoice</Button>
        </div>
        {isLoading ? <Skeleton className="h-32 w-full" /> : (
          <Card><CardContent className="p-0">
            {(!data?.invoices || data.invoices.length === 0) ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No invoices submitted yet.</div>
            ) : (
              <div className="divide-y">
                {data.invoices.map((inv) => (
                  <button key={inv.id} onClick={() => { setActiveId(inv.id); setView("detail"); }} className="w-full text-left p-4 hover:bg-muted/30 flex items-center gap-4" data-testid={`row-invoice-${inv.id}`}>
                    <div className="flex-1">
                      <div className="font-medium">{gbp(inv.totalAmount + inv.additionalCostsTotal)} · {inv.rateType === "day_shift" ? `${inv.entryCount ?? 0} ${(inv.entryCount ?? 0) === 1 ? "day" : "days"}` : hoursLabel(inv.totalHours)}</div>
                      <div className="text-[11px] text-muted-foreground"><span className="font-mono" data-testid={`text-invoice-number-${inv.id}`}>{inv.invoiceNumber}</span> · Submitted {new Date(inv.submittedAt).toLocaleDateString("en-GB")}</div>
                    </div>
                    <Badge className={STATUS_BADGE[inv.status]} data-testid={`badge-status-${inv.id}`}>{inv.status}</Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent></Card>
        )}
      </div>
    );
  };

  return (
    <PortalShell
      token="me"
      candidateName={portal?.nurse.fullName || ""}
      groups={groups}
      activeKey="finance:invoices"
    >
      {renderBody()}
    </PortalShell>
  );
}
