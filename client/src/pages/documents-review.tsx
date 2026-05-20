import { useMemo, useState } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  FolderOpen,
  Trash2,
  Archive,
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
  notes: string | null;
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

const REVIEW_CODES = new Set([
  "low_confidence_classification",
  "chase_reply_low_confidence",
  "chase_reply_upsert_failed",
  "chase_reply_auto_attached",
]);

// Codes we intentionally hide here because they represent admin/automated
// markers rather than something needing review (e.g. manual category
// overrides, auto-attached confirmations the admin already actioned).
const STICKY_CODES = new Set([
  "manual_category_override",
  "manual_unassigned",
]);

function reviewMessage(issues: AiIssueEntry[] | null): { code: string; message: string } {
  if (issues && Array.isArray(issues)) {
    // Prefer one of the well-known review codes first so the existing
    // colour-coding (rose for chase-reply failures, amber otherwise) still
    // works for those rows.
    for (const entry of issues) {
      if (entry && typeof entry === "object" && entry.code && REVIEW_CODES.has(entry.code)) {
        return {
          code: entry.code,
          message: entry.message || "Needs admin review.",
        };
      }
    }
    // Otherwise surface the first real AI issue (plain-text string OR a
    // structured issue like name_mismatch / expired / illegible) so
    // admins can see what the AI actually flagged.
    for (const entry of issues) {
      if (typeof entry === "string" && entry.trim()) {
        return { code: "ai_issue", message: entry };
      }
      if (entry && typeof entry === "object") {
        if (entry.code && STICKY_CODES.has(entry.code)) continue;
        if (entry.message && entry.message.trim()) {
          return { code: entry.code || "ai_issue", message: entry.message };
        }
      }
    }
  }
  return { code: "ai_issue", message: "AI flagged this document for review." };
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

  // Two-step confirmation state for the destructive Reject / Keep-don't-assign
  // actions. `pendingAction` is null when no dialog is open.
  const [pendingAction, setPendingAction] = useState<
    | { kind: "reject"; doc: ReviewRow }
    | { kind: "unassign"; doc: ReviewRow }
    | null
  >(null);

  const invalidateQueues = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/documents/review-queue"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/documents"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/training-matrix"] });
    queryClient.invalidateQueries({
      queryKey: ["/api/admin/reports/training-notifications/last-chased"],
    });
  };

  const changeCategory = useMutation({
    mutationFn: async ({ docId, category }: { docId: string; category: string }) => {
      const res = await apiRequest("PATCH", `/api/documents/${docId}/category`, { category });
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateQueues();
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

  const rejectDocument = useMutation({
    mutationFn: async (docId: string) => {
      const res = await apiRequest("DELETE", `/api/documents/${docId}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateQueues();
      const removed: number = data?.removedTrainingRows || 0;
      toast({
        title: "Document rejected",
        description:
          removed > 0
            ? `Document and ${removed} linked training record${removed === 1 ? "" : "s"} removed.`
            : "Document and file removed from the system.",
      });
      setPendingAction(null);
    },
    onError: (err: any) => {
      toast({
        title: "Could not reject document",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const unassignDocument = useMutation({
    mutationFn: async (docId: string) => {
      const res = await apiRequest("POST", `/api/documents/${docId}/unassign-training`);
      return res.json();
    },
    onSuccess: (data: any) => {
      invalidateQueues();
      const removed: number = data?.removedTrainingRows || 0;
      toast({
        title: "Document kept on file",
        description:
          removed > 0
            ? `Cleared ${removed} training credit${removed === 1 ? "" : "s"}. Document remains on the candidate's record.`
            : "Document kept on the candidate's record but not credited against any training module.",
      });
      setPendingAction(null);
    },
    onError: (err: any) => {
      toast({
        title: "Could not unassign document",
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
            Every document the AI flagged with a warning or failure —
            mis-categorisations, name mismatches, expired or illegible
            certificates, and chase-reply auto-ingest queue items. Re-categorise,
            unassign or reject — rows drop off the list once the flag is
            cleared.
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
                            {doc.mimeType?.startsWith("image/") && doc.filePath ? (
                              <a
                                href={doc.filePath}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0"
                                data-testid={`thumb-review-${doc.id}`}
                              >
                                <img
                                  src={doc.filePath}
                                  alt={doc.type}
                                  className="h-12 w-12 rounded object-cover border border-border"
                                />
                              </a>
                            ) : (
                              <FileText className="h-4 w-4 mt-0.5 text-muted-foreground/40 shrink-0" />
                            )}
                            <div className="min-w-0 space-y-1">
                              <p className="text-sm font-medium truncate">
                                {doc.originalFilename || doc.filename}
                              </p>
                              {doc.type === "Share Code Screenshot" && doc.notes && (
                                <p
                                  className="text-[11px] font-mono text-foreground/80"
                                  data-testid={`text-review-share-code-${doc.id}`}
                                >
                                  Share code:{" "}
                                  <span className="font-semibold tracking-wider">{doc.notes}</span>
                                </p>
                              )}
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
                              {(() => {
                                const r = reviewMessage(doc.aiIssues);
                                const isError =
                                  r.code === "chase_reply_low_confidence" ||
                                  r.code === "chase_reply_upsert_failed";
                                return (
                                  <p
                                    className={`text-[11px] flex items-start gap-1.5 mt-1.5 ${
                                      isError
                                        ? "text-rose-600 dark:text-rose-300/90"
                                        : "text-amber-600 dark:text-amber-300/90"
                                    }`}
                                  >
                                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                                    <span>{r.message}</span>
                                  </p>
                                );
                              })()}
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

                          <div className="flex items-center gap-2 justify-end flex-wrap">
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
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                              onClick={() => setPendingAction({ kind: "unassign", doc })}
                              disabled={unassignDocument.isPending || rejectDocument.isPending}
                              data-testid={`btn-unassign-${doc.id}`}
                              title="Keep on file but don't credit against any training module"
                            >
                              <Archive className="h-3 w-3 mr-1" />
                              Keep, don't assign
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                              onClick={() => setPendingAction({ kind: "reject", doc })}
                              disabled={unassignDocument.isPending || rejectDocument.isPending}
                              data-testid={`btn-reject-${doc.id}`}
                              title="Discard the document and remove the file"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
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

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent data-testid="dialog-confirm-action">
          {pendingAction?.kind === "reject" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Reject this document?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete{" "}
                  <span className="font-medium text-foreground">
                    {pendingAction.doc.originalFilename || pendingAction.doc.filename}
                  </span>{" "}
                  for {pendingAction.doc.candidateName}, remove the file from
                  storage, and clear any training credits that were
                  auto-attached from it. The action is logged in the audit
                  trail but cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={rejectDocument.isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                  disabled={rejectDocument.isPending}
                  onClick={() => rejectDocument.mutate(pendingAction.doc.id)}
                  data-testid="btn-confirm-reject"
                >
                  {rejectDocument.isPending ? "Rejecting…" : "Yes, reject"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {pendingAction?.kind === "unassign" && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Keep on file but don't credit?</AlertDialogTitle>
                <AlertDialogDescription>
                  <span className="font-medium text-foreground">
                    {pendingAction.doc.originalFilename || pendingAction.doc.filename}
                  </span>{" "}
                  will stay on {pendingAction.doc.candidateName}'s record for
                  audit, but any training-module credits auto-attached from it
                  will be removed and the matrix cell will revert. Use this when
                  the document is genuine but doesn't fulfil any mandatory
                  module (e.g. an extra qualification).
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={unassignDocument.isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={unassignDocument.isPending}
                  onClick={() => unassignDocument.mutate(pendingAction.doc.id)}
                  data-testid="btn-confirm-unassign"
                >
                  {unassignDocument.isPending ? "Saving…" : "Keep on file"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
