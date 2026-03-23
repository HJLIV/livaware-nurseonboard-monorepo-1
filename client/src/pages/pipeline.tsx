import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import type { Candidate } from "@shared/schema";

const PIPELINE_STAGES = [
  { key: "application", label: "Application", color: "border-blue-700", headerColor: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" },
  { key: "verification", label: "Verification", color: "border-amber-700", headerColor: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" },
  { key: "competency", label: "Competency", color: "border-purple-700", headerColor: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300" },
  { key: "references", label: "References", color: "border-indigo-700", headerColor: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" },
  { key: "induction", label: "Induction", color: "border-cyan-700", headerColor: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300" },
  { key: "cleared", label: "Cleared", color: "border-emerald-700", headerColor: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
];

function CandidateCard({ candidate }: { candidate: Candidate }) {
  const daysInPipeline = Math.floor((Date.now() - new Date(candidate.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <Link href={`/candidates/${candidate.id}`}>
      <div className="rounded-lg border border-card-border bg-card p-3 cursor-pointer hover:border-primary/30 hover:shadow-sm transition-all duration-200" data-testid={`pipeline-card-${candidate.id}`}>
        <div className="flex items-center gap-2 mb-2">
          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
            {candidate.fullName.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{candidate.fullName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {candidate.band && <Badge variant="outline" className="text-[10px] h-5">Band {candidate.band}</Badge>}
          <span className="text-[10px] text-muted-foreground tabular-nums">{daysInPipeline}d in pipeline</span>
        </div>
        {candidate.specialisms && candidate.specialisms.length > 0 && (
          <p className="text-[10px] text-muted-foreground mt-1.5 truncate">{candidate.specialisms.join(", ")}</p>
        )}
        {(candidate.status === "escalated" || candidate.status === "blocked") && (
          <div className="mt-2">
            <StatusBadge status={candidate.status} className="text-[10px]" />
          </div>
        )}
      </div>
    </Link>
  );
}

function PipelineColumnSkeleton() {
  return (
    <div className="rounded-lg border-2 border-muted bg-muted/30 flex flex-col">
      <div className="px-3 py-2.5 rounded-t-md bg-muted">
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
      </div>
      <div className="flex-1 p-2 space-y-2">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const { data: candidates, isLoading } = useQuery<Candidate[]>({ queryKey: ["/api/candidates"] });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="animate-fade-slide-up stagger-1">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">Kanban view of the onboarding pipeline</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => <PipelineColumnSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-4 min-h-[calc(100vh-200px)] animate-fade-in stagger-2">
            {PIPELINE_STAGES.map((stage, index) => {
              const stageCandidates = (candidates || []).filter(c => c.status === stage.key);
              return (
                <div key={stage.key} className={`rounded-lg border-2 ${stage.color} bg-muted/30 flex flex-col animate-fade-slide-up stagger-${Math.min(index + 1, 6)}`} data-testid={`pipeline-column-${stage.key}`}>
                  <div className={`px-3 py-2.5 rounded-t-md ${stage.headerColor}`}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide">{stage.label}</h3>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/20 text-[10px] font-bold tabular-nums">
                        {stageCandidates.length}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                    {stageCandidates.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground text-center py-6 italic">No candidates at this stage</p>
                    ) : (
                      stageCandidates.map(c => <CandidateCard key={c.id} candidate={c} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {candidates && candidates.filter(c => c.status === "escalated" || c.status === "blocked").length > 0 && (
          <Card className="border border-orange-200 dark:border-orange-800/50 animate-fade-slide-up">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-orange-700 dark:text-orange-300">Escalated / Blocked</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {candidates.filter(c => c.status === "escalated" || c.status === "blocked").map(c => (
                  <CandidateCard key={c.id} candidate={c} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
