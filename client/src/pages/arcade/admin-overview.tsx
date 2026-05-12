import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Search, Users, Loader2, Gamepad2, Shield, BookOpen, Trophy, ArrowRight } from "lucide-react";

type AssignableNurse = {
  nurseId: string;
  name: string;
  email: string;
  arcadeUserId: string | null;
  currentStage: string;
  assignmentCount: number;
  completedCount: number;
};

type ArcadeModule = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  scenarioCount: number;
  assignmentCount: number;
};

export default function ArcadeAdminOverview() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [assignTarget, setAssignTarget] = useState<AssignableNurse | null>(null);
  const [selectedModuleIds, setSelectedModuleIds] = useState<Set<string>>(new Set());
  const [moduleSearch, setModuleSearch] = useState("");

  const { data: nurses, isLoading } = useQuery<AssignableNurse[]>({
    queryKey: ["/api/admin/assignable-nurses"],
  });

  const { data: modules } = useQuery<ArcadeModule[]>({
    queryKey: ["/api/admin/modules"],
    enabled: !!assignTarget,
  });

  const { data: nurseAssignments } = useQuery<{
    moduleIds: string[];
    assignments: Array<{ moduleId: string; status: string }>;
  }>({
    queryKey: ["/api/admin/nurse-assignments", assignTarget?.nurseId],
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/admin/nurse-assignments/${assignTarget!.nurseId}`);
      return r.json();
    },
    enabled: !!assignTarget,
  });

  const assignedStatusByModuleId = useMemo(() => {
    const map = new Map<string, string>();
    nurseAssignments?.assignments.forEach((a) => map.set(a.moduleId, a.status));
    return map;
  }, [nurseAssignments]);

  useEffect(() => {
    if (!assignTarget) {
      setSelectedModuleIds(new Set());
      setModuleSearch("");
    }
  }, [assignTarget]);

  const filteredNurses = useMemo(() => {
    if (!nurses) return [];
    const q = search.trim().toLowerCase();
    if (!q) return nurses;
    return nurses.filter(
      (n) => n.name.toLowerCase().includes(q) || n.email.toLowerCase().includes(q),
    );
  }, [nurses, search]);

  const filteredModules = useMemo(() => {
    if (!modules) return [];
    const q = moduleSearch.trim().toLowerCase();
    if (!q) return modules;
    return modules.filter(
      (m) => m.name.toLowerCase().includes(q) || (m.description ?? "").toLowerCase().includes(q),
    );
  }, [modules, moduleSearch]);

  const totals = useMemo(() => {
    if (!nurses) return { total: 0, withAssignments: 0, none: 0 };
    return {
      total: nurses.length,
      withAssignments: nurses.filter((n) => n.assignmentCount > 0).length,
      none: nurses.filter((n) => n.assignmentCount === 0).length,
    };
  }, [nurses]);

  const assignMutation = useMutation({
    mutationFn: async (input: { nurseId: string; moduleIds: string[] }) => {
      const r = await apiRequest("POST", "/api/admin/assign", {
        moduleIds: input.moduleIds,
        nurseIds: [input.nurseId],
      });
      const json = (await r.json()) as {
        assignedCount: number;
        emailsSent: number;
        emailFailures: Array<{ error?: string }>;
      };
      return { ...json, totalRequested: input.moduleIds.length };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/assignable-nurses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/modules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/nurse-assignments"] });
      const skipped = res.totalRequested - res.assignedCount;
      const parts: string[] = [];
      if (res.assignedCount > 0) {
        parts.push(`${res.assignedCount} module${res.assignedCount === 1 ? "" : "s"} assigned`);
      } else {
        parts.push("All selected modules were already assigned");
      }
      if (skipped > 0 && res.assignedCount > 0) parts.push(`${skipped} already assigned`);
      if (res.emailsSent > 0) parts.push(`email sent`);
      else if (res.assignedCount > 0 && res.emailFailures.length === 0) {
        parts.push("no email (Outlook not configured)");
      } else if (res.emailFailures.length > 0) {
        parts.push(`email failed: ${res.emailFailures[0].error ?? "unknown"}`);
      }
      toast({
        title: "Modules assigned",
        description: parts.join(" — "),
      });
      setAssignTarget(null);
    },
    onError: (e: any) => {
      toast({
        title: "Assignment failed",
        description: e?.message ?? "Could not assign modules.",
        variant: "destructive",
      });
    },
  });

  function toggleModule(id: string) {
    setSelectedModuleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllShown() {
    setSelectedModuleIds((prev) => {
      const next = new Set(prev);
      const selectable = filteredModules.filter((m) => !assignedStatusByModuleId.has(m.id));
      const allSelected = selectable.length > 0 && selectable.every((m) => next.has(m.id));
      if (allSelected) {
        selectable.forEach((m) => next.delete(m.id));
      } else {
        selectable.forEach((m) => next.add(m.id));
      }
      return next;
    });
  }

  function statusLabel(status: string) {
    switch (status) {
      case "passed":
      case "completed":
        return "Completed";
      case "in_progress":
        return "In progress";
      case "failed":
        return "Failed";
      default:
        return "Assigned";
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto" data-testid="arcade-admin-overview">
      <header className="flex flex-col gap-2">
        <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
          Skills Arcade
        </span>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl font-light tracking-tight">
              Assign clinical scenarios
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Pick a nurse and assign Skills Arcade modules in one step. Nurses who have never
              logged in are set up automatically — no separate invite needed.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild data-testid="link-modules">
              <Link href="/arcade/admin/modules">
                <Shield className="w-4 h-4 mr-2" />
                Manage modules
              </Link>
            </Button>
            <Button variant="outline" asChild data-testid="link-reports">
              <Link href="/arcade/admin/reports">
                <BookOpen className="w-4 h-4 mr-2" />
                Reports
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile label="Nurses" value={totals.total} icon={Users} />
        <StatTile label="With assignments" value={totals.withAssignments} icon={Trophy} />
        <StatTile label="No modules yet" value={totals.none} icon={Gamepad2} />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search nurses by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-nurses"
        />
      </div>

      <Card>
        <CardContent className="p-0 divide-y">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filteredNurses.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {nurses && nurses.length === 0
                ? "No nurses on the platform yet. Register one from the Nurses page."
                : "No nurses match your search."}
            </div>
          ) : (
            filteredNurses.map((n) => (
              <div
                key={n.nurseId}
                className="flex items-center gap-4 p-4 hover-elevate"
                data-testid={`nurse-row-${n.nurseId}`}
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                  {initials(n.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{n.name}</span>
                    {!n.arcadeUserId && (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wider">
                        New to arcade
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {n.currentStage.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{n.email}</div>
                </div>
                <div className="hidden sm:flex flex-col items-end text-right text-xs text-muted-foreground min-w-[110px]">
                  <span>
                    <span className="font-serif text-base text-foreground">
                      {n.assignmentCount}
                    </span>{" "}
                    assigned
                  </span>
                  <span>{n.completedCount} completed</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => setAssignTarget(n)}
                  data-testid={`button-assign-${n.nurseId}`}
                >
                  Assign modules
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!assignTarget} onOpenChange={(open) => !open && setAssignTarget(null)}>
        <DialogContent className="max-w-lg" aria-describedby="assign-modules-desc">
          <DialogHeader>
            <DialogTitle>Assign modules to {assignTarget?.name}</DialogTitle>
            <DialogDescription id="assign-modules-desc">
              Pick the Skills Arcade modules this nurse should complete. Modules they're already
              assigned will be skipped automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search modules..."
                value={moduleSearch}
                onChange={(e) => setModuleSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-modules"
              />
            </div>

            {modules && modules.length > 0 && (
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={selectAllShown}
                  data-testid="button-toggle-all-modules"
                >
                  {(() => {
                    const selectable = filteredModules.filter(
                      (m) => !assignedStatusByModuleId.has(m.id),
                    );
                    return selectable.length > 0 && selectable.every((m) => selectedModuleIds.has(m.id))
                      ? "Clear selection"
                      : `Select all new (${selectable.length})`;
                  })()}
                </button>
                <span className="text-muted-foreground">
                  {selectedModuleIds.size} selected
                  {assignedStatusByModuleId.size > 0 && (
                    <> · {assignedStatusByModuleId.size} already assigned</>
                  )}
                </span>
              </div>
            )}

            <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
              {!modules ? (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : filteredModules.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">
                  No modules match your search.
                </p>
              ) : (
                [...filteredModules]
                  .sort((a, b) => {
                    const aAssigned = assignedStatusByModuleId.has(a.id) ? 1 : 0;
                    const bAssigned = assignedStatusByModuleId.has(b.id) ? 1 : 0;
                    if (aAssigned !== bAssigned) return aAssigned - bAssigned;
                    return a.name.localeCompare(b.name);
                  })
                  .map((m) => {
                    const existingStatus = assignedStatusByModuleId.get(m.id);
                    const isAssigned = !!existingStatus;
                    const checked = selectedModuleIds.has(m.id);
                    return (
                      <label
                        key={m.id}
                        className={`flex items-start gap-3 p-3 ${
                          isAssigned
                            ? "opacity-60 cursor-not-allowed bg-muted/30"
                            : "cursor-pointer hover-elevate"
                        }`}
                        data-testid={`module-option-${m.id}`}
                      >
                        <Checkbox
                          checked={isAssigned ? true : checked}
                          disabled={isAssigned}
                          onCheckedChange={() => !isAssigned && toggleModule(m.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-sm font-medium">{m.name}</div>
                            {isAssigned && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] uppercase tracking-wider shrink-0"
                              >
                                {statusLabel(existingStatus!)}
                              </Badge>
                            )}
                          </div>
                          {m.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2">
                              {m.description}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                assignTarget &&
                assignMutation.mutate({
                  nurseId: assignTarget.nurseId,
                  moduleIds: Array.from(selectedModuleIds),
                })
              }
              disabled={selectedModuleIds.size === 0 || assignMutation.isPending}
              data-testid="button-confirm-assign"
            >
              {assignMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Assign ({selectedModuleIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: any;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <div className="font-serif text-2xl font-light leading-none">{value}</div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
