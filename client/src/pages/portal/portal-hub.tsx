import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
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
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

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

const journeyConfig = [
  {
    key: "preboard" as const,
    label: "Applicant Assessment",
    description: "Complete your initial assessment and screening",
    icon: ClipboardCheck,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    key: "onboard" as const,
    label: "Candidate Onboarding",
    description: "Complete orientation and compliance training",
    icon: ShieldCheck,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    key: "skillsArcade" as const,
    label: "Pre-Induction",
    description: "Demonstrate competency in required clinical skills",
    icon: Gamepad2,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
];

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
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="flex items-center gap-3">
            <img src="/images/livaware-logo-white.png" alt="Livaware" className="h-7 w-auto invert dark:invert-0" />
            <div className="h-6 w-px bg-border" />
            <p className="text-xs text-muted-foreground">Clinical Workforce Platform</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-10">
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

export default function PortalHub() {
  const [, params] = useRoute("/portal/:token");
  const token = params?.token;
  const [showIntro, setShowIntro] = useState<boolean | null>(null);

  const { data: portal, isLoading, error } = useQuery<PortalData>({
    queryKey: [`/api/portal/${token}`],
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (portal && showIntro === null) {
      setShowIntro(portal.firstVisit === true);
    }
  }, [portal, showIntro]);

  if (isLoading || (portal && showIntro === null)) {
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

  if (showIntro) {
    return (
      <WelcomeIntro
        nurseName={portal.nurse.fullName}
        onContinue={() => setShowIntro(false)}
      />
    );
  }

  const { nurse, journey } = portal;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="flex items-center gap-3 mb-1">
            <img src="/images/livaware-logo-white.png" alt="Livaware" className="h-7 w-auto invert dark:invert-0" />
            <div className="h-6 w-px bg-border" />
            <div>
              <p className="text-sm font-medium">Portal</p>
              <p className="text-xs text-muted-foreground">
                Onboarding Journey
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Welcome back,</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            {nurse.fullName}
          </h2>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Current stage:</span>
            <StatusBadge status={nurse.currentStage} isStage />
          </div>
        </div>

        {/* Journey Checklist */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Your Journey
          </h3>

          {journeyConfig.map((stage) => {
            const data = journey[stage.key];
            const isCompleted =
              data.status === "completed" ||
              data.status === "cleared" ||
              data.status === "competent";
            const isActive = data.status === "in_progress";
            const isLocked = data.status === "not_started" || data.status === "locked";
            const Icon = stage.icon;

            const preboardCompleted =
              journey.preboard.status === "completed" ||
              journey.preboard.status === "cleared" ||
              journey.preboard.status === "competent";

            const lockReason =
              isLocked && stage.key === "onboard" && !preboardCompleted
                ? "Complete Applicant Assessment first"
                : isLocked && stage.key === "skillsArcade" && !preboardCompleted
                  ? "Complete Applicant Assessment first"
                  : isLocked && stage.key === "skillsArcade"
                    ? "Complete Onboarding first"
                    : null;

            return (
              <Card
                key={stage.key}
                className={cn(
                  "transition-all",
                  isActive && "ring-1 ring-primary/30 border-primary/20",
                  isLocked && "opacity-60",
                )}
              >
                <CardContent className="flex items-center gap-4 py-5">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
                      isCompleted
                        ? "bg-emerald-500/10"
                        : isActive
                          ? stage.bgColor
                          : "bg-muted",
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : isLocked ? (
                      <Lock className="h-5 w-5 text-muted-foreground/50" />
                    ) : (
                      <Icon
                        className={cn(
                          "h-5 w-5",
                          isActive ? stage.color : "text-muted-foreground",
                        )}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn("text-sm font-medium", isLocked && "text-muted-foreground")}>{stage.label}</p>
                      {isLocked ? (
                        <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider bg-muted/50 text-muted-foreground/60 border-border/40">
                          Locked
                        </Badge>
                      ) : (
                        <StatusBadge status={data.status} />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lockReason || stage.description}
                    </p>
                  </div>

                  {data.actionUrl && isActive && (
                    <Link href={data.actionUrl}>
                      <Button size="sm" className="shrink-0">
                        {data.label || "Continue"}
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  )}

                  {isCompleted && (
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0"
                    >
                      Done
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-xs text-muted-foreground">
            Need help? Contact your administrator or supervisor.
          </p>
        </div>
      </div>
    </div>
  );
}
