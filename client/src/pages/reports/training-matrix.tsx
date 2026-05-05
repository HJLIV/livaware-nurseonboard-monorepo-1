import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ComplianceMatrix,
  type MatrixCandidate,
  type MatrixResponse,
} from "@/components/reports/compliance-matrix";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Mail, Inbox, Loader2, AlertCircle, Send, FileWarning } from "lucide-react";
import { Link } from "wouter";

interface OutstandingModule {
  moduleName: string;
  status: "red" | "amber";
  label: string;
  expiryDate?: string | null;
}

interface PrepareItem {
  nurseId: string;
  name: string;
  email: string | null;
  modules: OutstandingModule[];
  moduleCount: number;
  portalUrl: string | null;
  portalExpiresAt: string | null;
}

interface PrepareResponse {
  outlookConfigured: boolean;
  defaultSubject: string;
  defaultBody: string;
  tokens: string[];
  items: PrepareItem[];
  samplePreview: { subject: string; body: string };
}

interface LastChasedRecord {
  sentAt: string;
  sentBy: string | null;
  recipientEmail: string;
  modulesIncluded: string[];
  moduleCount: number;
}

interface PendingReviewRecord {
  needsReviewCount: number;
  autoAttachedCount: number;
  latestAt: string;
}

interface LastChasedResponse {
  outlookConfigured: boolean;
  lastChasedByNurse: Record<string, LastChasedRecord>;
  pendingReviewByNurse?: Record<string, PendingReviewRecord>;
}

function daysAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return "";
  const d = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (d <= 0) {
    const h = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
    return `${h}h ago`;
  }
  if (d === 1) return "yesterday";
  return `${d}d ago`;
}

export default function TrainingMatrixPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const lastChasedQuery = useQuery<LastChasedResponse>({
    queryKey: ["/api/admin/reports/training-notifications/last-chased"],
    staleTime: 30_000,
  });

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"single" | "bulk">("single");
  const [prepare, setPrepare] = useState<PrepareResponse | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [previewIdx, setPreviewIdx] = useState(0);

  const prepareMutation = useMutation({
    mutationFn: async (input: { nurseIds: string[]; mode: "single" | "bulk" }) => {
      const res = await apiRequest("POST", "/api/admin/reports/training-notifications/prepare", {
        nurseIds: input.nurseIds,
      });
      const data = (await res.json()) as PrepareResponse;
      return { data, mode: input.mode };
    },
    onSuccess: ({ data, mode }) => {
      setPrepare(data);
      setEditSubject(data.defaultSubject);
      setEditBody(data.defaultBody);
      setPreviewIdx(0);
      setDialogMode(mode);
      setDialogOpen(true);
    },
    onError: (err: any) => {
      toast({
        title: "Could not prepare email",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async (input: { nurseIds: string[]; subject: string; body: string }) => {
      const res = await apiRequest("POST", "/api/admin/reports/training-notifications/send", input);
      return (await res.json()) as {
        total: number;
        succeeded: number;
        failed: number;
        skipped: number;
        results: Array<{ nurseId: string; name: string; ok: boolean; error?: string }>;
      };
    },
    onSuccess: (data) => {
      const failedNames = data.results.filter((r) => !r.ok).map((r) => `${r.name} (${r.error || "failed"})`);
      toast({
        title: `Sent ${data.succeeded} of ${data.total} chase email${data.total === 1 ? "" : "s"}`,
        description:
          failedNames.length > 0
            ? `Skipped/failed: ${failedNames.slice(0, 3).join("; ")}${failedNames.length > 3 ? `…+${failedNames.length - 3}` : ""}`
            : "All recipients notified.",
        variant: data.succeeded > 0 ? "default" : "destructive",
      });
      setDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/training-notifications/last-chased"] });
    },
    onError: (err: any) => {
      toast({
        title: "Send failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/reports/training-notifications/scan-replies", {});
      return (await res.json()) as {
        scannedNurses: number;
        totalAttachmentsFound: number;
        totalAttachmentsProcessed: number;
        totalAutoAttached: number;
        totalNeedsReview: number;
        errors: string[];
      };
    },
    onSuccess: (data) => {
      toast({
        title: `Scan complete — ${data.scannedNurses} nurse${data.scannedNurses === 1 ? "" : "s"} checked`,
        description: `${data.totalAutoAttached} auto-attached · ${data.totalNeedsReview} needs review · ${data.totalAttachmentsFound} attachments found${data.errors.length > 0 ? ` · ${data.errors.length} error(s)` : ""}`,
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/training-matrix"] });
      // Refresh "Last chased" + "Reply received · N attachments need review"
      // indicators on each row so the admin sees the result of the scan
      // immediately without a full page refresh.
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/reports/training-notifications/last-chased"] });
    },
    onError: (err: any) => {
      toast({
        title: "Mailbox scan failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const lastChased = lastChasedQuery.data?.lastChasedByNurse ?? {};
  const pendingReview = lastChasedQuery.data?.pendingReviewByNurse ?? {};
  const outlookConfigured = lastChasedQuery.data?.outlookConfigured ?? true;

  const previewItem = prepare?.items[previewIdx];
  const previewRendered = useMemo(() => {
    if (!previewItem) return { subject: editSubject, body: editBody };
    const moduleLines = previewItem.modules.map((m) => `  • ${m.moduleName} — ${m.label}`).join("\n");
    const expiryDate = previewItem.portalExpiresAt
      ? new Date(previewItem.portalExpiresAt)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const tokens: Record<string, string> = {
      "{{NAME}}": previewItem.name,
      "{{MODULES_LIST}}": moduleLines || "  • (no modules)",
      "{{COUNT}}": String(previewItem.modules.length),
      "{{PORTAL_URL}}": previewItem.portalUrl ?? "(no email on file — link cannot be generated)",
      "{{PORTAL_EXPIRY}}": expiryDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    };
    const apply = (s: string) => Object.entries(tokens).reduce((a, [k, v]) => a.split(k).join(v), s);
    return { subject: apply(editSubject), body: apply(editBody) };
  }, [previewItem, editSubject, editBody]);

  const handleSend = () => {
    if (!prepare) return;
    const ids = prepare.items.filter((i) => !!i.email).map((i) => i.nurseId);
    if (ids.length === 0) {
      toast({
        title: "No valid recipients",
        description: "None of the selected candidates have an email address on file.",
        variant: "destructive",
      });
      return;
    }
    sendMutation.mutate({ nurseIds: ids, subject: editSubject, body: editBody });
  };

  return (
    <>
      <ComplianceMatrix
        endpoint="/api/admin/reports/training-matrix"
        title="Mandatory Training Matrix"
        description="One row per candidate, one column per CSTF mandatory training module. Amber if the certificate expires within 30 days, red if expired or missing."
        defaultDetailSection="compliance"
        cellToTab={() => "training_compliance"}
        extraToolbarActions={({ data, filteredCandidates }) =>
          buildToolbarActions(data, filteredCandidates, prepareMutation, scanMutation, outlookConfigured)
        }
        getRowMeta={(c) => {
          const rec = lastChased[c.id];
          const pending = pendingReview[c.id];
          if (!rec && !pending) return null;
          return (
            <div className="space-y-0.5">
              {rec && (
                <div className="text-[10px] text-muted-foreground/80 flex items-center gap-1" data-testid={`last-chased-${c.id}`}>
                  <Mail className="h-2.5 w-2.5" />
                  <span>
                    Last chased {daysAgo(rec.sentAt)}
                    {rec.moduleCount > 0 && ` · ${rec.moduleCount} module${rec.moduleCount === 1 ? "" : "s"}`}
                  </span>
                </div>
              )}
              {pending && pending.needsReviewCount > 0 && (
                <Link
                  href="/documents/review"
                  className="text-[10px] text-rose-600 dark:text-rose-400 flex items-center gap-1 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`pending-review-${c.id}`}
                >
                  <FileWarning className="h-2.5 w-2.5" />
                  <span>
                    Reply received · {pending.needsReviewCount} attachment{pending.needsReviewCount === 1 ? "" : "s"} need review
                  </span>
                </Link>
              )}
              {pending && pending.autoAttachedCount > 0 && (
                <Link
                  href="/documents/review"
                  className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`pending-confirm-${c.id}`}
                >
                  <FileWarning className="h-2.5 w-2.5" />
                  <span>
                    {pending.autoAttachedCount} auto-attached · please confirm (1-year default expiry)
                  </span>
                </Link>
              )}
            </div>
          );
        }}
        getRowActions={(c) => {
          const hasGap = candidateHasGap(c);
          if (!hasGap) return null;
          return (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              title="Email this nurse about outstanding training"
              disabled={prepareMutation.isPending || !outlookConfigured}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                prepareMutation.mutate({ nurseIds: [c.id], mode: "single" });
              }}
              data-testid={`button-notify-${c.id}`}
            >
              {prepareMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            </Button>
          );
        }}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-training-chase">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "bulk"
                ? `Notify ${prepare?.items.length ?? 0} nurse${(prepare?.items.length ?? 0) === 1 ? "" : "s"} of outstanding training`
                : `Notify ${prepare?.items[0]?.name ?? "nurse"} of outstanding training`}
            </DialogTitle>
            <DialogDescription>
              Each recipient gets a fresh secure portal link valid for 30 days, plus instructions to reply with the
              certificate(s) attached. We'll auto-file confident matches and route the rest to your review queue.
            </DialogDescription>
          </DialogHeader>

          {!prepare ? null : !outlookConfigured ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-destructive">Outlook is not configured</p>
                <p className="text-muted-foreground">
                  Set the AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID and AZURE_AD_CLIENT_SECRET environment variables to enable sending.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {dialogMode === "bulk" && (
                <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-2 max-h-40 overflow-y-auto">
                  <p className="font-medium text-foreground">Recipients ({prepare.items.length})</p>
                  <ul className="space-y-1">
                    {prepare.items.map((it, i) => (
                      <li
                        key={it.nurseId}
                        className={`flex items-center justify-between gap-2 cursor-pointer rounded px-1.5 py-1 ${i === previewIdx ? "bg-primary/10" : "hover:bg-muted/60"}`}
                        onClick={() => setPreviewIdx(i)}
                        data-testid={`recipient-${it.nurseId}`}
                      >
                        <span className="truncate">
                          {it.name}
                          <span className="text-muted-foreground ml-2 text-[10px]">{it.email || "no email"}</span>
                        </span>
                        <Badge variant="outline" className="text-[10px]">{it.moduleCount} outstanding</Badge>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Click a name to preview their personalised version below. The same template is sent to each — tokens are filled per nurse.
                  </p>
                </div>
              )}

              {dialogMode === "single" && previewItem && (
                <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                  <div>
                    <span className="font-medium">{previewItem.name}</span>
                    <span className="text-muted-foreground ml-2">&lt;{previewItem.email || "no email"}&gt;</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {previewItem.modules.map((m) => (
                      <Badge
                        key={m.moduleName}
                        variant="outline"
                        className={
                          m.status === "red"
                            ? "border-red-500/40 text-red-600 dark:text-red-400 text-[10px]"
                            : "border-amber-500/40 text-amber-700 dark:text-amber-300 text-[10px]"
                        }
                      >
                        {m.moduleName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Subject (template)</label>
                <Input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  data-testid="input-chase-subject"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium">Body (template)</label>
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={12}
                  className="font-mono text-xs"
                  data-testid="textarea-chase-body"
                />
                <p className="text-[10px] text-muted-foreground">
                  Tokens replaced per recipient: <code>{prepare.tokens.join("  ")}</code>
                </p>
              </div>

              <details className="rounded-md border bg-muted/20 p-3 text-xs" open>
                <summary className="cursor-pointer font-medium text-foreground">Preview (as {previewItem?.name ?? "recipient"} will see it)</summary>
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Subject</p>
                    <p className="text-sm">{previewRendered.subject}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Body</p>
                    <pre className="whitespace-pre-wrap text-xs leading-relaxed font-sans bg-background border rounded p-2">
                      {previewRendered.body}
                    </pre>
                  </div>
                </div>
              </details>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-chase-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sendMutation.isPending || !outlookConfigured || !prepare || prepare.items.length === 0}
              data-testid="button-chase-send"
            >
              {sendMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> Send{prepare && prepare.items.length > 1 ? ` to ${prepare.items.length}` : ""}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function candidateHasGap(c: MatrixCandidate): boolean {
  for (const cell of Object.values(c.cells)) {
    if (cell && (cell.status === "red" || cell.status === "amber")) return true;
  }
  return false;
}

function buildToolbarActions(
  data: MatrixResponse | undefined,
  filteredCandidates: MatrixCandidate[],
  prepareMutation: ReturnType<
    typeof useMutation<
      { data: PrepareResponse; mode: "single" | "bulk" },
      any,
      { nurseIds: string[]; mode: "single" | "bulk" }
    >
  >,
  scanMutation: ReturnType<typeof useMutation<any, any, void>>,
  outlookConfigured: boolean,
) {
  // The bulk button operates on EXACTLY the candidates currently visible in
  // the filtered matrix that have at least one red/amber cell — what the
  // admin sees is what the admin sends. We pass the explicit IDs to /prepare
  // so the toolbar count never drifts from the actual recipient list.
  const bulkIds = filteredCandidates.filter(candidateHasGap).map((c) => c.id);
  return (
    <>
      <Button
        variant="default"
        size="sm"
        disabled={!data || bulkIds.length === 0 || prepareMutation.isPending || !outlookConfigured}
        onClick={() => prepareMutation.mutate({ nurseIds: bulkIds, mode: "bulk" })}
        title={!outlookConfigured ? "Outlook integration not configured" : "Email every visible candidate with red/amber outstanding training"}
        data-testid="button-notify-all"
      >
        {prepareMutation.isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Mail className="h-4 w-4 mr-2" />
        )}
        Notify all ({bulkIds.length})
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={scanMutation.isPending || !outlookConfigured}
        onClick={() => scanMutation.mutate()}
        title={!outlookConfigured ? "Outlook integration not configured" : "Scan the shared inbox for replies to chase emails and auto-file confident matches"}
        data-testid="button-scan-replies"
      >
        {scanMutation.isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Inbox className="h-4 w-4 mr-2" />
        )}
        Scan replies
      </Button>
    </>
  );
}
