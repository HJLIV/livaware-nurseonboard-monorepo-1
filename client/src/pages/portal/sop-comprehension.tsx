// Nurse-facing SOP comprehension MCQ page (task 114 follow-up).
//
// 14 short scenarios — one per SOP — that test *application* of the
// principle rather than rote recall. Single-best-answer MCQ. Each row
// is a collapsible card mirroring the induction page so the candidate
// can see at a glance what's outstanding before committing time to a
// question.
//
// Standalone from the Skills Arcade gate by design — this is purely a
// comprehension check, not a gating step.

import { useMemo, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  PortalShell,
  buildPortalGroups,
  type PortalSidebarGroup,
} from "@/components/layout/portal-shell";
import { StageLockedCard } from "@/components/portal/stage-locked-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2, AlertCircle, Circle, ChevronRight, ChevronDown,
  XCircle, BookOpen, RefreshCw,
} from "lucide-react";

interface QuestionOption { id: string; label: string; }
interface PortalQuestion {
  sopSlug: string;
  sopTitle: string;
  version: string;
  vignette: string;
  options: QuestionOption[];
  status: "not_attempted" | "passed" | "failed";
  attemptCount: number;
  lastAttemptAt: string | null;
  lastChosenOptionId: string | null;
  lastWasCorrect: boolean | null;
}
interface ComprehensionResponse {
  questions: PortalQuestion[];
  totalRequired: number;
  passed: number;
  outstanding: number;
}
interface AnswerResponse {
  ok: true;
  sopSlug: string;
  chosenOptionId: string;
  isCorrect: boolean;
  attemptCount: number;
  explanation: string;
  correctOptionId: string | null;
}

interface PortalData {
  nurse: { id: string; fullName: string; email: string; currentStage: string };
  journey: {
    preboard: { status: string; actionUrl?: string; label: string };
    onboard: { status: string; actionUrl?: string; label: string };
    skillsArcade: { status: string; actionUrl?: string; label: string };
  };
  induction?: { unlocked: boolean; total: number; outstanding: number };
  gate?: {
    unlocked: boolean;
    stageCompleted?: boolean;
    prerequisites: { examinationCompleted: boolean; competencyDeclared: boolean; cvReviewed: boolean };
  } | null;
  token: string;
}

function statusIconFor(q: PortalQuestion) {
  if (q.status === "passed") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (q.status === "failed") return <AlertCircle className="h-4 w-4 text-amber-500" />;
  return <Circle className="h-4 w-4 text-muted-foreground/40" />;
}

function ComprehensionCard({
  token,
  question,
  defaultExpanded,
}: {
  token: string;
  question: PortalQuestion;
  defaultExpanded?: boolean;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded ?? false);
  const [chosen, setChosen] = useState<string | null>(null);
  // After a submit we hold the response so we can render explanation +
  // correct-answer reveal inline. Resets when the user clicks "Try again".
  const [feedback, setFeedback] = useState<AnswerResponse | null>(null);

  const submit = useMutation({
    mutationFn: async (chosenOptionId: string): Promise<AnswerResponse> => {
      const res = await apiRequest(
        "POST",
        `/api/portal/${token}/sop-comprehension/${encodeURIComponent(question.sopSlug)}/answer`,
        { chosenOptionId },
      );
      return await res.json();
    },
    onSuccess: (data) => {
      setFeedback(data);
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}/sop-comprehension`] });
      toast({
        title: data.isCorrect ? "Correct" : "Not quite",
        description: data.isCorrect
          ? "Comprehension check passed."
          : "Read the explanation and try again.",
        variant: data.isCorrect ? "default" : "destructive",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Could not record answer",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const isPassed = question.status === "passed" && !feedback;
  // Once passed, the card is read-only. Otherwise the user can answer
  // (or try again after a wrong answer).
  const showAnswered = !!feedback;
  const correctOptionId = feedback?.correctOptionId ?? null;

  if (!expanded) {
    return (
      <Card
        data-testid={`sop-comp-card-${question.sopSlug}`}
        className={`transition-colors ${question.status === "passed" ? "ring-1 ring-emerald-500/15" : question.status === "failed" ? "ring-1 ring-amber-500/30" : ""}`}
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full text-left p-4 flex items-center gap-3 hover-elevate"
          data-testid={`button-expand-sop-comp-${question.sopSlug}`}
          aria-expanded={false}
        >
          <span className="shrink-0">{statusIconFor(question)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{question.sopTitle}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                v{question.version}
              </span>
              {question.status === "passed" && (
                <span className="text-[10px] text-emerald-600/80">Passed</span>
              )}
              {question.status === "failed" && (
                <span className="text-[10px] text-amber-600">Try again</span>
              )}
              {question.attemptCount > 0 && (
                <span className="text-[10px] text-muted-foreground/60">
                  · {question.attemptCount} attempt{question.attemptCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
        </button>
      </Card>
    );
  }

  return (
    <Card
      data-testid={`sop-comp-card-${question.sopSlug}`}
      className={question.status === "passed" ? "ring-1 ring-emerald-500/15" : question.status === "failed" ? "ring-1 ring-amber-500/30" : ""}
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => { setExpanded(false); setFeedback(null); setChosen(null); }}
            className="flex-1 min-w-0 text-left flex items-start gap-2 hover-elevate -m-1 p-1 rounded"
            data-testid={`button-collapse-sop-comp-${question.sopSlug}`}
            aria-expanded={true}
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground/60 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold">{question.sopTitle}</h3>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  v{question.version}
                </span>
              </div>
            </div>
          </button>
          {isPassed && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Passed
            </Badge>
          )}
        </div>

        <p className="text-sm leading-relaxed text-foreground/90">{question.vignette}</p>

        <div className="space-y-2">
          {question.options.map((opt) => {
            const isChosen = chosen === opt.id;
            const isFeedbackChosen = feedback && feedback.chosenOptionId === opt.id;
            const isCorrectReveal = correctOptionId === opt.id && showAnswered;
            const isWrongChosen = isFeedbackChosen && feedback && !feedback.isCorrect;
            const tone = isCorrectReveal
              ? "border-emerald-500/40 bg-emerald-500/5"
              : isWrongChosen
                ? "border-red-500/40 bg-red-500/5"
                : isChosen
                  ? "border-primary/50 bg-primary/5"
                  : "border-border";
            return (
              <button
                key={opt.id}
                type="button"
                disabled={showAnswered || isPassed || submit.isPending}
                onClick={() => setChosen(opt.id)}
                className={`w-full text-left rounded border ${tone} px-3 py-2.5 text-sm transition-colors hover-elevate disabled:cursor-not-allowed`}
                data-testid={`option-${question.sopSlug}-${opt.id}`}
              >
                <span className="flex items-start gap-2">
                  <span className="text-xs font-mono text-muted-foreground/60 mt-0.5">
                    {opt.id.toUpperCase()}.
                  </span>
                  <span className="flex-1">{opt.label}</span>
                  {isCorrectReveal && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />}
                  {isWrongChosen && <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                </span>
              </button>
            );
          })}
        </div>

        {feedback && (
          <div
            className={`rounded border px-3 py-2.5 text-sm ${feedback.isCorrect ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" : "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-400"}`}
            data-testid={`feedback-${question.sopSlug}`}
          >
            <p className="font-medium mb-1">
              {feedback.isCorrect ? "Correct" : "Not quite"}
            </p>
            <p className="leading-relaxed">{feedback.explanation}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-muted-foreground">
            {isPassed && question.lastAttemptAt
              ? `Passed on ${new Date(question.lastAttemptAt).toLocaleDateString()}`
              : "Pick the best single answer."}
          </p>
          {!isPassed && !showAnswered && (
            <Button
              size="sm"
              onClick={() => chosen && submit.mutate(chosen)}
              disabled={!chosen || submit.isPending}
              data-testid={`button-submit-sop-comp-${question.sopSlug}`}
            >
              Submit answer
            </Button>
          )}
          {showAnswered && !feedback?.isCorrect && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setFeedback(null); setChosen(null); }}
              data-testid={`button-retry-sop-comp-${question.sopSlug}`}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Try again
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PortalSopComprehensionPage() {
  const [, paramsWithToken] = useRoute("/portal/sop-comprehension/:token");
  const params = paramsWithToken ?? { token: "me" };
  const [, navigate] = useLocation();
  const token = params?.token;

  const { data: portal } = useQuery<PortalData>({
    queryKey: [`/api/portal/${token}`],
    enabled: !!token,
    retry: false,
  });

  const stageUnlocked = portal?.gate?.stageCompleted !== false;
  const { data: comprehension, isLoading } = useQuery<ComprehensionResponse>({
    queryKey: [`/api/portal/${token}/sop-comprehension`],
    enabled: !!token && stageUnlocked,
  });

  const { data: induction } = useQuery<{ totalRequired: number; outstanding: number }>({
    queryKey: [`/api/portal/${token}/induction`],
    enabled: !!token && stageUnlocked,
  });

  const { data: policies } = useQuery<{ totalRequired: number; outstanding: number }>({
    queryKey: [`/api/portal/${token}/policies`],
    enabled: !!token && stageUnlocked,
  });

  const inductionSummary = useMemo(() => {
    if (!induction) return portal?.induction ?? null;
    return {
      total: induction.totalRequired,
      outstanding: induction.outstanding,
      unlocked: induction.outstanding === 0,
    };
  }, [induction, portal]);

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal || !token) return [];
    return buildPortalGroups({
      token,
      journey: portal.journey,
      stepStatuses: {},
      selectOverview: () => navigate(`/portal`),
      selectOnboardingStep: (stepKey) => navigate(`/portal/page?step=${stepKey}`),
      policiesSummary: policies
        ? { totalRequired: policies.totalRequired, outstanding: policies.outstanding }
        : null,
      selectPolicies: () => navigate(`/portal/policies`),
      inductionSummary,
      selectInduction: () => navigate(`/portal/induction`),
      sopComprehensionSummary: comprehension
        ? { totalRequired: comprehension.totalRequired, outstanding: comprehension.outstanding }
        : null,
      selectSopComprehension: () => navigate(`/portal/sop-comprehension`),
      gate: portal.gate ?? null,
    });
  }, [portal, token, navigate, policies, inductionSummary, comprehension]);

  const stageLocked = !!portal?.gate && portal.gate.stageCompleted === false;

  const content = (
    <div className="space-y-6" data-testid="portal-sop-comprehension">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
          Compliance
        </p>
        <h1 className="font-serif text-3xl font-light tracking-tight">
          SOP Comprehension Check
        </h1>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
          Each scenario below is a real-world situation that's slightly outside
          the textbook procedure. Pick the single best action. You'll see
          immediate feedback and can try again if you choose the wrong option —
          this is a learning check, not an exam.
        </p>
        {comprehension && (
          <div className="mt-3 flex items-center gap-2">
            {comprehension.outstanding === 0 ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20" data-testid="badge-comp-complete">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                All {comprehension.totalRequired} comprehension checks passed
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20" data-testid="badge-comp-outstanding">
                <BookOpen className="h-3.5 w-3.5 mr-1" />
                {comprehension.passed} of {comprehension.totalRequired} passed · {comprehension.outstanding} to go
              </Badge>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : !comprehension || comprehension.questions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No comprehension questions are configured.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {comprehension.questions.map((q) => (
            <ComprehensionCard key={q.sopSlug} token={token!} question={q} />
          ))}
        </div>
      )}
    </div>
  );

  if (!token) return null;
  if (!portal) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-32 w-72" />
      </div>
    );
  }

  return (
    <PortalShell
      token={token}
      candidateName={portal.nurse.fullName}
      groups={groups}
      activeKey="compliance:sop_comprehension"
    >
      {stageLocked ? <StageLockedCard label="SOP Comprehension Check" /> : content}
    </PortalShell>
  );
}
