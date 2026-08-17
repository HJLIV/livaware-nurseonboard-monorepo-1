// Assigned actions panel (task 212) — super-admin → nurse structured
// write-ups (reflections & witness statements). Rendered inside the
// Supervision & Appraisals area of both profile pages. Super admins can
// assign an action (which emails the nurse a secure portal link) and mark
// submitted write-ups as reviewed; all admins can read submissions.
import { useState } from "react";
import type React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuthRole } from "@/lib/use-auth-role";
import {
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Loader2,
  Mail,
  Send,
  ShieldAlert,
} from "lucide-react";
import {
  REFLECTION_FRAMEWORKS,
  WITNESS_STATEMENT_DECLARATION,
  type AssignedActionPrompt,
} from "@shared/schema";

export interface AssignedActionRow {
  id: string;
  nurseId: string;
  type: "reflection" | "witness_statement";
  typeLabel: string;
  framework: "gibbs" | "kolb" | "driscoll" | "schon" | null;
  focusContext: string | null;
  eventDetails: string | null;
  pointsToAddress: string | null;
  instructions: string | null;
  status: "assigned" | "in_progress" | "submitted" | "reviewed";
  response: { answers?: Record<string, string> } | null;
  honestyDeclarationAccepted: boolean;
  pasteAttempts: number;
  keystrokeCount: number;
  maxBurstChars: number;
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  prompts: AssignedActionPrompt[];
}

const STATUS_STYLES: Record<AssignedActionRow["status"], { label: string; className: string }> = {
  assigned: { label: "Assigned", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  in_progress: { label: "In progress", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  submitted: { label: "Submitted", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  reviewed: { label: "Reviewed", className: "bg-muted text-muted-foreground border-border" },
};

function frameworkLabel(key: string | null): string | null {
  if (!key) return null;
  return REFLECTION_FRAMEWORKS.find((f) => f.key === key)?.label ?? key;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface AssignForm {
  type: "reflection" | "witness_statement";
  framework: string;
  focusContext: string;
  eventDetails: string;
  pointsToAddress: string;
  instructions: string;
}

const EMPTY_FORM: AssignForm = {
  type: "reflection",
  framework: "gibbs",
  focusContext: "",
  eventDetails: "",
  pointsToAddress: "",
  instructions: "",
};

export function AssignedActionsPanel({ nurseId }: { nurseId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { isSuperAdmin } = useAuthRole();

  const { data: actions, isLoading } = useQuery<AssignedActionRow[]>({
    queryKey: [`/api/admin/nurses/${nurseId}/assigned-actions`],
    enabled: !!nurseId,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AssignForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function openAssign() {
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (form.type === "witness_statement" && !form.eventDetails.trim()) {
      toast({ title: "Event details are required for a witness statement", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/admin/nurses/${nurseId}/assigned-actions`, {
        type: form.type,
        framework: form.type === "reflection" ? form.framework : null,
        focusContext: form.focusContext.trim() || null,
        eventDetails: form.eventDetails.trim() || null,
        pointsToAddress: form.pointsToAddress.trim() || null,
        instructions: form.instructions.trim() || null,
      });
      const body = await res.json();
      await qc.invalidateQueries({ queryKey: [`/api/admin/nurses/${nurseId}/assigned-actions`] });
      await qc.invalidateQueries({ queryKey: [`/api/nurses/${nurseId}/audit-log`] });
      await qc.invalidateQueries({ queryKey: [`/api/candidates/${nurseId}/audit-log`] });
      const emailNote = body?.email?.sent
        ? "The nurse has been emailed their secure portal link."
        : body?.email?.error
          ? `Assigned, but the email could not be sent: ${body.email.error}`
          : "Assigned. (Email sending is suppressed in this environment.)";
      toast({
        title: "Action assigned",
        description: emailNote,
        variant: body?.email?.error ? "destructive" : "default",
      });
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Could not assign", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const markReviewed = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/assigned-actions/${id}/review`);
      return res.json();
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: [`/api/admin/nurses/${nurseId}/assigned-actions`] });
      await qc.invalidateQueries({ queryKey: [`/api/nurses/${nurseId}/audit-log`] });
      await qc.invalidateQueries({ queryKey: [`/api/candidates/${nurseId}/audit-log`] });
      toast({ title: "Marked as reviewed" });
    },
    onError: (err: any) => {
      toast({ title: "Could not mark reviewed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4" data-testid="assigned-actions-panel">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-serif text-lg font-light tracking-tight flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Assigned write-ups
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Ask the nurse to complete a structured reflection or witness statement via
            their portal. Submissions land here for review.
          </p>
        </div>
        {isSuperAdmin && (
          <Button variant="outline" onClick={openAssign} data-testid="button-assign-action">
            <Send className="h-4 w-4 mr-1.5" /> Assign action
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !actions || actions.length === 0 ? (
        <p className="text-sm text-muted-foreground/80 italic">
          No assigned write-ups yet.
        </p>
      ) : (
        <div className="space-y-3">
          {actions.map((a) => {
            const status = STATUS_STYLES[a.status];
            const expanded = expandedId === a.id;
            const answers = a.response?.answers ?? {};
            return (
              <Card key={a.id} data-testid={`assigned-action-${a.id}`}>
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[11px]">
                        {a.typeLabel}
                      </Badge>
                      {a.framework && (
                        <Badge variant="outline" className="text-[11px]">
                          {frameworkLabel(a.framework)}
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-[11px] ${status.className}`}>
                        {status.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        assigned {fmtDate(a.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {(a.status === "submitted" || a.status === "reviewed") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedId(expanded ? null : a.id)}
                          data-testid={`button-expand-action-${a.id}`}
                        >
                          {expanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                      {isSuperAdmin && a.status === "submitted" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => markReviewed.mutate(a.id)}
                          disabled={markReviewed.isPending}
                          data-testid={`button-review-action-${a.id}`}
                        >
                          <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark reviewed
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Context summary */}
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    {a.focusContext && <p>Focus: {a.focusContext}</p>}
                    {a.eventDetails && <p>Event: {a.eventDetails}</p>}
                  </div>

                  {expanded && (
                    <div className="border-t pt-3 space-y-4" data-testid={`action-response-${a.id}`}>
                      {a.pointsToAddress && (
                        <div className="text-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-1">
                            Points they were asked to address
                          </p>
                          <p className="whitespace-pre-wrap">{a.pointsToAddress}</p>
                        </div>
                      )}
                      {a.prompts.map((p) => (
                        <div key={p.key} className="text-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-1">
                            {p.title}
                          </p>
                          <p className="whitespace-pre-wrap text-foreground/90">
                            {answers[p.key] || "—"}
                          </p>
                        </div>
                      ))}
                      {a.type === "witness_statement" && (
                        <p
                          className={`text-xs flex items-center gap-1.5 ${a.honestyDeclarationAccepted ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
                          data-testid={`declaration-status-${a.id}`}
                        >
                          {a.honestyDeclarationAccepted ? (
                            <CheckCheck className="h-3.5 w-3.5" />
                          ) : (
                            <ShieldAlert className="h-3.5 w-3.5" />
                          )}
                          Honesty declaration {a.honestyDeclarationAccepted ? "confirmed" : "NOT confirmed"}
                        </p>
                      )}
                      <div
                        className="text-[11px] text-muted-foreground border-t pt-2 flex flex-wrap gap-x-4 gap-y-1"
                        data-testid={`action-telemetry-${a.id}`}
                      >
                        <span>Submitted {fmtDate(a.submittedAt)}</span>
                        <span>Keystrokes: {a.keystrokeCount}</span>
                        <span>Paste attempts blocked: {a.pasteAttempts}</span>
                        <span>Largest text burst: {a.maxBurstChars} chars</span>
                        {a.maxBurstChars > 200 && (
                          <span className="text-amber-600 dark:text-amber-400">
                            Large burst — review for pasted content
                          </span>
                        )}
                        {a.reviewedBy && a.reviewedAt && (
                          <span>
                            Reviewed by {a.reviewedBy} · {fmtDate(a.reviewedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign a write-up</DialogTitle>
            <DialogDescription className="flex items-start gap-1.5">
              <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              The nurse will be emailed a secure portal link and see an "action
              required" prompt in their portal.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssign} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="aa-type">Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, type: v as AssignForm["type"] }))
                  }
                >
                  <SelectTrigger id="aa-type" data-testid="select-action-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reflection">Reflection</SelectItem>
                    <SelectItem value="witness_statement">Witness statement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.type === "reflection" && (
                <div className="space-y-1.5">
                  <Label htmlFor="aa-framework">Reflective framework</Label>
                  <Select
                    value={form.framework}
                    onValueChange={(v) => setForm((f) => ({ ...f, framework: v }))}
                  >
                    <SelectTrigger id="aa-framework" data-testid="select-action-framework">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFLECTION_FRAMEWORKS.map((fw) => (
                        <SelectItem key={fw.key} value={fw.key}>
                          <span className="flex flex-col items-start text-left">
                            <span>{fw.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {fw.description}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground" data-testid="text-framework-description">
                    {REFLECTION_FRAMEWORKS.find((fw) => fw.key === form.framework)?.description}
                  </p>
                </div>
              )}
            </div>

            {form.type === "reflection" ? (
              <div className="space-y-1.5">
                <Label htmlFor="aa-focus">Focus (optional)</Label>
                <Input
                  id="aa-focus"
                  value={form.focusContext}
                  onChange={(e) => setForm((f) => ({ ...f, focusContext: e.target.value }))}
                  placeholder="e.g. The medication error on 12 Aug, or a particular patient's care"
                  data-testid="input-action-focus"
                />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="aa-event">Event details</Label>
                  <Textarea
                    id="aa-event"
                    required
                    rows={3}
                    value={form.eventDetails}
                    onChange={(e) => setForm((f) => ({ ...f, eventDetails: e.target.value }))}
                    placeholder="What happened, when, where, and who was involved — as you understand it."
                    data-testid="input-action-event"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="aa-points">Points to address (optional)</Label>
                  <Textarea
                    id="aa-points"
                    rows={3}
                    value={form.pointsToAddress}
                    onChange={(e) => setForm((f) => ({ ...f, pointsToAddress: e.target.value }))}
                    placeholder="Specific questions or points the nurse must cover in their statement."
                    data-testid="input-action-points"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="aa-instructions">Instructions for the nurse (optional)</Label>
              <Textarea
                id="aa-instructions"
                rows={3}
                value={form.instructions}
                onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                placeholder="Any personalisation — deadline, tone, what you'll do with the write-up."
                data-testid="input-action-instructions"
              />
            </div>

            {form.type === "witness_statement" && (
              <p className="text-xs text-muted-foreground border rounded-md px-3 py-2">
                The nurse will be asked to confirm: "{WITNESS_STATEMENT_DECLARATION}"
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} data-testid="button-confirm-assign">
                {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Assign &amp; email nurse
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
