import { useMemo } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  User,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Categories the admin can choose from for a manual override. Mirrors the
// server's ALLOWED_CATEGORIES set in routes/documents.ts and the dictionary
// used by DocumentCategorySelect on the candidate-detail page — kept in
// sync by hand because there's no shared constants file yet.
const DOCUMENT_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "training_certificate", label: "Training certificate" },
  { value: "identity", label: "Identity (passport / ID)" },
  { value: "right_to_work", label: "Right to work" },
  { value: "dbs", label: "DBS check" },
  { value: "nmc", label: "NMC registration" },
  { value: "health", label: "Health (occ. health, immunisations)" },
  { value: "indemnity", label: "Professional indemnity" },
  { value: "proof_of_address", label: "Proof of address" },
  { value: "competency_evidence", label: "Competency evidence" },
  { value: "profile", label: "Profile (CV, headshot)" },
  { value: "other", label: "Other / uncategorised" },
];

type AiIssueEntry =
  | string
  | {
      code?: string;
      message?: string;
    };

interface ReviewRow {
  id: string;
  nurseId: string;
  type: string;
  filename: string;
  originalFilename: string | null;
  filePath: string | null;
  fileSize: number | null;
  mimeType: string | null;
  category: string | null;
  sharepointUrl: string | null;
  aiStatus: string | null;
  aiIssues: AiIssueEntry[] | null;
  uploadedAt: string;
  candidateName: string;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function lowConfidenceMessage(issues: AiIssueEntry[] | null): string {
  if (!issues || !Array.isArray(issues)) return "";
  for (const entry of issues) {
    if (entry && typeof entry === "object" && entry.code === "low_confidence_classification") {
      return entry.message || "AI was not confident about this document's category.";
    }
  }
  return "AI was not confident about this document's category.";
}

export default function DocumentsReviewPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<{ data: ReviewRow[]; total: number }>({
    queryKey: ["/api/admin/documents/review-queue"],
  });

  const isUnauthorized = error instanceof Error && error.message.startsWith("403");
  const docs = useMemo(() => data?.data ?? [], [data]);
  const total = data?.total ?? 0;

  const changeCategory = useMutation({
    mutationFn: async ({ docId, category }: { docId: string; category: string }) => {
      const res = await apiRequest("PATCH", `/api/documents/${docId}/category`, { category });
      return res.json();
    },
    onSuccess: (data: any) => {
      // Refetch the queue so the just-fixed row drops out, and invalidate
      // the candidate's documents view so a subsequent visit reflects it.
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents/review-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
      const added: string[] = data?.trainingModulesAdded || [];
      const removed: number = data?.removedTrainingRows || 0;
      let description: string | undefined;
      if (added.length > 0) {
        description = `Auto-recorded ${added.length} training module${added.length === 1 ? "" : "s"}: ${added.join(", ")}.`;
      } else if (removed > 0) {
        description = `Cleared ${removed} stale training record${removed === 1 ? "" : "s"} from this document.`;
      }
      toast({ title: "Category updated", description });
    },
    onError: (err: any) => {
      toast({
        title: "Could not change category",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <AppLayout>
      <div className="space-y-7">
        <div className="animate-fade-in-up">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50 mb-1.5">
            System
          </p>
          <h1 className="font-serif text-3xl font-light tracking-tight text-foreground">
            Documents to review
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Documents the AI wasn't sure how to categorise. Pick the right
            category from the dropdown — the row drops off the list once the
            warning is cleared.
          </p>
        </div>

        {isUnauthorized ? (
          <Card className="animate-fade-in-up animate-delay-200 overflow-hidden">
            <CardContent className="p-0">
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/8 mb-4">
                  <FolderOpen className="h-7 w-7 text-red-400/40" />
                </div>
                <p className="font-serif text-lg text-foreground mb-1">Access Denied</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  You do not have permission to view this page. Admin access is required.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center gap-3 animate-fade-in-up animate-delay-100">
              <Badge
                variant="secondary"
                className="shrink-0 font-semibold tabular-nums gap-1.5"
                data-testid="badge-review-count"
              >
                <AlertTriangle className="h-3 w-3" />
                {total} {total === 1 ? "document" : "documents"} flagged
              </Badge>
            </div>

            <Card className="animate-fade-in-up animate-delay-200 overflow-hidden">
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-6 space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full rounded-lg" />
                    ))}
                  </div>
                ) : docs.length > 0 ? (
                  <div className="divide-y divide-border/50">
                    {docs.map((doc, i) => (
                      <div
                        key={doc.id}
                        className="px-5 py-4 hover:bg-muted/20 transition-colors duration-150 animate-fade-in-up"
                        style={{ animationDelay: `${Math.min(i * 20, 300)}ms` }}
                        data-testid={`row-review-${doc.id}`}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_220px_auto] gap-4 items-start">
                          <div className="flex items-start gap-3 min-w-0">
                            <FileText className="h-4 w-4 mt-0.5 text-muted-foreground/40 shrink-0" />
                            <div className="min-w-0 space-y-1">
                              <p className="text-sm font-medium truncate">
                                {doc.originalFilename || doc.filename}
                              </p>
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/60">
                                <time className="tabular-nums">
                                  {formatDate(doc.uploadedAt)}
                                </time>
                                {doc.fileSize && (
                                  <>
                                    <span aria-hidden>·</span>
                                    <span>{formatFileSize(doc.fileSize)}</span>
                                  </>
                                )}
                                {doc.category && (
                                  <>
                                    <span aria-hidden>·</span>
                                    <span>
                                      Currently:{" "}
                                      <span className="uppercase tracking-wider font-semibold text-muted-foreground/80">
                                        {doc.category}
                                      </span>
                                    </span>
                                  </>
                                )}
                              </div>
                              <p className="text-[11px] text-amber-600 dark:text-amber-300/90 flex items-start gap-1.5 mt-1.5">
                                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                <span>{lowConfidenceMessage(doc.aiIssues)}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center min-w-0">
                            <Link
                              href={`/candidates/${doc.nurseId}`}
                              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline truncate"
                              data-testid={`link-candidate-${doc.id}`}
                            >
                              <User className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{doc.candidateName}</span>
                            </Link>
                          </div>

                          <div>
                            <Select
                              value={doc.category || "other"}
                              disabled={changeCategory.isPending}
                              onValueChange={(next) => {
                                if (next && next !== (doc.category || "other")) {
                                  changeCategory.mutate({ docId: doc.id, category: next });
                                }
                              }}
                            >
                              <SelectTrigger
                                className="h-8 w-full text-xs"
                                data-testid={`select-category-${doc.id}`}
                                title="Set the correct category"
                              >
                                <SelectValue placeholder="Set category" />
                              </SelectTrigger>
                              <SelectContent>
                                {DOCUMENT_CATEGORY_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex items-center gap-3 justify-end">
                            {doc.filePath && (
                              <a
                                href={doc.filePath}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                                data-testid={`link-view-${doc.id}`}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                View
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 mb-4">
                      <CheckCircle2 className="h-7 w-7 text-emerald-400/70" />
                    </div>
                    <p className="font-serif text-lg text-foreground mb-1">
                      Nothing to review
                    </p>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      All AI-classified documents look confident. New low-confidence
                      uploads will appear here.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
