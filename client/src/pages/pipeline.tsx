import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LayoutGrid, List as ListIcon, ArrowRight } from "lucide-react";
import type { Candidate } from "@shared/schema";

const PIPELINE_STAGES = [
  { key: "application",  label: "Application",  dot: "bg-blue-400",    header: "bg-blue-500/10 text-blue-400 border-blue-500/15",   col: "border-blue-500/20",   pillBg: "bg-blue-500/10",    pillText: "text-blue-400" },
  { key: "verification", label: "Verification", dot: "bg-amber-400",   header: "bg-amber-500/10 text-amber-400 border-amber-500/15", col: "border-amber-500/20",   pillBg: "bg-amber-500/10",   pillText: "text-amber-400" },
  { key: "competency",   label: "Competency",   dot: "bg-purple-400",  header: "bg-purple-500/10 text-purple-400 border-purple-500/15", col: "border-purple-500/20", pillBg: "bg-purple-500/10",  pillText: "text-purple-400" },
  { key: "references",   label: "References",   dot: "bg-indigo-400",  header: "bg-indigo-500/10 text-indigo-400 border-indigo-500/15", col: "border-indigo-500/20", pillBg: "bg-indigo-500/10",  pillText: "text-indigo-400" },
  { key: "induction",    label: "Induction",    dot: "bg-cyan-400",    header: "bg-cyan-500/10 text-cyan-400 border-cyan-500/15",   col: "border-cyan-500/20",   pillBg: "bg-cyan-500/10",    pillText: "text-cyan-400" },
  { key: "cleared",      label: "Cleared",      dot: "bg-emerald-400", header: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15", col: "border-emerald-500/20", pillBg: "bg-emerald-500/10", pillText: "text-emerald-400" },
];

const STAGE_BY_KEY = Object.fromEntries(PIPELINE_STAGES.map(s => [s.key, s])) as Record<string, typeof PIPELINE_STAGES[number]>;

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

function PipelineListRow({ candidate, index }: { candidate: Candidate; index: number }) {
  const [, navigate] = useLocation();
  const daysInPipeline = Math.floor((Date.now() - new Date(candidate.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  const initials = candidate.fullName.split(" ").map(n => n[0]).join("").slice(0, 2);
  const stage = STAGE_BY_KEY[candidate.status] ?? null;
  const href = `/candidates/${candidate.id}`;

  return (
    <TableRow
      className="group cursor-pointer animate-fade-in-up outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-inset"
      style={{ animationDelay: `${Math.min(index * 25, 300)}ms` }}
      data-testid={`pipeline-row-${candidate.id}`}
      onClick={() => navigate(href)}
      tabIndex={0}
      role="link"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(href);
        }
      }}
    >
      <TableCell className="py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-primary/10 ring-1 ring-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
            {initials}
          </div>
          <span className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
            {candidate.fullName}
          </span>
        </div>
      </TableCell>
      <TableCell className="py-2.5">
        {stage ? (
          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${stage.pillBg}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${stage.pillText}`}>{stage.label}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/50">{candidate.status}</span>
        )}
      </TableCell>
      <TableCell className="py-2.5">
        {candidate.band ? (
          <Badge variant="outline" className="text-[10px] font-semibold">Band {candidate.band}</Badge>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
      </TableCell>
      <TableCell className="py-2.5 hidden md:table-cell tabular-nums text-xs text-muted-foreground">
        {daysInPipeline}d
      </TableCell>
      <TableCell className="py-2.5 hidden lg:table-cell max-w-[260px]">
        {candidate.specialisms && candidate.specialisms.length > 0 ? (
          <span className="text-xs text-muted-foreground/80 truncate block" title={candidate.specialisms.join(", ")}>
            {candidate.specialisms.join(", ")}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
        )}
      </TableCell>
      <TableCell className="py-2.5">
        {(candidate.status === "escalated" || candidate.status === "blocked") ? (
          <StatusBadge status={candidate.status} />
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </TableCell>
      <TableCell className="py-2.5 w-8">
        <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
      </TableCell>
    </TableRow>
  );
}

type PipelineViewMode = "board" | "list";
const PIPELINE_VIEW_MODE_STORAGE_KEY = "pipeline:viewMode";

export default function PipelinePage() {
  const { data: candidates, isLoading } = useQuery<Candidate[]>({ queryKey: ["/api/candidates"] });
  const [viewMode, setViewMode] = useState<PipelineViewMode>("board");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PIPELINE_VIEW_MODE_STORAGE_KEY);
      if (stored === "board" || stored === "list") setViewMode(stored);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PIPELINE_VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {}
  }, [viewMode]);

  const stageOrder = PIPELINE_STAGES.map(s => s.key);
  const sortedForList = (candidates || [])
    .slice()
    .sort((a, b) => {
      const ai = stageOrder.indexOf(a.status);
      const bi = stageOrder.indexOf(b.status);
      const aRank = ai === -1 ? stageOrder.length : ai;
      const bRank = bi === -1 ? stageOrder.length : bi;
      if (aRank !== bRank) return aRank - bRank;
      return a.fullName.localeCompare(b.fullName);
    });

  return (
    <AppLayout>
      <div className="space-y-7">
        <div className="flex items-end justify-between animate-fade-in-up gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50 mb-1.5">
              Candidates
            </p>
            <h1 className="font-serif text-3xl font-light tracking-tight text-foreground" data-testid="text-page-title">
              Pipeline
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Kanban view of the candidate onboarding pipeline
            </p>
          </div>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => { if (v === "board" || v === "list") setViewMode(v); }}
            className="shrink-0 rounded-md border border-border/60 bg-card p-0.5"
            data-testid="toggle-view-mode"
          >
            <ToggleGroupItem
              value="board"
              size="sm"
              aria-label="Board view"
              className="h-8 px-2.5 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
              data-testid="toggle-view-board"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="ml-1.5 text-xs font-medium hidden sm:inline">Board</span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="list"
              size="sm"
              aria-label="List view"
              className="h-8 px-2.5 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
              data-testid="toggle-view-list"
            >
              <ListIcon className="h-4 w-4" />
              <span className="ml-1.5 text-xs font-medium hidden sm:inline">List</span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {isLoading ? (
          viewMode === "list" ? (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Band</TableHead>
                    <TableHead className="hidden md:table-cell">Days</TableHead>
                    <TableHead className="hidden lg:table-cell">Specialisms</TableHead>
                    <TableHead>Flag</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[1, 2, 3, 4, 5].map(i => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
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
          )
        ) : viewMode === "list" ? (
          sortedForList.length === 0 ? (
            <Card className="animate-fade-in-up animate-delay-100">
              <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                <p className="font-serif text-lg text-foreground mb-1">No candidates in the pipeline</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Register an applicant to start populating the pipeline
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden animate-fade-in-up animate-delay-100">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Band</TableHead>
                    <TableHead className="hidden md:table-cell">Days</TableHead>
                    <TableHead className="hidden lg:table-cell">Specialisms</TableHead>
                    <TableHead>Flag</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedForList.map((c, i) => (
                    <PipelineListRow key={c.id} candidate={c} index={i} />
                  ))}
                </TableBody>
              </Table>
            </Card>
          )
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
