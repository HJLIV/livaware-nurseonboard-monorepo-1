import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveAuditActor, actorRoleLabel } from "@/lib/audit-actor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OnboardingAccessPanel } from "@/components/admin/onboarding-access-panel";
import { InductionProgressPanel } from "@/components/admin/induction-progress-panel";
import { SopComprehensionPanel } from "@/components/admin/sop-comprehension-panel";
import { PortalAccessPanel } from "@/components/admin/portal-access-panel";
import { useAuthRole } from "@/lib/use-auth-role";
import { StatusBadge } from "@/components/shared/status-badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ClipboardCheck,
  ShieldCheck,
  Gamepad2,
  CheckCircle2,
  Circle,
  ExternalLink,
  Calendar,
  Mail,
  User,
  ChevronRight,
  Copy,
  Check,
  Link2,
  Loader2,
  FileText,
  Shirt,
  Pencil,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Paperclip, Plus, Trash2 } from "lucide-react";
import { AssignedActionsPanel } from "@/components/admin/assigned-actions-panel";
import { cn } from "@/lib/utils";
import { getStageDisplayName } from "@shared/schema";
import { useAuth } from "@/lib/auth";

interface NurseDetail {
  id: string;
  fullName: string;
  email: string;
  currentStage: string;
  preboardStatus: string;
  onboardStatus: string;
  arcadeStatus: string;
  portalToken?: string;
  createdAt: string;
  updatedAt: string;
  uniformTopSize?: string | null;
  uniformTrouserSize?: string | null;
  uniformTrouserLength?: string | null;
  uniformSizingUpdatedAt?: string | null;
  uniformSizingUpdatedBy?: string | null;
}

interface PreboardResult {
  id: number;
  status: string;
  score?: number;
  aiAnalysis?: string;
  completedAt?: string;
}

interface OnboardStep {
  id: number;
  name: string;
  status: string;
  completedAt?: string;
}

interface ArcadeAssignment {
  id: number;
  skillName: string;
  status: string;
  score?: number;
  attempts: number;
  lastAttemptAt?: string;
}

interface AuditLog {
  id: string;
  module: string;
  action: string;
  detail?: Record<string, unknown> | string;
  agentName?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  nurseName?: string | null;
  nurseEmail?: string | null;
  timestamp: string;
}

const journeyStages = [
  { key: "preboard", label: "Applicant", icon: ClipboardCheck },
  { key: "onboard", label: "Candidate", icon: ShieldCheck },
  { key: "skills_arcade", label: "Skills Arcade", icon: Gamepad2 },
];

function JourneyStepper({ currentStage }: { currentStage: string }) {
  const stageOrder = ["preboard", "onboard", "skills_arcade", "completed"];
  const currentIndex = stageOrder.indexOf(currentStage);

  return (
    <div className="flex items-center gap-2">
      {journeyStages.map((stage, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = stageOrder[index] === currentStage;
        const Icon = stage.icon;

        return (
          <div key={stage.key} className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all",
                isCompleted
                  ? "bg-emerald-500/15 text-emerald-400"
                  : isCurrent
                    ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : isCurrent ? (
                <Icon className="h-4 w-4" />
              ) : (
                <Circle className="h-4 w-4" />
              )}
              {stage.label}
            </div>
            {index < journeyStages.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-8",
                  index < currentIndex ? "bg-emerald-500/40" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface AdminInvoiceRow {
  id: string;
  status: string;
  totalAmount: number;
  totalHours: number;
  additionalCostsTotal: number;
  submittedAt: string;
}

function SubmitOnBehalfForm({ nurseId, nurseName, nurseEmail, onDone }: {
  nurseId: string; nurseName: string; nurseEmail: string; onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [hourlyRate, setHourlyRate] = useState("25.00");
  const [patientInitials, setPatientInitials] = useState("");
  const [location, setLocation] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bankName, setBankName] = useState("");
  const [sortCode, setSortCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [address, setAddress] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      const body = {
        personalDetails: { fullName: nurseName, address, email: nurseEmail, phoneNumber: "" },
        bankDetails: { accountType: "personal", accountName, bankName, sortCode, accountNumber },
        timesheetEntries: [{ date, startTime, endTime, patientInitials, location }],
        hourlyRatePence: Math.round(parseFloat(hourlyRate || "0") * 100),
        additionalCosts: [],
        paymentNotes: "Submitted on behalf by admin",
      };
      const res = await apiRequest("POST", `/api/admin/invoices/by-nurse/${nurseId}`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Invoice submitted on behalf" });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/invoices/by-nurse/${nurseId}`] });
      onDone();
    },
    onError: (e: Error) => toast({ title: "Submission failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card data-testid="card-submit-on-behalf">
      <CardHeader><CardTitle className="text-base">Submit invoice on behalf</CardTitle><CardDescription>For nurses who can't access the portal. Reuses the same submit endpoint as the nurse wizard.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[10px] uppercase text-muted-foreground">Date</label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-onbehalf-date" /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Hourly rate (£)</label><Input type="number" step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} data-testid="input-onbehalf-rate" /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Start</label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} data-testid="input-onbehalf-start" /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">End</label><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} data-testid="input-onbehalf-end" /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Patient initials</label><Input value={patientInitials} onChange={(e) => setPatientInitials(e.target.value)} data-testid="input-onbehalf-initials" /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Location</label><Input value={location} onChange={(e) => setLocation(e.target.value)} data-testid="input-onbehalf-location" /></div>
          <div className="col-span-2"><label className="text-[10px] uppercase text-muted-foreground">Address</label><Input value={address} onChange={(e) => setAddress(e.target.value)} data-testid="input-onbehalf-address" /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Account name</label><Input value={accountName} onChange={(e) => setAccountName(e.target.value)} data-testid="input-onbehalf-account-name" /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Bank name</label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} data-testid="input-onbehalf-bank-name" /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Sort code</label><Input value={sortCode} onChange={(e) => setSortCode(e.target.value)} data-testid="input-onbehalf-sort-code" /></div>
          <div><label className="text-[10px] uppercase text-muted-foreground">Account number</label><Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} data-testid="input-onbehalf-account-number" /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onDone} data-testid="button-onbehalf-cancel">Cancel</Button>
          <Button size="sm" onClick={() => submit.mutate()} disabled={submit.isPending || !date || !startTime || !endTime} data-testid="button-onbehalf-submit">
            {submit.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />} Submit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function NurseInvoicesTab({ nurseId, nurseName, nurseEmail, currentStage }: { nurseId: string; nurseName: string; nurseEmail: string; currentStage: string }) {
  const { data, isLoading } = useQuery<{ invoices: AdminInvoiceRow[]; nurse: { currentStage: string } }>({
    queryKey: [`/api/admin/invoices/by-nurse/${nurseId}`],
    queryFn: async () => (await apiRequest("GET", `/api/admin/invoices/by-nurse/${nurseId}`)).json(),
  });
  const [showSubmit, setShowSubmit] = useState(false);
  if (isLoading || !data) return <Skeleton className="h-32 w-full" />;
  const fmtPence = (p: number) => `£${(p / 100).toFixed(2)}`;
  const fmtMins = (m: number) => `${(m / 60).toFixed(2)} h`;
  const isCompleted = currentStage === "completed";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Link href="/reports/invoices" className="text-xs underline text-primary" data-testid="link-invoices-matrix">Open in invoices matrix →</Link>
        {isCompleted && !showSubmit && (
          <Button size="sm" variant="outline" onClick={() => setShowSubmit(true)} data-testid="button-show-submit-onbehalf">Submit on behalf</Button>
        )}
      </div>
      {showSubmit && isCompleted && (
        <SubmitOnBehalfForm nurseId={nurseId} nurseName={nurseName} nurseEmail={nurseEmail} onDone={() => setShowSubmit(false)} />
      )}
      <Card><CardContent className="p-0">
        {data.invoices.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            {isCompleted ? "No invoices submitted by this nurse." : "Invoices become available once the nurse reaches the Nurse stage."}
          </div>
        ) : (
          <div className="divide-y" data-testid="list-nurse-invoices">
            {data.invoices.map((inv) => (
              <div key={inv.id} className="p-3 flex items-center gap-3 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{fmtPence(inv.totalAmount + inv.additionalCostsTotal)} · {fmtMins(inv.totalHours)}</div>
                  <div className="text-[11px] text-muted-foreground">Submitted {new Date(inv.submittedAt).toLocaleDateString("en-GB")}</div>
                </div>
                <Badge variant="outline" data-testid={`badge-nurse-invoice-${inv.id}`}>{inv.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent></Card>
    </div>
  );
}

const UNIFORM_LENGTH_LABELS: Record<string, string> = { short: "Short", regular: "Regular", long: "Long" };

function UniformSizingCard({ nurse }: { nurse: NurseDetail }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [top, setTop] = useState(nurse.uniformTopSize || "");
  const [trouser, setTrouser] = useState(nurse.uniformTrouserSize || "");
  const [length, setLength] = useState<string>(nurse.uniformTrouserLength || "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/nurses/${nurse.id}/uniform-sizing`, {
        uniformTopSize: top.trim() || null,
        uniformTrouserSize: trouser.trim() || null,
        uniformTrouserLength: length || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/nurses/${nurse.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/nurses/${nurse.id}/audit-log`] });
      setEditing(false);
      toast({ title: "Uniform sizing saved", description: "The office will see the updated sizes next time they pull the list." });
    },
    onError: (e: Error) => {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    },
  });

  const empty = !nurse.uniformTopSize && !nurse.uniformTrouserSize && !nurse.uniformTrouserLength;

  return (
    <Card data-testid="card-uniform-sizing">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Shirt className="h-4 w-4 text-muted-foreground" />
            Uniform Sizing
          </CardTitle>
          {nurse.uniformSizingUpdatedAt && (
            <p className="text-[11px] text-muted-foreground/70 mt-1">
              Updated {new Date(nurse.uniformSizingUpdatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              {nurse.uniformSizingUpdatedBy ? ` · ${nurse.uniformSizingUpdatedBy}` : ""}
            </p>
          )}
        </div>
        {!editing && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setEditing(true)} data-testid="button-edit-uniform-sizing">
            <Pencil className="h-3 w-3" /> Edit
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!editing ? (
          empty ? (
            <p className="text-sm text-muted-foreground italic">Not recorded. Click <strong>Edit</strong> to capture top, trouser & length.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">Top</p>
                <p className="font-medium" data-testid="value-uniform-top">{nurse.uniformTopSize || "Not recorded"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">Trouser</p>
                <p className="font-medium" data-testid="value-uniform-trouser">{nurse.uniformTrouserSize || "Not recorded"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">Length</p>
                <p className="font-medium" data-testid="value-uniform-length">{nurse.uniformTrouserLength ? UNIFORM_LENGTH_LABELS[nurse.uniformTrouserLength] : "Not recorded"}</p>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Top</Label>
                <Input value={top} onChange={(e) => setTop(e.target.value)} placeholder="e.g. M" maxLength={80} data-testid="input-uniform-top" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Trouser</Label>
                <Input value={trouser} onChange={(e) => setTrouser(e.target.value)} placeholder="e.g. M 12" maxLength={80} data-testid="input-uniform-trouser" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Length</Label>
                <Select value={length || "__none"} onValueChange={(v) => setLength(v === "__none" ? "" : v)}>
                  <SelectTrigger data-testid="select-uniform-length"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">—</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="long">Long</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-uniform-sizing">
                {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => {
                setTop(nurse.uniformTopSize || "");
                setTrouser(nurse.uniformTrouserSize || "");
                setLength(nurse.uniformTrouserLength || "");
                setEditing(false);
              }}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewTab({ nurse }: { nurse: NurseDetail }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const advanceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/nurses/${nurse.id}/advance-stage`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/nurses/${nurse.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/nurses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Stage advanced", description: `Moved to ${getStageDisplayName(data.currentStage)} stage.` });
    },
    onError: (error: Error) => {
      toast({ title: "Cannot advance", description: error.message, variant: "destructive" });
    },
  });

  const portalLinkMutation = useMutation({
    mutationFn: async (module: string) => {
      const res = await apiRequest("POST", `/api/nurses/${nurse.id}/portal-link`, { module });
      return res.json();
    },
    onSuccess: (data) => {
      setPortalUrl(data.url);
      toast({ title: "Portal link generated", description: `Link for ${data.module} module created.` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleCopy = async () => {
    if (portalUrl) {
      await navigator.clipboard.writeText(portalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const stageOrder = ["preboard", "onboard", "skills_arcade", "completed"];
  const isAtFinalStage = stageOrder.indexOf(nurse.currentStage) >= stageOrder.length - 1;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <UniformSizingCard nurse={nurse} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{nurse.fullName}</p>
              <p className="text-xs text-muted-foreground">Full Name</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{nurse.email}</p>
              <p className="text-xs text-muted-foreground">Email</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {new Date(nurse.createdAt).toLocaleDateString("en-US", {
                  month: "long", day: "numeric", year: "numeric",
                })}
              </p>
              <p className="text-xs text-muted-foreground">Registered</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stage Progress</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Current Stage</span>
            <StatusBadge status={nurse.currentStage} isStage />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Applicant Stage</span>
            <StatusBadge status={nurse.preboardStatus} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Candidate Stage</span>
            <StatusBadge status={nurse.onboardStatus} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Skills Arcade</span>
            <StatusBadge status={nurse.arcadeStatus} />
          </div>
          <div className="pt-3 border-t space-y-2">
            {!isAtFinalStage && (
              <Button
                variant="default"
                size="sm"
                className="w-full gap-2"
                onClick={() => advanceMutation.mutate()}
                disabled={advanceMutation.isPending}
                tooltip="Moves this nurse forward to the next lifecycle stage."
              >
                {advanceMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Advance to Next Stage
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={() => portalLinkMutation.mutate(nurse.currentStage === "preboard" ? "preboard" : nurse.currentStage === "onboard" ? "onboard" : "hub")}
              disabled={portalLinkMutation.isPending}
              tooltip="Creates a secure portal link for this nurse's current stage that you can share."
            >
              {portalLinkMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Generate Portal Link
            </Button>
          </div>
          {portalUrl && (
            <div className="rounded-lg bg-muted/30 border p-3 space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Portal Link</p>
              <div className="flex items-center gap-2">
                <Input value={portalUrl} readOnly className="text-xs font-mono h-8 bg-card" />
                <Button size="icon" variant="ghost" onClick={handleCopy} className="shrink-0 h-8 w-8" tooltip="Copy this portal link to the clipboard.">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PreboardTab({ nurseId }: { nurseId: string }) {
  const { data: results, isLoading } = useQuery<PreboardResult[]>({
    queryKey: [`/api/nurses/${nurseId}/preboard`],
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <ClipboardCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            No preboard assessments yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {results.map((result) => (
        <Card key={result.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Assessment #{result.id}
              </CardTitle>
              <StatusBadge status={result.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.score !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Score</span>
                <span className="text-sm font-semibold">{result.score}%</span>
              </div>
            )}
            {result.completedAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Completed</span>
                <span className="text-sm">
                  {new Date(result.completedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            )}
            {result.aiAnalysis && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  AI Analysis
                </p>
                <p className="text-sm">{result.aiAnalysis}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OnboardTab({ nurseId, nurse }: { nurseId: string; nurse: NurseDetail }) {
  const { data: steps, isLoading } = useQuery<OnboardStep[]>({
    queryKey: [`/api/nurses/${nurseId}/onboard`],
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <UniformSizingCard nurse={nurse} />
      {!steps || steps.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ShieldCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No onboarding steps assigned yet
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {steps.map((step, index) => (
        <Card key={step.id}>
          <CardContent className="flex items-center gap-4 py-4">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                step.status === "completed"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : step.status === "in_progress"
                    ? "bg-blue-500/15 text-blue-400"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {step.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                index + 1
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{step.name}</p>
              {step.completedAt && (
                <p className="text-xs text-muted-foreground">
                  Completed{" "}
                  {new Date(step.completedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              )}
            </div>
            <StatusBadge status={step.status} />
          </CardContent>
        </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ArcadeTab({ nurseId }: { nurseId: string }) {
  const { data: assignments, isLoading } = useQuery<ArcadeAssignment[]>({
    queryKey: [`/api/nurses/${nurseId}/arcade`],
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!assignments || assignments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Gamepad2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            No skill assignments yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {assignments.map((assignment) => (
        <Card key={assignment.id}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">{assignment.skillName}</p>
              <StatusBadge status={assignment.status} />
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              {assignment.score !== undefined && (
                <span>
                  Score: <span className="font-semibold text-foreground">{assignment.score}%</span>
                </span>
              )}
              <span>
                Attempts: <span className="font-semibold text-foreground">{assignment.attempts}</span>
              </span>
              {assignment.lastAttemptAt && (
                <span>
                  Last attempt:{" "}
                  {new Date(assignment.lastAttemptAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface NursePolicyRow {
  id: string;
  title: string;
  version: string;
  requireAcknowledgement: boolean;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedVersion: string | null;
  needsReacknowledgement: boolean;
  totalActiveSeconds: number | null;
  sessionCount: number | null;
  scrolledToEnd: boolean | null;
  openedPdf: boolean | null;
}

interface NursePoliciesResponse {
  policies: NursePolicyRow[];
  totalRequired: number;
  outstanding: number;
  // Server echoes whether the requesting admin is in the stricter
  // "policy read-behaviour" tier. The client also has this on /api/auth/me;
  // we keep both so the API response is self-describing.
  canViewReadBehaviour?: boolean;
}

function formatReadDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

const NURSE_DETAIL_SKIM_THRESHOLD = 10;

function PoliciesTab({ nurseId, variant = "policies" }: { nurseId: string; variant?: "policies" | "reading" }) {
  const { user } = useAuth();
  // Stricter admin tier — without this, the time-spent / scrolled / pdf
  // columns are hidden so reading-behaviour signals stay with compliance
  // leads only.
  const canViewReadBehaviour = !!user?.canViewPolicyReadBehaviour;
  const isReading = variant === "reading";
  const noun = isReading ? "reading materials" : "policies";
  const { data, isLoading } = useQuery<NursePoliciesResponse>({
    queryKey: [
      isReading
        ? `/api/nurses/${nurseId}/reading-materials-progress`
        : `/api/nurses/${nurseId}/policy-acknowledgements`,
    ],
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  if (!data || data.policies.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No {noun} published yet</p>
        </CardContent>
      </Card>
    );
  }

  const outstandingCount = data.outstanding ?? 0;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="text-sm">
            <span className="font-medium">{data.totalRequired ?? 0}</span>
            <span className="text-muted-foreground"> required {noun}</span>
          </div>
          {outstandingCount > 0 ? (
            <Badge
              variant="outline"
              className="bg-rose-500/10 text-rose-500 border-rose-500/20"
              data-testid="nurse-policies-outstanding-summary"
            >
              {outstandingCount} outstanding
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
              All acknowledged
            </Badge>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="border-b text-left">
            <tr className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
              <th className="px-4 py-3 font-medium">{isReading ? "Reading item" : "Policy"}</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {canViewReadBehaviour && (
                <>
                  <th className="px-4 py-3 font-medium">Time spent</th>
                  <th className="px-4 py-3 font-medium text-center">Sessions</th>
                  <th className="px-4 py-3 font-medium text-center">Scrolled</th>
                  <th className="px-4 py-3 font-medium text-center">PDF</th>
                </>
              )}
              <th className="px-4 py-3 font-medium">Acknowledged</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.policies.map((p) => {
              const tracked = (p.sessionCount ?? 0) > 0 || (p.totalActiveSeconds ?? 0) > 0;
              const skimmed = tracked && (p.totalActiveSeconds ?? 0) < NURSE_DETAIL_SKIM_THRESHOLD;
              const isOutstanding = p.requireAcknowledgement && (!p.acknowledged || p.needsReacknowledgement);
              return (
                <tr
                  key={p.id}
                  data-testid={`nurse-policy-row-${p.id}`}
                  className={cn(isOutstanding && "bg-rose-500/5")}
                >
                  <td className={cn("px-4 py-3", isOutstanding && "border-l-2 border-rose-500/60")}>
                    <div className="font-medium">{p.title}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">v{p.version}</div>
                  </td>
                  <td className="px-4 py-3">
                    {p.acknowledged && !p.needsReacknowledgement ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                        Acknowledged
                      </Badge>
                    ) : p.needsReacknowledgement ? (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                        Needs re-ack
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-rose-500/10 text-rose-500 border-rose-500/20">
                        Outstanding
                      </Badge>
                    )}
                  </td>
                  {canViewReadBehaviour && (
                    <>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">{tracked ? formatReadDuration(p.totalActiveSeconds) : "—"}</span>
                          {skimmed && (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[9px] px-1 py-0">
                              skimmed
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">{tracked ? p.sessionCount : "—"}</td>
                      <td className="px-4 py-3 text-center text-xs">{tracked ? (p.scrolledToEnd ? "Yes" : "No") : "—"}</td>
                      <td className="px-4 py-3 text-center text-xs">{tracked ? (p.openedPdf ? "Yes" : "No") : "—"}</td>
                    </>
                  )}
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {p.acknowledgedAt ? new Date(p.acknowledgedAt).toLocaleString() : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AuditTab({ nurseId }: { nurseId: string }) {
  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: [`/api/nurses/${nurseId}/audit-log`],
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No audit entries yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-center gap-3 rounded-lg border px-4 py-3"
        >
          <Badge variant="secondary" className="text-[11px] shrink-0">
            {log.module}
          </Badge>
          <Badge variant="outline" className="text-[11px] shrink-0">
            {log.action}
          </Badge>
          <span className="flex-1 truncate text-sm text-muted-foreground">
            {typeof log.detail === "object" ? JSON.stringify(log.detail) : log.detail}
          </span>
          {(() => {
            const { actorName, actorRole } = resolveAuditActor(log);
            const roleLabel = actorRoleLabel(actorRole);
            return (
              <span className="text-xs text-muted-foreground shrink-0 flex items-center gap-1.5" title={log.agentName ?? undefined}>
                by <span className="text-foreground/80">{actorName}</span>
                {roleLabel && actorRole !== "system" && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-medium uppercase tracking-wider text-muted-foreground/70">
                    {roleLabel}
                  </Badge>
                )}
              </span>
            );
          })()}
          <time className="text-xs text-muted-foreground shrink-0">
            {new Date(log.timestamp).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
      ))}
    </div>
  );
}

// ─── Supervision & Appraisals (task 162) ──────────────────────────────
interface SupervisionEntry {
  id: string;
  nurseId: string;
  type: "supervision" | "appraisal" | "reflection" | "other";
  title: string | null;
  conversationDate: string;
  notes: string;
  attachmentFilename: string | null;
  attachmentOriginalFilename: string | null;
  attachmentMimeType: string | null;
  attachmentSize: number | null;
  createdBy: string;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
}

const SUPERVISION_TYPE_LABELS: Record<SupervisionEntry["type"], string> = {
  supervision: "Supervision",
  appraisal: "Appraisal",
  reflection: "Reflective conversation",
  other: "Other",
};

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function SupervisionTab({ nurseId }: { nurseId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isSuperAdmin } = useAuthRole();
  const { user } = useAuth();
  // The server's agentName format is "username (role)" for admin
  // sessions and bare "username" otherwise; we mirror that so the
  // FE can decide which rows the current user is allowed to mutate.
  const sessionAgent =
    user?.role && user?.username ? `${user.username} (${user.role})` : user?.username || "";

  const { data: entries, isLoading } = useQuery<SupervisionEntry[]>({
    queryKey: [`/api/admin/nurses/${nurseId}/supervisions`],
    enabled: !!nurseId,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SupervisionEntry | null>(null);
  const [form, setForm] = useState({
    type: "supervision" as SupervisionEntry["type"],
    title: "",
    conversationDate: todayIso(),
    notes: "",
    file: null as File | null,
    removeAttachment: false,
  });
  const [submitting, setSubmitting] = useState(false);

  function openNew() {
    setEditing(null);
    setForm({
      type: "supervision",
      title: "",
      conversationDate: todayIso(),
      notes: "",
      file: null,
      removeAttachment: false,
    });
    setDialogOpen(true);
  }

  function openEdit(entry: SupervisionEntry) {
    setEditing(entry);
    setForm({
      type: entry.type,
      title: entry.title || "",
      conversationDate: entry.conversationDate,
      notes: entry.notes,
      file: null,
      removeAttachment: false,
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.notes.trim()) {
      toast({ title: "Notes are required", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("type", form.type);
      fd.append("conversationDate", form.conversationDate);
      fd.append("notes", form.notes);
      if (form.title.trim()) fd.append("title", form.title.trim());
      if (form.file) fd.append("file", form.file);
      if (editing && form.removeAttachment && !form.file) {
        fd.append("removeAttachment", "true");
      }
      const url = editing
        ? `/api/admin/supervisions/${editing.id}`
        : `/api/admin/nurses/${nurseId}/supervisions`;
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Save failed" }));
        throw new Error(body.message || "Save failed");
      }
      await qc.invalidateQueries({ queryKey: [`/api/admin/nurses/${nurseId}/supervisions`] });
      await qc.invalidateQueries({ queryKey: [`/api/nurses/${nurseId}/audit-log`] });
      toast({ title: editing ? "Entry updated" : "Entry added" });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Could not save", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/admin/supervisions/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Delete failed" }));
        throw new Error(body.message || "Delete failed");
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [`/api/admin/nurses/${nurseId}/supervisions`] });
      await qc.invalidateQueries({ queryKey: [`/api/nurses/${nurseId}/audit-log`] });
      toast({ title: "Entry deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Could not delete", description: err.message, variant: "destructive" });
    },
  });

  function canMutate(entry: SupervisionEntry): boolean {
    if (isSuperAdmin) return true;
    return !!sessionAgent && entry.createdBy === sessionAgent;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
            Internal record
          </p>
          <h2 className="font-serif text-xl font-light tracking-tight">
            Supervision &amp; Appraisals
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Admin-only log of 1:1 supervision calls, appraisals, and reflective conversations. The
            nurse cannot see these entries.
          </p>
        </div>
        <Button onClick={openNew} data-testid="button-add-supervision">
          <Plus className="h-4 w-4 mr-1.5" /> Add entry
        </Button>
      </div>

      {/* Assigned write-ups (task 212) — super-admin assigns reflections /
          witness statements; nurse completions land here for review. */}
      <div className="border-t pt-6">
        <AssignedActionsPanel nurseId={nurseId} />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : !entries || entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">No supervision entries yet.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Add the summary of your last 1:1 to keep a running record.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Card key={entry.id} data-testid={`supervision-entry-${entry.id}`}>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[11px]">
                      {SUPERVISION_TYPE_LABELS[entry.type]}
                    </Badge>
                    <span className="text-sm font-medium">
                      {new Date(entry.conversationDate).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    {entry.title && (
                      <span className="text-sm text-muted-foreground">— {entry.title}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {canMutate(entry) && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(entry)}
                          data-testid={`button-edit-supervision-${entry.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm("Delete this entry? This cannot be undone.")) {
                              deleteEntry.mutate(entry.id);
                            }
                          }}
                          data-testid={`button-delete-supervision-${entry.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap text-foreground/90">{entry.notes}</p>
                {entry.attachmentFilename && (
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <a
                      href={`/api/admin/supervisions/${entry.id}/attachment`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      data-testid={`link-supervision-attachment-${entry.id}`}
                    >
                      <Download className="h-3 w-3" />
                      {entry.attachmentOriginalFilename || entry.attachmentFilename}
                    </a>
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground border-t pt-2">
                  Logged by {entry.createdBy} ·{" "}
                  {new Date(entry.createdAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {entry.updatedBy && entry.updatedAt !== entry.createdAt && (
                    <>
                      {" · "}edited by {entry.updatedBy} on{" "}
                      {new Date(entry.updatedAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit entry" : "Add supervision entry"}</DialogTitle>
            <DialogDescription>
              Internal record — the nurse will not see this.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="supervision-type">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, type: v as SupervisionEntry["type"] }))
                  }
                >
                  <SelectTrigger id="supervision-type" data-testid="select-supervision-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SUPERVISION_TYPE_LABELS).map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supervision-date">Date of conversation</Label>
                <Input
                  id="supervision-date"
                  type="date"
                  required
                  value={form.conversationDate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, conversationDate: e.target.value }))
                  }
                  data-testid="input-supervision-date"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supervision-title">Title / subject (optional)</Label>
              <Input
                id="supervision-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Mid-year appraisal"
                data-testid="input-supervision-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supervision-notes">Notes</Label>
              <Textarea
                id="supervision-notes"
                required
                rows={10}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Paste the call summary or write notes here. Line breaks are preserved."
                data-testid="textarea-supervision-notes"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supervision-file">Attachment (optional)</Label>
              <Input
                id="supervision-file"
                type="file"
                accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                onChange={(e) =>
                  setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))
                }
                data-testid="input-supervision-file"
              />
              {editing?.attachmentFilename && !form.file && (
                <div className="flex items-center justify-between text-xs text-muted-foreground border rounded-md px-2 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <Paperclip className="h-3 w-3" />
                    Current: {editing.attachmentOriginalFilename || editing.attachmentFilename}
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.removeAttachment}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, removeAttachment: e.target.checked }))
                      }
                      data-testid="checkbox-remove-attachment"
                    />
                    Remove
                  </label>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} data-testid="button-save-supervision">
                {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                {editing ? "Save changes" : "Add entry"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function NurseDetail() {
  const [, params] = useRoute("/nurses/:id");
  const nurseId = params?.id || "";
  const { isSuperAdmin } = useAuthRole();

  const { data: nurse, isLoading } = useQuery<NurseDetail>({
    queryKey: [`/api/nurses/${nurseId}`],
    enabled: !!nurseId,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-12 w-full max-w-2xl" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!nurse) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-lg font-medium text-muted-foreground">
            Record not found
          </p>
          <Link href="/nurses">
            <Button variant="ghost" className="mt-2">
              Back to Onboarding
            </Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <Link href="/nurses">
            <Button variant="ghost" size="icon" className="mt-1">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">Profile</p>
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-2xl font-light tracking-tight">
                {nurse.fullName}
              </h1>
              <StatusBadge status={nurse.currentStage} isStage />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{nurse.email}</p>
          </div>
        </div>

        {/* Journey Stepper */}
        <Card>
          <CardContent className="py-4">
            <JourneyStepper currentStage={nurse.currentStage} />
          </CardContent>
        </Card>

        <OnboardingAccessPanel candidateId={nurseId} />
        {isSuperAdmin && <PortalAccessPanel candidateId={nurseId} />}

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="preboard">Applicant</TabsTrigger>
            <TabsTrigger value="onboard">Candidate</TabsTrigger>
            <TabsTrigger value="arcade">Skills Arcade</TabsTrigger>
            <TabsTrigger value="policies">Policies</TabsTrigger>
            <TabsTrigger value="induction">Induction</TabsTrigger>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="supervision">Supervision &amp; Appraisals</TabsTrigger>
            <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab nurse={nurse} />
          </TabsContent>

          <TabsContent value="preboard" className="mt-6">
            <PreboardTab nurseId={nurseId} />
          </TabsContent>

          <TabsContent value="onboard" className="mt-6">
            <OnboardTab nurseId={nurseId} nurse={nurse} />
          </TabsContent>

          <TabsContent value="arcade" className="mt-6">
            <ArcadeTab nurseId={nurseId} />
          </TabsContent>

          <TabsContent value="policies" className="mt-6 space-y-4">
            <PoliciesTab nurseId={nurseId} />
            <div>
              <h3 className="text-sm font-medium mb-2 text-muted-foreground">Reading materials</h3>
              <PoliciesTab nurseId={nurseId} variant="reading" />
            </div>
          </TabsContent>

          <TabsContent value="induction" className="mt-6 space-y-4">
            <InductionProgressPanel candidateId={nurseId} />
            <SopComprehensionPanel candidateId={nurseId} />
          </TabsContent>

          <TabsContent value="invoices" className="mt-6">
            <NurseInvoicesTab nurseId={nurseId} nurseName={nurse.fullName} nurseEmail={nurse.email} currentStage={nurse.currentStage} />
          </TabsContent>

          <TabsContent value="supervision" className="mt-6">
            <SupervisionTab nurseId={nurseId} />
          </TabsContent>

          <TabsContent value="audit" className="mt-6">
            <AuditTab nurseId={nurseId} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
