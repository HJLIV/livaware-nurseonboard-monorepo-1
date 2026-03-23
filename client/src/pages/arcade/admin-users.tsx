import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Shield, Stethoscope, GraduationCap, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, Lock, Clock, BookOpen, Trophy, ShieldAlert, Info,
  Syringe, Droplets, Scissors, Sticker, Wind, Thermometer, Heart,
  Activity, Pill, AlertTriangle, Eye, FileText, Utensils, Scale,
  ClipboardList, Brain, UserCheck, CircleDot, Gauge, Search,
  Beaker, Waves, CloudFog, MonitorCheck, HeartHandshake,
  HandHelping, Soup, GlassWater, PersonStanding, UserPlus, Mail, Loader2,
  Copy, CheckCheck,
} from "lucide-react";

type UserDetail = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  assignmentCount: number;
};

type ModuleProgress = {
  assignmentId: string;
  moduleId: string;
  moduleName: string;
  moduleIcon: string;
  moduleColor: string;
  version: string;
  status: string;
  totalAttempts: number;
  passCount: number;
  failCount: number;
  isLocked: boolean;
  remediationStatus: string | null;
  attempts: Array<{
    id: string;
    result: string | null;
    minorCount: number;
    majorCount: number;
    submittedAt: string | null;
  }>;
};

type UserProgress = {
  user: { id: string; name: string; email: string; role: string };
  summary: { totalModules: number; passedModules: number; lockedModules: number; notStarted: number };
  modules: ModuleProgress[];
};

const iconMap: Record<string, any> = {
  Syringe, Droplets, Scissors, Sticker, Wind, Thermometer, Heart,
  Activity, Pill, AlertTriangle, Eye, FileText, Utensils, Scale,
  ClipboardList, Brain, UserCheck, CircleDot, Gauge, Search,
  BookOpen, Beaker, Waves, CloudFog, MonitorCheck, HeartHandshake,
  HandHelping, Soup, GlassWater, PersonStanding, ShieldAlert, Lock, Trophy,
  CheckCircle2, XCircle, Info, Shield, Stethoscope, GraduationCap,
};

const roleConfig: Record<string, { label: string; color: string; icon: any }> = {
  nurse: { label: "Nurse", color: "bg-primary/10 text-primary", icon: Stethoscope },
  trainer: { label: "Trainer", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: GraduationCap },
  admin: { label: "Admin", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: Shield },
};

function UserProgressPanel({ userId }: { userId: string }) {
  const { data, isLoading } = useQuery<UserProgress>({
    queryKey: [`/api/admin/users/${userId}/progress`],
  });

  if (isLoading) {
    return (
      <div className="space-y-3 pt-3">
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}
      </div>
    );
  }

  if (!data) return null;

  const { summary, modules } = data;
  const inProgress = summary.totalModules - summary.passedModules - summary.lockedModules - summary.notStarted;

  const passed = modules.filter((m) => m.passCount > 0);
  const locked = modules.filter((m) => m.isLocked);
  const active = modules.filter((m) => m.totalAttempts > 0 && m.passCount === 0 && !m.isLocked);
  const notStarted = modules.filter((m) => m.totalAttempts === 0 && !m.isLocked);

  return (
    <div className="space-y-4 pt-3 border-t mt-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-md bg-muted/50 p-3 text-center">
          <p className="text-lg font-bold">{summary.totalModules}</p>
          <p className="text-xs text-muted-foreground">Assigned</p>
        </div>
        <div className="rounded-md bg-emerald-500/10 p-3 text-center">
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{summary.passedModules}</p>
          <p className="text-xs text-muted-foreground">Passed</p>
        </div>
        <div className="rounded-md bg-primary/10 p-3 text-center">
          <p className="text-lg font-bold text-primary">{inProgress}</p>
          <p className="text-xs text-muted-foreground">In Progress</p>
        </div>
        <div className="rounded-md bg-amber-500/10 p-3 text-center">
          <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{summary.lockedModules}</p>
          <p className="text-xs text-muted-foreground">Locked</p>
        </div>
      </div>

      {locked.length > 0 && (
        <ModuleSection title="Locked" modules={locked} variant="locked" />
      )}
      {active.length > 0 && (
        <ModuleSection title="In Progress" modules={active} variant="active" />
      )}
      {passed.length > 0 && (
        <ModuleSection title="Passed" modules={passed} variant="passed" />
      )}
      {notStarted.length > 0 && (
        <ModuleSection title="Not Started" modules={notStarted} variant="not_started" />
      )}

      {modules.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No modules assigned</p>
      )}
    </div>
  );
}

function ModuleSection({ title, modules, variant }: { title: string; modules: ModuleProgress[]; variant: string }) {
  const colorClass = variant === "locked"
    ? "text-amber-600 dark:text-amber-400"
    : variant === "passed"
      ? "text-emerald-600 dark:text-emerald-400"
      : variant === "active"
        ? "text-primary"
        : "text-muted-foreground";

  return (
    <div className="space-y-1.5">
      <h4 className={`text-xs font-semibold uppercase tracking-wider ${colorClass}`}>
        {title} ({modules.length})
      </h4>
      {modules.map((mod) => (
        <ModuleRow key={mod.assignmentId} module={mod} />
      ))}
    </div>
  );
}

function ModuleRow({ module: mod }: { module: ModuleProgress }) {
  const [expanded, setExpanded] = useState(false);
  const ModIcon = iconMap[mod.moduleIcon] || BookOpen;

  const statusBadge = mod.isLocked ? (
    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
      <Lock className="w-3 h-3 mr-1" />Locked
    </Badge>
  ) : mod.passCount > 0 ? (
    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="w-3 h-3 mr-1" />Passed
    </Badge>
  ) : mod.totalAttempts > 0 ? (
    <Badge variant="secondary" className="bg-primary/10 text-primary">
      <Clock className="w-3 h-3 mr-1" />{mod.failCount} failed
    </Badge>
  ) : (
    <Badge variant="secondary">
      <Clock className="w-3 h-3 mr-1" />Not started
    </Badge>
  );

  return (
    <div className="rounded-md border bg-card" data-testid={`module-row-${mod.moduleId}`}>
      <button
        className="w-full flex items-center gap-3 p-2.5 text-left hover-elevate rounded-md flex-wrap"
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-expand-module-${mod.moduleId}`}
      >
        <ModIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium truncate">{mod.moduleName}</span>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {mod.totalAttempts > 0 && (
            <span className="text-xs text-muted-foreground">{mod.totalAttempts} attempt{mod.totalAttempts !== 1 ? "s" : ""}</span>
          )}
          {statusBadge}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && mod.attempts.length > 0 && (
        <div className="px-2.5 pb-2.5">
          <div className="rounded-md bg-muted/40 divide-y divide-border">
            <div className="grid grid-cols-5 gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <span>Attempt</span>
              <span>Result</span>
              <span>Major</span>
              <span>Minor</span>
              <span>Date</span>
            </div>
            {mod.attempts.map((attempt, idx) => (
              <div key={attempt.id} className="grid grid-cols-5 gap-2 px-3 py-2 text-sm items-center" data-testid={`attempt-row-${attempt.id}`}>
                <span className="text-muted-foreground">#{mod.attempts.length - idx}</span>
                <span>
                  {attempt.result === "pass" ? (
                    <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Pass</Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-destructive/10 text-destructive">Fail</Badge>
                  )}
                </span>
                <span className={attempt.majorCount > 0 ? "text-destructive font-medium" : "text-muted-foreground"}>
                  {attempt.majorCount > 0 && <ShieldAlert className="w-3 h-3 inline mr-0.5" />}
                  {attempt.majorCount}
                </span>
                <span className={attempt.minorCount > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}>
                  {attempt.minorCount > 0 && <Info className="w-3 h-3 inline mr-0.5" />}
                  {attempt.minorCount}
                </span>
                <span className="text-xs text-muted-foreground">
                  {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {expanded && mod.attempts.length === 0 && (
        <div className="px-2.5 pb-2.5">
          <p className="text-xs text-muted-foreground text-center py-3 bg-muted/40 rounded-md">No attempts yet</p>
        </div>
      )}
    </div>
  );
}

const inviteSchema = z.object({
  name: z.string().min(1, "Full name is required"),
  email: z.string().email("Please enter a valid email address"),
});

type InviteResult = {
  user: { id: string; name: string; email: string; role: string };
  emailSent: boolean;
  emailError?: string;
  tempPassword?: string;
};

function InviteNurseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const [result, setResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<z.infer<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: "", email: "" },
  });

  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof inviteSchema>) => {
      const res = await apiRequest("POST", "/api/admin/invite-nurse", values);
      return await res.json() as InviteResult;
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users-detail"] });
    },
    onError: (e: any) => {
      const msg = e.message || "";
      if (msg.includes("409")) {
        form.setError("email", { message: "An account with this email already exists" });
      } else {
        toast({ title: "Error", description: msg.replace(/^\d+:\s*/, "") || "Failed to create account", variant: "destructive" });
      }
    },
  });

  const handleClose = () => {
    form.reset();
    setResult(null);
    setCopied(false);
    onOpenChange(false);
  };

  const copyPassword = () => {
    if (result?.tempPassword) {
      navigator.clipboard.writeText(result.tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            Invite Nurse
          </DialogTitle>
          <DialogDescription>
            Create a nurse account and send an email invite with their login details.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Account created</p>
                <p className="text-xs text-muted-foreground">{result.user.name} &mdash; {result.user.email}</p>
              </div>
            </div>

            {result.emailSent ? (
              <div className="flex items-center gap-3 p-3 rounded-md bg-primary/5 border border-primary/20">
                <Mail className="w-5 h-5 text-primary shrink-0" />
                <p className="text-sm text-muted-foreground">Invite email sent successfully to <strong>{result.user.email}</strong>.</p>
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertDescription className="space-y-2">
                  <p className="font-medium">Email could not be sent</p>
                  <p className="text-xs">{result.emailError}</p>
                  {result.tempPassword && (
                    <div className="mt-2 p-2 rounded bg-background border flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Temporary password (share securely):</p>
                        <p className="font-mono font-bold text-sm mt-0.5">{result.tempPassword}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={copyPassword} data-testid="button-copy-password">
                        {copied ? <CheckCheck className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button onClick={handleClose} data-testid="button-invite-done">Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Sarah Johnson" data-testid="input-invite-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Address</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="sarah@example.nhs.uk" data-testid="input-invite-email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className="text-xs text-muted-foreground">
                A temporary password will be auto-generated and emailed to the nurse via your connected Outlook account.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending} data-testid="button-send-invite">
                  {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  <Mail className="w-4 h-4 mr-1" />
                  Send Invite
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsers() {
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const { data: users, isLoading } = useQuery<UserDetail[]>({
    queryKey: ["/api/admin/users-detail"],
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  const filteredUsers = users?.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  }) ?? [];

  const grouped = {
    admin: filteredUsers.filter((u) => u.role === "admin"),
    trainer: filteredUsers.filter((u) => u.role === "trainer"),
    nurse: filteredUsers.filter((u) => u.role === "nurse"),
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <InviteNurseDialog open={showInviteDialog} onOpenChange={setShowInviteDialog} />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-admin-users-title">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">View user details and training progress</p>
        </div>
        <Button onClick={() => setShowInviteDialog(true)} data-testid="button-invite-nurse">
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Nurse
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search users by name, email, or role..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-users"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(["admin", "trainer", "nurse"] as const).map((role) => {
          const rc = roleConfig[role];
          const Icon = rc.icon;
          const total = users?.filter((u) => u.role === role).length ?? 0;
          return (
            <Card key={role}>
              <CardContent className="p-4 text-center">
                <Icon className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-2xl font-bold">{total}</p>
                <p className="text-xs text-muted-foreground">{rc.label}s</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {(["nurse", "trainer", "admin"] as const).map((role) => {
        if (grouped[role].length === 0) return null;
        return (
          <div key={role} className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              {roleConfig[role].label}s ({grouped[role].length})
            </h2>
            {grouped[role].map((user) => {
              const rc = roleConfig[user.role];
              const initials = user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
              const isExpanded = expandedUserId === user.id;

              return (
                <Card key={user.id} data-testid={`card-user-${user.id}`}>
                  <CardContent className="p-3">
                    <button
                      className="w-full flex items-center gap-3 text-left flex-wrap"
                      onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                      data-testid={`button-expand-user-${user.id}`}
                    >
                      <Avatar className="w-9 h-9">
                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <Badge variant="secondary" className={rc.color}>{rc.label}</Badge>
                        {user.role === "nurse" && (
                          <span className="text-xs text-muted-foreground">{user.assignmentCount} modules</span>
                        )}
                        {user.role === "nurse" && (
                          isExpanded
                            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {isExpanded && user.role === "nurse" && (
                      <UserProgressPanel userId={user.id} />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );
      })}

      {filteredUsers.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">No users match your search</p>
      )}
    </div>
  );
}
