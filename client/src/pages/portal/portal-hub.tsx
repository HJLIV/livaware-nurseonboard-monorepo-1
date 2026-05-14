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
  GraduationCap,
  Lock,
  Compass,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
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
    complianceApproved?: boolean;
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

// ─── Journey-first home ─────────────────────────────────────────────────
//
// Walks the live `groups` from buildPortalGroups so that locked / done
// states reflect the same gating rules the rest of the portal uses.
// Items with status "locked" never count as outstanding here, so we
// can't tease the user with a count for a section they cannot open.

const STAGE_ORDER: {
  groupKey: string;
  view: "assessment" | "compliance" | "induction" | "training";
  label: string;
  icon: typeof ClipboardCheck;
  blurb: string;
}[] = [
  { groupKey: "assessment", view: "assessment", label: "Assessment", icon: ClipboardCheck, blurb: "Clinical exam, competency, CV" },
  { groupKey: "onboarding", view: "compliance", label: "Compliance", icon: ShieldCheck, blurb: "Identity, RTW, references, declarations" },
  { groupKey: "induction", view: "induction", label: "Induction", icon: BookOpenCheck, blurb: "Handbook, policies, SOP quizzes" },
  { groupKey: "training", view: "training", label: "Training", icon: GraduationCap, blurb: "Mandatory training & Skills Arcade" },
];

function JourneyHome({
  portal,
  groups,
  chaseModules,
  onJump,
  onOpenChase,
}: {
  portal: PortalData;
  groups: PortalSidebarGroup[];
  chaseModules: { label: string; status: "red" | "amber" | "green" }[];
  onJump: (view: "assessment" | "compliance" | "induction" | "training") => void;
  onOpenChase: () => void;
}) {
  const { nurse, gate } = portal;
  const isAssessmentLocked = gate ? !gate.unlocked : false;
  const isStageLocked = gate?.complianceApproved === false;
  // Treat the user as "fresh" when nothing has been touched yet — no
  // assessment prereq met, and no stage status moved off "pending".
  const isFresh =
    isAssessmentLocked &&
    !!gate &&
    !gate.prerequisites.examinationCompleted &&
    !gate.prerequisites.competencyDeclared &&
    !gate.prerequisites.cvReviewed;

  const progress = STAGE_ORDER.map((s) => {
    const g = groups.find((x) => x.key === s.groupKey);
    const items = (g?.items ?? []).filter((i) => i.status !== "coming_soon");
    const done = items.filter((i) => i.status === "completed").length;
    const total = items.length;
    const allLocked = total > 0 && items.every((i) => i.status === "locked");
    const allDone = total > 0 && done === total;
    return { ...s, done, total, allLocked, allDone };
  });

  // First actionable item across stages (skips locked / completed / coming_soon).
  let nextAction:
    | { sectionLabel: string; view: typeof STAGE_ORDER[number]["view"]; itemLabel: string; icon: typeof ClipboardCheck }
    | null = null;
  for (const s of STAGE_ORDER) {
    const g = groups.find((x) => x.key === s.groupKey);
    const item = g?.items.find(
      (i) => i.status !== "completed" && i.status !== "locked" && i.status !== "coming_soon",
    );
    if (item) {
      nextAction = { sectionLabel: s.label, view: s.view, itemLabel: item.label, icon: s.icon };
      break;
    }
  }

  // To-do glance: explicit, item-level outstanding work the user can
  // actually act on right now. Locked items are excluded so we never
  // advertise a count for something the user can't open.
  const todo = STAGE_ORDER.flatMap((s) => {
    const g = groups.find((x) => x.key === s.groupKey);
    const items = (g?.items ?? []).filter(
      (i) => i.status !== "completed" && i.status !== "locked" && i.status !== "coming_soon",
    );
    return items.map((i) => ({
      sectionKey: s.view,
      sectionLabel: s.label,
      icon: s.icon,
      itemLabel: i.label,
      hint: i.hint,
    }));
  });
  const outstandingChase = chaseModules.filter((m) => !["green"].includes(m.status));

  const firstName = nurse.fullName.split(" ")[0] || nurse.fullName;

  return (
    <div className="space-y-6 max-w-3xl" data-testid="portal-overview">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
          Welcome{isFresh ? "" : " back"}
        </p>
        <h1 className="font-serif text-3xl font-light tracking-tight" data-testid="text-overview-name">
          Hello, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {isFresh
            ? "Welcome to your Livaware nurse portal. Here's what your onboarding looks like — we'll walk you through it step by step."
            : "Here's where you are in your onboarding — pick up where you left off."}
        </p>
      </div>

      {isFresh && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/0" data-testid="portal-home-walkthrough">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start gap-3 mb-4">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/15 text-primary shrink-0">
                <Compass className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-primary/80 mb-1">How it works</p>
                <h2 className="font-serif text-xl font-light tracking-tight">Your onboarding in four steps</h2>
              </div>
            </div>
            <ol className="space-y-3">
              {STAGE_ORDER.map((s, idx) => {
                const Icon = s.icon;
                return (
                  <li key={s.view} className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/15 text-primary text-[11px] font-semibold shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-primary/70" />
                        <p className="text-sm font-medium">{s.label}</p>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                        {s.blurb}
                        {idx > 0 && (
                          <span className="text-muted-foreground/60">
                            {" "}· unlocks once you've finished {STAGE_ORDER[idx - 1].label}
                          </span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-muted-foreground/80 mt-4 pt-4 border-t border-border leading-relaxed">
              You can stop and come back at any time — your progress is saved automatically.
            </p>
          </CardContent>
        </Card>
      )}

      {(isAssessmentLocked || isStageLocked) && !isFresh && (
        <Card className="border-amber-500/30 bg-amber-500/5" data-testid="portal-home-locked-explainer">
          <CardContent className="p-4 flex items-start gap-3">
            <Lock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium mb-1">
                {isAssessmentLocked
                  ? "Compliance, Induction & Training are locked while you finish Assessment"
                  : "Induction & Training open after compliance approval"}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {isAssessmentLocked
                  ? "Submit your clinical examination, complete your competency self-rating, and upload your CV — the rest of the portal opens automatically."
                  : "Once an admin signs off your compliance pack, your handbook, policies, SOP quizzes and Skills Arcade will all become available."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {nextAction ? (
        <Card className="border-primary/20 bg-primary/5" data-testid="portal-home-next-action">
          <CardContent className="p-5 sm:p-6 flex items-start gap-4">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary/15 text-primary shrink-0">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-primary/80 mb-1">
                {isFresh ? "Start here" : "Next up"} · {nextAction.sectionLabel}
              </p>
              <h2 className="font-serif text-xl font-light tracking-tight mb-1">{nextAction.itemLabel}</h2>
              <p className="text-sm text-muted-foreground">A few minutes is usually enough.</p>
            </div>
            <Button onClick={() => onJump(nextAction!.view)} className="shrink-0 mt-1">
              {isFresh ? "Begin" : "Continue"}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-6 flex items-center gap-4">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
            <div>
              <h2 className="font-serif text-xl font-light tracking-tight mb-1">You're all caught up</h2>
              <p className="text-sm text-muted-foreground">Everything we need is in. Thank you!</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div data-testid="portal-home-stages">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-3">Your journey</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {progress.map((p) => {
            const Icon = p.icon;
            const pct = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100);
            const locked = p.allLocked && !p.allDone;
            return (
              <button
                key={p.view}
                type="button"
                onClick={() => !locked && onJump(p.view)}
                disabled={locked}
                className={cn(
                  "text-left rounded-lg border p-4 transition-colors",
                  p.allDone
                    ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
                    : locked
                      ? "border-border bg-muted/40 opacity-80 cursor-not-allowed"
                      : "border-border bg-card hover:bg-secondary/40",
                )}
                data-testid={`portal-home-stage-${p.view}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      p.allDone ? "text-emerald-500" : locked ? "text-muted-foreground/50" : "text-primary/80",
                    )}
                  />
                  <span className="text-sm font-medium">{p.label}</span>
                  {p.allDone && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-auto" />}
                  {locked && <Lock className="h-3 w-3 text-muted-foreground/50 ml-auto" />}
                </div>
                <Progress value={pct} className={cn("h-1.5 mb-1.5", p.allDone && "[&>div]:bg-emerald-500")} />
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {locked ? "Locked" : `${p.done} of ${p.total} done`}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {outstandingChase.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5" data-testid="portal-home-chase">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start gap-3 mb-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 shrink-0">
                <ArrowRight className="h-5 w-5" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-[0.16em] text-amber-700/80 dark:text-amber-400/80 mb-1">
                  Documents requested
                </p>
                <h2 className="font-serif text-xl font-light tracking-tight">
                  {outstandingChase.length} training {outstandingChase.length === 1 ? "certificate" : "certificates"} to upload
                </h2>
              </div>
              <Button onClick={onOpenChase} size="sm" className="shrink-0">
                Upload now
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 ml-13 pl-0.5">
              {outstandingChase.slice(0, 5).map((m) => (
                <li key={m.label}>· {m.label}</li>
              ))}
              {outstandingChase.length > 5 && (
                <li className="text-muted-foreground/70">+ {outstandingChase.length - 5} more</li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}

      {todo.length > 0 && !isFresh && (
        <div data-testid="portal-home-todo">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-3">To do at a glance</p>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
            {todo.slice(0, 8).map((r, idx) => {
              const Icon = r.icon;
              return (
                <li key={`${r.sectionKey}-${idx}`}>
                  <button
                    type="button"
                    onClick={() => onJump(r.sectionKey)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
                    data-testid={`portal-home-todo-item-${idx}`}
                  >
                    <Icon className="h-4 w-4 text-primary/70 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-tight">{r.itemLabel}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {r.sectionLabel}
                        {r.hint ? ` · ${r.hint}` : ""}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
          {todo.length > 8 && (
            <p className="text-[11px] text-muted-foreground/70 mt-2 text-center">
              + {todo.length - 8} more across your sections
            </p>
          )}
        </div>
      )}
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
  const stageUnlocked = portal?.gate?.complianceApproved !== false;
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
      availabilityEnabled: portal.nurse.currentStage === "completed",
      selectAvailability: () => navigate(`/portal/availability`),
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
        <JourneyHome
          portal={portal}
          groups={groups}
          chaseModules={
            (chaseStatus?.modules ?? []).map((m) => ({ label: m.label, status: m.status }))
          }
          onJump={(view) => navigate(`/portal/section/${view}`)}
          onOpenChase={() => navigate(`/portal/${token}`)}
        />
      )}
    </PortalShell>
  );
}
