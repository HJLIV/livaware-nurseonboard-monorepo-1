import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  ClipboardCheck,
  ShieldCheck,
  Gamepad2,
  CheckCircle2,
  ArrowRight,
  User,
  Shield,
  Clock,
  Sparkles,
  BookOpenCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PortalShell,
  buildPortalGroups,
  normalizeStatus,
  ADDITIONAL_ONBOARDING_ITEMS,
  type PortalSidebarGroup,
} from "@/components/layout/portal-shell";
import ChaseUpload, { type ChaseStatusResponse } from "@/pages/portal/chase-upload";
import { PORTAL_STEPS } from "@shared/schema";

interface PortalData {
  nurse: {
    id: string;
    fullName: string;
    email: string;
    currentStage: string;
  };
  journey: {
    preboard: { status: string; actionUrl?: string; label: string };
    onboard: { status: string; actionUrl?: string; label: string };
    skillsArcade: { status: string; actionUrl?: string; label: string };
  };
  token: string;
  firstVisit?: boolean;
}

const introStages = [
  {
    number: 1,
    title: "Applicant Assessment",
    description: "Your first step. A short clinical and situational assessment so we can understand how you think and approach care. This helps us decide whether to move forward with your placement.",
    icon: ClipboardCheck,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    ringColor: "ring-blue-500/20",
    duration: "10 – 15 minutes",
  },
  {
    number: 2,
    title: "Candidate Onboarding",
    description: "Once you pass the assessment, we'll ask you to upload your professional documents — NMC PIN, DBS certificate, right-to-work evidence, training certificates, and references. Our AI-assisted verification speeds things up.",
    icon: ShieldCheck,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    ringColor: "ring-emerald-500/20",
    duration: "20 – 40 minutes",
  },
  {
    number: 3,
    title: "Pre-Induction",
    description: "Interactive clinical scenarios that assess your hands-on competency across key nursing skills — medication administration, wound care, IV therapy, and more.",
    icon: Gamepad2,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    ringColor: "ring-amber-500/20",
    duration: "30 – 60 minutes",
  },
];

function WelcomeIntro({ nurseName, onContinue }: { nurseName: string; onContinue: () => void }) {
  const firstName = nurseName.split(" ")[0];

  return (
    <div data-testid="portal-welcome-intro">
      <div className="mx-auto max-w-2xl py-2">
        <div className="text-center mb-10 animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 ring-1 ring-primary/20 mb-5">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h2 className="font-serif text-3xl font-light tracking-tight mb-3">
            Welcome, {firstName}
          </h2>
          <p className="text-muted-foreground leading-relaxed max-w-md mx-auto">
            Thank you for your interest in joining us. We'd like to start with a short assessment to understand how you approach clinical care. Here's what to expect.
          </p>
        </div>

        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 mb-4 text-center">
            Your journey in three stages
          </p>

          <div className="space-y-4">
            {introStages.map((stage, i) => {
              const Icon = stage.icon;
              return (
                <div
                  key={stage.number}
                  className="animate-fade-in-up"
                  style={{ animationDelay: `${(i + 1) * 100}ms` }}
                >
                  <Card className={`relative overflow-hidden ring-1 ${stage.ringColor} border-transparent`}>
                    <CardContent className="p-5">
                      <div className="flex gap-4">
                        <div className="flex flex-col items-center gap-2 shrink-0">
                          <div className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-xl",
                            stage.bgColor,
                          )}>
                            <Icon className={cn("h-5 w-5", stage.color)} />
                          </div>
                          <span className="text-[10px] font-bold text-muted-foreground/40 uppercase">
                            Stage {stage.number}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold mb-1">{stage.title}</h3>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {stage.description}
                          </p>
                          <div className="flex items-center gap-1.5 mt-2.5">
                            <Clock className="w-3 h-3 text-muted-foreground/50" />
                            <span className="text-[11px] text-muted-foreground/60 font-medium">
                              {stage.duration}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        </div>

        <Card className="bg-card/50 border-dashed animate-fade-in-up" style={{ animationDelay: "400ms" }}>
          <CardContent className="p-5">
            <div className="flex gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/8 shrink-0">
                <Shield className="w-4 h-4 text-primary/60" />
              </div>
              <div>
                <p className="text-xs font-semibold mb-0.5">Your data is safe</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  All information you provide is encrypted and stored securely. Documents are verified using AI-assisted checks, and only authorised staff can access your records.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center animate-fade-in-up" style={{ animationDelay: "500ms" }}>
          <Button size="lg" onClick={onContinue} className="gap-2 px-8 font-semibold">
            Begin Assessment
            <ArrowRight className="w-4 h-4" />
          </Button>
          <p className="text-[11px] text-muted-foreground mt-3">
            You can save your progress and return at any time using this link.
          </p>
        </div>

        <div className="mt-12 text-center">
          <p className="text-xs text-muted-foreground">
            Need help? Contact your administrator or supervisor.
          </p>
        </div>
      </div>
    </div>
  );
}

function OverviewPanel({
  portal,
  stepStatuses,
  onJumpToOnboarding,
}: {
  portal: PortalData;
  stepStatuses: Record<string, string>;
  onJumpToOnboarding: (stepKey?: string) => void;
}) {
  const { nurse, journey, token } = portal;

  const onboardCompleted = PORTAL_STEPS.filter(
    (s) => normalizeStatus(stepStatuses[s.key]) === "completed",
  ).length;
  const onboardAwaiting = PORTAL_STEPS.filter(
    (s) => normalizeStatus(stepStatuses[s.key]) === "awaiting_verification",
  ).length;
  const onboardTotal = PORTAL_STEPS.length + ADDITIONAL_ONBOARDING_ITEMS.length;

  const stages = [
    {
      key: "assessment",
      label: "Assessment",
      description: "Complete your initial clinical and situational assessment.",
      icon: ClipboardCheck,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
      status: journey.preboard.status,
      actionUrl: journey.preboard.actionUrl,
      actionLabel: journey.preboard.label,
      progress: undefined as string | undefined,
    },
    {
      key: "onboard",
      label: "Onboarding",
      description: "Identity, documents, training, references and personal declarations.",
      icon: ShieldCheck,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      status: journey.onboard.status,
      actionUrl: undefined,
      actionLabel: onboardCompleted > 0 ? "Continue" : "Start onboarding",
      progress: `${onboardCompleted} of ${onboardTotal} complete${onboardAwaiting > 0 ? ` · ${onboardAwaiting} awaiting verification` : ""}`,
    },
    {
      key: "compliance",
      label: "Compliance",
      description: "Policies, training documents, Livaware modules and the Clinical Skills Arcade.",
      icon: BookOpenCheck,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      status: journey.skillsArcade.status,
      actionUrl: journey.skillsArcade.actionUrl,
      actionLabel: "Open Skills Arcade",
      progress: "Policies, training documents and Livaware modules coming soon",
    },
  ];

  return (
    <div className="space-y-6" data-testid="portal-overview">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
          Welcome back
        </p>
        <h1 className="font-serif text-3xl font-light tracking-tight" data-testid="text-overview-name">
          {nurse.fullName}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Current stage:</span>
          <StatusBadge status={nurse.currentStage} isStage />
        </div>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
          Use the sidebar on the left to jump to any section. Anything still
          outstanding is pinned at the top of the menu so you always know where
          you left off.
        </p>
      </div>

      <div className="space-y-3">
        {stages.map((stage) => {
          const norm = normalizeStatus(stage.status);
          const isCompleted = norm === "completed";
          const isInProgress = norm === "in_progress" || norm === "awaiting_verification";
          const Icon = stage.icon;

          const handleAction = () => {
            if (stage.key === "onboard") {
              onJumpToOnboarding();
            } else if (stage.actionUrl) {
              window.location.href = stage.actionUrl;
            }
          };

          return (
            <Card
              key={stage.key}
              className={cn(
                "transition-all",
                isInProgress && "ring-1 ring-primary/20 border-primary/15",
              )}
              data-testid={`overview-stage-${stage.key}`}
            >
              <CardContent className="flex items-center gap-4 py-5">
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl shrink-0",
                    isCompleted ? "bg-emerald-500/10" : stage.bgColor,
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <Icon className={cn("h-5 w-5", stage.color)} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{stage.label}</p>
                    <StatusBadge status={stage.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {stage.progress || stage.description}
                  </p>
                </div>

                {isCompleted ? (
                  <Badge
                    variant="outline"
                    className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0"
                  >
                    Done
                  </Badge>
                ) : (
                  <Button size="sm" onClick={handleAction} className="shrink-0">
                    {stage.actionLabel}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}

      </div>
    </div>
  );
}

export default function PortalHub() {
  const [, params] = useRoute("/portal/:token");
  const [, navigate] = useLocation();
  const token = params?.token;
  const [showIntro, setShowIntro] = useState<boolean | null>(null);

  const { data: portal, isLoading, error } = useQuery<PortalData>({
    queryKey: [`/api/portal/${token}`],
    enabled: !!token,
    retry: false,
  });

  const { data: chaseStatus, isLoading: chaseLoading } = useQuery<ChaseStatusResponse>({
    queryKey: [`/api/portal/${token}/chase-status`],
    enabled: !!token,
    retry: false,
  });

  const { data: onboardingState } = useQuery<{ stepStatuses?: Record<string, string> } | null>({
    queryKey: ["/api/portal", token, "onboarding-state"],
    enabled: !!token && !!portal && !chaseStatus?.isChase,
  });

  useEffect(() => {
    if (portal && showIntro === null) {
      setShowIntro(portal.firstVisit === true);
    }
  }, [portal, showIntro]);

  const stepStatuses = (onboardingState?.stepStatuses as Record<string, string>) || {};

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal || !token) return [];
    return buildPortalGroups({
      token,
      journey: portal.journey,
      stepStatuses,
      selectOverview: () => navigate(`/portal/${token}`),
      selectOnboardingStep: (stepKey) =>
        navigate(`/portal/page/${token}?step=${stepKey}`),
    });
  }, [portal, token, stepStatuses, navigate]);

  if (isLoading || chaseLoading || (portal && showIntro === null)) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-64 mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !portal) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-6">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <span className="text-xl text-destructive">!</span>
            </div>
            <h2 className="text-lg font-semibold mb-2">Portal Not Found</h2>
            <p className="text-sm text-muted-foreground">
              This portal link is invalid or has expired. Please contact your
              administrator for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (chaseStatus?.isChase) {
    return <ChaseUpload token={token!} initialData={chaseStatus} />;
  }

  return (
    <PortalShell
      token={token!}
      candidateName={portal.nurse.fullName}
      groups={groups}
      activeKey="overview"
    >
      {showIntro ? (
        <WelcomeIntro
          nurseName={portal.nurse.fullName}
          onContinue={() => setShowIntro(false)}
        />
      ) : (
        <OverviewPanel
          portal={portal}
          stepStatuses={stepStatuses}
          onJumpToOnboarding={(stepKey) => {
            const target = stepKey
              ? `/portal/page/${token}?step=${stepKey}`
              : `/portal/page/${token}`;
            navigate(target);
          }}
        />
      )}
    </PortalShell>
  );
}
