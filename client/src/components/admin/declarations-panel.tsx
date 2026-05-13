// Admin panel: per-nurse onboarding declarations (task 121).
// Lists each declaration with status pill, "View answers" drawer, and a
// "Re-open" action that requires a typed reason.

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, FileText, AlertCircle, Eye, RotateCcw } from "lucide-react";

interface DeclarationItem {
  key: string;
  title: string;
  status: "not_started" | "draft" | "submitted" | "reopened";
  version: number | null;
  submittedAt: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  pdfDocumentId: string | null;
}

interface Question {
  id: string;
  prompt: string;
  type: "boolean" | "enum" | "short_text" | "long_text" | "date" | "number" | "file";
  options?: { value: string; label: string }[];
  conditionalOn?: { questionId: string; equals: string | boolean };
}

interface FileAnswer {
  filename: string; originalFilename: string; filePath: string;
  fileSize: number; mimeType: string; documentId?: string;
}

interface DetailPayload {
  declaration: { key: string; title: string; intro: string; questions: Question[]; legalReferences?: string[] };
  latest: {
    id: string; version: number; status: string; answers: Record<string, unknown>;
    signatureName: string | null; submittedAt: string | null;
    ipAddress: string | null; pdfDocumentId: string | null;
    reopenedAt: string | null; reopenReason: string | null;
  } | null;
  history: any[];
}

function StatusPill({ status }: { status: DeclarationItem["status"] }) {
  if (status === "submitted") {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Submitted
      </Badge>
    );
  }
  if (status === "draft") return <Badge variant="outline">Draft</Badge>;
  if (status === "reopened") {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
        <AlertCircle className="h-3 w-3 mr-1" /> Re-opened
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-muted-foreground">Not started</Badge>;
}

function answerLabel(q: Question, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (q.type === "boolean") return value === true ? "Yes" : "No";
  if (q.type === "enum") return q.options?.find((o) => o.value === value)?.label ?? String(value);
  if (q.type === "file") {
    const f = value as FileAnswer;
    return f && f.originalFilename ? `${f.originalFilename} (${Math.round(f.fileSize / 1024)} KB)` : "—";
  }
  return String(value);
}

function AnswerCell({ q, value }: { q: Question; value: unknown }) {
  if (q.type === "file" && value && (value as FileAnswer).filePath) {
    const f = value as FileAnswer;
    return (
      <a href={f.filePath} target="_blank" rel="noopener noreferrer"
         className="text-sm text-primary hover:underline inline-flex items-center gap-1">
        <FileText className="h-3.5 w-3.5" /> {f.originalFilename}
        <span className="text-xs text-muted-foreground">({Math.round(f.fileSize / 1024)} KB)</span>
      </a>
    );
  }
  return <p className="text-sm mt-0.5">{answerLabel(q, value)}</p>;
}

export function DeclarationsPanel({ candidateId }: { candidateId: string }) {
  const { toast } = useToast();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [reopenKey, setReopenKey] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");

  const { data, isLoading } = useQuery<{
    items: DeclarationItem[]; total: number; completed: number; outstanding: number;
  }>({
    queryKey: [`/api/nurses/${candidateId}/declarations`],
  });

  const { data: detail } = useQuery<DetailPayload>({
    queryKey: [`/api/nurses/${candidateId}/declarations/${openKey}`],
    enabled: !!openKey,
  });

  const reopenMutation = useMutation({
    mutationFn: async ({ key, reason }: { key: string; reason: string }) => {
      const res = await apiRequest(
        "POST", `/api/nurses/${candidateId}/declarations/${key}/reopen`, { reason },
      );
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Declaration re-opened", description: "A new draft version has been created for the candidate." });
      setReopenKey(null); setReopenReason("");
      queryClient.invalidateQueries({ queryKey: [`/api/nurses/${candidateId}/declarations`] });
    },
    onError: (err: any) => {
      toast({ title: "Could not re-open", description: err?.message || "Try again.", variant: "destructive" });
    },
  });

  return (
    <Card data-testid="admin-declarations-panel">
      <CardContent className="p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Onboarding</p>
            <h3 className="font-serif text-xl font-light tracking-tight">Declarations</h3>
          </div>
          {data && (
            <p className="text-xs text-muted-foreground">
              {data.completed} of {data.total} signed
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <div className="space-y-2">
            {data?.items.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
                data-testid={`declaration-row-${item.key}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <StatusPill status={item.status} />
                    {item.version != null && (
                      <span className="text-[10px] text-muted-foreground">v{item.version}</span>
                    )}
                    {item.submittedAt && (
                      <span className="text-[10px] text-muted-foreground">
                        Signed {new Date(item.submittedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.pdfDocumentId && (
                    <a
                      href={`/api/documents/${item.pdfDocumentId}/download`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                      data-testid={`declaration-pdf-${item.key}`}
                    >
                      <FileText className="h-3.5 w-3.5" /> PDF
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpenKey(item.key)}
                    disabled={item.status === "not_started"}
                    data-testid={`button-view-declaration-${item.key}`}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" /> View
                  </Button>
                  {item.status === "submitted" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { setReopenKey(item.key); setReopenReason(""); }}
                      data-testid={`button-reopen-declaration-${item.key}`}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Re-open
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Sheet open={!!openKey} onOpenChange={(o) => { if (!o) setOpenKey(null); }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{detail?.declaration.title || "Declaration"}</SheetTitle>
          </SheetHeader>
          {detail ? (
            <div className="space-y-4 mt-4 text-sm">
              {detail.latest ? (
                <>
                  <div className="rounded-md bg-muted p-3 text-xs space-y-1">
                    <div>Version: <strong>{detail.latest.version}</strong></div>
                    <div>Status: <strong>{detail.latest.status}</strong></div>
                    {detail.latest.submittedAt && (
                      <div>Signed: <strong>{new Date(detail.latest.submittedAt).toLocaleString()}</strong> by <strong>{detail.latest.signatureName}</strong></div>
                    )}
                    {detail.latest.ipAddress && <div>IP: <code>{detail.latest.ipAddress}</code></div>}
                    {detail.latest.reopenReason && (
                      <div>Re-open reason: <em>{detail.latest.reopenReason}</em></div>
                    )}
                  </div>
                  <div className="space-y-3">
                    {detail.declaration.questions.map((q) => (
                      <div key={q.id} className="border-b pb-2">
                        <p className="text-xs font-medium text-muted-foreground">{q.prompt}</p>
                        <AnswerCell q={q} value={detail.latest!.answers[q.id]} />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground">No submission yet.</p>
              )}
            </div>
          ) : <Skeleton className="h-32 w-full mt-4" />}
        </SheetContent>
      </Sheet>

      <Dialog open={!!reopenKey} onOpenChange={(o) => { if (!o) { setReopenKey(null); setReopenReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-open declaration</DialogTitle>
            <DialogDescription>
              The candidate will be able to edit and re-submit this declaration. The previous signed version is preserved in the history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason (required)</label>
            <Textarea
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="e.g. New criminal record disclosed, please re-confirm answers."
              rows={3}
              data-testid="reopen-reason-input"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setReopenKey(null); setReopenReason(""); }}>Cancel</Button>
            <Button
              disabled={!reopenReason.trim() || reopenMutation.isPending}
              onClick={() => reopenKey && reopenMutation.mutate({ key: reopenKey, reason: reopenReason.trim() })}
              data-testid="button-confirm-reopen"
            >
              {reopenMutation.isPending ? "Re-opening…" : "Re-open"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
