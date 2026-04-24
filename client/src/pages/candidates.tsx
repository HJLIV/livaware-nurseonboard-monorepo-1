import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/shared/status-badge";
import { StepProgress } from "@/components/shared/step-progress";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, ArrowRight, UserPlus, Mail, Phone, Stethoscope, Send, Loader2, Sparkles, FileSearch } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Candidate, OnboardingState } from "@shared/schema";

function AddCandidateDialog() {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [band, setBand] = useState("5");
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/candidates", {
        fullName, email, phone, band: parseInt(band), status: "application",
        currentStage: "onboard",
        fastTracked: true,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setOpen(false);
      setFullName(""); setEmail(""); setPhone("");
      toast({
        title: "Fast-tracked to onboarding",
        description: data.emailSent
          ? "Portal invite email sent to " + data.email
          : "Candidate registered and fast-tracked. Portal invite email could not be sent.",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 font-semibold" data-testid="button-add-candidate">
          <Plus className="h-4 w-4" />
          Fast-Track to Onboarding
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-light">Fast-Track to Onboarding</DialogTitle>
          <p className="text-sm text-muted-foreground">Bypass the applicant stage for someone you already know well. They'll go straight to onboarding.</p>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Full Name</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Sarah Mitchell" className="h-10" data-testid="input-candidate-name" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. sarah@nhs.net" className="h-10" data-testid="input-candidate-email" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Phone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 07712345678" className="h-10" data-testid="input-candidate-phone" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Band</Label>
            <Select value={band} onValueChange={setBand}>
              <SelectTrigger className="h-10" data-testid="select-band"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5">Band 5</SelectItem>
                <SelectItem value="6">Band 6</SelectItem>
                <SelectItem value="7">Band 7</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full h-10 font-semibold"
            onClick={() => createMutation.mutate()}
            disabled={!fullName || !email || createMutation.isPending}
            data-testid="button-submit-candidate"
          >
            {createMutation.isPending ? (
              <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : "Register Candidate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RunComplianceCheckOnAllButton() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<{
    total: number;
    succeeded: number;
    skipped: number;
    failed: number;
    totalDocumentsScanned: number;
    totalDocumentsReclassified: number;
    totalCvEntriesAdded: number;
    totalCvEducationAdded: number;
    totalTrainingAdded: number;
    results: Array<{
      nurseId: string;
      name: string;
      documentsScanned: number;
      documentsReclassified: number;
      cvEntriesAdded: number;
      cvEducationAdded: number;
      trainingModulesAdded: number;
      errors: string[];
      status: "ok" | "skipped" | "failed";
      message?: string;
    }>;
  } | null>(null);
  const { toast } = useToast();

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/compliance-check/bulk", {});
      return res.json();
    },
    onSuccess: (data) => {
      setSummary(data);
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nurses"] });
      toast({
        title: "AI document scan complete",
        description: `${data.succeeded} candidate${data.succeeded === 1 ? "" : "s"} scanned · ${data.totalCvEntriesAdded} work, ${data.totalCvEducationAdded} education and ${data.totalTrainingAdded} training record${data.totalTrainingAdded === 1 ? "" : "s"} added`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Bulk AI check failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSummary(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 font-semibold" data-testid="button-bulk-compliance-check">
          <Sparkles className="h-4 w-4" />
          Run AI Check On All
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-light">Run AI Check On All Candidates</DialogTitle>
        </DialogHeader>
        {!summary && (
          <>
            <div className="space-y-3 py-2 text-sm text-muted-foreground">
              <p>
                This re-analyses every uploaded document for every candidate. CVs are parsed for
                work history and training certificates are matched against the mandatory training
                catalogue. Existing records are kept — only new entries are added.
              </p>
              <p className="text-xs">
                Each candidate is processed sequentially with bounded concurrency. This may take
                several minutes depending on the size of your roster.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)} disabled={bulkMutation.isPending}>
                Cancel
              </Button>
              <Button
                onClick={() => bulkMutation.mutate()}
                disabled={bulkMutation.isPending}
                className="gap-2"
                data-testid="button-confirm-bulk-compliance-check"
              >
                {bulkMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Scanning…
                  </>
                ) : (
                  <>
                    <FileSearch className="h-4 w-4" /> Start scan
                  </>
                )}
              </Button>
            </div>
          </>
        )}
        {summary && (
          <div className="space-y-3 py-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Candidates scanned</p>
                <p className="text-2xl font-light">{summary.succeeded}</p>
                <p className="text-xs text-muted-foreground">
                  of {summary.total} ({summary.skipped} skipped, {summary.failed} failed)
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Documents scanned</p>
                <p className="text-2xl font-light">{summary.totalDocumentsScanned}</p>
                {summary.totalDocumentsReclassified > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {summary.totalDocumentsReclassified} re-classified
                  </p>
                )}
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Work history added</p>
                <p className="text-2xl font-light">{summary.totalCvEntriesAdded}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Education added</p>
                <p className="text-2xl font-light">{summary.totalCvEducationAdded}</p>
              </div>
              <div className="rounded-md border p-3 col-span-2">
                <p className="text-xs text-muted-foreground">Training records added</p>
                <p className="text-2xl font-light">{summary.totalTrainingAdded}</p>
              </div>
            </div>
            {summary.results.some((r) => r.status === "failed" || r.errors.length > 0) && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:bg-amber-950/30">
                <p className="font-semibold mb-1">Issues</p>
                <ul className="space-y-1 max-h-32 overflow-y-auto">
                  {summary.results
                    .filter((r) => r.status === "failed" || r.errors.length > 0)
                    .map((r) => (
                      <li key={r.nurseId}>
                        <span className="font-medium">{r.name}:</span>{" "}
                        {r.message || r.errors.join("; ")}
                      </li>
                    ))}
                </ul>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button onClick={() => { setOpen(false); setSummary(null); }}>Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SendAllPortalInvitesButton() {
  const [open, setOpen] = useState(false);
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const { toast } = useToast();

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/portal-links/bulk", {
        sendEmail,
        forceRegenerate,
      });
      return res.json() as Promise<{
        total: number;
        generated: number;
        reused: number;
        emailsSent: number;
        emailsFailed: number;
        emailsSkipped: number;
        outlookConfigured: boolean;
      }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nurses"] });
      const lines: string[] = [
        `${data.total} candidate${data.total === 1 ? "" : "s"} processed`,
        `${data.generated} new link${data.generated === 1 ? "" : "s"} created, ${data.reused} reused`,
      ];
      if (data.outlookConfigured) {
        lines.push(`${data.emailsSent} email${data.emailsSent === 1 ? "" : "s"} sent` + (data.emailsFailed > 0 ? `, ${data.emailsFailed} failed` : ""));
      } else if (sendEmail) {
        lines.push("Email skipped — Outlook not configured");
      }
      toast({ title: "Portal invites processed", description: lines.join(" · ") });
      setOpen(false);
    },
    onError: (err: Error) => {
      toast({ title: "Bulk invite failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 font-semibold" data-testid="button-bulk-portal-invites">
          <Send className="h-4 w-4" />
          Open Portals For All
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-light">Open Portals For All</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Generates a portal link for every candidate already on the system, scoped to their current stage. Existing
            active links are reused unless you tick "force new links".
          </p>
        </DialogHeader>
        <div className="space-y-3 pt-2 text-sm">
          <label className="flex items-start gap-2 cursor-pointer" data-testid="checkbox-send-email-label">
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="mt-1"
              data-testid="checkbox-send-email"
            />
            <span>
              <span className="font-medium">Email each candidate their portal link</span>
              <span className="block text-xs text-muted-foreground">Requires Outlook to be configured. If not, links are still created and you can copy them per-candidate.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer" data-testid="checkbox-force-label">
            <input
              type="checkbox"
              checked={forceRegenerate}
              onChange={(e) => setForceRegenerate(e.target.checked)}
              className="mt-1"
              data-testid="checkbox-force-regenerate"
            />
            <span>
              <span className="font-medium">Force a brand-new link even if one is already active</span>
              <span className="block text-xs text-muted-foreground">Old links keep working until they expire (30 days).</span>
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={bulkMutation.isPending} data-testid="button-cancel-bulk">
            Cancel
          </Button>
          <Button onClick={() => bulkMutation.mutate()} disabled={bulkMutation.isPending} data-testid="button-confirm-bulk">
            {bulkMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Processing...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1.5" /> Run for All Candidates
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidateRow({ candidate, index }: { candidate: Candidate; index: number }) {
  const { data: state } = useQuery<OnboardingState>({
    queryKey: ["/api/candidates", candidate.id, "onboarding-state"],
  });

  const initials = candidate.fullName.split(" ").map(n => n[0]).join("").slice(0, 2);

  return (
    <div className="animate-fade-in-up" style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}>
      <Link href={`/candidates/${candidate.id}`}>
        <Card
          className="group border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
          data-testid={`candidate-row-${candidate.id}`}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 text-sm font-bold text-primary shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">{candidate.fullName}</p>
                  <StatusBadge status={candidate.status} />
                  {candidate.band && (
                    <Badge variant="outline" className="text-[10px] font-semibold">Band {candidate.band}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1.5">
                  <div className="flex items-center gap-1">
                    <Mail className="h-3 w-3 text-muted-foreground/40" />
                    <span className="text-xs text-muted-foreground">{candidate.email}</span>
                  </div>
                  {candidate.nmcPin && (
                    <div className="flex items-center gap-1">
                      <Stethoscope className="h-3 w-3 text-muted-foreground/40" />
                      <span className="text-xs text-muted-foreground">NMC: {candidate.nmcPin}</span>
                    </div>
                  )}
                  {candidate.specialisms && candidate.specialisms.length > 0 && (
                    <span className="text-xs text-muted-foreground/60 truncate hidden sm:inline">{candidate.specialisms.join(", ")}</span>
                  )}
                </div>
              </div>
              <div className="hidden lg:block w-80 shrink-0">
                {state?.stepStatuses != null && (
                  <StepProgress
                    stepStatuses={state.stepStatuses as Record<string, string>}
                    currentStep={state.currentStep}
                    compact
                  />
                )}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

export default function CandidatesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: candidates, isLoading } = useQuery<Candidate[]>({ queryKey: ["/api/candidates"] });

  const filtered = (candidates || []).filter(c => {
    const matchesSearch = c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.nmcPin?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <AppLayout>
      <div className="space-y-7">
        <div className="flex items-end justify-between animate-fade-in-up">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50 mb-1.5">
              Candidates
            </p>
            <h1 className="font-serif text-3xl font-light tracking-tight text-foreground" data-testid="text-page-title">
              Onboarding
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage candidate onboarding applications
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RunComplianceCheckOnAllButton />
            <SendAllPortalInvitesButton />
            <AddCandidateDialog />
          </div>
        </div>

        <div className="flex items-center gap-3 animate-fade-in-up animate-delay-100">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              placeholder="Search by name, email, or NMC PIN..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10 bg-card border-border/60"
              data-testid="input-search-candidates"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 h-10 bg-card border-border/60" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="application">Application</SelectItem>
              <SelectItem value="verification">Verification</SelectItem>
              <SelectItem value="competency">Competency</SelectItem>
              <SelectItem value="references">References</SelectItem>
              <SelectItem value="induction">Induction</SelectItem>
              <SelectItem value="cleared">Cleared</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
          {candidates && (
            <Badge variant="secondary" className="shrink-0 font-semibold tabular-nums">
              {filtered.length} of {candidates.length}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="animate-fade-in-up animate-delay-200">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8 mb-4">
                {search || statusFilter !== "all" ? (
                  <Search className="h-7 w-7 text-primary/40" />
                ) : (
                  <UserPlus className="h-7 w-7 text-primary/40" />
                )}
              </div>
              <p className="font-serif text-lg text-foreground mb-1">
                {search || statusFilter !== "all" ? "No matching candidates" : "No candidates yet"}
              </p>
              <p className="text-sm text-muted-foreground max-w-xs">
                {search || statusFilter !== "all"
                  ? "Try adjusting your search or clearing filters"
                  : "Register your first candidate to begin onboarding"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((candidate, i) => (
              <CandidateRow key={candidate.id} candidate={candidate} index={i} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
