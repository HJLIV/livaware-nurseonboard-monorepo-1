import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  agentName?: string;
  timestamp: string;
}

const journeyStages = [
  { key: "preboard", label: "Preboard", icon: ClipboardCheck },
  { key: "onboard", label: "Onboard", icon: ShieldCheck },
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
      toast({ title: "Stage advanced", description: `Nurse moved to ${data.currentStage.replace("_", " ")} stage.` });
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nurse Information</CardTitle>
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
            <StatusBadge status={nurse.currentStage} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Preboard</span>
            <StatusBadge status={nurse.preboardStatus} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Onboard</span>
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
                <Button size="icon" variant="ghost" onClick={handleCopy} className="shrink-0 h-8 w-8">
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

function OnboardTab({ nurseId }: { nurseId: string }) {
  const { data: steps, isLoading } = useQuery<OnboardStep[]>({
    queryKey: [`/api/nurses/${nurseId}/onboard`],
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!steps || steps.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <ShieldCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            No onboarding steps assigned yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
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
          {log.agentName && (
            <span className="text-xs text-muted-foreground shrink-0">
              by {log.agentName}
            </span>
          )}
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

export default function NurseDetail() {
  const [, params] = useRoute("/nurses/:id");
  const nurseId = params?.id || "";

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
            Nurse not found
          </p>
          <Link href="/nurses">
            <Button variant="ghost" className="mt-2">
              Back to Nurses
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">Nurse Profile</p>
            <div className="flex items-center gap-3">
              <h1 className="font-serif text-2xl font-light tracking-tight">
                {nurse.fullName}
              </h1>
              <StatusBadge status={nurse.currentStage} />
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

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="preboard">Preboard</TabsTrigger>
            <TabsTrigger value="onboard">Onboard</TabsTrigger>
            <TabsTrigger value="arcade">Skills Arcade</TabsTrigger>
            <TabsTrigger value="audit">Audit Trail</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab nurse={nurse} />
          </TabsContent>

          <TabsContent value="preboard" className="mt-6">
            <PreboardTab nurseId={nurseId} />
          </TabsContent>

          <TabsContent value="onboard" className="mt-6">
            <OnboardTab nurseId={nurseId} />
          </TabsContent>

          <TabsContent value="arcade" className="mt-6">
            <ArcadeTab nurseId={nurseId} />
          </TabsContent>

          <TabsContent value="audit" className="mt-6">
            <AuditTab nurseId={nurseId} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
