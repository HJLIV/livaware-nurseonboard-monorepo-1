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
  gate?: {
    unlocked: boolean;
    mode: "auto" | "manual";
    prerequisites: { examinationCompleted: boolean; competencyDeclared: boolean; cvReviewed: boolean };
    lockedReason?: string | null;
  };
  // Task 114: induction-summary block (21 read-and-acknowledge items).
  induction?: { unlocked: boolean; total: number; outstanding: number };
  // Task 121: declaration completion summary used by hub progress.
  declarations?: { total: number; completed: number };
  token: string;
  firstVisit?: boolean;
}

const onboardingProcessSteps = [
  {
    number: 1,
    title: "Initial assessment & clinical competency questionnaire",
    description:
      "You'll start with a short timed clinical and situational assessment, followed by a competency self-rating across the core nursing domains. This helps us understand your strengths and tailor the rest of your journey.",
  },
  {
    number: 2,
    title: "CV & qualifications upload",
    description:
      "Upload your CV along with supporting qualification documents so our team can verify your credentials and education history. The portal walks you through each document we need.",
  },
  {
    number: 3,
    title: "Identity, right-to-work & background checks",
    description:
      "Next you'll add your passport or photo ID, verify your NMC PIN, complete your DBS check and confirm your Right to Work. Each step has clear guidance and links to the official services.",
  },
  {
    number: 4,
    title: "Mandatory training, references & policies",
    description:
      "You'll work through your CSTF mandatory training modules and nominate your professional references. Finally, you'll read and sign the policies required to work with us.",
  },
];

function WelcomeIntro({ onContinue }: { onContinue: () => void }) {
  return (
    <div data-testid="portal-welcome-intro">
      <div className="mx-auto max-w-2xl py-2">
        <div className="text-center mb-10 animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 ring-1 ring-primary/20 mb-5">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-3">
            Welcome
          </p>
          <h2 className="font-serif text-3xl font-light tracking-tight mb-4">
            Ensuring compliance by Livaware
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            As a leading provider in personal healthcare ecosystems, Livaware is committed to maintaining the highest standards of clinical excellence and compliance in the healthcare sector. We partner with Livaware Ltd to onboard and ensure initial compliance of staff to ensure only those with the most potential are provided to work in people's homes.
          </p>
        </div>

        <div className="mb-8 animate-fade-in-up" style={{ animationDelay: "100ms" }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 mb-4 text-center">
            Understanding our onboarding process
          </p>

          <div className="space-y-3">
            {onboardingProcessSteps.map((step, i) => (
              <div
                key={step.number}
                className="animate-fade-in-up"
                style={{ animationDelay: `${(i + 2) * 100}ms` }}
              >
                <Card className="relative overflow-hidden ring-1 ring-primary/15 border-transparent">
                  <CardContent className="p-5">
                    <div className="flex gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                        <span className="font-serif text-lg font-light text-primary">
                          {step.number}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold mb-1">{step.title}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5 mb-8 animate-fade-in-up" style={{ animationDelay: "600ms" }}>
          <div>
            <h3 className="font-serif text-xl font-light tracking-tight mb-2">
              What to expect after onboarding
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              Upon completion of the onboarding process, you will be fully equipped to become a Livaware. As a verified member, you'll have the opportunity to work directly with a variety of clients, ranging from individual end-users to larger institutions needing professional healthcare services.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              At Livaware, we also recognise and reward excellence. Top performers will have the opportunity to engage in special assignments and projects in collaboration with Livaware, further enhancing your career trajectory and exposure in the healthcare industry.
            </p>
          </div>

          <div>
            <h3 className="font-serif text-xl font-light tracking-tight mb-2">
              Commitment to your growth
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We believe in nurturing the potential of our associates. Through continuous education, performance feedback, and career development opportunities, we aim to help you grow professionally and personally.
            </p>
          </div>

          <div>
            <h3 className="font-serif text-xl font-light tracking-tight mb-2">
              Good luck!
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              We hope to have you join us and contribute to an ecosystem built on integrity, expertise, and compassion. Together, we will advance the standards of healthcare and make a significant impact on the lives of those we serve.
            </p>
          </div>
        </div>

        <Card className="bg-card/50 border-dashed animate-fade-in-up" style={{ animationDelay: "700ms" }}>
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

        <div className="mt-8 text-center animate-fade-in-up" style={{ animationDelay: "800ms" }}>
          <Button size="lg" onClick={onContinue} className="gap-2 px-8 font-semibold">
            Continue
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
  policiesSummary,
  onOpenPolicies,
}: {
  portal: PortalData;
  stepStatuses: Record<string, string>;
  onJumpToOnboarding: (stepKey?: string) => void;
  policiesSummary: { totalRequired: number; outstanding: number } | null;
  onOpenPolicies: () => void;
}) {
  const { nurse, journey, token } = portal;

  const onboardStepsCompleted = PORTAL_STEPS.filter(
    (s) => normalizeStatus(stepStatuses[s.key]) === "completed",
  ).length;
  const onboardAwaiting = PORTAL_STEPS.filter(
    (s) => normalizeStatus(stepStatuses[s.key]) === "awaiting_verification",
  ).length;
  // Task 121: declaration completion now contributes to onboarding progress.
  const declarationsCompleted = portal.declarations?.completed ?? 0;
  const onboardCompleted = onboardStepsCompleted + declarationsCompleted;
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
      label: "Policies & attestations",
      description: "Read and acknowledge the policies that form part of your compliance file.",
      icon: BookOpenCheck,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      status: policiesSummary
        ? policiesSummary.totalRequired === 0
          ? "not_started"
          : policiesSummary.outstanding === 0
            ? "completed"
            : "in_progress"
        : "not_started",
      actionUrl: undefined,
      actionLabel: policiesSummary && policiesSummary.outstanding > 0 ? "Review & sign" : "Open policies",
      progress: policiesSummary
        ? policiesSummary.totalRequired === 0
          ? "No policies to acknowledge yet"
          : policiesSummary.outstanding === 0
            ? `All ${policiesSummary.totalRequired} policies acknowledged`
            : `${policiesSummary.outstanding} of ${policiesSummary.totalRequired} outstanding`
        : "Loading…",
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
            } else if (stage.key === "compliance") {
              onOpenPolicies();
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
  // /portal (no token) uses cookie-based session auth via the "me" sentinel.
  const token = params?.token || "me";

  const [showIntro, setShowIntro] = useState<boolean | null>(null);
  const isBootstrapToken = !!params?.token && params.token !== "me" && params.token !== "session";

  const { data: portal, isLoading, error } = useQuery<PortalData>({
    queryKey: [`/api/portal/${token}`],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/portal/${token}`, { credentials: "include" });
      if (res.status === 410 || res.status === 401) {
        const body = await res.json().catch(() => ({} as any));
        const dest = body?.redirect || "/portal/sign-in";
        const qs = body?.email ? `?email=${encodeURIComponent(body.email)}` : "";
        navigate(`${dest}${qs}`);
        throw new Error(body?.message || "Sign-in required");
      }
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
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

  // Live policies summary so the sidebar item shows accurate progress and
  // the Compliance overview row reflects what's still outstanding.
  const stageUnlocked = portal?.gate?.stageCompleted !== false;
  const { data: policiesData } = useQuery<{
    policies: Array<unknown>;
    totalRequired: number;
    outstanding: number;
  }>({
    queryKey: [`/api/portal/${token}/policies`],
    enabled: !!token && !!portal && !chaseStatus?.isChase && stageUnlocked,
  });

  useEffect(() => {
    if (portal && showIntro === null) {
      // Show the Livaware compliance welcome to every active nurse the
      // first time they land here after this copy was rolled out, not
      // just brand-new portal links. We key the "seen" flag by token +
      // copy version so each nurse sees it once and won't see it again
      // after they click Continue.
      const seenKey = `portal-intro-seen:v3:${token}`;
      let alreadySeen = false;
      try {
        alreadySeen = window.localStorage.getItem(seenKey) === "1";
      } catch {
        alreadySeen = false;
      }
      setShowIntro(!alreadySeen);
    }
  }, [portal, showIntro, token]);

  const dismissIntro = () => {
    try {
      window.localStorage.setItem(`portal-intro-seen:v3:${token}`, "1");
    } catch {
      // ignore — storage may be unavailable (private mode, etc.)
    }
    setShowIntro(false);
  };

  const stepStatuses = (onboardingState?.stepStatuses as Record<string, string>) || {};

  const { data: sopComprehensionData } = useQuery<{ totalRequired: number; outstanding: number }>({
    queryKey: [`/api/portal/${token}/sop-comprehension`],
    enabled: !!token && stageUnlocked,
  });

  const { data: declarationsData } = useQuery<{
    items: { key: string; title: string; status: "not_started" | "draft" | "submitted" | "reopened" }[];
    total: number; completed: number; outstanding: number;
  }>({
    queryKey: [`/api/portal/${token}/declarations`],
    enabled: !!token,
  });

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal || !token) return [];
    return buildPortalGroups({
      token,
      journey: portal.journey,
      stepStatuses,
      gate: portal.gate ?? null,
      // Cookie-based navigation — no token in the URL.
      selectOverview: () => navigate(`/portal`),
      selectOnboardingStep: (stepKey) =>
        navigate(`/portal/page?step=${stepKey}`),
      selectCompetency: () =>
        navigate(`/portal/page?step=competency`),
      selectCvUpload: () =>
        navigate(`/portal/page?step=profile`),
      policiesSummary: policiesData
        ? { totalRequired: policiesData.totalRequired, outstanding: policiesData.outstanding }
        : null,
      selectPolicies: () => navigate(`/portal/policies`),
      inductionSummary: portal.induction
        ? {
            total: portal.induction.total,
            outstanding: portal.induction.outstanding,
            unlocked: portal.induction.unlocked,
          }
        : null,
      selectInduction: () => navigate(`/portal/induction`),
      sopComprehensionSummary: sopComprehensionData
        ? { totalRequired: sopComprehensionData.totalRequired, outstanding: sopComprehensionData.outstanding }
        : null,
      selectSopComprehension: () => navigate(`/portal/sop-comprehension`),
      declarationsSummary: declarationsData ?? null,
      selectDeclaration: (key) => navigate(`/portal/declaration/${key}`),
    });
  }, [portal, token, stepStatuses, navigate, policiesData, sopComprehensionData, declarationsData]);

  // After the bootstrap fetch lands (cookie now set), normalize the URL to
  // /portal so the original token never lingers in the address bar / history.
  useEffect(() => {
    if (portal && isBootstrapToken) navigate("/portal", { replace: true });
  }, [portal, isBootstrapToken, navigate]);

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
        <WelcomeIntro onContinue={dismissIntro} />
      ) : (
        <OverviewPanel
          portal={{
            ...portal,
            declarations: declarationsData
              ? { total: declarationsData.total, completed: declarationsData.completed }
              : portal.declarations,
          }}
          stepStatuses={stepStatuses}
          onJumpToOnboarding={(stepKey) => {
            const target = stepKey
              ? `/portal/page?step=${stepKey}`
              : `/portal/page`;
            navigate(target);
          }}
          policiesSummary={policiesData
            ? { totalRequired: policiesData.totalRequired, outstanding: policiesData.outstanding }
            : null}
          onOpenPolicies={() => navigate(`/portal/policies`)}
        />
      )}
    </PortalShell>
  );
}
