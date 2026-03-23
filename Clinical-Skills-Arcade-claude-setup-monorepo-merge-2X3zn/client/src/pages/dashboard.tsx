import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Users,
  ClipboardCheck,
  ShieldCheck,
  Gamepad2,
  ArrowRight,
  UserPlus,
  ScrollText,
  Activity,
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
  id: number;
  module: string;
  action: string;
  nurseId?: number;
  nurseName?: string;
  detail?: string;
  agent?: string;
  createdAt: string;
}

const moduleColors: Record<string, string> = {
  admin: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  preboard: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  onboard: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  "skills-arcade": "bg-amber-500/15 text-amber-400 border-amber-500/20",
  portal: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
};

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  isLoading,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  description: string;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-3xl font-bold tracking-tight">{value}</p>
            )}
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="rounded-lg bg-primary/10 p-2.5">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelSection({ stats, isLoading }: { stats?: DashboardStats; isLoading: boolean }) {
  const stages = [
    { label: "Preboard", count: stats?.funnelCounts?.preboard ?? 0, color: "bg-blue-500" },
    { label: "Onboard", count: stats?.funnelCounts?.onboard ?? 0, color: "bg-emerald-500" },
    { label: "Skills Arcade", count: stats?.funnelCounts?.skillsArcade ?? 0, color: "bg-amber-500" },
    { label: "Completed", count: stats?.funnelCounts?.completed ?? 0, color: "bg-primary" },
  ];

  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Journey Funnel</CardTitle>
        <CardDescription>Nurse progression through lifecycle stages</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {stages.map((stage, index) => (
              <div key={stage.label} className="flex items-center gap-3">
                <span className="w-28 text-sm font-medium text-muted-foreground shrink-0">
                  {stage.label}
                </span>
                <div className="flex-1 relative">
                  <div className="h-9 rounded-md bg-muted/40 w-full" />
                  <div
                    className={`absolute top-0 left-0 h-9 rounded-md ${stage.color} transition-all duration-500`}
                    style={{
                      width: `${Math.max((stage.count / maxCount) * 100, 4)}%`,
                    }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white mix-blend-difference">
                    {stage.count}
                  </span>
                </div>
                {index < stages.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentActivity({ logs, isLoading }: { logs?: AuditLog[]; isLoading: boolean }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Recent Activity</CardTitle>
          <CardDescription>Latest actions across all modules</CardDescription>
        </div>
        <Link href="/audit">
          <Button variant="ghost" size="sm" className="text-xs">
            View All
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-4 w-48 flex-1" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        ) : logs && logs.length > 0 ? (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2.5"
              >
                <Badge
                  variant="outline"
                  className={
                    moduleColors[log.module] ||
                    "bg-gray-500/15 text-gray-400 border-gray-500/20"
                  }
                >
                  {log.module}
                </Badge>
                <Badge variant="secondary" className="text-[11px]">
                  {log.action}
                </Badge>
                <span className="flex-1 truncate text-sm text-muted-foreground">
                  {log.nurseName && (
                    <span className="font-medium text-foreground">
                      {log.nurseName}
                    </span>
                  )}
                  {log.detail && (
                    <span className="ml-1.5">{log.detail}</span>
                  )}
                </span>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {new Date(log.createdAt).toLocaleDateString("en-US", {
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
          <p className="text-sm text-muted-foreground text-center py-8">
            No recent activity
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function QuickActions() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Link href="/nurses">
          <Button className="w-full justify-start gap-2" variant="default">
            <UserPlus className="h-4 w-4" />
            Register New Nurse
          </Button>
        </Link>
        <Link href="/preboard">
          <Button className="w-full justify-start gap-2" variant="outline">
            <ClipboardCheck className="h-4 w-4" />
            Preboard Admin
          </Button>
        </Link>
        <Link href="/audit">
          <Button className="w-full justify-start gap-2" variant="outline">
            <ScrollText className="h-4 w-4" />
            Audit Trail
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

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Nurse lifecycle management overview
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Nurses"
            value={stats?.totalNurses ?? 0}
            icon={Users}
            description="Registered in platform"
            isLoading={statsLoading}
          />
          <StatCard
            title="Preboard Complete"
            value={stats?.preboardComplete ?? 0}
            icon={ClipboardCheck}
            description="Assessment completed"
            isLoading={statsLoading}
          />
          <StatCard
            title="Onboard Cleared"
            value={stats?.onboardCleared ?? 0}
            icon={ShieldCheck}
            description="Onboarding finished"
            isLoading={statsLoading}
          />
          <StatCard
            title="Skills Competent"
            value={stats?.skillsCompetent ?? 0}
            icon={Gamepad2}
            description="Arcade competency achieved"
            isLoading={statsLoading}
          />
        </div>

        {/* Funnel + Quick Actions */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <FunnelSection stats={stats} isLoading={statsLoading} />
          </div>
          <QuickActions />
        </div>

        {/* Recent Activity */}
        <RecentActivity logs={logs} isLoading={logsLoading} />
      </div>
    </AppLayout>
  );
}
