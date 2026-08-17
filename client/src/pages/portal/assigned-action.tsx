// Nurse-facing assigned-action completion page (task 212). Renders the
// chosen reflective framework / witness-statement structure as guided
// prompts, each with a paste-locked text area (shared
// usePasteBlockedTextEntry hook — identical behaviour, dictation, and
// telemetry to the preboard assessment). Witness statements require the
// honesty declaration before submitting.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  PortalShell,
  buildPortalGroups,
  type PortalSidebarGroup,
} from "@/components/layout/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePasteBlockedTextEntry } from "@/hooks/use-paste-blocked-text-entry";
import {
  CheckCircle2,
  ClipboardList,
  Mic,
  Square,
  ShieldCheck,
} from "lucide-react";
import {
  WITNESS_STATEMENT_DECLARATION,
  type AssignedActionPrompt,
} from "@shared/schema";

interface ActionListItem {
  id: string;
  type: "reflection" | "witness_statement";
  typeLabel: string;
  status: "assigned" | "in_progress" | "submitted" | "reviewed";
  createdAt: string;
  submittedAt: string | null;
}

interface ActionDetail extends ActionListItem {
  framework: string | null;
  frameworkLabel: string | null;
  focusContext: string | null;
  eventDetails: string | null;
  pointsToAddress: string | null;
  instructions: string | null;
  prompts: AssignedActionPrompt[];
}

interface PortalData {
  nurse: { id: string; fullName: string };
  journey: any;
  gate?: any;
  serviceAgreement?: { signed: boolean };
  agreements?: { total: number; outstanding: number } | null;
  assignedActions?: { outstanding: number };
}

/** Handle a PromptEntry registers with its parent so the parent can pull
 *  the current text + integrity telemetry at submit time. */
export interface PromptEntryHandle {
  getText: () => string;
  getTelemetry: () => { pasteAttempts: number; keystrokeCount: number; maxBurstChars: number };
  stopListening: () => void;
}

export function PromptEntry({
  prompt,
  index,
  disabled,
  register,
}: {
  prompt: AssignedActionPrompt;
  index: number;
  disabled: boolean;
  register: (key: string, handle: PromptEntryHandle | null) => void;
}) {
  const entry = usePasteBlockedTextEntry({ disabled });

  // The registered handle must read CURRENT text at submit time — a
  // `() => entry.text` closure registered on mount would capture the
  // initial empty string forever (code-review catch on task 212). The
  // ref is updated on every render, so getText always reads fresh state
  // without re-registering per keystroke.
  const textRef = useRef(entry.text);
  textRef.current = entry.text;

  useEffect(() => {
    register(prompt.key, {
      getText: () => textRef.current,
      getTelemetry: entry.getTelemetry,
      stopListening: entry.stopListening,
    });
    return () => register(prompt.key, null);
  }, [prompt.key, entry.getTelemetry, entry.stopListening, register]);

  return (
    <div className="space-y-2" data-testid={`prompt-${prompt.key}`}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">
          {index + 1}. {prompt.title}
        </p>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{prompt.prompt}</p>
      </div>
      <div className="relative">
        <label htmlFor={`prompt-input-${prompt.key}`} className="sr-only">
          {prompt.title}
        </label>
        <textarea
          {...entry.textareaProps}
          id={`prompt-input-${prompt.key}`}
          data-testid={`input-${prompt.key}`}
          disabled={disabled}
          aria-label={prompt.title}
          placeholder={
            entry.isListening
              ? "Listening — speak your answer..."
              : "Type your answer, or tap the mic to dictate..."
          }
          className="w-full min-h-[140px] rounded-md border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 resize-y outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-colors disabled:opacity-50"
        />
        {entry.speechSupported && !disabled && (
          <button
            type="button"
            onClick={entry.toggleListening}
            aria-label={entry.isListening ? "Stop dictation" : "Start dictation"}
            title={entry.isListening ? "Stop dictation" : "Dictate your answer"}
            data-testid={`button-dictate-${prompt.key}`}
            className={`absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
              entry.isListening
                ? "border-primary bg-primary/15 text-primary animate-pulse"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {entry.isListening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
      </div>
      <div
        aria-live="polite"
        role="status"
        className={`min-h-[18px] text-[11px] tracking-wide text-destructive transition-opacity ${
          entry.pasteBlocked ? "opacity-100" : "opacity-0"
        }`}
      >
        {entry.pasteBlocked && (
          <span data-testid={`text-paste-blocked-${prompt.key}`}>
            Pasting is disabled — please type your answer in your own words.
          </span>
        )}
      </div>
    </div>
  );
}

function CompletionForm({
  action,
  token,
  onSubmitted,
}: {
  action: ActionDetail;
  token: string;
  onSubmitted: () => void;
}) {
  const { toast } = useToast();
  const [declaration, setDeclaration] = useState(false);
  // promptKey → handle. A plain ref map keeps per-keystroke renders out of
  // the parent entirely.
  const handlesRef = useRef(new Map<string, PromptEntryHandle>());
  const register = useCallback((key: string, handle: PromptEntryHandle | null) => {
    if (handle) handlesRef.current.set(key, handle);
    else handlesRef.current.delete(key);
  }, []);

  const submit = useMutation({
    mutationFn: async () => {
      const answers: Record<string, string> = {};
      let pasteAttempts = 0;
      let keystrokeCount = 0;
      let maxBurstChars = 0;
      for (const p of action.prompts) {
        const h = handlesRef.current.get(p.key);
        answers[p.key] = h?.getText() ?? "";
        if (h) {
          const t = h.getTelemetry();
          pasteAttempts += t.pasteAttempts;
          keystrokeCount += t.keystrokeCount;
          maxBurstChars = Math.max(maxBurstChars, t.maxBurstChars);
          h.stopListening();
        }
      }
      const res = await apiRequest(
        "POST",
        `/api/portal/${token}/assigned-actions/${action.id}/submit`,
        {
          answers,
          honestyDeclarationAccepted:
            action.type === "witness_statement" ? declaration : undefined,
          pasteAttempts,
          keystrokeCount,
          maxBurstChars,
        },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}/assigned-actions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}`] });
      toast({ title: "Submitted — thank you" });
      onSubmitted();
    },
    onError: (err: any) => {
      toast({ title: "Could not submit", description: err.message, variant: "destructive" });
    },
  });

  const needsDeclaration = action.type === "witness_statement";

  return (
    <div className="space-y-6">
      {action.instructions && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80 mb-1">
              From your supervisor
            </p>
            <p className="whitespace-pre-wrap leading-relaxed">{action.instructions}</p>
          </CardContent>
        </Card>
      )}

      {(action.focusContext || action.eventDetails || action.pointsToAddress) && (
        <Card>
          <CardContent className="p-4 space-y-3 text-sm">
            {action.focusContext && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70 mb-1">
                  Focus
                </p>
                <p className="whitespace-pre-wrap">{action.focusContext}</p>
              </div>
            )}
            {action.eventDetails && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70 mb-1">
                  Event details
                </p>
                <p className="whitespace-pre-wrap">{action.eventDetails}</p>
              </div>
            )}
            {action.pointsToAddress && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70 mb-1">
                  Please make sure you address
                </p>
                <p className="whitespace-pre-wrap">{action.pointsToAddress}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground/80 border border-border rounded-md px-3 py-2">
        Answer every section in your own words. Copy &amp; paste is disabled; you can type
        or dictate with the microphone button.
      </p>

      {action.prompts.map((p, i) => (
        <PromptEntry
          key={p.key}
          prompt={p}
          index={i}
          disabled={submit.isPending}
          register={register}
        />
      ))}

      {needsDeclaration && (
        <label
          className="flex items-start gap-3 rounded-md border border-border bg-card p-4 cursor-pointer"
          data-testid="declaration-wrapper"
        >
          <Checkbox
            checked={declaration}
            onCheckedChange={(v) => setDeclaration(v === true)}
            className="mt-0.5"
            data-testid="checkbox-honesty-declaration"
          />
          <span className="text-sm leading-relaxed">
            <ShieldCheck className="inline h-4 w-4 mr-1 text-primary" />
            {WITNESS_STATEMENT_DECLARATION}
          </span>
        </label>
      )}

      <Button
        onClick={() => submit.mutate()}
        disabled={submit.isPending || (needsDeclaration && !declaration)}
        className="w-full sm:w-auto"
        data-testid="button-submit-action"
      >
        {submit.isPending ? "Submitting…" : `Submit ${action.typeLabel.toLowerCase()}`}
      </Button>
    </div>
  );
}

export default function PortalAssignedActionPage() {
  const [, paramsWithToken] = useRoute("/portal/action/:token");
  const params = paramsWithToken ?? { token: "me" };
  const [, navigate] = useLocation();
  const token = params?.token ?? "me";
  const selectedId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("id")
      : null;

  const { data: portal } = useQuery<PortalData>({
    queryKey: [`/api/portal/${token}`],
    enabled: !!token,
    retry: false,
  });

  const { data: actions, isLoading } = useQuery<ActionListItem[]>({
    queryKey: [`/api/portal/${token}/assigned-actions`],
    enabled: !!token,
    retry: false,
  });

  const outstanding = (actions ?? []).filter(
    (a) => a.status === "assigned" || a.status === "in_progress",
  );
  const completed = (actions ?? []).filter(
    (a) => a.status === "submitted" || a.status === "reviewed",
  );
  const activeId =
    selectedId && (actions ?? []).some((a) => a.id === selectedId)
      ? selectedId
      : outstanding[0]?.id ?? null;

  const { data: detail } = useQuery<ActionDetail>({
    queryKey: [`/api/portal/${token}/assigned-actions/${activeId}`],
    enabled: !!token && !!activeId && outstanding.some((a) => a.id === activeId),
    retry: false,
  });

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal) return [];
    return buildPortalGroups({
      token,
      journey: portal.journey,
      stepStatuses: {},
      gate: portal.gate ?? null,
      serviceAgreementSigned: portal.serviceAgreement?.signed,
      agreementsSummary: portal.agreements ?? null,
      selectAgreements: () => navigate(`/portal/agreements`),
      selectServiceAgreement: () => navigate(`/portal/service-agreement`),
      selectOverview: () => navigate(`/portal`),
      selectOnboardingStep: (k) => navigate(`/portal/page?step=${k}`),
      selectPolicies: () => navigate(`/portal/policies`),
      selectInduction: () => navigate(`/portal/induction`),
      selectSopComprehension: () => navigate(`/portal/sop-comprehension`),
      selectCompetency: () => navigate(`/portal/page?step=competency`),
      selectCvUpload: () => navigate(`/portal/page?step=cv`),
      selectDeclaration: (k) => navigate(`/portal/declaration/${k}`),
    });
  }, [portal, token, navigate]);

  const outstandingCount = outstanding.length;

  const content = (
    <div className="space-y-6 max-w-3xl" data-testid="portal-assigned-action">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
          Action required
        </p>
        <h1 className="font-serif text-3xl font-light tracking-tight">
          {detail ? detail.typeLabel : "Your assigned write-ups"}
        </h1>
        {detail?.frameworkLabel && (
          <p className="text-sm text-muted-foreground mt-1">{detail.frameworkLabel}</p>
        )}
      </div>

      {outstanding.length > 1 && (
        <div className="flex flex-wrap gap-2" data-testid="action-switcher">
          {outstanding.map((a) => (
            <Button
              key={a.id}
              variant={a.id === activeId ? "default" : "outline"}
              size="sm"
              onClick={() => navigate(`/portal/action?id=${a.id}`)}
              data-testid={`button-select-action-${a.id}`}
            >
              {a.typeLabel}
            </Button>
          ))}
        </div>
      )}

      {detail && detail.status !== "submitted" && detail.status !== "reviewed" ? (
        <CompletionForm
          key={detail.id}
          action={detail}
          token={token}
          onSubmitted={() => {
            queryClient.invalidateQueries({
              queryKey: [`/api/portal/${token}/assigned-actions`],
            });
            navigate(`/portal/action`);
          }}
        />
      ) : outstanding.length === 0 ? (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-6 flex items-center gap-4">
            <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
            <div>
              <h2 className="font-serif text-xl font-light tracking-tight mb-1">
                Nothing outstanding
              </h2>
              <p className="text-sm text-muted-foreground">
                You have no write-ups to complete right now.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {completed.length > 0 && (
        <div className="space-y-2" data-testid="completed-actions">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
            Submitted
          </p>
          {completed.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4 flex items-center gap-3">
                <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{a.typeLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    Submitted{" "}
                    {a.submittedAt
                      ? new Date(a.submittedAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : ""}
                  </p>
                </div>
                <Badge variant="outline" className="text-[11px]">
                  {a.status === "reviewed" ? "Reviewed" : "Submitted"}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  if (isLoading || !actions) {
    return (
      <PortalShell
        token={token}
        candidateName={portal?.nurse.fullName || ""}
        groups={groups}
        activeKey="overview"
        assignedActionsOutstanding={outstandingCount}
      >
        <div className="space-y-4 max-w-3xl">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      token={token}
      candidateName={portal?.nurse.fullName || ""}
      groups={groups}
      activeKey="overview"
      assignedActionsOutstanding={outstandingCount}
    >
      {content}
    </PortalShell>
  );
}
