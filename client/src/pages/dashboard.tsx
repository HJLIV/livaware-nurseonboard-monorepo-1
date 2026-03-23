import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { RegisterNurseDialog } from "./nurses";
import {
  Users,
  ClipboardCheck,
  ShieldCheck,
  Gamepad2,
  ArrowRight,
  UserPlus,
  ScrollText,
  Activity,
  TrendingUp,
  ChevronRight,
} from "lucide-react";

interface DashboardStats {
  totalNurses: number;
  preboardComplete: number;
  onboardCleared: number;
  skillsCompetent: number;
  funnelCounts: {
    preboard: number;
    onboard: number;
    skillsArcade: number;
    completed: number;
  };
}

interface AuditLog {
  id: string;
  module: string;
  action: string;
  nurseId?: string;
  agentName?: string;
  detail?: Record<string, unknown> | string;
  timestamp: string;
}

const moduleColors: Record<string, string> = {
  admin:          "bg-purple-500/12 text-purple-400 border-purple-500/20",
  preboard:       "bg-blue-500/12 text-blue-400 border-blue-500/20",
  onboard:        "bg-emerald-500/12 text-emerald-400 border-emerald-500/20",
  skills_arcade:  "bg-amber-500/12 text-amber-400 border-amber-500/20",
  portal:         "bg-cyan-500/12 text-cyan-400 border-cyan-500/20",
};

const statCards = [
  {
    key: "totalNurses" as keyof DashboardStats,
    title: "Total Nurses",
    desc: "Registered in platform",
    icon: Users,
    accent: "blue",
    gradient: "from-blue-500/8 to-transparent",
    ringColor: "ring-blue-500/20",
    iconBg: "bg-blue-500/15",
    iconColor: "text-blue-400 dark:text-blue-400",
  },
  {
    key: "preboardComplete" as keyof DashboardStats,
    title: "Preboard Complete",
    desc: "Assessments finished",
    icon: ClipboardCheck,
    accent: "primary",
    gradient: "from-primary/8 to-transparent",
    ringColor: "ring-primary/20",
    iconBg: "bg-primary/12",
    iconColor: "text-primary",
  },
  {
    key: "onboardCleared" as keyof DashboardStats,
    title: "Onboard Cleared",
    desc: "Compliance confirmed",
    icon: ShieldCheck,
    accent: "emerald",
    gradient: "from-emerald-500/8 to-transparent",
    ringColor: "ring-emerald-500/20",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-400",
  },
  {
    key: "skillsCompetent" as keyof DashboardStats,
    title: "Skills Competent",
    desc: "Arcade competency achieved",
    icon: Gamepad2,
    accent: "amber",
    gradient: "from-amber-500/8 to-transparent",
    ringColor: "ring-amber-500/20",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-400",
  },
];

function StatCard({
  config,
  value,
  isLoading,
  delay,
}: {
  config: typeof statCards[0];
  value: number;
  isLoading: boolean;
  delay: string;
}) {
  const Icon = config.icon;
  return (
    <div className={`stat-card-glow animate-fade-in-up ${delay}`}>
      <Card className={`relative overflow-hidden border ring-1 ${config.ringColor} transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} pointer-events-none`} />
        <CardContent className="pt-6 pb-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                {config.title}
              </p>
              {isLoading ? (
                <Skeleton className="h-10 w-16 mt-1" />
              ) : (
                <p className="font-serif text-4xl font-light tracking-tight text-foreground animate-count-in">
                  {value.toLocaleString()}
                </p>
              )}
              <p className="text-xs text-muted-foreground/60">{config.desc}</p>
            </div>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.iconBg} ring-1 ${config.ringColor}`}>
              <Icon className={`h-5 w-5 ${config.iconColor}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const funnelStages = [
  { key: "preboard" as const,     label: "Preboard",     color: "bg-blue-500",    pct_color: "text-blue-400" },
  { key: "onboard" as const,      label: "Onboard",      color: "bg-emerald-500", pct_color: "text-emerald-400" },
  { key: "skillsArcade" as const, label: "Skills Arcade", color: "bg-amber-500",  pct_color: "text-amber-400" },
  { key: "completed" as const,    label: "Completed",    color: "bg-primary",     pct_color: "text-primary" },
];

function FunnelSection({ stats, isLoading }: { stats?: DashboardStats; isLoading: boolean }) {
  const maxCount = Math.max(
    ...(stats
      ? funnelStages.map((s) => stats.funnelCounts?.[s.key] ?? 0)
      : [1]),
    1,
  );

  return (
    <Card className="animate-fade-in-up animate-delay-300">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-serif text-lg font-light tracking-tight">Journey Funnel</CardTitle>
            <CardDescription className="text-xs mt-0.5">Nurse progression through lifecycle stages</CardDescription>
          </div>
          <TrendingUp className="h-4 w-4 text-muted-foreground/40" />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {funnelStages.map((stage, index) => {
              const count = stats?.funnelCounts?.[stage.key] ?? 0;
              const widthPct = Math.max((count / maxCount) * 100, 4);
              return (
                <div key={stage.label} className="flex items-center gap-3 group">
                  <span className="w-24 text-xs font-medium text-muted-foreground/70 shrink-0 uppercase tracking-wide">
                    {stage.label}
                  </span>
                  <div className="flex-1 relative h-8 rounded-lg bg-muted/30 overflow-hidden">
                    <div
                      className={`absolute top-0 left-0 h-full ${stage.color} opacity-85 rounded-lg transition-all duration-700`}
                      style={{ width: `${widthPct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white mix-blend-difference">
                      {count}
                    </span>
                  </div>
                  {index < funnelStages.length - 1 && (
                    <ChevronRight className="h-3 w-3 text-muted-foreground/25 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivity({ logs, isLoading }: { logs?: AuditLog[]; isLoading: boolean }) {
  return (
    <Card className="animate-fade-in-up animate-delay-400">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="font-serif text-lg font-light tracking-tight">Recent Activity</CardTitle>
          <CardDescription className="text-xs mt-0.5">Latest actions across all modules</CardDescription>
        </div>
        <Link href="/audit">
          <Button variant="ghost" size="sm" className="text-xs gap-1 text-muted-foreground hover:text-foreground">
            View All
            <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        ) : logs && logs.length > 0 ? (
          <div className="space-y-1">
            {logs.map((log, i) => (
              <div
                key={log.id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/30 transition-colors duration-150 animate-fade-in-up`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <Badge
                  variant="outline"
                  className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${
                    moduleColors[log.module] || "bg-gray-500/12 text-gray-400 border-gray-500/20"
                  }`}
                >
                  {log.module}
                </Badge>
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {log.action}
                </Badge>
                <span className="flex-1 truncate text-sm text-muted-foreground">
                  {log.agentName && (
                    <span className="font-medium text-foreground">{log.agentName}</span>
                  )}
                  {log.detail && (
                    <span className="ml-1.5 text-muted-foreground/70">
                      {typeof log.detail === "object" ? Object.values(log.detail).join(", ") : log.detail}
                    </span>
                  )}
                </span>
                <time className="shrink-0 text-[11px] text-muted-foreground/50 tabular-nums">
                  {new Date(log.timestamp).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground/50">No recent activity</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  return (
    <Card className="animate-fade-in-up animate-delay-300">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-lg font-light tracking-tight">Quick Actions</CardTitle>
        <CardDescription className="text-xs mt-0.5">Common tasks at a glance</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-4">
        <RegisterNurseDialog trigger={
          <Button className="w-full justify-start gap-3 h-10 font-medium" variant="default">
            <UserPlus className="h-4 w-4" />
            Register New Nurse
            <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-60" />
          </Button>
        } />
        <Link href="/preboard">
          <Button className="w-full justify-start gap-3 h-10 font-medium" variant="outline">
            <ClipboardCheck className="h-4 w-4" />
            Preboard Admin
            <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-60" />
          </Button>
        </Link>
        <Link href="/audit">
          <Button className="w-full justify-start gap-3 h-10 font-medium" variant="outline">
            <ScrollText className="h-4 w-4" />
            Audit Trail
            <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-60" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: logs, isLoading: logsLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs?limit=10"],
  });

  const delays = ["", "animate-delay-50", "animate-delay-100", "animate-delay-150"];

  return (
    <AppLayout>
      <div className="space-y-7">

        {/* ── Page Header ── */}
        <div className="animate-fade-in-up">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50 mb-1.5">
            Overview
          </p>
          <h1 className="font-serif text-3xl font-light tracking-tight text-foreground">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Nurse lifecycle management at a glance
          </p>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((config, i) => (
            <StatCard
              key={config.key}
              config={config}
              value={typeof stats?.[config.key] === "number" ? stats[config.key] as number : 0}
              isLoading={statsLoading}
              delay={delays[i] ?? ""}
            />
          ))}
        </div>

        {/* ── Funnel + Quick Actions ── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <FunnelSection stats={stats} isLoading={statsLoading} />
          </div>
          <QuickActions />
        </div>

        {/* ── Recent Activity ── */}
        <RecentActivity logs={logs} isLoading={logsLoading} />
      </div>
    </AppLayout>
  );
}
