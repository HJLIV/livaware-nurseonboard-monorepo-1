import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import type { Candidate } from "@shared/schema";

const PIPELINE_STAGES = [
  { key: "application",  label: "Application",  dot: "bg-blue-400",    header: "bg-blue-500/10 text-blue-400 border-blue-500/15",   col: "border-blue-500/20" },
  { key: "verification", label: "Verification", dot: "bg-amber-400",   header: "bg-amber-500/10 text-amber-400 border-amber-500/15", col: "border-amber-500/20" },
  { key: "competency",   label: "Competency",   dot: "bg-purple-400",  header: "bg-purple-500/10 text-purple-400 border-purple-500/15", col: "border-purple-500/20" },
  { key: "references",   label: "References",   dot: "bg-indigo-400",  header: "bg-indigo-500/10 text-indigo-400 border-indigo-500/15", col: "border-indigo-500/20" },
  { key: "induction",    label: "Induction",    dot: "bg-cyan-400",    header: "bg-cyan-500/10 text-cyan-400 border-cyan-500/15",   col: "border-cyan-500/20" },
  { key: "cleared",      label: "Cleared",      dot: "bg-emerald-400", header: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15", col: "border-emerald-500/20" },
];

function KanbanCard({ candidate }: { candidate: Candidate }) {
  const daysInPipeline = Math.floor((Date.now() - new Date(candidate.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  const initials = candidate.fullName.split(" ").map(n => n[0]).join("").slice(0, 2);

  return (
    <Link href={`/candidates/${candidate.id}`}>
      <div
        className="group rounded-lg border bg-card p-3 cursor-pointer hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        data-testid={`pipeline-card-${candidate.id}`}
      >
        <div className="flex items-center gap-2.5 mb-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 ring-1 ring-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
            {initials}
          </div>
          <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{candidate.fullName}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {candidate.band && <Badge variant="outline" className="text-[10px] h-5 font-semibold">Band {candidate.band}</Badge>}
          <span className="text-[10px] text-muted-foreground/50 tabular-nums">{daysInPipeline}d</span>
        </div>
        {candidate.specialisms && candidate.specialisms.length > 0 && (
          <p className="text-[10px] text-muted-foreground/50 mt-1.5 truncate">{candidate.specialisms.join(", ")}</p>
        )}
        {(candidate.status === "escalated" || candidate.status === "blocked") && (
          <div className="mt-2">
            <StatusBadge status={candidate.status} />
          </div>
        )}
      </div>
    </Link>
  );
}

export default function PipelinePage() {
  const { data: candidates, isLoading } = useQuery<Candidate[]>({ queryKey: ["/api/candidates"] });

  return (
    <AppLayout>
      <div className="space-y-7">
        <div className="animate-fade-in-up">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50 mb-1.5">
            Onboard
          </p>
          <h1 className="font-serif text-3xl font-light tracking-tight text-foreground" data-testid="text-page-title">
            Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Kanban view of the onboarding pipeline
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-6 gap-4 animate-fade-in-up animate-delay-100">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="rounded-xl border bg-card/50 flex flex-col">
                <div className="px-3 py-3"><Skeleton className="h-4 w-20" /></div>
                <div className="flex-1 p-2 space-y-2">
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-4 min-h-[calc(100vh-220px)]">
            {PIPELINE_STAGES.map((stage, stageIndex) => {
              const stageCandidates = (candidates || []).filter(c => c.status === stage.key);
              return (
                <div
                  key={stage.key}
                  className={`rounded-xl border ${stage.col} bg-card/30 flex flex-col animate-fade-in-up`}
                  style={{ animationDelay: `${stageIndex * 60}ms` }}
                  data-testid={`pipeline-column-${stage.key}`}
                >
                  <div className={`px-3 py-2.5 rounded-t-xl border-b ${stage.header}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
                        <h3 className="text-[11px] font-bold uppercase tracking-wider">{stage.label}</h3>
                      </div>
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-current/10 text-[10px] font-bold tabular-nums px-1.5">
                        {stageCandidates.length}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                    {stageCandidates.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground/40 text-center py-8 italic">
                        No candidates
                      </p>
                    ) : (
                      stageCandidates.map(c => <KanbanCard key={c.id} candidate={c} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
