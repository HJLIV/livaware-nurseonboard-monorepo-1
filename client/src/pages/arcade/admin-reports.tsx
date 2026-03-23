import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Download, BarChart3, TrendingUp, AlertTriangle, Users } from "lucide-react";

interface ReportData {
  totalAttempts: number;
  passRate: number;
  avgAttemptsToPass: number;
  lockedCount: number;
  moduleStats: Array<{
    moduleName: string;
    totalAttempts: number;
    passRate: number;
    lockoutRate: number;
  }>;
}

export default function AdminReports() {
  const { data, isLoading } = useQuery<ReportData>({
    queryKey: ["/api/admin/reports"],
  });

  const handleExport = () => {
    window.open("/api/admin/reports/export.csv", "_blank");
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-60" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Skills Arcade</p>
          <h1 className="font-serif text-2xl font-light tracking-tight" data-testid="text-reports-title">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">Competency assessment overview</p>
        </div>
        <Button variant="outline" onClick={handleExport} data-testid="button-export-csv">
          <Download className="w-4 h-4 mr-1" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <BarChart3 className="w-4 h-4 text-muted-foreground mb-1" />
            <p className="font-serif text-2xl font-light" data-testid="text-total-attempts">{data?.totalAttempts ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total Attempts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <TrendingUp className="w-4 h-4 text-emerald-500 mb-1" />
            <p className="font-serif text-2xl font-light text-emerald-600 dark:text-emerald-400" data-testid="text-pass-rate">{data?.passRate ?? 0}%</p>
            <p className="text-xs text-muted-foreground">Pass Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <Users className="w-4 h-4 text-primary mb-1" />
            <p className="font-serif text-2xl font-light" data-testid="text-avg-attempts">{data?.avgAttemptsToPass?.toFixed(1) ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Avg Attempts to Pass</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <AlertTriangle className="w-4 h-4 text-amber-500 mb-1" />
            <p className="font-serif text-2xl font-light text-amber-600 dark:text-amber-400" data-testid="text-locked">{data?.lockedCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">Locked Modules</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <h2 className="font-semibold">Module Performance</h2>
        </CardHeader>
        <CardContent>
          {(data?.moduleStats ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No data available yet.</p>
          ) : (
            <div className="space-y-3">
              {(data?.moduleStats ?? []).map((ms, i) => (
                <div key={i} className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded-md" data-testid={`row-module-stat-${i}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{ms.moduleName}</p>
                    <p className="text-xs text-muted-foreground">{ms.totalAttempts} attempts</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{ms.passRate}%</p>
                      <p className="text-xs text-muted-foreground">pass</p>
                    </div>
                    {ms.lockoutRate > 0 && (
                      <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        {ms.lockoutRate}% lockout
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
