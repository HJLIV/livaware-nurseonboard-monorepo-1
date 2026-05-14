// Static, no-auth mockup of the redesigned nurse portal (task #126).
//
// Lets you click through Home / Assessment / Compliance / Induction /
// Training / Roster on desktop (slim left rail) and mobile (bottom tab
// bar) using hardcoded data — no portal token, no API calls. Toggle the
// "scenario" dropdown at the top to preview different gate states.

import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  PortalShell,
  PortalSectionChecklist,
  buildPortalGroups,
  type PortalSidebarGroup,
} from "@/components/layout/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ShieldCheck,
  BookOpenCheck,
  GraduationCap,
  CalendarDays,
  Lock,
  Sparkles,
  AlertCircle,
  Compass,
} from "lucide-react";

type Scenario = "fresh" | "in_progress" | "locked" | "completed";

const SCENARIOS: { key: Scenario; label: string; blurb: string }[] = [
  { key: "fresh", label: "Fresh applicant", blurb: "Just received their portal link" },
  { key: "in_progress", label: "Mid-onboarding", blurb: "Assessment done, working on compliance" },
  { key: "locked", label: "Compliance locked", blurb: "Hasn't finished assessment yet" },
  { key: "completed", label: "Active nurse", blurb: "Stage = completed (rostering visible)" },
];

interface MockState {
  stepStatuses: Record<string, string>;
  journey: {
    preboard: { status: string; label: string };
    onboard: { status: string; label: string };
    skillsArcade: { status: string; label: string };
  };
  gate: {
    unlocked: boolean;
    mode: "auto" | "manual";
    stageCompleted?: boolean;
    complianceApproved?: boolean;
    prerequisites: { examinationCompleted: boolean; competencyDeclared: boolean; cvReviewed: boolean };
  };
  induction: { unlocked: boolean; total: number; outstanding: number };
  declarations: {
    items: { key: string; title: string; status: "not_started" | "draft" | "submitted" | "reopened" }[];
  };
  policies: { totalRequired: number; outstanding: number };
  sop: { totalRequired: number; outstanding: number };
  isCompleted: boolean;
  isFresh: boolean;
  candidateName: string;
}

function buildMock(scenario: Scenario): MockState {
  const completed = (n: string) => ({ status: "completed", label: n });
  const inProgress = (n: string) => ({ status: "in_progress", label: n });
  const pending = (n: string) => ({ status: "pending", label: n });

  if (scenario === "fresh") {
    return {
      candidateName: "Amaka Obi",
      stepStatuses: {},
      journey: {
        preboard: pending("Clinical examination"),
        onboard: pending("Compliance pack"),
        skillsArcade: pending("Skills Arcade"),
      },
      gate: {
        unlocked: false,
        mode: "auto",
        stageCompleted: false,
        complianceApproved: false,
        prerequisites: { examinationCompleted: false, competencyDeclared: false, cvReviewed: false },
      },
      induction: { unlocked: false, total: 21, outstanding: 21 },
      declarations: { items: [] },
      policies: { totalRequired: 8, outstanding: 8 },
      sop: { totalRequired: 6, outstanding: 6 },
      isCompleted: false,
      isFresh: true,
    };
  }
  if (scenario === "locked") {
    return {
      candidateName: "Sarah Hughes",
      stepStatuses: {},
      journey: {
        preboard: inProgress("Clinical examination"),
        onboard: pending("Compliance pack"),
        skillsArcade: pending("Skills Arcade"),
      },
      gate: {
        unlocked: false,
        mode: "auto",
        stageCompleted: false,
        complianceApproved: false,
        prerequisites: { examinationCompleted: true, competencyDeclared: false, cvReviewed: false },
      },
      induction: { unlocked: false, total: 21, outstanding: 21 },
      declarations: { items: [] },
      policies: { totalRequired: 8, outstanding: 8 },
      sop: { totalRequired: 6, outstanding: 6 },
      isCompleted: false,
      isFresh: false,
    };
  }
  if (scenario === "completed") {
    return {
      candidateName: "Priya Patel",
      stepStatuses: {
        identity: "completed",
        right_to_work: "completed",
        nmc_pin: "completed",
        dbs: "completed",
        health: "completed",
        references: "completed",
        documents: "completed",
        training: "completed",
        equal_opportunities: "completed",
        competency: "completed",
      },
      journey: {
        preboard: completed("Clinical examination"),
        onboard: completed("Compliance pack"),
        skillsArcade: completed("Skills Arcade"),
      },
      gate: {
        unlocked: true,
        mode: "auto",
        stageCompleted: true,
        complianceApproved: true,
        prerequisites: { examinationCompleted: true, competencyDeclared: true, cvReviewed: true },
      },
      induction: { unlocked: true, total: 21, outstanding: 0 },
      declarations: {
        items: [
          { key: "rehab_of_offenders", title: "Rehabilitation of Offenders", status: "submitted" },
          { key: "occupational_health", title: "Occupational Health", status: "submitted" },
          { key: "epp_declaration", title: "EPP", status: "submitted" },
          { key: "working_time_directive", title: "EWTD", status: "submitted" },
          { key: "data_protection", title: "Data Protection", status: "submitted" },
          { key: "age_and_eligibility", title: "Age & Eligibility", status: "submitted" },
        ],
      },
      policies: { totalRequired: 8, outstanding: 0 },
      sop: { totalRequired: 6, outstanding: 0 },
      isCompleted: true,
      isFresh: false,
    };
  }
  // in_progress
  return {
    candidateName: "Joana Pereira",
    stepStatuses: {
      identity: "completed",
      right_to_work: "completed",
      nmc_pin: "in_progress",
      dbs: "pending",
      health: "in_progress",
      references: "pending",
      documents: "in_progress",
      training: "in_progress",
      equal_opportunities: "completed",
      competency: "completed",
    },
    journey: {
      preboard: completed("Clinical examination"),
      onboard: inProgress("Compliance pack"),
      skillsArcade: pending("Skills Arcade"),
    },
    gate: {
      unlocked: true,
      mode: "auto",
      stageCompleted: false,
      complianceApproved: false,
      prerequisites: { examinationCompleted: true, competencyDeclared: true, cvReviewed: true },
    },
    induction: { unlocked: false, total: 21, outstanding: 14 },
    declarations: {
      items: [
        { key: "rehab_of_offenders", title: "Rehabilitation of Offenders", status: "submitted" },
        { key: "occupational_health", title: "Occupational Health", status: "draft" },
        { key: "epp_declaration", title: "EPP", status: "not_started" },
        { key: "working_time_directive", title: "EWTD", status: "submitted" },
        { key: "data_protection", title: "Data Protection", status: "submitted" },
        { key: "age_and_eligibility", title: "Age & Eligibility", status: "submitted" },
      ],
    },
    policies: { totalRequired: 8, outstanding: 5 },
    sop: { totalRequired: 6, outstanding: 4 },
    isCompleted: false,
    isFresh: false,
  };
}

type View = "home" | "assessment" | "compliance" | "induction" | "training" | "roster";

const KEY_FROM_VIEW: Record<View, string> = {
  home: "overview",
  assessment: "assessment",
  compliance: "compliance",
  induction: "induction",
  training: "training",
  roster: "roster",
};

export default function PortalMockupPage() {
  const [scenario, setScenario] = useState<Scenario>("in_progress");
  const [view, setView] = useState<View>("home");
  const mock = useMemo(() => buildMock(scenario), [scenario]);

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    return buildPortalGroups({
      token: "mock",
      journey: {
        preboard: { ...mock.journey.preboard, actionUrl: "#" },
        onboard: { ...mock.journey.onboard, actionUrl: "#" },
        skillsArcade: { ...mock.journey.skillsArcade, actionUrl: "#" },
      },
      stepStatuses: mock.stepStatuses,
      gate: mock.gate,
      availabilityEnabled: mock.isCompleted,
      selectAvailability: () => setView("roster"),
      selectOverview: () => setView("home"),
      selectOnboardingStep: () => setView("compliance"),
      selectCompetency: () => setView("assessment"),
      selectCvUpload: () => setView("assessment"),
      policiesSummary: mock.policies,
      selectPolicies: () => setView("induction"),
      inductionSummary: mock.induction,
      selectInduction: () => setView("induction"),
      sopComprehensionSummary: mock.sop,
      selectSopComprehension: () => setView("induction"),
      declarationsSummary: mock.declarations,
      selectDeclaration: () => setView("compliance"),
    });
  }, [mock]);

  const activeKey = KEY_FROM_VIEW[view];

  return (
    <>
      {/* Scenario bar (mockup-only, sits above the shell). */}
      <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
          Mockup
        </span>
        <span className="text-muted-foreground">Scenario:</span>
        <select
          value={scenario}
          onChange={(e) => {
            setScenario(e.target.value as Scenario);
            setView("home");
          }}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
          data-testid="mockup-scenario-select"
        >
          {SCENARIOS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label} — {s.blurb}
            </option>
          ))}
        </select>
        <span className="ml-auto text-muted-foreground hidden sm:inline">
          Static — no API calls.{" "}
          <Link href="/portal" className="underline">
            Back to live portal
          </Link>
        </span>
      </div>

      <PortalShell
        token="mock"
        candidateName={mock.candidateName}
        groups={groups}
        activeKey={activeKey}
        onItemSelect={(item) => {
          if (item.key === "overview") setView("home");
          else if (item.key.startsWith("assessment:")) setView("assessment");
          else if (item.key.startsWith("onboard:")) setView("compliance");
          else if (item.key.startsWith("induction:")) setView("induction");
          else if (item.key.startsWith("training:")) setView("training");
          else if (item.key.startsWith("rostering:")) setView("roster");
        }}
      >
        {view === "home" && <HomeView mock={mock} groups={groups} onJump={setView} />}
        {view !== "home" && (
          <SectionView view={view} groups={groups} mock={mock} />
        )}
      </PortalShell>
    </>
  );
}

// ─── Stage definitions ──────────────────────────────────────────────────

const STAGE_ORDER: { groupKey: string; view: Exclude<View, "home" | "roster">; label: string; icon: typeof ClipboardCheck; blurb: string }[] = [
  {
    groupKey: "assessment",
    view: "assessment",
    label: "Assessment",
    icon: ClipboardCheck,
    blurb: "Clinical exam, competency, CV",
  },
  {
    groupKey: "onboarding",
    view: "compliance",
    label: "Compliance",
    icon: ShieldCheck,
    blurb: "Identity, RTW, references, declarations",
  },
  {
    groupKey: "induction",
    view: "induction",
    label: "Induction",
    icon: BookOpenCheck,
    blurb: "Handbook, policies, SOP quizzes",
  },
  {
    groupKey: "training",
    view: "training",
    label: "Training",
    icon: GraduationCap,
    blurb: "Mandatory training & Skills Arcade",
  },
];

// ─── Home (Overview) ────────────────────────────────────────────────────

function HomeView({
  mock,
  groups,
  onJump,
}: {
  mock: MockState;
  groups: PortalSidebarGroup[];
  onJump: (v: View) => void;
}) {
  const isLocked = !mock.gate.unlocked;
  const stageLocked = mock.gate.complianceApproved === false;

  // Per-section progress for the stage stepper.
  const progress = STAGE_ORDER.map((s) => {
    const g = groups.find((x) => x.key === s.groupKey);
    const items = g?.items.filter((i) => i.status !== "coming_soon") ?? [];
    const done = items.filter((i) => i.status === "completed").length;
    const total = items.length;
    const allLocked = items.length > 0 && items.every((i) => i.status === "locked");
    return { ...s, done, total, allLocked, allDone: total > 0 && done === total };
  });

  // Compute next action: first non-completed/non-locked item across stages
  let nextAction:
    | { sectionLabel: string; view: View; itemLabel: string; icon: typeof ClipboardCheck }
    | null = null;
  for (const s of STAGE_ORDER) {
    const g = groups.find((x) => x.key === s.groupKey);
    const item = g?.items.find(
      (i) =>
        i.status !== "completed" &&
        i.status !== "locked" &&
        i.status !== "coming_soon",
    );
    if (item) {
      nextAction = { sectionLabel: s.label, view: s.view, itemLabel: item.label, icon: s.icon };
      break;
    }
  }

  const todo = STAGE_ORDER.map((s) => {
    const g = groups.find((x) => x.key === s.groupKey);
    const outstanding = (g?.items ?? []).filter(
      (i) => i.status !== "completed" && i.status !== "locked" && i.status !== "coming_soon",
    ).length;
    return { ...s, outstanding };
  }).filter((r) => r.outstanding > 0);

  return (
    <div className="space-y-6 max-w-3xl" data-testid="portal-home">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
          Welcome{mock.isFresh ? "" : " back"}
        </p>
        <h1 className="font-serif text-3xl font-light tracking-tight">
          Hello, {mock.candidateName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {mock.isFresh
            ? "Welcome to your Livaware nurse portal. Here's what your onboarding looks like — we'll walk you through it step by step."
            : "Here's where you are in your onboarding — pick up where you left off."}
        </p>
      </div>

      {/* Walkthrough — fresh applicants only */}
      {mock.isFresh && (
        <Card
          className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/0"
          data-testid="portal-home-walkthrough"
        >
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start gap-3 mb-4">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/15 text-primary shrink-0">
                <Compass className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-primary/80 mb-1">
                  How it works
                </p>
                <h2 className="font-serif text-xl font-light tracking-tight">
                  Your onboarding in four steps
                </h2>
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
              You can stop and come back at any time — your progress is saved
              automatically. Ready when you are.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Next-action hero */}
      {nextAction ? (
        <Card className="border-primary/20 bg-primary/5" data-testid="portal-home-next-action">
          <CardContent className="p-5 sm:p-6 flex items-start gap-4">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary/15 text-primary shrink-0">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-[0.16em] text-primary/80 mb-1">
                {mock.isFresh ? "Start here" : "Next up"} · {nextAction.sectionLabel}
              </p>
              <h2 className="font-serif text-xl font-light tracking-tight mb-1">
                {nextAction.itemLabel}
              </h2>
              <p className="text-sm text-muted-foreground">
                {mock.isFresh
                  ? "This is your first step. A few minutes is usually enough."
                  : "A few minutes is usually enough."}
              </p>
            </div>
            <Button onClick={() => onJump(nextAction!.view)} className="shrink-0 mt-1">
              {mock.isFresh ? "Begin" : "Continue"}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-6 flex items-center gap-4">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
            <div>
              <h2 className="font-serif text-xl font-light tracking-tight mb-1">
                You're all caught up
              </h2>
              <p className="text-sm text-muted-foreground">
                Everything we need is in. Thank you!
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stage stepper — 4 cards. Completed stages render green. */}
      <div data-testid="portal-home-stages">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-3">
          Your journey
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {progress.map((p) => {
            const Icon = p.icon;
            const pct = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100);
            return (
              <button
                key={p.view}
                type="button"
                onClick={() => onJump(p.view)}
                className={cn(
                  "text-left rounded-lg border p-4 transition-colors",
                  p.allDone
                    ? "border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10"
                    : p.allLocked
                      ? "border-border bg-muted/40 hover:bg-muted/60 opacity-80"
                      : "border-border bg-card hover:bg-secondary/40",
                )}
                data-testid={`portal-home-stage-${p.view}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      p.allDone ? "text-emerald-500" : p.allLocked ? "text-muted-foreground/50" : "text-primary/80",
                    )}
                  />
                  <span className="text-sm font-medium">{p.label}</span>
                  {p.allDone && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-auto" />
                  )}
                  {p.allLocked && !p.allDone && (
                    <Lock className="h-3 w-3 text-muted-foreground/50 ml-auto" />
                  )}
                </div>
                <Progress
                  value={pct}
                  className={cn("h-1.5 mb-1.5", p.allDone && "[&>div]:bg-emerald-500")}
                />
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  {p.allLocked && !p.allDone
                    ? "Locked"
                    : `${p.done} of ${p.total} done`}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Locked-section explainer */}
      {(isLocked || stageLocked) && !mock.isFresh && (
        <Card className="border-amber-500/30 bg-amber-500/5" data-testid="portal-home-locked-explainer">
          <CardContent className="p-4 flex items-start gap-3">
            <Lock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium mb-1">
                {isLocked
                  ? "Compliance, Induction & Training are locked while you finish Assessment"
                  : "Induction & Training open after compliance approval"}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {isLocked
                  ? "Submit your clinical examination, complete your competency self-rating, and upload your CV — the rest of the portal opens automatically."
                  : "Once an admin signs off your compliance pack, your handbook, policies, SOP quizzes and Skills Arcade will all become available."}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* To-do glance */}
      {todo.length > 0 && !mock.isFresh && (
        <div data-testid="portal-home-todo">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-3">
            To do at a glance
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
            {todo.map((r) => {
              const Icon = r.icon;
              return (
                <li key={r.view}>
                  <button
                    type="button"
                    onClick={() => onJump(r.view)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/40 transition-colors"
                  >
                    <Icon className="h-4 w-4 text-primary/70" />
                    <span className="text-sm flex-1">{r.label}</span>
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                      {r.outstanding} outstanding
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Section view ───────────────────────────────────────────────────────

function SectionView({
  view,
  groups,
  mock,
}: {
  view: Exclude<View, "home">;
  groups: PortalSidebarGroup[];
  mock: MockState;
}) {
  const meta: Record<
    Exclude<View, "home">,
    { groupKey: string; title: string; eyebrow: string; description: string; icon: typeof ShieldCheck }
  > = {
    assessment: {
      groupKey: "assessment",
      title: "Assessment",
      eyebrow: "Step 1",
      description:
        "Clinical examination, competency self-rating, and CV upload. Finishing all three unlocks the rest of your onboarding.",
      icon: ClipboardCheck,
    },
    compliance: {
      groupKey: "onboarding",
      title: "Compliance",
      eyebrow: "Step 2",
      description:
        "Identity, right to work, references, qualifications and the supporting declarations we need on file.",
      icon: ShieldCheck,
    },
    induction: {
      groupKey: "induction",
      title: "Induction",
      eyebrow: "Step 3",
      description:
        "Read the staff handbook, sign off the policies, and pass the SOP comprehension quizzes.",
      icon: BookOpenCheck,
    },
    training: {
      groupKey: "training",
      title: "Training",
      eyebrow: "Step 4",
      description:
        "Mandatory training certificates and the Clinical Skills Arcade — the final step before you're roster-ready.",
      icon: GraduationCap,
    },
    roster: {
      groupKey: "rostering",
      title: "Rostering",
      eyebrow: "Active nurse",
      description: "Mark your AM / PM / Night availability for the next six months.",
      icon: CalendarDays,
    },
  };
  const def = meta[view];
  const group = groups.find((g) => g.key === def.groupKey);
  const Icon = def.icon;

  const isLocked = !mock.gate.unlocked;
  const stageLocked = mock.gate.complianceApproved === false;
  const inductionDone = mock.induction.unlocked && mock.policies.outstanding === 0 && mock.sop.outstanding === 0;

  let lockedExplainer: { title: string; body: string } | null = null;
  if (def.groupKey === "onboarding" && isLocked) {
    const p = mock.gate.prerequisites;
    const rem: string[] = [];
    if (!p.examinationCompleted) rem.push("Submit your clinical examination");
    if (!p.competencyDeclared) rem.push("Complete your competency self-rating");
    if (!p.cvReviewed) rem.push("Upload your CV (admin will review)");
    lockedExplainer = {
      title: "Compliance is locked while you finish Assessment",
      body: rem.length > 0 ? `Still to do: ${rem.join(" · ")}` : "Your assessment is being reviewed.",
    };
  } else if (def.groupKey === "induction" && (isLocked || stageLocked)) {
    lockedExplainer = {
      title: isLocked ? "Induction is locked" : "Induction opens after compliance approval",
      body: isLocked
        ? "Finish the Assessment section first."
        : "Once an admin signs off your compliance pack, your handbook, policies and SOP quizzes appear here.",
    };
  } else if (def.groupKey === "training" && (isLocked || stageLocked || !inductionDone)) {
    lockedExplainer = {
      title: isLocked
        ? "Training is locked"
        : stageLocked
          ? "Training opens after compliance approval"
          : "Training opens after Induction",
      body: isLocked
        ? "Finish Assessment first."
        : stageLocked
          ? "Once your compliance pack is signed off, finish Induction and Training will follow."
          : "Read the staff handbook, sign the policies, and pass the SOP quizzes — Training will open automatically.",
    };
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
          {def.eyebrow}
        </p>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <h1 className="font-serif text-3xl font-light tracking-tight">{def.title}</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{def.description}</p>
      </div>

      {lockedExplainer && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 flex items-start gap-3">
            <Lock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-foreground mb-1">{lockedExplainer.title}</p>
              <p className="text-muted-foreground leading-relaxed">{lockedExplainer.body}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {!group ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-5 w-5 mx-auto mb-2 text-muted-foreground/50" />
            Nothing to do in this section right now.
          </CardContent>
        </Card>
      ) : (
        <PortalSectionChecklist group={group} />
      )}
    </div>
  );
}
