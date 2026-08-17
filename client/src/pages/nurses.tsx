import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Search, Users, ArrowUpRight, Mail, Calendar, Copy, ExternalLink, Check, ChevronRight, Loader2, RefreshCw, Archive, ArchiveRestore, LayoutGrid, List as ListIcon, ChevronDown, Settings2, MailCheck, Shirt, Download } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getStageDisplayName } from "@shared/schema";
import { RunComplianceCheckOnAllButton, SendAllPortalInvitesButton, RecoverDocumentsButton } from "@/pages/candidates";

interface Nurse {
  id: string;
  fullName: string;
  email: string;
  currentStage: string;
  preboardStatus: string;
  onboardStatus: string;
  arcadeStatus: string;
  createdAt: string;
  archivedAt?: string | null;
  archivedBy?: string | null;
}

const stageConfig: Record<string, { bg: string; text: string; dot: string }> = {
  preboard:       { bg: "bg-blue-500/8",    text: "text-blue-400",    dot: "bg-blue-400" },
  onboard:        { bg: "bg-emerald-500/8",  text: "text-emerald-400", dot: "bg-emerald-400" },
  skills_arcade:  { bg: "bg-amber-500/8",   text: "text-amber-400",   dot: "bg-amber-400" },
  "skills-arcade": { bg: "bg-amber-500/8",   text: "text-amber-400",   dot: "bg-amber-400" },
  completed:      { bg: "bg-primary/8",      text: "text-primary",     dot: "bg-primary" },
};

export function RegisterNurseDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(true);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [emailOutcome, setEmailOutcome] = useState<"sent" | "skipped" | "failed">("sent");
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const registerMutation = useMutation({
    mutationFn: async () => {
      // Capture the toggle value at submit time so a later UI flip can't
      // race with the success branch below.
      const wantedToSend = sendWelcomeEmail;
      const res = await apiRequest("POST", "/api/nurses", {
        fullName: `${firstName.trim()} ${lastName.trim()}`,
        email: email.trim(),
        sendWelcomeEmail: wantedToSend,
      });
      const json = await res.json();
      return { ...json, wantedToSend };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/nurses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      if (data.preboardInviteUrl) {
        setInviteUrl(data.preboardInviteUrl);
        if (data.emailSent) {
          setEmailOutcome("sent");
          toast({ title: "Welcome email sent", description: `${firstName} ${lastName} has been emailed their welcome and secure portal link.` });
        } else if (!data.wantedToSend) {
          setEmailOutcome("skipped");
          toast({ title: "Applicant registered", description: `${firstName} ${lastName} added — welcome email was skipped at your request. Share the portal link below when you're ready.` });
        } else {
          setEmailOutcome("failed");
          toast({ title: "Applicant registered", description: `${firstName} ${lastName} added. Welcome email could not be sent automatically — share the link manually.`, variant: "destructive" });
        }
      } else {
        resetAndClose();
        toast({ title: "Applicant registered", description: `${firstName} ${lastName} has been added to the platform.` });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    },
  });

  const resetAndClose = () => {
    setOpen(false);
    setFirstName("");
    setLastName("");
    setEmail("");
    setSendWelcomeEmail(true);
    setInviteUrl(null);
    setEmailOutcome("sent");
    setCopied(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    registerMutation.mutate();
  };

  const handleCopy = async () => {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast({ title: "Link copied", description: "Assessment invite link copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2 font-semibold shadow-md" tooltip="Register a new applicant and generate their assessment invite link.">
            <UserPlus className="h-4 w-4" />
            Register Applicant
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {inviteUrl ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif text-xl font-light">Applicant Registered</DialogTitle>
              <DialogDescription>
                {firstName} {lastName} has been registered. Share the assessment link below.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Assessment Invite Link</p>
                <div className="flex items-center gap-2">
                  <Input value={inviteUrl} readOnly className="text-xs font-mono bg-card" />
                  <Button size="icon" variant="outline" onClick={handleCopy} className="shrink-0" tooltip="Copy the assessment invite link to your clipboard.">
                    {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  This link expires in 30 days.{" "}
                  {emailOutcome === "sent" && "We've also emailed it to the applicant — keep this on hand as a backup."}
                  {emailOutcome === "skipped" && "No welcome email was sent — share this link with the applicant yourself."}
                  {emailOutcome === "failed" && (
                    <span className="text-amber-500">The welcome email could not be sent automatically — please share this link with the applicant manually.</span>
                  )}
                </p>
              </div>
              <DialogFooter>
                <Button onClick={resetAndClose} className="w-full">Done</Button>
              </DialogFooter>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-serif text-xl font-light">Register New Applicant</DialogTitle>
              <DialogDescription>Add a new applicant to the platform. An assessment invite will be generated automatically.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">First Name</Label>
                  <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Last Name</Label>
                  <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane.doe@example.com" className="h-10" />
              </div>
              <label
                htmlFor="sendWelcomeEmail"
                className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  id="sendWelcomeEmail"
                  checked={sendWelcomeEmail}
                  onCheckedChange={(v) => setSendWelcomeEmail(v === true)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5 flex-1">
                  <p className="text-sm font-medium leading-none flex items-center gap-2">
                    <MailCheck className="h-3.5 w-3.5 text-primary" />
                    Send welcome email now
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Emails the applicant a warm Basecamp welcome with their secure portal link and instructions to return at <span className="font-mono text-foreground/80">onboard.livaware.co.uk</span> any time.
                  </p>
                </div>
              </label>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={resetAndClose}>Cancel</Button>
                <Button type="submit" disabled={registerMutation.isPending || !firstName.trim() || !lastName.trim() || !email.trim()} className="gap-2">
                  {registerMutation.isPending ? (
                    <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : sendWelcomeEmail ? "Register & Send Welcome" : "Register Applicant"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NurseCard({ nurse, onClick, onAdvance, isAdvancing, onArchive, onRestore, isArchiving, isRestoring, index }: { nurse: Nurse; onClick: () => void; onAdvance?: () => void; isAdvancing?: boolean; onArchive?: () => void; onRestore?: () => void; isArchiving?: boolean; isRestoring?: boolean; index: number }) {
  const stage = stageConfig[nurse.currentStage] || stageConfig.preboard;
  const nameParts = nurse.fullName.split(" ");
  const initials = nameParts.length >= 2
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : (nurse.fullName[0] || "?").toUpperCase();

  return (
    <div
      className="animate-fade-in-up"
      style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}
    >
      <Card
        className="group relative overflow-hidden border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
        onClick={onClick}
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${stage.bg} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`} />
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 text-sm font-bold text-primary">
              {initials}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {nurse.fullName}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Mail className="h-3 w-3 text-muted-foreground/40" />
                    <span className="text-xs text-muted-foreground truncate">{nurse.email}</span>
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0 mt-0.5" />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${stage.bg}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${stage.text}`}>{getStageDisplayName(nurse.currentStage)}</span>
                </div>
                <StatusBadge status={nurse.preboardStatus} />
                <StatusBadge status={nurse.onboardStatus} />
                <StatusBadge status={nurse.arcadeStatus} />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                  <Calendar className="h-2.5 w-2.5" />
                  {new Date(nurse.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
                <div className="flex items-center gap-1.5">
                  {nurse.currentStage === "preboard" && onAdvance && !nurse.archivedAt && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1 px-2"
                      onClick={(e) => { e.stopPropagation(); onAdvance(); }}
                      disabled={isAdvancing}
                      tooltip="Move this applicant into the Onboarding stage."
                    >
                      {isAdvancing ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ChevronRight className="h-2.5 w-2.5" />}
                      Advance to Onboarding
                    </Button>
                  )}
                  {nurse.archivedAt && onRestore && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1 px-2"
                      onClick={(e) => { e.stopPropagation(); onRestore(); }}
                      disabled={isRestoring}
                      data-testid={`button-restore-nurse-${nurse.id}`}
                      tooltip="Restore this archived candidate back to the active list."
                    >
                      {isRestoring ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <ArchiveRestore className="h-2.5 w-2.5" />}
                      Restore
                    </Button>
                  )}
                  {!nurse.archivedAt && onArchive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] gap-1 px-2 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Archive ${nurse.fullName}? They'll be hidden from the active list and can be restored later.`)) {
                          onArchive();
                        }
                      }}
                      disabled={isArchiving}
                      data-testid={`button-archive-nurse-${nurse.id}`}
                      tooltip="Archive this candidate. They can be restored later."
                    >
                      {isArchiving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Archive className="h-2.5 w-2.5" />}
                      Archive
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NurseListRow({ nurse, onClick, onAdvance, isAdvancing, onArchive, onRestore, isArchiving, isRestoring, index }: { nurse: Nurse; onClick: () => void; onAdvance?: () => void; isAdvancing?: boolean; onArchive?: () => void; onRestore?: () => void; isArchiving?: boolean; isRestoring?: boolean; index: number }) {
  const stage = stageConfig[nurse.currentStage] || stageConfig.preboard;
  const nameParts = nurse.fullName.split(" ");
  const initials = nameParts.length >= 2
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : (nurse.fullName[0] || "?").toUpperCase();

  return (
    <TableRow
      className="group cursor-pointer animate-fade-in-up outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset"
      style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
      data-testid={`nurse-row-${nurse.id}`}
      role="link"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <TableCell className="py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20 text-xs font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
              {nurse.fullName}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground sm:hidden">
              <Mail className="h-3 w-3 text-muted-foreground/40" />
              <span className="truncate">{nurse.email}</span>
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="py-2.5 hidden sm:table-cell">
        <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0">
          <Mail className="h-3 w-3 text-muted-foreground/40 shrink-0" />
          <span className="truncate">{nurse.email}</span>
        </div>
      </TableCell>
      <TableCell className="py-2.5">
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${stage.bg}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${stage.text}`}>{getStageDisplayName(nurse.currentStage)}</span>
        </div>
      </TableCell>
      <TableCell className="py-2.5 hidden md:table-cell"><StatusBadge status={nurse.preboardStatus} /></TableCell>
      <TableCell className="py-2.5 hidden md:table-cell"><StatusBadge status={nurse.onboardStatus} /></TableCell>
      <TableCell className="py-2.5 hidden lg:table-cell"><StatusBadge status={nurse.arcadeStatus} /></TableCell>
      <TableCell className="py-2.5 hidden xl:table-cell">
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
          <Calendar className="h-3 w-3" />
          {new Date(nurse.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </div>
      </TableCell>
      <TableCell className="py-2.5 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {nurse.currentStage === "preboard" && onAdvance && !nurse.archivedAt && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1 px-2"
              onClick={(e) => { e.stopPropagation(); onAdvance(); }}
              disabled={isAdvancing}
              tooltip="Move this applicant into the Onboarding stage."
            >
              {isAdvancing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
              Advance
            </Button>
          )}
          {nurse.archivedAt && onRestore && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1 px-2"
              onClick={(e) => { e.stopPropagation(); onRestore(); }}
              disabled={isRestoring}
              data-testid={`button-restore-nurse-${nurse.id}`}
              tooltip="Restore this archived candidate back to the active list."
            >
              {isRestoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArchiveRestore className="h-3 w-3" />}
              Restore
            </Button>
          )}
          {!nurse.archivedAt && onArchive && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] gap-1 px-2 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Archive ${nurse.fullName}? They'll be hidden from the active list and can be restored later.`)) {
                  onArchive();
                }
              }}
              disabled={isArchiving}
              data-testid={`button-archive-nurse-${nurse.id}`}
              tooltip="Archive this candidate. They can be restored later."
            >
              {isArchiving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3" />}
            </Button>
          )}
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
        </div>
      </TableCell>
    </TableRow>
  );
}

type NurseViewMode = "cards" | "list";
const NURSE_VIEW_MODE_STORAGE_KEY = "nurses:viewMode";

export default function NursesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">("active");
  const searchString = useSearch();
  const stageFilter = useMemo(() => {
    const param = new URLSearchParams(searchString).get("stage");
    if (param === "preboard" || param === "onboard" || param === "skills_arcade" || param === "completed") {
      return param;
    }
    return "all" as const;
  }, [searchString]);
  const [, setLocation] = useLocation();
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<NurseViewMode>("cards");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(NURSE_VIEW_MODE_STORAGE_KEY);
      if (stored === "cards" || stored === "list") setViewMode(stored);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(NURSE_VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {}
  }, [viewMode]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: nursesList, isLoading } = useQuery<Nurse[]>({
    queryKey: ["/api/nurses", { status: statusFilter }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/nurses?status=${statusFilter}`);
      return res.json();
    },
  });
  const { data: archivedList } = useQuery<Nurse[]>({
    queryKey: ["/api/nurses", { status: "archived" }],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/nurses?status=archived");
      return res.json();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (nurseId: string) => {
      const res = await apiRequest("DELETE", `/api/nurses/${nurseId}`);
      return res.json();
    },
    onSuccess: (_data, nurseId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/nurses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      const archived = nursesList?.find((n) => n.id === nurseId);
      toast({ title: "Candidate archived", description: archived ? `${archived.fullName} moved to Archived.` : undefined });
    },
    onError: (err: Error) => {
      toast({ title: "Archive failed", description: err.message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (nurseId: string) => {
      const res = await apiRequest("POST", `/api/nurses/${nurseId}/restore`, {});
      return res.json();
    },
    onSuccess: (_data, nurseId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/nurses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      const restored = nursesList?.find((n) => n.id === nurseId);
      toast({ title: "Candidate restored", description: restored ? `${restored.fullName} is active again.` : undefined });
    },
    onError: (err: Error) => {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });

  const advanceMutation = useMutation({
    mutationFn: async (nurseId: string) => {
      setAdvancingId(nurseId);
      const res = await apiRequest("POST", `/api/nurses/${nurseId}/advance-stage`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/nurses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Advanced to Onboarding", description: `${data.fullName} has been moved to the onboarding stage.` });
      setAdvancingId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to advance", description: err.message, variant: "destructive" });
      setAdvancingId(null);
    },
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/backfill-preboard-completions", {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/nurses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      if (data.advanced > 0) {
        toast({ title: `${data.advanced} applicant${data.advanced > 1 ? "s" : ""} advanced`, description: `Moved to onboarding: ${data.names.join(", ")}` });
      } else {
        toast({ title: "No applicants to advance", description: "All applicants with completed assessments have already been moved." });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Backfill failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = nursesList?.filter((nurse) => {
    if (stageFilter !== "all" && nurse.currentStage !== stageFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      nurse.fullName.toLowerCase().includes(q) ||
      nurse.email.toLowerCase().includes(q)
    );
  });

  const preboardCount = nursesList?.filter(n => n.currentStage === "preboard").length ?? 0;

  const stageCounts = {
    all: nursesList?.length ?? 0,
    preboard: preboardCount,
    onboard: nursesList?.filter(n => n.currentStage === "onboard").length ?? 0,
    skills_arcade: nursesList?.filter(n => n.currentStage === "skills_arcade" || n.currentStage === "skills-arcade").length ?? 0,
    completed: nursesList?.filter(n => n.currentStage === "completed").length ?? 0,
  };

  const setStageFilter = (next: "all" | "preboard" | "onboard" | "skills_arcade" | "completed") => {
    setLocation(next === "all" ? "/nurses" : `/nurses?stage=${next}`);
  };

  const stageOptions: Array<{ value: typeof stageFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "preboard", label: "Applicants" },
    { value: "onboard", label: "Candidates" },
    { value: "skills_arcade", label: "Skills Arcade" },
    { value: "completed", label: "Nurses" },
  ];

  return (
    <AppLayout>
      <div className="space-y-7">
        <div className="flex items-end justify-between animate-fade-in-up">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50 mb-1.5">
              Candidates
            </p>
            <h1 className="font-serif text-3xl font-light tracking-tight text-foreground">
              Onboarding
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage candidate onboarding and compliance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" data-testid="button-bulk-actions" tooltip="Open bulk actions that apply across every active candidate.">
                  <Settings2 className="h-3.5 w-3.5" />
                  Actions
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[420px] p-0">
                <div className="px-4 py-3 border-b border-border/50">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Bulk actions</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Run platform-wide jobs across all active candidates.</p>
                </div>
                <div className="divide-y divide-border/50">
                  {preboardCount > 0 && (
                    <div className="flex items-start gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">Advance all assessed</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Move every applicant who has finished their pre-assessment into the Compliance stage.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs shrink-0"
                        onClick={() => backfillMutation.mutate()}
                        disabled={backfillMutation.isPending}
                        data-testid="button-advance-all-assessed"
                        tooltip="Move every applicant who finished their pre-assessment into the Onboarding stage."
                      >
                        {backfillMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Run
                      </Button>
                    </div>
                  )}
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">Run AI check on all</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Re-scan every candidate's documents, refresh AI compliance flags and update extracted CV / training data.
                      </p>
                    </div>
                    <RunComplianceCheckOnAllButton />
                  </div>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">Recover documents</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Re-link orphaned files in SharePoint back to their candidate records.
                      </p>
                    </div>
                    <RecoverDocumentsButton />
                  </div>
                  <div className="flex items-start gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">Open portals for all</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Email a fresh secure portal link to every active candidate who doesn't have a current invite.
                      </p>
                    </div>
                    <SendAllPortalInvitesButton />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => { window.location.href = "/api/admin/uniform-sizing.csv"; }}
              data-testid="button-download-uniform-sizing-csv"
              tooltip="Download every active candidate with their uniform top, trouser and length sizes as CSV."
            >
              <Shirt className="h-3.5 w-3.5" />
              Uniform Sizing CSV
            </Button>
            <RegisterNurseDialog />
          </div>
        </div>

        <div className="flex items-center gap-4 animate-fade-in-up animate-delay-100 flex-wrap">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as "active" | "archived")}>
            <TabsList data-testid="tabs-nurse-status">
              <TabsTrigger value="active" data-testid="tab-status-active">Active</TabsTrigger>
              <TabsTrigger value="archived" data-testid="tab-status-archived" className="gap-1.5">
                <Archive className="h-3 w-3" />
                Archived
                {archivedList && archivedList.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-semibold tabular-nums ml-1">
                    {archivedList.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={stageFilter} onValueChange={(v) => setStageFilter(v as typeof stageFilter)}>
            <TabsList data-testid="tabs-nurse-stage">
              {stageOptions.map((opt) => (
                <TabsTrigger
                  key={opt.value}
                  value={opt.value}
                  data-testid={`tab-stage-${opt.value}`}
                  className="gap-1.5"
                >
                  {opt.label}
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-semibold tabular-nums ml-0.5">
                    {stageCounts[opt.value]}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 bg-card border-border/60"
            />
          </div>
          {nursesList && (
            <Badge variant="secondary" className="shrink-0 font-semibold tabular-nums">
              {filtered?.length ?? 0} of {nursesList.length}
            </Badge>
          )}
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => { if (v === "cards" || v === "list") setViewMode(v); }}
            className="ml-auto shrink-0 rounded-md border border-border/60 bg-card p-0.5"
            data-testid="toggle-view-mode"
          >
            <ToggleGroupItem
              value="cards"
              size="sm"
              aria-label="Card view"
              className="h-8 px-2.5 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
              data-testid="toggle-view-cards"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="ml-1.5 text-xs font-medium hidden sm:inline">Cards</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="list"
              size="sm"
              aria-label="List view"
              className="h-8 px-2.5 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
              data-testid="toggle-view-list"
            >
              <ListIcon className="h-4 w-4" />
              <span className="ml-1.5 text-xs font-medium hidden sm:inline">List</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {isLoading ? (
          viewMode === "list" ? (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead className="hidden sm:table-cell">Email</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="hidden md:table-cell">Applicant</TableHead>
                    <TableHead className="hidden md:table-cell">Onboard</TableHead>
                    <TableHead className="hidden lg:table-cell">Arcade</TableHead>
                    <TableHead className="hidden xl:table-cell">Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i}><CardContent className="p-5"><Skeleton className="h-24 w-full" /></CardContent></Card>
              ))}
            </div>
          )
        ) : filtered && filtered.length > 0 ? (
          viewMode === "list" ? (
            <Card className="overflow-hidden animate-fade-in-up animate-delay-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead className="hidden sm:table-cell">Email</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="hidden md:table-cell">Applicant</TableHead>
                    <TableHead className="hidden md:table-cell">Onboard</TableHead>
                    <TableHead className="hidden lg:table-cell">Arcade</TableHead>
                    <TableHead className="hidden xl:table-cell">Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((nurse, i) => (
                    <NurseListRow
                      key={nurse.id}
                      nurse={nurse}
                      onClick={() => setLocation(`/candidates/${nurse.id}`)}
                      onAdvance={() => advanceMutation.mutate(nurse.id)}
                      isAdvancing={advancingId === nurse.id}
                      onArchive={() => archiveMutation.mutate(nurse.id)}
                      onRestore={() => restoreMutation.mutate(nurse.id)}
                      isArchiving={archiveMutation.isPending && archiveMutation.variables === nurse.id}
                      isRestoring={restoreMutation.isPending && restoreMutation.variables === nurse.id}
                      index={i}
                    />
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((nurse, i) => (
                <NurseCard
                  key={nurse.id}
                  nurse={nurse}
                  onClick={() => setLocation(`/candidates/${nurse.id}`)}
                  onAdvance={() => advanceMutation.mutate(nurse.id)}
                  isAdvancing={advancingId === nurse.id}
                  onArchive={() => archiveMutation.mutate(nurse.id)}
                  onRestore={() => restoreMutation.mutate(nurse.id)}
                  isArchiving={archiveMutation.isPending && archiveMutation.variables === nurse.id}
                  isRestoring={restoreMutation.isPending && restoreMutation.variables === nurse.id}
                  index={i}
                />
              ))}
            </div>
          )
        ) : (
          <Card className="animate-fade-in-up">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8 mb-4">
                <Users className="h-7 w-7 text-primary/40" />
              </div>
              <p className="font-serif text-lg text-foreground mb-1">
                {search ? "No results found" : "No applicants registered"}
              </p>
              <p className="text-sm text-muted-foreground max-w-xs">
                {search ? "Try adjusting your search terms" : "Register your first applicant to begin the onboarding journey"}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
