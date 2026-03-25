import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Upload, BookOpen, Settings, Loader2, Users, FileJson, ChevronDown,
  ChevronUp, ListOrdered, GitBranch, Calculator, Link2, ShieldAlert, Info,
  Search, ArrowRight, CheckCircle2, XCircle, CircleDot,
} from "lucide-react";
import type { Module, ScenarioContent, ScenarioTask, OrderingTaskData, MatchingTaskData, DecisionTaskData, CalculationTaskData } from "@shared/schema";

type ModuleContentResponse = {
  module: { id: string; name: string; description: string; icon: string; color: string; currentVersion: string };
  version: string;
  config: any;
  scenarios: Array<{ id: string; title: string; content: ScenarioContent }>;
};

const taskTypeConfig: Record<string, { label: string; icon: any; color: string }> = {
  ordering: { label: "Ordering", icon: ListOrdered, color: "bg-primary/10 text-primary" },
  decision: { label: "Decision Tree", icon: GitBranch, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  calculation: { label: "Calculation", icon: Calculator, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  matching: { label: "Matching", icon: Link2, color: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
};

function OrderingTaskView({ data }: { data: OrderingTaskData }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Correct Order</p>
      <ol className="space-y-1">
        {data.correctOrder.map((step, idx) => (
          <li key={step.id} className="flex items-start gap-2 text-sm" data-testid={`ordering-step-${step.id}`}>
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
              {idx + 1}
            </span>
            <span className="flex-1">{step.text}</span>
          </li>
        ))}
      </ol>
      {data.distractors && data.distractors.length > 0 && (
        <div className="mt-3 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Distractors</p>
          {data.distractors.map((d) => (
            <div key={d.id} className="flex items-start gap-2 text-sm rounded-md bg-destructive/5 p-2" data-testid={`distractor-${d.id}`}>
              <XCircle className="w-4 h-4 shrink-0 text-destructive mt-0.5" />
              <div className="flex-1">
                <p>{d.text}</p>
                {d.errorClassification && (
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge variant="secondary" className={d.errorClassification === "MAJOR" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}>
                      {d.errorClassification === "MAJOR" ? <ShieldAlert className="w-3 h-3 mr-0.5" /> : <Info className="w-3 h-3 mr-0.5" />}
                      {d.errorClassification}
                    </Badge>
                    {d.errorRationale && <span className="text-xs text-muted-foreground">{d.errorRationale}</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DecisionTaskView({ data }: { data: DecisionTaskData }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Decision Nodes</p>
      {data.nodes.map((node, nodeIdx) => (
        <div key={node.id} className="rounded-md border bg-muted/30 p-3 space-y-2" data-testid={`decision-node-${node.id}`}>
          <div className="flex items-start gap-2 flex-wrap">
            <Badge variant="secondary" className="shrink-0">
              {node.id === data.startNodeId ? "Start" : `Node ${nodeIdx + 1}`}
            </Badge>
            <p className="text-sm flex-1">{node.prompt}</p>
          </div>
          <div className="space-y-1 ml-2">
            {node.options.map((opt) => (
              <div
                key={opt.id}
                className={`flex items-start gap-2 text-sm rounded-md p-2 ${opt.isCorrect ? "bg-emerald-500/5" : "bg-destructive/5"}`}
                data-testid={`decision-option-${opt.id}`}
              >
                {opt.isCorrect ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0 text-destructive mt-0.5" />
                )}
                <div className="flex-1">
                  <p>{opt.text}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {opt.isCorrect && opt.nextNodeId && (
                      <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                        <ArrowRight className="w-3 h-3" /> {opt.nextNodeId}
                      </span>
                    )}
                    {!opt.isCorrect && opt.errorClassification && (
                      <Badge variant="secondary" className={opt.errorClassification === "MAJOR" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}>
                        {opt.errorClassification === "MAJOR" ? <ShieldAlert className="w-3 h-3 mr-0.5" /> : <Info className="w-3 h-3 mr-0.5" />}
                        {opt.errorClassification}
                      </Badge>
                    )}
                    {opt.feedback && <span className="text-xs text-muted-foreground">{opt.feedback}</span>}
                  </div>
                  {opt.errorRationale && (
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.errorRationale}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CalculationTaskView({ data }: { data: CalculationTaskData }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Calculation</p>
      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
        <p className="text-sm">{data.question}</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">Formula</span>
            <p className="font-mono text-xs bg-muted rounded px-2 py-1 mt-0.5">{data.formula}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Correct Answer</span>
            <p className="font-bold mt-0.5">{data.correctAnswer} {data.unit}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">Inputs</span>
            <div className="space-y-0.5 mt-0.5">
              {Object.entries(data.inputs).map(([key, val]) => (
                <p key={key} className="text-xs"><span className="font-mono">{key}</span> = {val}</p>
              ))}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Tolerance</span>
            <p className="mt-0.5">{data.tolerance} {data.unit}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className={data.errorClassification === "MAJOR" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}>
            {data.errorClassification === "MAJOR" ? <ShieldAlert className="w-3 h-3 mr-0.5" /> : <Info className="w-3 h-3 mr-0.5" />}
            {data.errorClassification} error if incorrect
          </Badge>
          {data.errorRationale && <span className="text-xs text-muted-foreground">{data.errorRationale}</span>}
        </div>
      </div>
    </div>
  );
}

function MatchingTaskView({ data }: { data: MatchingTaskData }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Correct Pairs</p>
      <div className="space-y-1">
        {data.pairs.map((pair, idx) => (
          <div key={idx} className="flex items-center gap-2 text-sm rounded-md bg-muted/30 p-2" data-testid={`matching-pair-${idx}`}>
            <span className="flex-1 text-right">{pair.left.text}</span>
            <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">{pair.right.text}</span>
          </div>
        ))}
      </div>
      {data.distractors && data.distractors.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Distractor Items</p>
          {data.distractors.map((d) => (
            <div key={d.id} className="flex items-center gap-2 text-sm rounded-md bg-destructive/5 p-2">
              <XCircle className="w-4 h-4 shrink-0 text-destructive" />
              <span>{d.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskView({ task }: { task: ScenarioTask }) {
  const config = taskTypeConfig[task.type] || taskTypeConfig.ordering;
  const Icon = config.icon;

  return (
    <div className="space-y-2" data-testid={`task-view-${task.id}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className={config.color}>
          <Icon className="w-3 h-3 mr-1" />{config.label}
        </Badge>
        <span className="text-sm font-medium">{task.title}</span>
      </div>
      <p className="text-xs text-muted-foreground">{task.description}</p>

      {task.type === "ordering" && <OrderingTaskView data={task.data as OrderingTaskData} />}
      {task.type === "decision" && <DecisionTaskView data={task.data as DecisionTaskData} />}
      {task.type === "calculation" && <CalculationTaskView data={task.data as CalculationTaskData} />}
      {task.type === "matching" && <MatchingTaskView data={task.data as MatchingTaskData} />}
    </div>
  );
}

function ModuleContentPanel({ moduleId }: { moduleId: string }) {
  const { data, isLoading } = useQuery<ModuleContentResponse>({
    queryKey: [`/api/admin/modules/${moduleId}/content`],
  });

  if (isLoading) {
    return (
      <div className="space-y-3 pt-3 border-t mt-3">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  if (!data || data.scenarios.length === 0) {
    return (
      <div className="pt-3 border-t mt-3">
        <p className="text-sm text-muted-foreground text-center py-4">No scenarios configured for this module</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-3 border-t mt-3">
      {data.config && typeof data.config === "object" && Object.keys(data.config).length > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span>Config:</span>
          {Object.entries(data.config).map(([key, val]) => (
            <Badge key={key} variant="secondary">
              {key}: {String(val)}
            </Badge>
          ))}
        </div>
      )}

      {data.scenarios.map((scenario) => (
        <div key={scenario.id} className="space-y-3" data-testid={`scenario-content-${scenario.id}`}>
          <h4 className="text-sm font-semibold">{scenario.title}</h4>
          {scenario.content.tasks.map((task) => (
            <TaskView key={task.id} task={task} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function AdminModules() {
  const { toast } = useToast();
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [assignModuleId, setAssignModuleId] = useState<string | null>(null);
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: modules, isLoading } = useQuery<(Module & { scenarioCount: number; assignmentCount: number })[]>({
    queryKey: ["/api/admin/modules"],
  });

  const { data: users } = useQuery<Array<{ id: string; name: string; role: string }>>({
    queryKey: ["/api/admin/users"],
  });

  const importMutation = useMutation({
    mutationFn: async (json: string) => {
      const parsed = JSON.parse(json);
      await apiRequest("POST", "/api/admin/scenarios/import", parsed);
    },
    onSuccess: () => {
      toast({ title: "Import successful" });
      setShowImport(false);
      setImportJson("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/modules"] });
    },
    onError: (e: Error) => {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ moduleId, userIds }: { moduleId: string; userIds: string[] }) => {
      await apiRequest("POST", "/api/admin/assign", { moduleId, userIds });
    },
    onSuccess: () => {
      toast({ title: "Module assigned" });
      setShowAssign(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/modules"] });
    },
    onError: (e: Error) => {
      toast({ title: "Assignment failed", description: e.message, variant: "destructive" });
    },
  });

  const nurses = users?.filter((u) => u.role === "nurse") ?? [];

  const filteredModules = (modules ?? []).filter((mod) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return mod.name.toLowerCase().includes(q) || (mod.description ?? "").toLowerCase().includes(q);
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Pre-Induction</p>
          <h1 className="font-serif text-2xl font-light tracking-tight" data-testid="text-admin-modules-title">Skill Modules</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage clinical competency modules and scenarios</p>
        </div>
        <Button onClick={() => setShowImport(true)} data-testid="button-import-json">
          <Upload className="w-4 h-4 mr-1" /> Import JSON
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search modules..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-modules"
        />
      </div>

      {filteredModules.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No modules found.</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {filteredModules.map((mod) => {
          const isExpanded = expandedModuleId === mod.id;
          return (
            <Card key={mod.id} data-testid={`card-admin-module-${mod.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 shrink-0">
                      <BookOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm">{mod.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{mod.description}</p>
                    </div>
                  </div>
                  <Badge variant="secondary">v{mod.currentVersion}</Badge>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <FileJson className="w-3 h-3" />
                    {mod.scenarioCount} scenarios
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {mod.assignmentCount} assigned
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Button
                    size="sm"
                    variant={isExpanded ? "default" : "outline"}
                    onClick={() => setExpandedModuleId(isExpanded ? null : mod.id)}
                    data-testid={`button-view-content-${mod.id}`}
                  >
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
                    {isExpanded ? "Hide Content" : "View Content"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAssignModuleId(mod.id);
                      setShowAssign(true);
                    }}
                    data-testid={`button-assign-${mod.id}`}
                  >
                    <Users className="w-3.5 h-3.5 mr-1" /> Assign to Nurses
                  </Button>
                </div>

                {isExpanded && <ModuleContentPanel moduleId={mod.id} />}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Scenario JSON</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste a JSON scenario to import into the system. This will create or update the module and its scenarios.
            </p>
            <Textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='{"module": {...}, "scenarios": [...]}'
              className="min-h-[200px] font-mono text-xs"
              data-testid="textarea-import-json"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>Cancel</Button>
            <Button
              onClick={() => importMutation.mutate(importJson)}
              disabled={!importJson.trim() || importMutation.isPending}
              data-testid="button-confirm-import"
            >
              {importMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAssign} onOpenChange={setShowAssign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Module to Nurses</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {nurses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No nurses found.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {nurses.map((nurse) => (
                  <label
                    key={nurse.id}
                    className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="rounded"
                      data-testid={`checkbox-nurse-${nurse.id}`}
                      data-nurse-id={nurse.id}
                    />
                    <span className="text-sm">{nurse.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const checked = document.querySelectorAll<HTMLInputElement>('[data-nurse-id]:checked');
                const ids = Array.from(checked).map((el) => el.dataset.nurseId!);
                if (assignModuleId && ids.length > 0) {
                  assignMutation.mutate({ moduleId: assignModuleId, userIds: ids });
                }
              }}
              disabled={assignMutation.isPending}
              data-testid="button-confirm-assign"
            >
              {assignMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
