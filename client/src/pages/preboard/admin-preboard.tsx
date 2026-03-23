import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  ClipboardCheck,
  Eye,
  Brain,
  Calendar,
  User,
} from "lucide-react";

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
          <DialogTitle>Assessment Detail</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{assessment.nurseName}</span>
            </div>
            <StatusBadge status={assessment.status} />
          </div>

          {assessment.score !== undefined && (
            <div className="rounded-lg border p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Score</p>
              <p className="text-3xl font-bold">{assessment.score}%</p>
            </div>
          )}

          {assessment.completedAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Completed{" "}
              {new Date(assessment.completedAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          )}

          {assessment.aiAnalysis && (
            <div className="rounded-lg bg-muted/50 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium">AI Analysis</p>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {assessment.aiAnalysis}
              </p>
            </div>
          )}

          {assessment.responses && Object.keys(assessment.responses).length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Responses</p>
              <div className="rounded-lg border p-3 max-h-60 overflow-y-auto">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {JSON.stringify(assessment.responses, null, 2)}
                </pre>
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
  const [selectedAssessment, setSelectedAssessment] =
    useState<PreboardAssessment | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: assessments, isLoading } = useQuery<PreboardAssessment[]>({
    queryKey: ["/api/preboard/assessments"],
  });

  const filtered = assessments?.filter((a) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      a.nurseName.toLowerCase().includes(q) ||
      a.status.toLowerCase().includes(q)
    );
  });

  const handleViewDetail = (assessment: PreboardAssessment) => {
    setSelectedAssessment(assessment);
    setDetailOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Preboard Admin
          </h1>
          <p className="text-muted-foreground">
            Manage and review preboard assessments
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search assessments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Assessment List */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : filtered && filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((assessment) => (
              <Card
                key={assessment.id}
                className="group hover:border-primary/30 transition-colors"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {assessment.nurseName}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Assessment #{assessment.id}
                      </CardDescription>
                    </div>
                    <StatusBadge status={assessment.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {assessment.score !== undefined && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Score</span>
                      <span className="font-semibold">{assessment.score}%</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created</span>
                    <span>
                      {new Date(assessment.createdAt).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric" },
                      )}
                    </span>
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
                    className="w-full mt-2"
                    onClick={() => handleViewDetail(assessment)}
                  >
                    <Eye className="mr-2 h-3.5 w-3.5" />
                    View Detail
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <ClipboardCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                {search
                  ? "No assessments match your search"
                  : "No preboard assessments yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Assessments will appear here when nurses complete preboarding
              </p>
            </CardContent>
          </Card>
        )}

        <AssessmentDetailDialog
          assessment={selectedAssessment}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      </div>
    </AppLayout>
  );
}
