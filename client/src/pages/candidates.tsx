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
import { Search, Plus, ArrowRight, UserPlus, Mail, Phone, Stethoscope, Send, Loader2, Sparkles, FileSearch, FolderSearch, Cloud, Inbox, ChevronDown, AlertTriangle, CheckCircle2, X, Link2, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DialogDescription } from "@/components/ui/dialog";
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

interface OrphanFile {
  filename: string;
  sizeBytes: number;
  mtime: string;
  mimeType: string;
  hint: string | null;
}

function OrphanRecoveryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [picks, setPicks] = useState<Record<string, string>>({});
  const { data, isLoading, refetch } = useQuery<{ orphans: OrphanFile[] }>({
    queryKey: ["/api/admin/orphan-uploads"],
    enabled: open,
  });
  const { data: candidates } = useQuery<Candidate[]>({ queryKey: ["/api/candidates"], enabled: open });

  const linkMut = useMutation({
    mutationFn: async ({ filename, nurseId }: { filename: string; nurseId: string }) => {
      return apiRequest("POST", "/api/admin/orphan-uploads/link", { filename, nurseId });
    },
    onSuccess: (_d, vars) => {
      toast({ title: "File linked", description: `Attached ${vars.filename} to candidate.` });
      setPicks(p => { const n = { ...p }; delete n[vars.filename]; return n; });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
    },
    onError: (e: any) => toast({ title: "Link failed", description: e.message, variant: "destructive" }),
  });

  const discardMut = useMutation({
    mutationFn: async (filename: string) => apiRequest("POST", "/api/admin/orphan-uploads/discard", { filename }),
    onSuccess: () => { toast({ title: "File discarded" }); refetch(); },
    onError: (e: any) => toast({ title: "Discard failed", description: e.message, variant: "destructive" }),
  });

  const orphans = data?.orphans || [];
  const formatSize = (b: number) => b < 1024 ? `${b} B` : b < 1024*1024 ? `${(b/1024).toFixed(1)} KB` : `${(b/1024/1024).toFixed(1)} MB`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="dialog-orphan-recovery">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FolderSearch className="h-5 w-5" /> Recover Orphan Files</DialogTitle>
          <DialogDescription>Files in the upload folder not linked to any candidate. Pick a candidate to attach, or discard.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Scanning uploads…</div>
        ) : orphans.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-green-600" />
            No orphan files found. Everything in the upload folder is linked to a candidate.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead className="w-24">Size</TableHead>
                <TableHead className="w-44">Hint</TableHead>
                <TableHead className="w-64">Attach to candidate</TableHead>
                <TableHead className="w-32 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orphans.map(o => (
                <TableRow key={o.filename} data-testid={`row-orphan-${o.filename}`}>
                  <TableCell className="font-mono text-xs break-all">{o.filename}</TableCell>
                  <TableCell className="text-xs">{formatSize(o.sizeBytes)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{o.hint || "—"}</TableCell>
                  <TableCell>
                    <Select value={picks[o.filename] || ""} onValueChange={v => setPicks(p => ({ ...p, [o.filename]: v }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-candidate-${o.filename}`}>
                        <SelectValue placeholder="Choose candidate…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(candidates || []).map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.fullName} — {c.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={!picks[o.filename] || linkMut.isPending}
                        onClick={() => linkMut.mutate({ filename: o.filename, nurseId: picks[o.filename] })}
                        data-testid={`button-link-${o.filename}`}
                      >
                        <Link2 className="h-3 w-3 mr-1" /> Link
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={discardMut.isPending}
                        onClick={() => discardMut.mutate(o.filename)}
                        data-testid={`button-discard-${o.filename}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface BulkResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    nurseId: string;
    candidateName: string;
    errors: string[];
    filesPulled?: number;
    filesSkippedAlreadyOnFile?: number;
    attachmentsPulled?: number;
    attachmentsSkippedAlreadyOnFile?: number;
  }>;
}

function BulkRecoveryDialog({
  open, onOpenChange, kind,
}: { open: boolean; onOpenChange: (v: boolean) => void; kind: "sharepoint" | "mailbox" }) {
  const { toast } = useToast();
  const [result, setResult] = useState<BulkResult | null>(null);
  const isSP = kind === "sharepoint";
  const title = isSP ? "Re-pull from SharePoint" : "Scan Microsoft 365 mailboxes";
  const desc = isSP
    ? "Walk every candidate's SharePoint folder and pull back any document missing from Livaware. Existing files are skipped — no duplicates created."
    : "Search the configured mailbox for messages from/to each candidate's email and import any attachments not already on file. Requires Mail.Read.All admin consent.";
  const endpoint = isSP ? "/api/admin/sharepoint-pull/bulk" : "/api/admin/mailbox-scan/bulk";
  const Icon = isSP ? Cloud : Inbox;

  const runMut = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", endpoint, {});
      return r.json() as Promise<BulkResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      const totalPulled = data.results.reduce((s, r) => s + (r.filesPulled || r.attachmentsPulled || 0), 0);
      toast({ title: "Recovery complete", description: `${totalPulled} files imported across ${data.total} candidates.` });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
    },
    onError: (e: any) => toast({ title: "Recovery failed", description: e.message, variant: "destructive" }),
  });

  const close = () => { onOpenChange(false); setTimeout(() => setResult(null), 200); };

  return (
    <Dialog open={open} onOpenChange={v => v ? onOpenChange(v) : close()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" data-testid={`dialog-bulk-${kind}`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Icon className="h-5 w-5" /> {title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>

        {!result && !runMut.isPending && (
          <div className="py-4 flex justify-end gap-2">
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={() => runMut.mutate()} data-testid={`button-run-bulk-${kind}`}>
              <Icon className="h-4 w-4 mr-2" /> Run for all candidates
            </Button>
          </div>
        )}

        {runMut.isPending && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Working through every candidate — this can take a few minutes…
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded border p-3"><div className="text-2xl font-light">{result.total}</div><div className="text-xs text-muted-foreground">Candidates</div></div>
              <div className="rounded border p-3"><div className="text-2xl font-light text-green-600">{result.succeeded}</div><div className="text-xs text-muted-foreground">Succeeded</div></div>
              <div className="rounded border p-3"><div className="text-2xl font-light text-amber-600">{result.failed}</div><div className="text-xs text-muted-foreground">With errors</div></div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead className="w-20 text-right">Imported</TableHead>
                  <TableHead className="w-20 text-right">Skipped</TableHead>
                  <TableHead>Errors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.results.map(r => {
                  const imported = r.filesPulled ?? r.attachmentsPulled ?? 0;
                  const skipped = r.filesSkippedAlreadyOnFile ?? r.attachmentsSkippedAlreadyOnFile ?? 0;
                  return (
                    <TableRow key={r.nurseId}>
                      <TableCell className="text-xs">{r.candidateName}</TableCell>
                      <TableCell className="text-right text-xs font-medium">{imported}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{skipped}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.errors.length === 0 ? <span className="text-green-600">OK</span> : r.errors.join("; ")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex justify-end"><Button variant="outline" onClick={close}>Close</Button></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RecoverDocumentsButton() {
  const [openOrphan, setOpenOrphan] = useState(false);
  const [openSP, setOpenSP] = useState(false);
  const [openMail, setOpenMail] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" data-testid="button-recover-documents">
            <FolderSearch className="h-4 w-4 mr-2" />
            Recover Documents
            <ChevronDown className="h-3 w-3 ml-2 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Recover missing files</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpenOrphan(true)} data-testid="menu-orphan-files">
            <FolderSearch className="h-4 w-4 mr-2" />
            <div className="flex flex-col">
              <span>Orphan files</span>
              <span className="text-[10px] text-muted-foreground">Files on disk not linked to a candidate</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpenSP(true)} data-testid="menu-sharepoint-pull">
            <Cloud className="h-4 w-4 mr-2" />
            <div className="flex flex-col">
              <span>SharePoint re-sync</span>
              <span className="text-[10px] text-muted-foreground">Re-pull from candidate SharePoint folders</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpenMail(true)} data-testid="menu-mailbox-scan">
            <Inbox className="h-4 w-4 mr-2" />
            <div className="flex flex-col">
              <span>Mailbox scan</span>
              <span className="text-[10px] text-muted-foreground">Import attachments from M365 mailbox</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <OrphanRecoveryDialog open={openOrphan} onOpenChange={setOpenOrphan} />
      <BulkRecoveryDialog open={openSP} onOpenChange={setOpenSP} kind="sharepoint" />
      <BulkRecoveryDialog open={openMail} onOpenChange={setOpenMail} kind="mailbox" />
    </>
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
            <RecoverDocumentsButton />
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
