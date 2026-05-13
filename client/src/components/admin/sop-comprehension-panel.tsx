// Admin panel: per-nurse SOP comprehension MCQ status (task 114
// follow-up). Mounted alongside the InductionProgressPanel on the
// candidate-detail Compliance > Induction tab. Shows pass/fail per
// SOP, attempt counts, and the underlying principle each scenario
// tests so an admin can see at a glance where understanding gaps are.

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Circle } from "lucide-react";

interface ComprehensionRow {
  sopSlug: string;
  sopTitle: string;
  version: string;
  principle: string;
  status: "passed" | "failed" | "not_attempted";
  attemptCount: number;
  firstPassedAt: string | null;
  lastAttemptAt: string | null;
}
interface ComprehensionResponse {
  questions: ComprehensionRow[];
  totalRequired: number;
  passed: number;
  outstanding: number;
}

function StatusBadge({ row }: { row: ComprehensionRow }) {
  if (row.status === "passed") {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3 mr-1" />
        Passed
      </Badge>
    );
  }
  if (row.status === "failed") {
    return (
      <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
        <AlertCircle className="h-3 w-3 mr-1" />
        Failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground/70">
      <Circle className="h-3 w-3 mr-1" />
      Not attempted
    </Badge>
  );
}

export function SopComprehensionPanel({ candidateId }: { candidateId: string }) {
  const { data, isLoading } = useQuery<ComprehensionResponse>({
    queryKey: [`/api/nurses/${candidateId}/sop-comprehension`],
    enabled: !!candidateId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  return (
    <Card data-testid="sop-comprehension-panel">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-xl font-light tracking-tight">
              SOP Comprehension Check
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              One MCQ per SOP — each scenario sits slightly outside the
              documented procedure to test application of the underlying
              principle, not rote recall.
            </p>
          </div>
          {data && (
            <Badge
              variant="outline"
              className={
                data.outstanding === 0
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-600 border-amber-500/20"
              }
              data-testid="badge-comp-summary"
            >
              {data.passed} / {data.totalRequired} passed
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !data || data.questions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No SOP comprehension questions configured.
          </p>
        ) : (
          <div className="rounded border divide-y">
            {data.questions.map((q) => (
              <div
                key={q.sopSlug}
                className="px-3 py-2.5 flex items-start gap-3"
                data-testid={`comp-row-${q.sopSlug}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{q.sopTitle}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                      v{q.version}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {q.principle}
                  </p>
                  {(q.attemptCount > 0 || q.lastAttemptAt) && (
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      {q.attemptCount} attempt{q.attemptCount === 1 ? "" : "s"}
                      {q.firstPassedAt
                        ? ` · passed ${new Date(q.firstPassedAt).toLocaleDateString()}`
                        : q.lastAttemptAt
                          ? ` · last attempt ${new Date(q.lastAttemptAt).toLocaleDateString()}`
                          : ""}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  <StatusBadge row={q} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
