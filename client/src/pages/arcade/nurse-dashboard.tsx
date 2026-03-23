import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  Lock,
  Clock,
  ArrowRight,
  AlertTriangle,
  Syringe,
  Heart,
  Droplets,
  Wrench,
  Stethoscope,
  Activity,
  Search,
  ShieldAlert,
  Info,
  CircleDot,
  Pill,
  ClipboardList,
  Timer,
  Wind,
  CloudFog,
  BarChart3,
  Thermometer,
  Settings,
  ShieldCheck,
  FileText,
  Scan,
  Layers,
  Scissors,
  Gauge,
  Footprints,
  HeartHandshake,
  MonitorCheck,
  FileCheck,
  Utensils,
  Scale,
  GlassWater,
  PersonStanding,
  Brain,
  Shield,
  Circle,
  AlertCircle,
  GraduationCap,
} from "lucide-react";

const iconMap: Record<string, any> = {
  Syringe, Heart, Droplets, Wrench, Stethoscope, Activity, BookOpen,
  Pill, ClipboardList, Lock, Timer, Wind, CloudFog, CircleDot, BarChart3,
  Thermometer, Settings, ShieldCheck, FileText, Scan, Layers, Scissors,
  Gauge, Footprints, AlertTriangle, HeartHandshake, MonitorCheck, FileCheck,
  Utensils, Scale, GlassWater, PersonStanding, Brain, Shield, Circle,
  AlertCircle, GraduationCap,
};

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  not_started: { label: "Not Started", color: "bg-muted text-muted-foreground", icon: CircleDot },
  in_progress: { label: "In Progress", color: "bg-primary/10 text-primary", icon: BookOpen },
  passed: { label: "Passed", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
  failed: { label: "Failed", color: "bg-destructive/10 text-destructive", icon: XCircle },
  locked: { label: "Locked", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: Lock },
};

interface AssignmentItem {
  id: string;
  moduleId: string;
  moduleName: string;
  moduleDescription: string;
  moduleIcon: string;
  moduleColor: string;
  status: string;
  dueAt: string | null;
  attemptCount: number;
  failedAttempts: number;
  lastAttemptResult: string | null;
  moduleVersionId: string;
}

interface DashboardData {
  assignments: AssignmentItem[];
  stats: {
    totalAssigned: number;
    completed: number;
    inProgress: number;
    locked: number;
  };
}

type FilterCategory = "all" | "due_soon" | "locked" | "completed";

export default function NurseDashboard() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("all");
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/nurse/dashboard"],
  });

  const stats = data?.stats ?? { totalAssigned: 0, completed: 0, inProgress: 0, locked: 0 };
  const assignments = data?.assignments ?? [];
  const completionPercent = stats.totalAssigned > 0 ? Math.round((stats.completed / stats.totalAssigned) * 100) : 0;

  const filteredAssignments = useMemo(() => {
    let filtered = assignments;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((a) =>
        a.moduleName.toLowerCase().includes(q) ||
        a.moduleDescription.toLowerCase().includes(q)
      );
    }

    switch (activeFilter) {
      case "due_soon":
        filtered = filtered.filter((a) => a.status !== "passed" && a.status !== "locked");
        break;
      case "locked":
        filtered = filtered.filter((a) => a.status === "locked");
        break;
      case "completed":
        filtered = filtered.filter((a) => a.status === "passed");
        break;
    }

    return filtered;
  }, [assignments, searchQuery, activeFilter]);

  const lockedAssignments = assignments.filter((a) => a.status === "locked");
  const activeAssignments = filteredAssignments.filter((a) => a.status !== "passed" && a.status !== "locked");
  const passedAssignments = filteredAssignments.filter((a) => a.status === "passed");
  const lockedFiltered = filteredAssignments.filter((a) => a.status === "locked");

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-8" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="w-10 h-10 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-2 w-full mt-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const filterButtons: { key: FilterCategory; label: string; count: number }[] = [
    { key: "all", label: "All", count: assignments.length },
    { key: "due_soon", label: "Active", count: assignments.filter((a) => a.status !== "passed" && a.status !== "locked").length },
    { key: "locked", label: "Locked", count: assignments.filter((a) => a.status === "locked").length },
    { key: "completed", label: "Completed", count: assignments.filter((a) => a.status === "passed").length },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">
          Welcome back, {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your clinical competency modules
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Assigned</p>
            <p className="text-2xl font-bold mt-1" data-testid="text-stat-assigned">{stats.totalAssigned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Completed</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400" data-testid="text-stat-completed">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">In Progress</p>
            <p className="text-2xl font-bold mt-1 text-primary" data-testid="text-stat-progress">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Locked</p>
            <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400" data-testid="text-stat-locked">{stats.locked}</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between gap-4 mb-2">
          <p className="text-sm font-medium">Overall Progress</p>
          <p className="text-sm text-muted-foreground">{completionPercent}%</p>
        </div>
        <Progress value={completionPercent} className="h-2" />
      </div>

      {lockedAssignments.length > 0 && activeFilter !== "completed" && (
        <Card className="border-amber-500/30 bg-amber-500/5 dark:bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-amber-500/10 shrink-0">
                <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  {lockedAssignments.length} module{lockedAssignments.length > 1 ? "s" : ""} locked
                </p>
                <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                  You must not perform {lockedAssignments.length > 1 ? "these skills" : "this skill"} independently until cleared by your trainer.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {lockedAssignments.map((a) => a.moduleName).join(", ")}
                </p>
              </div>
              <Link href="/remediation-info">
                <Button size="sm" variant="outline" className="shrink-0 border-amber-500/30 text-amber-700 dark:text-amber-400" data-testid="button-book-signoff">
                  Book face-to-face sign-off
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-modules"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {filterButtons.map((f) => (
              <Button
                key={f.key}
                variant={activeFilter === f.key ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFilter(f.key)}
                className="toggle-elevate"
                data-testid={`button-filter-${f.key}`}
              >
                {f.label}
                {f.count > 0 && (
                  <span className="ml-1.5 text-xs opacity-70">{f.count}</span>
                )}
              </Button>
            ))}
          </div>
        </div>

        {filteredAssignments.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <BookOpen className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {assignments.length === 0
                  ? "No modules assigned yet."
                  : "No modules match your search or filter."}
              </p>
              {assignments.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Your trainer will assign modules to you.</p>
              )}
            </CardContent>
          </Card>
        )}

        {activeAssignments.length > 0 && (activeFilter === "all" || activeFilter === "due_soon") && (
          <div className="space-y-3">
            {activeFilter === "all" && (
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Active</h2>
            )}
            {activeAssignments.map((a) => (
              <ModuleCard key={a.id} assignment={a} />
            ))}
          </div>
        )}

        {lockedFiltered.length > 0 && (activeFilter === "all" || activeFilter === "locked") && (
          <div className="space-y-3">
            {activeFilter === "all" && (
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mt-4">Locked — Needs Sign-off</h2>
            )}
            {lockedFiltered.map((a) => (
              <ModuleCard key={a.id} assignment={a} />
            ))}
          </div>
        )}

        {passedAssignments.length > 0 && (activeFilter === "all" || activeFilter === "completed") && (
          <div className="space-y-3">
            {activeFilter === "all" && (
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mt-4">Completed</h2>
            )}
            {passedAssignments.map((a) => (
              <ModuleCard key={a.id} assignment={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleCard({ assignment: a }: { assignment: AssignmentItem }) {
  const Icon = iconMap[a.moduleIcon] || BookOpen;
  const sc = statusConfig[a.status] || statusConfig.not_started;
  const StatusIcon = sc.icon;
  const isLocked = a.status === "locked";
  const isPassed = a.status === "passed";
  const maxFails = 4;

  return (
    <Card className={isLocked ? "opacity-80 border-amber-500/20" : isPassed ? "opacity-90" : "hover-elevate"} data-testid={`card-module-${a.moduleId}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <div className={`flex items-center justify-center w-11 h-11 rounded-md shrink-0 ${
            isLocked ? "bg-amber-500/10" : isPassed ? "bg-emerald-500/10" : "bg-primary/10"
          }`}>
            {isLocked ? (
              <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            ) : isPassed ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Icon className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm" data-testid={`text-module-name-${a.moduleId}`}>{a.moduleName}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.moduleDescription}</p>
              </div>
              <Badge variant="secondary" className={sc.color} data-testid={`badge-status-${a.moduleId}`}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {sc.label}
              </Badge>
            </div>

            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
              <span data-testid={`text-attempts-${a.moduleId}`}>
                Attempts: {a.attemptCount}
              </span>
              {a.failedAttempts > 0 && (
                <span className={`font-medium ${a.failedAttempts >= maxFails ? "text-amber-600 dark:text-amber-400" : "text-destructive"}`} data-testid={`text-fails-${a.moduleId}`}>
                  Fails: {a.failedAttempts}/{maxFails}
                </span>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="inline-flex items-center gap-1 text-muted-foreground" data-testid={`button-rules-info-${a.moduleId}`}>
                    <Info className="w-3 h-3" />
                    <span>Scoring rules</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[250px]">
                  <p className="text-xs font-medium mb-1">Pass criteria:</p>
                  <ul className="text-xs space-y-0.5">
                    <li>0 Major errors</li>
                    <li>3 or fewer Minor errors</li>
                  </ul>
                  <p className="text-xs mt-1.5 text-muted-foreground">Module locks after 4 failed attempts.</p>
                </TooltipContent>
              </Tooltip>
              {a.dueAt && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Due {new Date(a.dueAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {isLocked && (
              <div className="mt-3 p-2.5 rounded-md bg-amber-500/5 border border-amber-500/15">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      You must not perform this skill independently until cleared
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Contact your trainer to book a face-to-face sign-off session.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 mt-3">
              {isLocked ? (
                <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-400" data-testid={`button-signoff-${a.moduleId}`}>
                  Book sign-off
                </Button>
              ) : (
                <Link href={`/scenario/${a.id}`}>
                  <Button size="sm" variant={isPassed ? "outline" : "default"} data-testid={`button-start-${a.moduleId}`}>
                    {a.status === "not_started" ? "Start" : isPassed ? "Review" : "Continue"}
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
