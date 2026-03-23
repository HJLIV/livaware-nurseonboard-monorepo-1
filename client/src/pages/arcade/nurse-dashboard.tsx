import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import {
  BookOpen, CheckCircle2, XCircle, Lock, Clock, ArrowRight, AlertTriangle,
  Syringe, Heart, Droplets, Wrench, Stethoscope, Activity, Search, ShieldAlert,
  Info, CircleDot, Pill, ClipboardList, Timer, Wind, CloudFog, BarChart3,
  Thermometer, Settings, ShieldCheck, FileText, Scan, Layers, Scissors, Gauge,
  Footprints, HeartHandshake, MonitorCheck, FileCheck, Utensils, Scale,
  GlassWater, PersonStanding, Brain, Shield, Circle, AlertCircle, GraduationCap,
  Trophy, Target,
} from "lucide-react";

const iconMap: Record<string, any> = {
  Syringe, Heart, Droplets, Wrench, Stethoscope, Activity, BookOpen,
  Pill, ClipboardList, Lock, Timer, Wind, CloudFog, CircleDot, BarChart3,
  Thermometer, Settings, ShieldCheck, FileText, Scan, Layers, Scissors,
  Gauge, Footprints, AlertTriangle, HeartHandshake, MonitorCheck, FileCheck,
  Utensils, Scale, GlassWater, PersonStanding, Brain, Shield, Circle,
  AlertCircle, GraduationCap,
};

const statusConfig: Record<string, { label: string; color: string; icon: any; dot: string }> = {
  not_started: { label: "Not Started", color: "bg-muted text-muted-foreground", icon: CircleDot, dot: "bg-muted-foreground" },
  in_progress: { label: "In Progress", color: "bg-primary/10 text-primary", icon: BookOpen, dot: "bg-primary" },
  passed: { label: "Passed", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: CheckCircle2, dot: "bg-emerald-400" },
  failed: { label: "Failed", color: "bg-destructive/10 text-destructive", icon: XCircle, dot: "bg-destructive" },
  locked: { label: "Locked", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: Lock, dot: "bg-amber-400" },
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
  isAdmin?: boolean;
  assignments: AssignmentItem[];
  stats: { totalAssigned: number; completed: number; inProgress: number; locked: number };
}

type FilterCategory = "all" | "due_soon" | "locked" | "completed";

const statCards = [
  { key: "totalAssigned" as const, label: "Assigned", icon: Target, gradient: "from-blue-500/8", ring: "ring-blue-500/20", iconBg: "bg-blue-500/15", iconColor: "text-blue-400" },
  { key: "completed" as const, label: "Completed", icon: Trophy, gradient: "from-emerald-500/8", ring: "ring-emerald-500/20", iconBg: "bg-emerald-500/15", iconColor: "text-emerald-400" },
  { key: "inProgress" as const, label: "In Progress", icon: BookOpen, gradient: "from-primary/8", ring: "ring-primary/20", iconBg: "bg-primary/12", iconColor: "text-primary" },
  { key: "locked" as const, label: "Locked", icon: Lock, gradient: "from-amber-500/8", ring: "ring-amber-500/20", iconBg: "bg-amber-500/15", iconColor: "text-amber-400" },
];

const adminStatCards = [
  { key: "totalAssigned" as const, label: "Total Modules", icon: Target, gradient: "from-blue-500/8", ring: "ring-blue-500/20", iconBg: "bg-blue-500/15", iconColor: "text-blue-400" },
];

export default function NurseDashboard() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("all");
  const { data, isLoading } = useQuery<DashboardData>({ queryKey: ["/api/nurse/dashboard"] });

  const isAdmin = data?.isAdmin ?? false;
  const stats = data?.stats ?? { totalAssigned: 0, completed: 0, inProgress: 0, locked: 0 };
  const assignments = data?.assignments ?? [];
  const completionPercent = stats.totalAssigned > 0 ? Math.round((stats.completed / stats.totalAssigned) * 100) : 0;

  const filteredAssignments = useMemo(() => {
    let filtered = assignments;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((a) => a.moduleName.toLowerCase().includes(q) || a.moduleDescription.toLowerCase().includes(q));
    }
    if (!isAdmin) {
      switch (activeFilter) {
        case "due_soon": filtered = filtered.filter((a) => a.status !== "passed" && a.status !== "locked"); break;
        case "locked": filtered = filtered.filter((a) => a.status === "locked"); break;
        case "completed": filtered = filtered.filter((a) => a.status === "passed"); break;
      }
    }
    return filtered;
  }, [assignments, searchQuery, activeFilter, isAdmin]);

  const lockedAssignments = assignments.filter((a) => a.status === "locked");
  const activeAssignments = filteredAssignments.filter((a) => a.status !== "passed" && a.status !== "locked");
  const passedAssignments = filteredAssignments.filter((a) => a.status === "passed");
  const lockedFiltered = filteredAssignments.filter((a) => a.status === "locked");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-8 space-y-7 max-w-5xl mx-auto">
        <div className="space-y-2"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-64" /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>)}
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="space-y-3">{[1, 2, 3].map((i) => <Card key={i}><CardContent className="p-5"><Skeleton className="h-24 w-full" /></CardContent></Card>)}</div>
      </div>
    );
  }

  const displayedStatCards = isAdmin ? adminStatCards : statCards;

  const filterButtons: { key: FilterCategory; label: string; count: number }[] = isAdmin
    ? [{ key: "all", label: "All Modules", count: assignments.length }]
    : [
        { key: "all", label: "All", count: assignments.length },
        { key: "due_soon", label: "Active", count: assignments.filter((a) => a.status !== "passed" && a.status !== "locked").length },
        { key: "locked", label: "Locked", count: assignments.filter((a) => a.status === "locked").length },
        { key: "completed", label: "Completed", count: assignments.filter((a) => a.status === "passed").length },
      ];

  return (
    <div className="min-h-screen bg-background p-6 md:p-8 space-y-7 max-w-5xl mx-auto">
      <div className="animate-fade-in-up">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50 mb-1.5">
          Skills Arcade
        </p>
        <h1 className="font-serif text-3xl font-light tracking-tight text-foreground" data-testid="text-dashboard-title">
          {isAdmin ? "Clinical Module Library" : `Welcome back${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin ? `${assignments.length} clinical competency modules available` : "Your clinical competency modules"}
        </p>
      </div>

      <div className={`grid ${isAdmin ? "grid-cols-1 md:grid-cols-3" : "grid-cols-2 md:grid-cols-4"} gap-4 animate-fade-in-up animate-delay-50`}>
        {isAdmin ? (
          <>
            {adminStatCards.map((config) => {
              const Icon = config.icon;
              return (
                <div key={config.key} className="stat-card-glow">
                  <Card className={`relative overflow-hidden border ring-1 ${config.ring} transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5`}>
                    <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} to-transparent pointer-events-none`} />
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{config.label}</p>
                          <p className="font-serif text-3xl font-light tracking-tight text-foreground mt-1">{stats.totalAssigned}</p>
                        </div>
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${config.iconBg} ring-1 ${config.ring}`}>
                          <Icon className={`h-4 w-4 ${config.iconColor}`} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
            <Link href="/arcade/admin/modules">
              <Card className="relative overflow-hidden border ring-1 ring-emerald-500/20 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer h-full">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 to-transparent pointer-events-none" />
                <CardContent className="p-5 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/20">
                    <Settings className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Manage Modules</p>
                    <p className="text-xs text-muted-foreground">View content & assign</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto" />
                </CardContent>
              </Card>
            </Link>
            <Link href="/arcade/admin/reports">
              <Card className="relative overflow-hidden border ring-1 ring-violet-500/20 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer h-full">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-500/8 to-transparent pointer-events-none" />
                <CardContent className="p-5 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-500/20">
                    <Activity className="h-4 w-4 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Reports</p>
                    <p className="text-xs text-muted-foreground">Analytics & export</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto" />
                </CardContent>
              </Card>
            </Link>
          </>
        ) : (
          statCards.map((config) => {
            const Icon = config.icon;
            const value = stats[config.key];
            return (
              <div key={config.key} className="stat-card-glow">
                <Card className={`relative overflow-hidden border ring-1 ${config.ring} transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5`}>
                  <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} to-transparent pointer-events-none`} />
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{config.label}</p>
                        <p className="font-serif text-3xl font-light tracking-tight text-foreground mt-1 animate-count-in" data-testid={`text-stat-${config.key}`}>{value}</p>
                      </div>
                      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${config.iconBg} ring-1 ${config.ring}`}>
                        <Icon className={`h-4 w-4 ${config.iconColor}`} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })
        )}
      </div>

      {!isAdmin && (
        <div className="animate-fade-in-up animate-delay-100">
          <div className="flex items-center justify-between gap-4 mb-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Overall Progress</p>
            <p className="text-sm font-semibold text-primary tabular-nums">{completionPercent}%</p>
          </div>
          <Progress value={completionPercent} className="h-2.5" />
        </div>
      )}

      {!isAdmin && lockedAssignments.length > 0 && activeFilter !== "completed" && (
        <Card className="border-amber-500/25 bg-amber-500/5 animate-fade-in-up animate-delay-150">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 shrink-0">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  {lockedAssignments.length} module{lockedAssignments.length > 1 ? "s" : ""} locked
                </p>
                <p className="text-xs text-amber-700/70 dark:text-amber-400/70 mt-0.5">
                  You must not perform {lockedAssignments.length > 1 ? "these skills" : "this skill"} independently until cleared by your trainer.
                </p>
              </div>
              <Link href="/arcade/trainer">
                <Button size="sm" variant="outline" className="shrink-0 border-amber-500/30 text-amber-600 dark:text-amber-400" data-testid="button-book-signoff">
                  Book sign-off
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4 animate-fade-in-up animate-delay-200">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input
              placeholder="Search modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 bg-card border-border/60"
              data-testid="input-search-modules"
            />
          </div>
          {!isAdmin && (
            <div className="flex items-center gap-1.5">
              {filterButtons.map((f) => (
                <Button
                  key={f.key}
                  variant={activeFilter === f.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveFilter(f.key)}
                  className="font-semibold"
                  data-testid={`button-filter-${f.key}`}
                >
                  {f.label}
                  {f.count > 0 && <span className="ml-1.5 text-[10px] opacity-60 tabular-nums">{f.count}</span>}
                </Button>
              ))}
            </div>
          )}
        </div>

        {filteredAssignments.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8 mb-4">
                <BookOpen className="h-7 w-7 text-primary/40" />
              </div>
              <p className="font-serif text-lg text-foreground mb-1">
                {assignments.length === 0 ? "No modules assigned" : "No matching modules"}
              </p>
              <p className="text-sm text-muted-foreground max-w-xs">
                {assignments.length === 0 ? "Your trainer will assign modules to you." : "Try adjusting your search or filter."}
              </p>
            </CardContent>
          </Card>
        )}

        {isAdmin ? (
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50">
              All Modules ({filteredAssignments.length})
            </p>
            {filteredAssignments.map((a, i) => <ModuleCard key={a.id} assignment={a} index={i} isAdmin />)}
          </div>
        ) : (
          <>
            {activeAssignments.length > 0 && (activeFilter === "all" || activeFilter === "due_soon") && (
              <div className="space-y-3">
                {activeFilter === "all" && (
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50">Active</p>
                )}
                {activeAssignments.map((a, i) => <ModuleCard key={a.id} assignment={a} index={i} />)}
              </div>
            )}

            {lockedFiltered.length > 0 && (activeFilter === "all" || activeFilter === "locked") && (
              <div className="space-y-3">
                {activeFilter === "all" && (
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500/70 mt-4">Locked — Needs Sign-off</p>
                )}
                {lockedFiltered.map((a, i) => <ModuleCard key={a.id} assignment={a} index={i} />)}
              </div>
            )}

            {passedAssignments.length > 0 && (activeFilter === "all" || activeFilter === "completed") && (
              <div className="space-y-3">
                {activeFilter === "all" && (
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-500/70 mt-4">Completed</p>
                )}
                {passedAssignments.map((a, i) => <ModuleCard key={a.id} assignment={a} index={i} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ModuleCard({ assignment: a, index, isAdmin }: { assignment: AssignmentItem; index: number; isAdmin?: boolean }) {
  const Icon = iconMap[a.moduleIcon] || BookOpen;
  const isLocked = a.status === "locked";
  const isPassed = a.status === "passed";
  const isAvailable = a.status === "available";
  const maxFails = 4;

  const sc = isAvailable
    ? { label: "Available", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400", icon: BookOpen, dot: "bg-blue-400" }
    : statusConfig[a.status] || statusConfig.not_started;
  const StatusIcon = sc.icon;

  return (
    <div className="animate-fade-in-up" style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}>
      <Card
        className={`group relative overflow-hidden border transition-all duration-300 ${
          isLocked ? "opacity-80 border-amber-500/20" : isPassed ? "opacity-90" : "hover:shadow-lg hover:-translate-y-0.5"
        }`}
        data-testid={`card-module-${a.moduleId}`}
      >
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className={`flex items-center justify-center w-11 h-11 rounded-xl ring-1 shrink-0 ${
              isLocked ? "bg-amber-500/10 ring-amber-500/20" : isPassed ? "bg-emerald-500/10 ring-emerald-500/20" : "bg-primary/10 ring-primary/20"
            }`}>
              {isLocked ? <Lock className="w-5 h-5 text-amber-500" /> : isPassed ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Icon className="w-5 h-5 text-primary" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm group-hover:text-primary transition-colors" data-testid={`text-module-name-${a.moduleId}`}>{a.moduleName}</h3>
                  <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">{a.moduleDescription}</p>
                </div>
                <Badge variant="secondary" className={`${sc.color} shrink-0`} data-testid={`badge-status-${a.moduleId}`}>
                  <StatusIcon className="w-3 h-3 mr-1" />
                  {sc.label}
                </Badge>
              </div>

              {isAdmin ? (
                <div className="flex items-center justify-end gap-2 mt-3">
                  <Link href={`/arcade/walkthrough/${a.moduleId}`}>
                    <Button size="sm" variant="outline" className="gap-1 font-semibold" data-testid={`button-walkthrough-${a.moduleId}`}>
                      View Walkthrough
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground/60 flex-wrap">
                    <span data-testid={`text-attempts-${a.moduleId}`}>Attempts: {a.attemptCount}</span>
                    {a.failedAttempts > 0 && (
                      <span className={`font-semibold ${a.failedAttempts >= maxFails ? "text-amber-500" : "text-destructive"}`} data-testid={`text-fails-${a.moduleId}`}>
                        Fails: {a.failedAttempts}/{maxFails}
                      </span>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="inline-flex items-center gap-1 hover:text-foreground transition-colors" data-testid={`button-rules-info-${a.moduleId}`}>
                          <Info className="w-3 h-3" /><span>Scoring</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[250px]">
                        <p className="text-xs font-medium mb-1">Pass criteria:</p>
                        <ul className="text-xs space-y-0.5"><li>0 Major errors</li><li>3 or fewer Minor errors</li></ul>
                        <p className="text-xs mt-1.5 text-muted-foreground">Module locks after 4 failed attempts.</p>
                      </TooltipContent>
                    </Tooltip>
                    {a.dueAt && (
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Due {new Date(a.dueAt).toLocaleDateString()}</span>
                    )}
                  </div>

                  {isLocked && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/15">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">You must not perform this skill independently until cleared</p>
                          <p className="text-xs text-muted-foreground/70 mt-0.5">Contact your trainer to book a face-to-face sign-off session.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 mt-3">
                    {isLocked ? (
                      <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400 font-semibold" data-testid={`button-signoff-${a.moduleId}`}>
                        Book sign-off
                      </Button>
                    ) : (
                      <Link href={`/arcade/scenario/${a.id}`}>
                        <Button size="sm" variant={isPassed ? "outline" : "default"} className="gap-1 font-semibold" data-testid={`button-start-${a.moduleId}`}>
                          {a.status === "not_started" ? "Start" : isPassed ? "Review" : "Continue"}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
