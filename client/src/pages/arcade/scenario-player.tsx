import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  GripVertical,
  Loader2,
  RotateCcw,
  Trophy,
  Shield,
  ShieldAlert,
  User,
  Stethoscope,
  ClipboardList,
  Calculator,
  ListOrdered,
  GitBranch,
  Link2,
  Info,
  ChevronRight,
  CircleAlert,
} from "lucide-react";
import type {
  ScenarioContent,
  ScenarioTask,
  OrderingTaskData,
  DecisionTaskData,
  CalculationTaskData,
  MatchingTaskData,
  ScoringResult,
} from "@shared/schema";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

interface ScenarioData {
  attemptId: string;
  scenario: {
    id: string;
    title: string;
    contentJson: ScenarioContent;
  };
  moduleName: string;
}

interface TaskResponse {
  taskId: string;
  type: string;
  answer: any;
}

const taskTypeIcons: Record<string, any> = {
  ordering: ListOrdered,
  matching: Link2,
  decision: GitBranch,
  calculation: Calculator,
};

const taskTypeLabels: Record<string, string> = {
  ordering: "Ordering",
  matching: "Matching",
  decision: "Decision",
  calculation: "Calculation",
};

export default function ScenarioPlayer() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [started, setStarted] = useState(false);
  const [attemptData, setAttemptData] = useState<ScenarioData | null>(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [responses, setResponses] = useState<TaskResponse[]>([]);
  const [result, setResult] = useState<ScoringResult | null>(null);

  const { data: assignmentInfo, isLoading: loadingInfo } = useQuery<{
    moduleName: string;
    moduleDescription: string;
    status: string;
    attemptCount: number;
    failedAttempts: number;
  }>({
    queryKey: ["/api/nurse/assignments", assignmentId],
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/nurse/attempts/start", { assignmentId });
      return await res.json();
    },
    onSuccess: (data: ScenarioData) => {
      setAttemptData(data);
      setStarted(true);
      setCurrentTaskIndex(0);
      setResponses([]);
      setResult(null);
    },
    onError: (e: Error) => {
      toast({
        title: "Unable to start assessment",
        description: e.message.includes("locked")
          ? "This module is locked. Contact your trainer for face-to-face remediation."
          : e.message,
        variant: "destructive",
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: { attemptId: string; responses: TaskResponse[] }) => {
      const res = await apiRequest("POST", "/api/nurse/attempts/submit", payload);
      return await res.json();
    },
    onSuccess: (data: ScoringResult) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/nurse/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nurse/assignments", assignmentId] });
    },
    onError: (e: Error) => {
      toast({
        title: "Submission could not be processed",
        description: "Your responses have been preserved. Please try submitting again.",
        variant: "destructive",
      });
    },
  });

  const tasks: ScenarioTask[] = attemptData?.scenario?.contentJson?.tasks ?? [];
  const currentTask = tasks[currentTaskIndex];
  const totalTasks = tasks.length;
  const progressPercent = totalTasks > 0 ? Math.round(((currentTaskIndex + 1) / totalTasks) * 100) : 0;

  const saveResponse = useCallback((taskId: string, type: string, answer: any) => {
    setResponses((prev) => {
      const existing = prev.findIndex((r) => r.taskId === taskId);
      const newResp: TaskResponse = { taskId, type, answer };
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = newResp;
        return updated;
      }
      return [...prev, newResp];
    });
  }, []);

  const handleNext = () => {
    if (currentTaskIndex < totalTasks - 1) {
      setCurrentTaskIndex((i) => i + 1);
    }
  };

  const handlePrev = () => {
    if (currentTaskIndex > 0) {
      setCurrentTaskIndex((i) => i - 1);
    }
  };

  const handleSubmit = () => {
    if (!attemptData) return;
    submitMutation.mutate({
      attemptId: attemptData.attemptId,
      responses,
    });
  };

  if (loadingInfo) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-8 w-32" />
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <Skeleton className="w-10 h-10 rounded-md" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-10 w-40" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (result) {
    return (
      <ResultsScreen
        result={result}
        moduleName={attemptData?.moduleName ?? ""}
        tasks={tasks}
        onRetry={() => {
          setResult(null);
          setStarted(false);
        }}
        onBack={() => navigate("/")}
        assignmentStatus={assignmentInfo?.status}
      />
    );
  }

  if (!started) {
    const isLocked = assignmentInfo?.status === "locked";
    const failsUsed = assignmentInfo?.failedAttempts ?? 0;
    const maxFails = 4;

    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </Button>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 shrink-0">
                <Stethoscope className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold" data-testid="text-module-title">{assignmentInfo?.moduleName}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">{assignmentInfo?.moduleDescription}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-md space-y-3" data-testid="section-patient-context">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <User className="w-4 h-4" />
                Scenario Overview
              </h3>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>You will be assessed on a clinical scenario relevant to <strong className="text-foreground">{assignmentInfo?.moduleName}</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Tasks may include ordering steps, matching items, clinical decisions, and calculations</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>Answer each task carefully before moving to the next</span>
                </li>
              </ul>
            </div>

            <div className="p-4 bg-primary/5 rounded-md border border-primary/10">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Scoring Rules
              </h3>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium">Pass</p>
                    <p className="text-xs text-muted-foreground">0 Major errors AND 3 or fewer Minor errors</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium">Fail</p>
                    <p className="text-xs text-muted-foreground">Any Major error OR 4+ Minor errors</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">Attempts Used</p>
                <p className="font-semibold" data-testid="text-attempt-count">{assignmentInfo?.attemptCount ?? 0}</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">Fails</p>
                <p className={`font-semibold ${failsUsed >= 3 ? "text-amber-600 dark:text-amber-400" : ""}`} data-testid="text-fail-count">
                  {failsUsed}/{maxFails}
                  {failsUsed >= 3 && failsUsed < maxFails && (
                    <span className="text-xs font-normal text-amber-600 dark:text-amber-400 ml-1">(final attempt)</span>
                  )}
                </p>
              </div>
            </div>

            {isLocked ? (
              <div className="p-4 rounded-md bg-amber-500/5 border border-amber-500/20">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Module Locked</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      You must not perform this skill independently until you have completed face-to-face
                      training and received sign-off from your trainer.
                    </p>
                    <Button size="sm" variant="outline" className="mt-2 border-amber-500/30 text-amber-700 dark:text-amber-400" data-testid="button-book-signoff">
                      Book face-to-face sign-off
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <Button
                className="w-full"
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                data-testid="button-start-scenario"
              >
                {startMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Begin Assessment
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-40 bg-background border-b px-4 py-2.5 shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-semibold truncate" data-testid="text-module-name-header">{attemptData?.moduleName}</p>
              <Badge variant="secondary" className="shrink-0">
                Task {currentTaskIndex + 1}/{totalTasks}
              </Badge>
            </div>
          </div>
          <Progress value={progressPercent} className="h-1.5 mb-2" />
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {tasks.map((t, i) => {
              const TypeIcon = taskTypeIcons[t.type] || ClipboardList;
              const isActive = i === currentTaskIndex;
              const isCompleted = responses.some((r) => r.taskId === t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => setCurrentTaskIndex(i)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : isCompleted
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                  }`}
                  data-testid={`button-step-${i}`}
                >
                  <TypeIcon className="w-3 h-3" />
                  {taskTypeLabels[t.type] ?? t.type}
                  {isCompleted && !isActive && <CheckCircle2 className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {currentTask && (
            <TaskRenderer
              task={currentTask}
              onSaveResponse={saveResponse}
              existingResponse={responses.find((r) => r.taskId === currentTask.id)}
            />
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handlePrev}
              disabled={currentTaskIndex === 0}
              data-testid="button-prev-task"
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Previous
            </Button>
            {currentTaskIndex < totalTasks - 1 ? (
              <Button onClick={handleNext} data-testid="button-next-task">
                Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={submitMutation.isPending || responses.length < totalTasks}
                data-testid="button-submit-attempt"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Scoring...
                  </>
                ) : (
                  "Submit Assessment"
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskRenderer({
  task,
  onSaveResponse,
  existingResponse,
}: {
  task: ScenarioTask;
  onSaveResponse: (taskId: string, type: string, answer: any) => void;
  existingResponse?: TaskResponse;
}) {
  switch (task.type) {
    case "ordering":
      return (
        <OrderingTask
          task={task}
          data={task.data as OrderingTaskData}
          onSave={(answer) => onSaveResponse(task.id, "ordering", answer)}
          existingAnswer={existingResponse?.answer}
        />
      );
    case "decision":
      return (
        <DecisionTask
          task={task}
          data={task.data as DecisionTaskData}
          onSave={(answer) => onSaveResponse(task.id, "decision", answer)}
          existingAnswer={existingResponse?.answer}
        />
      );
    case "calculation":
      return (
        <CalculationTask
          task={task}
          data={task.data as CalculationTaskData}
          onSave={(answer) => onSaveResponse(task.id, "calculation", answer)}
          existingAnswer={existingResponse?.answer}
        />
      );
    case "matching":
      return (
        <MatchingTask
          task={task}
          data={task.data as MatchingTaskData}
          onSave={(answer) => onSaveResponse(task.id, "matching", answer)}
          existingAnswer={existingResponse?.answer}
        />
      );
    default:
      return <Card><CardContent className="p-6"><p>Unknown task type</p></CardContent></Card>;
  }
}

function OrderingTask({
  task,
  data,
  onSave,
  existingAnswer,
}: {
  task: ScenarioTask;
  data: OrderingTaskData;
  onSave: (answer: string[]) => void;
  existingAnswer?: string[];
}) {
  const allSteps = [...data.correctOrder, ...(data.distractors ?? [])];
  const [items, setItems] = useState<typeof allSteps>(() => {
    if (existingAnswer) {
      return existingAnswer.map((id) => allSteps.find((s) => s.id === id)).filter(Boolean) as typeof allSteps;
    }
    return shuffleArray([...allSteps]);
  });

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = [...items];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setItems(reordered);
    onSave(reordered.map((s) => s.id));
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setItems(reordered);
    onSave(reordered.map((s) => s.id));
  };

  const initialSaved = useRef(false);
  useEffect(() => {
    if (!existingAnswer && items.length > 0 && !initialSaved.current) {
      initialSaved.current = true;
      onSave(items.map((s) => s.id));
    }
  }, [existingAnswer, items, onSave]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-semibold" data-testid="text-task-title">{task.title}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{task.description}</p>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Drag items or use the arrow buttons to arrange them in the correct order:
        </p>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="ordering">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                {items.map((step, index) => (
                  <Draggable key={step.id} draggableId={step.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`flex items-center gap-2 p-3 rounded-md border transition-colors ${
                          snapshot.isDragging
                            ? "bg-primary/5 border-primary/30 shadow-md"
                            : "bg-card border-card-border"
                        }`}
                        data-testid={`drag-item-${step.id}`}
                      >
                        <div
                          {...provided.dragHandleProps}
                          className="flex items-center gap-1 shrink-0 cursor-grab active:cursor-grabbing"
                        >
                          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-muted text-xs font-medium">
                            {index + 1}
                          </div>
                          <GripVertical className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <span className="text-sm flex-1 min-w-0">{step.text}</span>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7"
                            onClick={() => moveItem(index, "up")}
                            disabled={index === 0}
                            aria-label={`Move ${step.text} up`}
                            data-testid={`button-move-up-${step.id}`}
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7"
                            onClick={() => moveItem(index, "down")}
                            disabled={index === items.length - 1}
                            aria-label={`Move ${step.text} down`}
                            data-testid={`button-move-down-${step.id}`}
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </CardContent>
    </Card>
  );
}

function DecisionTask({
  task,
  data,
  onSave,
  existingAnswer,
}: {
  task: ScenarioTask;
  data: DecisionTaskData;
  onSave: (answer: Record<string, string>) => void;
  existingAnswer?: Record<string, string>;
}) {
  const [currentNodeId, setCurrentNodeId] = useState(data.startNodeId);
  const [choices, setChoices] = useState<Record<string, string>>(existingAnswer ?? {});
  const [history, setHistory] = useState<string[]>([data.startNodeId]);

  const currentNode = data.nodes.find((n) => n.id === currentNodeId);

  const selectOption = (optionId: string, nextNodeId?: string) => {
    const updated = { ...choices, [currentNodeId]: optionId };
    setChoices(updated);
    onSave(updated);

    if (nextNodeId) {
      setCurrentNodeId(nextNodeId);
      setHistory((h) => [...h, nextNodeId]);
    }
  };

  const goBack = () => {
    if (history.length > 1) {
      const newHistory = history.slice(0, -1);
      setHistory(newHistory);
      setCurrentNodeId(newHistory[newHistory.length - 1]);
    }
  };

  if (!currentNode) return null;

  const decisionStep = history.length;
  const totalNodes = data.nodes.filter((n) => !n.isTerminal).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-semibold" data-testid="text-task-title">{task.title}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{task.description}</p>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="secondary" className="text-xs">
            Decision {decisionStep} of ~{totalNodes}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {history.length > 1 && (
          <Button variant="ghost" size="sm" onClick={goBack} data-testid="button-decision-back">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to previous
          </Button>
        )}
        <div className="p-4 bg-muted/50 rounded-md">
          <p className="text-sm font-medium" data-testid="text-decision-prompt">{currentNode.prompt}</p>
        </div>
        {currentNode.isTerminal ? (
          <div className="p-4 bg-emerald-500/5 rounded-md border border-emerald-500/15">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Decision pathway complete</p>
                <p className="text-sm text-muted-foreground mt-0.5">{currentNode.terminalMessage ?? "You've completed this decision tree."}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Choose the most appropriate action:</p>
            {currentNode.options.map((opt) => {
              const isSelected = choices[currentNodeId] === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => selectOption(opt.id, opt.nextNodeId)}
                  className={`w-full text-left p-4 rounded-md border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                    isSelected
                      ? "bg-primary/10 border-primary/30 font-medium"
                      : "bg-card border-card-border hover-elevate"
                  }`}
                  data-testid={`button-option-${opt.id}`}
                >
                  {opt.text}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CalculationTask({
  task,
  data,
  onSave,
  existingAnswer,
}: {
  task: ScenarioTask;
  data: CalculationTaskData;
  onSave: (answer: number) => void;
  existingAnswer?: number;
}) {
  const [value, setValue] = useState<string>(existingAnswer?.toString() ?? "");
  const [scratchpad, setScratchpad] = useState("");
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [selectedDropFactor, setSelectedDropFactor] = useState<string>("");

  const isIVCalc = task.title.toLowerCase().includes("drip") ||
    task.title.toLowerCase().includes("iv") ||
    data.formula?.toLowerCase().includes("drop") ||
    data.formula?.toLowerCase().includes("drip");

  const handleChange = (v: string) => {
    setValue(v);
    const num = parseFloat(v);
    if (!isNaN(num)) {
      onSave(num);
    }
  };

  const parsedValue = parseFloat(value);
  const isPlausible = !isNaN(parsedValue) && parsedValue > 0 && parsedValue < 10000;
  const showPlausibilityWarning = !isNaN(parsedValue) && parsedValue > 0 && (parsedValue > 500 || parsedValue < 0.1);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-semibold" data-testid="text-task-title">{task.title}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{task.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 bg-muted/50 rounded-md">
          <p className="text-sm" data-testid="text-calc-question">{data.question}</p>
        </div>

        <div className="p-3 bg-primary/5 rounded-md border border-primary/10">
          <p className="text-xs text-muted-foreground font-medium mb-1">Formula</p>
          <p className="text-sm font-mono" data-testid="text-calc-formula">{data.formula}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {Object.entries(data.inputs).map(([key, val]) => (
            <div key={key} className="p-3 bg-muted/50 rounded-md">
              <p className="text-xs text-muted-foreground">{key}</p>
              <p className="font-semibold" data-testid={`text-input-${key.replace(/\s+/g, "-").toLowerCase()}`}>{val}</p>
            </div>
          ))}
        </div>

        {isIVCalc && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1 block text-muted-foreground">Drop factor (gtt/mL)</label>
              <Select value={selectedDropFactor} onValueChange={setSelectedDropFactor}>
                <SelectTrigger data-testid="select-drop-factor">
                  <SelectValue placeholder="Select drop factor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 gtt/mL (macrodrip)</SelectItem>
                  <SelectItem value="15">15 gtt/mL (macrodrip)</SelectItem>
                  <SelectItem value="20">20 gtt/mL (macrodrip)</SelectItem>
                  <SelectItem value="60">60 gtt/mL (microdrip)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selectedDropFactor && (
              <div className="p-2.5 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground">
                  Unit conversion: {selectedDropFactor} drops = 1 mL
                  {" | "}60 minutes = 1 hour
                </p>
              </div>
            )}
          </div>
        )}

        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowScratchpad(!showScratchpad)}
            className="mb-2"
            data-testid="button-toggle-scratchpad"
          >
            <ClipboardList className="w-3.5 h-3.5 mr-1" />
            {showScratchpad ? "Hide" : "Show"} working area
          </Button>
          {showScratchpad && (
            <Textarea
              value={scratchpad}
              onChange={(e) => setScratchpad(e.target.value)}
              placeholder="Show your working here..."
              className="min-h-[80px] font-mono text-sm mb-3"
              data-testid="textarea-scratchpad"
            />
          )}
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Your answer ({data.unit}):</label>
          <Input
            type="number"
            step="any"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={`Enter value in ${data.unit}`}
            data-testid="input-calculation"
          />
          {showPlausibilityWarning && (
            <div className="flex items-start gap-2 mt-2 p-2.5 rounded-md bg-amber-500/5 border border-amber-500/15">
              <CircleAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Does this rate look plausible? Check your calculation and units carefully. An unsafe rate is classified as a Major error.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MatchingTask({
  task,
  data,
  onSave,
  existingAnswer,
}: {
  task: ScenarioTask;
  data: MatchingTaskData;
  onSave: (answer: Record<string, string>) => void;
  existingAnswer?: Record<string, string>;
}) {
  const leftItems = data.pairs.map((p) => p.left);
  const [rightItems] = useState(() => shuffleArray([...data.pairs.map((p) => p.right), ...(data.distractors ?? [])]));
  const [matches, setMatches] = useState<Record<string, string>>(existingAnswer ?? {});
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);

  const handleLeftClick = (leftId: string) => {
    setSelectedLeft(leftId);
  };

  const handleRightClick = (rightId: string) => {
    if (!selectedLeft) return;
    const updated = { ...matches, [selectedLeft]: rightId };
    setMatches(updated);
    onSave(updated);
    setSelectedLeft(null);
  };

  const clearMatch = (leftId: string) => {
    const updated = { ...matches };
    delete updated[leftId];
    setMatches(updated);
    onSave(updated);
  };

  const matchedCount = Object.keys(matches).length;
  const totalPairs = leftItems.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-semibold" data-testid="text-task-title">{task.title}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{task.description}</p>
        <Badge variant="secondary" className="mt-1 w-fit">
          {matchedCount}/{totalPairs} matched
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">Select an item on the left, then select its match on the right:</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">Items</p>
            {leftItems.map((item) => {
              const isSelected = selectedLeft === item.id;
              const isMatched = !!matches[item.id];
              const matchedRight = isMatched ? rightItems.find((r) => r.id === matches[item.id]) : null;
              return (
                <div key={item.id}>
                  <button
                    onClick={() => handleLeftClick(item.id)}
                    className={`w-full text-left p-3 rounded-md border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                      isSelected
                        ? "bg-primary/10 border-primary/30"
                        : isMatched
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : "bg-card border-card-border hover-elevate"
                    }`}
                    data-testid={`button-match-left-${item.id}`}
                  >
                    {item.text}
                    {isMatched && matchedRight && (
                      <span className="block text-xs text-emerald-600 dark:text-emerald-400 mt-1 truncate">
                        Matched: {matchedRight.text}
                      </span>
                    )}
                  </button>
                  {isMatched && (
                    <button
                      onClick={() => clearMatch(item.id)}
                      className="text-xs text-muted-foreground mt-0.5 ml-1"
                      data-testid={`button-clear-match-${item.id}`}
                    >
                      Clear match
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">Matches</p>
            {rightItems.map((item) => {
              const isUsed = Object.values(matches).includes(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => handleRightClick(item.id)}
                  disabled={!selectedLeft}
                  className={`w-full text-left p-3 rounded-md border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                    isUsed
                      ? "bg-emerald-500/10 border-emerald-500/30 opacity-60"
                      : selectedLeft
                        ? "bg-card border-card-border hover-elevate cursor-pointer"
                        : "bg-card border-card-border opacity-60"
                  }`}
                  data-testid={`button-match-right-${item.id}`}
                >
                  {item.text}
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultsScreen({
  result,
  moduleName,
  tasks,
  onRetry,
  onBack,
  assignmentStatus,
}: {
  result: ScoringResult;
  moduleName: string;
  tasks: ScenarioTask[];
  onRetry: () => void;
  onBack: () => void;
  assignmentStatus?: string;
}) {
  const passed = result.passed;
  const isLocked = assignmentStatus === "locked";

  const majorErrors = result.errors.filter((e) => e.classification === "MAJOR");
  const minorErrors = result.errors.filter((e) => e.classification === "MINOR");

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <Card className="animate-fade-in-up">
        <CardContent className="p-6 text-center space-y-4">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full animate-scale-in ${
            passed ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
          }`}>
            {passed ? (
              <Trophy className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="w-8 h-8 text-destructive" />
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold" data-testid="text-result-title">
              {passed ? "Assessment Passed" : "Assessment Not Passed"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">{moduleName}</p>
          </div>
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <p className="font-serif text-2xl font-light text-destructive" data-testid="text-major-count">{result.majorCount}</p>
              <p className="text-xs text-muted-foreground">Major Errors</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-center">
              <p className="font-serif text-2xl font-light text-amber-600 dark:text-amber-400" data-testid="text-minor-count">{result.minorCount}</p>
              <p className="text-xs text-muted-foreground">Minor Errors</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {majorErrors.length > 0 && (
        <Card className="border-destructive/20 animate-fade-in-up animate-delay-100">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-md bg-destructive/10">
                <ShieldAlert className="w-3.5 h-3.5 text-destructive" />
              </div>
              <h3 className="font-semibold text-sm text-destructive">Major Errors ({majorErrors.length})</h3>
            </div>
            <p className="text-xs text-muted-foreground">Any Major error results in a fail. These represent critical safety risks.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {majorErrors.map((err, i) => (
              <div
                key={`major-${i}`}
                className="p-3 rounded-md bg-destructive/5 border border-destructive/15"
                data-testid={`error-major-${i}`}
              >
                <p className="text-sm font-medium">{err.detail}</p>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">Why it matters:</strong> {err.rationale}
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">Correct action:</strong> Review the correct procedure and ensure this step is performed safely.
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {minorErrors.length > 0 && (
        <Card className="border-amber-500/20 animate-fade-in-up animate-delay-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-500/10">
                <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="font-semibold text-sm text-amber-600 dark:text-amber-400">Minor Errors ({minorErrors.length})</h3>
            </div>
            <p className="text-xs text-muted-foreground">4 or more Minor errors results in a fail. These represent areas for improvement.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {minorErrors.map((err, i) => (
              <div
                key={`minor-${i}`}
                className="p-3 rounded-md bg-amber-500/5 border border-amber-500/15"
                data-testid={`error-minor-${i}`}
              >
                <p className="text-sm font-medium">{err.detail}</p>
                <div className="mt-1.5 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">{err.rationale}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {result.errors.length === 0 && passed && (
        <Card className="border-emerald-500/20 animate-fade-in-up animate-delay-100">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Perfect score</p>
                <p className="text-xs text-muted-foreground mt-0.5">No errors detected. Well done on demonstrating full competency.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isLocked && (
        <Card className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/5 animate-fade-in-up animate-delay-300">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Module Locked</p>
                <p className="text-xs text-muted-foreground mt-1">
                  You must not perform this skill independently until you have completed face-to-face
                  training and received sign-off from your trainer.
                </p>
                <Button size="sm" variant="outline" className="mt-2 border-amber-500/30 text-amber-700 dark:text-amber-400" data-testid="button-book-signoff-result">
                  Book face-to-face sign-off
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack} data-testid="button-back-dashboard">
          <ArrowLeft className="w-4 h-4 mr-1" /> Dashboard
        </Button>
        {!isLocked && !passed && (
          <Button className="flex-1" onClick={onRetry} data-testid="button-retry">
            <RotateCcw className="w-4 h-4 mr-1" /> Retry
          </Button>
        )}
      </div>
    </div>
  );
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
