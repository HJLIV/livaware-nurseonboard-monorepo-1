import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, ClipboardCheck, Eye, Brain, Calendar, User } from "lucide-react";

interface PreboardAssessment {
  id: number;
  nurseId: number;
  nurseName: string;
  status: string;
  score?: number;
  aiAnalysis?: string;
  responses?: Record<string, unknown>;
  completedAt?: string;
  createdAt: string;
}

function AssessmentDetailDialog({
  assessment,
  open,
  onOpenChange,
}: {
  assessment: PreboardAssessment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!assessment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-light">Assessment Detail</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                <User className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold">{assessment.nurseName}</span>
            </div>
            <StatusBadge status={assessment.status} />
          </div>

          {assessment.score !== undefined && (
            <div className="rounded-xl border bg-card p-6 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">Score</p>
              <p className="font-serif text-4xl font-light text-foreground">{assessment.score}%</p>
            </div>
          )}

          {assessment.completedAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4 text-muted-foreground/40" />
              Completed {new Date(assessment.completedAt).toLocaleDateString("en-US", {
                month: "long", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </div>
          )}

          {assessment.aiAnalysis && (
            <div className="rounded-xl bg-primary/5 border border-primary/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">AI Analysis</p>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{assessment.aiAnalysis}</p>
            </div>
          )}

          {assessment.responses && Object.keys(assessment.responses).length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/50 mb-2">Responses</p>
              <div className="rounded-lg border p-3 max-h-60 overflow-y-auto bg-muted/20">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">{JSON.stringify(assessment.responses, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPreboard() {
  const [search, setSearch] = useState("");
  const [selectedAssessment, setSelectedAssessment] = useState<PreboardAssessment | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: assessments, isLoading } = useQuery<PreboardAssessment[]>({
    queryKey: ["/api/preboard/assessments"],
  });

  const filtered = assessments?.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return a.nurseName.toLowerCase().includes(q) || a.status.toLowerCase().includes(q);
  });

  return (
    <AppLayout>
      <div className="space-y-7">
        <div className="animate-fade-in-up">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50 mb-1.5">
            Applicants
          </p>
          <h1 className="font-serif text-3xl font-light tracking-tight text-foreground">
            Assessment Admin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and review applicant assessments
          </p>
        </div>

        <div className="flex items-center gap-4 animate-fade-in-up animate-delay-100">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search assessments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 bg-card border-border/60"
            />
          </div>
          {filtered && (
            <Badge variant="secondary" className="shrink-0 font-semibold tabular-nums">
              {filtered.length} {filtered.length === 1 ? "assessment" : "assessments"}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-36 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : filtered && filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((assessment, i) => (
              <div key={assessment.id} className="animate-fade-in-up" style={{ animationDelay: `${Math.min(i * 50, 400)}ms` }}>
                <Card className="group border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-sm font-semibold group-hover:text-primary transition-colors">{assessment.nurseName}</CardTitle>
                        <CardDescription className="text-[10px] mt-0.5">Assessment #{assessment.id}</CardDescription>
                      </div>
                      <StatusBadge status={assessment.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {assessment.score !== undefined && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-xs text-muted-foreground/60">Score</span>
                        <span className="font-serif text-lg font-light">{assessment.score}%</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-xs text-muted-foreground/60">Created</span>
                      <span className="text-xs tabular-nums">{new Date(assessment.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </div>
                    {assessment.aiAnalysis && (
                      <div className="flex items-center gap-1.5 text-xs text-primary">
                        <Brain className="h-3 w-3" />
                        AI analysis available
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2 font-semibold gap-2"
                      onClick={() => { setSelectedAssessment(assessment); setDetailOpen(true); }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View Detail
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        ) : (
          <Card className="animate-fade-in-up animate-delay-200">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8 mb-4">
                <ClipboardCheck className="h-7 w-7 text-primary/40" />
              </div>
              <p className="font-serif text-lg text-foreground mb-1">
                {search ? "No matching assessments" : "No preboard assessments yet"}
              </p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Assessments will appear here when nurses complete preboarding
              </p>
            </CardContent>
          </Card>
        )}

        <AssessmentDetailDialog assessment={selectedAssessment} open={detailOpen} onOpenChange={setDetailOpen} />
      </div>
    </AppLayout>
  );
}
