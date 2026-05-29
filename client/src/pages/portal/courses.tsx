import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  PortalShell,
  buildPortalGroups,
  type PortalSidebarGroup,
  type PortalGateInfo,
  type JourneyData,
} from "@/components/layout/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Circle, Download, GraduationCap, ArrowLeft, Loader2, Lock } from "lucide-react";

type Status = "assigned" | "in_progress" | "completed" | "overdue";

interface Lesson { id: string; title: string; content: string; orderIndex: number }
interface Question { id: string; prompt: string; options: string[]; orderIndex: number }
interface CourseInfo {
  id: string; title: string; description: string; sourceType: string;
  category: string | null; passThreshold: number | null; certificateEnabled: boolean;
}
interface AssignedCourse {
  assignmentId: string;
  course: CourseInfo;
  status: Status;
  overdue: boolean;
  dueDate: string | null;
  completedAt: string | null;
  completedLessonIds: string[];
  quizScore: number | null;
  certificateDocumentId: string | null;
  linkedComplete: boolean;
  lessons: Lesson[];
  questions: Question[];
}

interface PortalShellData {
  nurse: { id: string; fullName: string; currentStage: string };
  journey: JourneyData;
  gate?: PortalGateInfo | null;
}

const STATUS_BADGE: Record<Status, string> = {
  assigned: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  in_progress: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  completed: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200",
  overdue: "bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-200",
};
const STATUS_LABEL: Record<Status, string> = {
  assigned: "Not started", in_progress: "In progress", completed: "Completed", overdue: "Overdue",
};

export default function PortalCoursesPage() {
  const [, navigate] = useLocation();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: portal } = useQuery<PortalShellData>({
    queryKey: [`/api/portal/me`],
    queryFn: async () => (await apiRequest("GET", "/api/portal/me")).json(),
  });
  const { data: courses, isLoading } = useQuery<AssignedCourse[]>({
    queryKey: [`/api/portal/me/lms/courses`],
    queryFn: async () => (await apiRequest("GET", "/api/portal/me/lms/courses")).json(),
  });

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal) return [];
    const isCompleted = portal.nurse.currentStage === "completed";
    return buildPortalGroups({
      token: "me",
      journey: portal.journey,
      stepStatuses: {},
      gate: portal.gate ?? null,
      availabilityEnabled: isCompleted,
      invoicesEnabled: isCompleted,
      selectOverview: () => navigate(`/portal`),
      selectOnboardingStep: (k) => navigate(`/portal/page?step=${k}`),
      selectAvailability: () => navigate(`/portal/availability`),
      selectInvoices: () => navigate(`/portal/invoices`),
      selectPolicies: () => navigate(`/portal/policies`),
      selectInduction: () => navigate(`/portal/induction`),
      selectSopComprehension: () => navigate(`/portal/sop-comprehension`),
      selectCompetency: () => navigate(`/portal/page?step=competency`),
      selectCvUpload: () => navigate(`/portal/page?step=cv`),
      selectDeclaration: (k) => navigate(`/portal/declaration/${k}`),
    });
  }, [portal, navigate]);

  const active = courses?.find((c) => c.assignmentId === activeId) || null;

  return (
    <PortalShell token="me" candidateName={portal?.nurse.fullName || ""} groups={groups} activeKey="training:livaware_modules">
      {active ? (
        <CoursePlayer course={active} onBack={() => setActiveId(null)} />
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Training</p>
            <h1 className="font-serif text-3xl font-light tracking-tight flex items-center gap-2" data-testid="heading-portal-courses">
              <GraduationCap className="h-7 w-7 text-primary" /> My Training Courses
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Complete your assigned courses and download your certificates.</p>
          </div>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !courses || courses.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">No courses assigned yet.</CardContent></Card>
          ) : (
            <div className="grid gap-3">
              {courses.map((c) => {
                const status = c.linkedComplete ? "completed" : c.status;
                return (
                  <Card key={c.assignmentId} data-testid={`row-course-${c.assignmentId}`}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{c.course.title}</div>
                        {c.course.description && <div className="text-[12px] text-muted-foreground line-clamp-1">{c.course.description}</div>}
                        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          <Badge className={STATUS_BADGE[status as Status]} variant="secondary">{STATUS_LABEL[status as Status]}</Badge>
                          {c.dueDate && <span>Due {new Date(c.dueDate).toLocaleDateString("en-GB")}</span>}
                          {c.course.sourceType !== "internal" && <span className="italic">Tracked from {c.course.sourceType.toUpperCase()}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {status === "completed" && c.certificateDocumentId && (
                          <Button variant="outline" size="sm" onClick={() => window.open(`/api/portal/me/lms/courses/${c.assignmentId}/certificate`, "_blank")} data-testid={`button-cert-${c.assignmentId}`}>
                            <Download className="h-4 w-4 mr-1" /> Certificate
                          </Button>
                        )}
                        {c.course.sourceType === "internal" ? (
                          <Button size="sm" onClick={() => setActiveId(c.assignmentId)} data-testid={`button-open-${c.assignmentId}`}>
                            {status === "completed" ? "Review" : "Open"}
                          </Button>
                        ) : status !== "completed" ? (
                          <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> External</Badge>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </PortalShell>
  );
}

function CoursePlayer({ course, onBack }: { course: AssignedCourse; onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const completedSet = new Set(course.completedLessonIds);
  const allLessonsDone = course.lessons.every((l) => completedSet.has(l.id));
  const hasQuiz = course.questions.length > 0;
  const isComplete = course.status === "completed";

  const completeLessonMutation = useMutation({
    mutationFn: async (lessonId: string) => apiRequest("POST", `/api/portal/me/lms/courses/${course.assignmentId}/lessons/${lessonId}/complete`).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/api/portal/me/lms/courses`] }),
    onError: (e: any) => toast({ title: "Failed", description: String(e.message || e), variant: "destructive" }),
  });

  const quizMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/portal/me/lms/courses/${course.assignmentId}/quiz`, { answers }).then((r) => r.json()),
    onSuccess: (res: any) => {
      toast({
        title: res.passed ? `Passed — ${res.score}%` : `Score ${res.score}%`,
        description: res.passed ? "Course complete. Your certificate is ready." : "You did not reach the pass mark. Review and try again.",
        variant: res.passed ? undefined : "destructive",
      });
      qc.invalidateQueries({ queryKey: [`/api/portal/me/lms/courses`] });
    },
    onError: (e: any) => toast({ title: "Quiz failed", description: String(e.message || e), variant: "destructive" }),
  });

  const allAnswered = course.questions.every((q) => typeof answers[q.id] === "number");

  return (
    <div className="space-y-5 max-w-3xl">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1" data-testid="button-back">
        <ArrowLeft className="h-4 w-4" /> All courses
      </button>
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Training course</p>
        <h1 className="font-serif text-3xl font-light tracking-tight">{course.course.title}</h1>
        {course.course.description && <p className="text-sm text-muted-foreground mt-1">{course.course.description}</p>}
        {isComplete && (
          <div className="mt-3 flex items-center gap-3">
            <Badge className={STATUS_BADGE.completed}>Completed</Badge>
            {course.certificateDocumentId && (
              <Button variant="outline" size="sm" onClick={() => window.open(`/api/portal/me/lms/courses/${course.assignmentId}/certificate`, "_blank")} data-testid="button-cert-player">
                <Download className="h-4 w-4 mr-1" /> Download certificate
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {course.lessons.map((l, i) => {
          const done = completedSet.has(l.id);
          return (
            <Card key={l.id} data-testid={`lesson-${l.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {done ? <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" /> : <Circle className="h-5 w-5 text-muted-foreground/40 mt-0.5 shrink-0" />}
                  <div className="flex-1">
                    <div className="font-medium">{i + 1}. {l.title}</div>
                    <div className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{l.content}</div>
                    {!done && !isComplete && (
                      <Button size="sm" className="mt-3" disabled={completeLessonMutation.isPending} onClick={() => completeLessonMutation.mutate(l.id)} data-testid={`button-complete-lesson-${l.id}`}>
                        Mark as read
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {hasQuiz && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div>
              <h2 className="font-serif text-xl font-light">Quiz</h2>
              <p className="text-sm text-muted-foreground">
                {!allLessonsDone ? "Finish all lessons to unlock the quiz." : `Answer all questions${typeof course.course.passThreshold === "number" ? ` — pass mark ${course.course.passThreshold}%` : ""}.`}
                {typeof course.quizScore === "number" && ` Last score: ${course.quizScore}%.`}
              </p>
            </div>
            <fieldset disabled={!allLessonsDone || isComplete} className="space-y-4">
              {course.questions.map((q, qi) => (
                <div key={q.id} className="space-y-2" data-testid={`question-${q.id}`}>
                  <div className="font-medium text-sm">Q{qi + 1}. {q.prompt}</div>
                  <div className="space-y-1.5 pl-1">
                    {q.options.map((opt, oi) => (
                      <label key={oi} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name={q.id} checked={answers[q.id] === oi} onChange={() => setAnswers({ ...answers, [q.id]: oi })} data-testid={`answer-${q.id}-${oi}`} />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </fieldset>
            {!isComplete && (
              <Button disabled={!allLessonsDone || !allAnswered || quizMutation.isPending} onClick={() => quizMutation.mutate()} data-testid="button-submit-quiz">
                {quizMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Submit quiz
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {!hasQuiz && !isComplete && allLessonsDone && (
        <Card><CardContent className="p-4 text-sm text-muted-foreground">All lessons read — finalising your completion…</CardContent></Card>
      )}
    </div>
  );
}
