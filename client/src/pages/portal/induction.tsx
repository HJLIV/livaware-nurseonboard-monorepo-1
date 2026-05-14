// Nurse-facing portal page for the 21 Staff-Handbook induction items
// (task 114). Mirrors /portal/policies but groups items by Part / SOP /
// Appendix and surfaces the "X of 21 outstanding" gate that controls
// access to the Skills Arcade.
//
// Time-on-page is captured silently via the existing
// usePolicyReadTracking hook — no timer, badge, or counter is shown to
// the candidate. Admins / super-admins see the totals on
// /api/nurses/:id/induction-progress.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePolicyReadTracking, type PolicyReadEventPayload } from "@/lib/policy-read-tracking";
import {
  PortalShell,
  buildPortalGroups,
  type PortalSidebarGroup,
} from "@/components/layout/portal-shell";
import { StageLockedCard } from "@/components/portal/stage-locked-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, BookOpen, AlertCircle, Lock, ChevronDown, ChevronRight, Circle } from "lucide-react";
import { PolicyBody } from "@/components/policy-body";
import { SopComprehensionDialog } from "@/components/portal/sop-comprehension-dialog";

interface InductionItem {
  id: string;
  // Stable identifier (e.g. "induction:sop-01-antt") — used to match a
  // SOP item to its comprehension MCQ after acknowledgement.
  slug?: string | null;
  title: string;
  body: string | null;
  pdfUrl: string | null;
  version: string;
  requireAcknowledgement: boolean;
  sortOrder: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedVersion: string | null;
  needsReacknowledgement: boolean;
  group: "part" | "sop" | "appendix" | null;
}

interface InductionResponse {
  policies: InductionItem[];
  totalRequired: number;
  outstanding: number;
}

interface PortalData {
  nurse: { id: string; fullName: string; email: string; currentStage: string };
  journey: {
    preboard: { status: string; actionUrl?: string; label: string };
    onboard: { status: string; actionUrl?: string; label: string };
    skillsArcade: { status: string; actionUrl?: string; label: string };
  };
  induction?: { unlocked: boolean; total: number; outstanding: number };
  gate?: {
    unlocked: boolean;
    stageCompleted?: boolean;
    complianceApproved?: boolean;
    prerequisites: { examinationCompleted: boolean; competencyDeclared: boolean; cvReviewed: boolean };
  } | null;
  token: string;
}

// localStorage key for persisting per-item scroll position so the
// candidate can resume reading from where they left off across visits.
const RESUME_KEY = (token: string, policyId: string) =>
  `induction-resume:${token}:${policyId}`;

function InductionCard({
  token,
  item,
  onAcknowledge,
  acknowledgePending,
  defaultExpanded,
}: {
  token: string;
  item: InductionItem;
  onAcknowledge: (events: PolicyReadEventPayload[]) => void;
  acknowledgePending: boolean;
  defaultExpanded?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const isAcked = item.acknowledged;
  const needsRe = item.needsReacknowledgement;
  // Collapsible sections: items render as a one-line list entry until
  // the candidate expands them. The reading-time tracker (and scroll
  // observers) only attach once expanded, so the silent timer cannot
  // run for a section that hasn't actually been opened.
  const [expanded, setExpanded] = useState<boolean>(defaultExpanded ?? false);
  const trackingEnabled = item.requireAcknowledgement && (!isAcked || needsRe) && expanded;
  // Scroll-to-end gating: candidate cannot acknowledge until they have
  // visibly scrolled to the bottom of the body. Auto-true for already-
  // acknowledged items (no need to re-scroll just to view) and for
  // items whose body is short enough to be fully visible without
  // scrolling.
  const [scrolledToEnd, setScrolledToEnd] = useState<boolean>(false);
  const tracker = usePolicyReadTracking({
    token,
    policyId: item.id,
    enabled: trackingEnabled,
    cardRef,
    bodyRef,
  });

  // On expand: restore last scroll position (resume) and seed
  // scrolledToEnd if the body fits without scrolling. We re-run this
  // each time the section is reopened so the resume marker is honoured
  // every time, not just on first mount.
  useEffect(() => {
    if (!expanded) return;
    const el = bodyRef.current;
    if (!el) return;
    let raf = 0;
    const apply = () => {
      // If the body fits without scrolling, the candidate has by
      // definition seen the whole thing.
      if (el.scrollHeight <= el.clientHeight + 8) {
        setScrolledToEnd(true);
        return;
      }
      try {
        const raw = window.localStorage.getItem(RESUME_KEY(token, item.id));
        if (raw) {
          const top = Number(raw);
          if (Number.isFinite(top) && top > 0 && top < el.scrollHeight) {
            el.scrollTop = top;
            // If the persisted position was already at/near the end,
            // honour that and unlock the button immediately.
            if (el.scrollHeight - el.scrollTop - el.clientHeight <= 8) {
              setScrolledToEnd(true);
            }
          }
        }
      } catch {
        // localStorage may be disabled (private mode) — ignore.
      }
    };
    raf = window.requestAnimationFrame(apply);
    return () => window.cancelAnimationFrame(raf);
  }, [token, item.id, expanded]);

  // Persist scroll position + observe scroll-to-end to unlock the
  // acknowledge button. Only wired up while expanded.
  useEffect(() => {
    if (!expanded) return;
    const el = bodyRef.current;
    if (!el) return;
    let pending = 0;
    const onScroll = () => {
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining <= 8) setScrolledToEnd(true);
      // Throttled persistence (one write per animation frame).
      if (pending) return;
      pending = window.requestAnimationFrame(() => {
        pending = 0;
        try {
          window.localStorage.setItem(
            RESUME_KEY(token, item.id),
            String(el.scrollTop),
          );
        } catch {
          // ignore
        }
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (pending) window.cancelAnimationFrame(pending);
    };
  }, [token, item.id, expanded]);

  // Already-acked items don't need the gate (they're shown read-only).
  const ackUnlocked = scrolledToEnd || (isAcked && !needsRe);

  const handleAcknowledge = () => {
    if (!ackUnlocked) return;
    const pending = tracker.drainPending();
    // Clear the resume marker — the section is done.
    try {
      window.localStorage.removeItem(RESUME_KEY(token, item.id));
    } catch {
      // ignore
    }
    onAcknowledge(pending);
    // Collapse back to the list view so the next outstanding item is
    // immediately visible and scannable.
    setExpanded(false);
  };

  // Collapsed list-row variant — a single tappable line showing the
  // section title, version, acknowledged state, and a chevron. The
  // reading timer is NOT running in this state.
  if (!expanded) {
    const statusIcon = isAcked && !needsRe
      ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      : needsRe
        ? <AlertCircle className="h-4 w-4 text-amber-500" />
        : <Circle className="h-4 w-4 text-muted-foreground/40" />;
    return (
      <Card
        ref={cardRef}
        data-testid={`induction-card-${item.id}`}
        className={`transition-colors ${isAcked && !needsRe ? "ring-1 ring-emerald-500/15" : needsRe ? "ring-1 ring-amber-500/30" : ""}`}
      >
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full text-left p-4 flex items-center gap-3 hover-elevate"
          data-testid={`button-expand-induction-${item.id}`}
          aria-expanded={false}
        >
          <span className="shrink-0">{statusIcon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium truncate">{item.title}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                v{item.version}
              </span>
              {isAcked && !needsRe && (
                <span className="text-[10px] text-emerald-600/80">Acknowledged</span>
              )}
              {needsRe && (
                <span className="text-[10px] text-amber-600">Re-acknowledge required</span>
              )}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
        </button>
      </Card>
    );
  }

  return (
    <Card
      ref={cardRef}
      data-testid={`induction-card-${item.id}`}
      className={isAcked ? "ring-1 ring-emerald-500/15" : needsRe ? "ring-1 ring-amber-500/30" : ""}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="flex-1 min-w-0 text-left flex items-start gap-2 hover-elevate -m-1 p-1 rounded"
            data-testid={`button-collapse-induction-${item.id}`}
            aria-expanded={true}
          >
            <ChevronDown className="h-4 w-4 text-muted-foreground/60 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                  v{item.version}
                </span>
              </div>
              {needsRe && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Updated since you last acknowledged (was v{item.acknowledgedVersion}). Please re-acknowledge.
                </p>
              )}
            </div>
          </button>
          {isAcked && !needsRe && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Acknowledged
            </Badge>
          )}
        </div>

        {item.body && (
          <div ref={bodyRef} className="mb-3 max-h-72 overflow-y-auto pr-2">
            <PolicyBody body={item.body} data-testid={`induction-body-${item.id}`} />
          </div>
        )}

        {item.requireAcknowledgement && (
          <div className="flex items-center justify-between gap-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              {isAcked && !needsRe && item.acknowledgedAt
                ? `Acknowledged on ${new Date(item.acknowledgedAt).toLocaleDateString()}`
                : "Confirm you have read and understood this section."}
            </p>
            {(!isAcked || needsRe) && (
              <div className="flex flex-col items-end gap-1">
                <Button
                  size="sm"
                  onClick={handleAcknowledge}
                  disabled={acknowledgePending || !ackUnlocked}
                  data-testid={`button-acknowledge-induction-${item.id}`}
                  title={ackUnlocked ? undefined : "Scroll to the end to enable"}
                >
                  {needsRe ? "Re-acknowledge" : "I have read & understood"}
                </Button>
                {!ackUnlocked && (
                  <span className="text-[10px] text-muted-foreground/70">
                    Scroll to the end to enable
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const GROUP_LABELS: Record<string, string> = {
  part: "Handbook Parts",
  sop: "Standard Operating Procedures",
  appendix: "Appendices, Templates & Quality Framework",
  unknown: "Other induction items",
};
const GROUP_ORDER = ["part", "sop", "appendix", "unknown"] as const;

export default function PortalInductionPage() {
  const [, paramsWithToken] = useRoute("/portal/induction/:token");
  const params = paramsWithToken ?? { token: "me" };
  const [, navigate] = useLocation();
  const token = params?.token;
  const { toast } = useToast();

  const { data: portal } = useQuery<PortalData>({
    queryKey: [`/api/portal/${token}`],
    enabled: !!token,
    retry: false,
  });

  const { data: onboardingState } = useQuery<{ stepStatuses?: Record<string, string> } | null>({
    queryKey: ["/api/portal", token, "onboarding-state"],
    enabled: !!token && !!portal,
  });

  const stageUnlocked = portal?.gate?.complianceApproved !== false;
  const { data: induction, isLoading } = useQuery<InductionResponse>({
    queryKey: [`/api/portal/${token}/induction`],
    enabled: !!token && stageUnlocked,
  });

  const { data: policies } = useQuery<{ totalRequired: number; outstanding: number }>({
    queryKey: [`/api/portal/${token}/policies`],
    enabled: !!token && stageUnlocked,
  });

  const { data: sopComprehension } = useQuery<{ totalRequired: number; outstanding: number }>({
    queryKey: [`/api/portal/${token}/sop-comprehension`],
    enabled: !!token && stageUnlocked,
  });

  const stepStatuses = (onboardingState?.stepStatuses as Record<string, string>) || {};

  const inductionSummary = useMemo(() => {
    if (!induction) return portal?.induction ?? null;
    return {
      total: induction.totalRequired,
      outstanding: induction.outstanding,
      unlocked: induction.outstanding === 0,
    };
  }, [induction, portal]);

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal || !token) return [];
    return buildPortalGroups({
      token,
      journey: portal.journey,
      stepStatuses,
      selectOverview: () => navigate(`/portal`),
      selectOnboardingStep: (stepKey) => navigate(`/portal/page?step=${stepKey}`),
      policiesSummary: policies
        ? { totalRequired: policies.totalRequired, outstanding: policies.outstanding }
        : null,
      selectPolicies: () => navigate(`/portal/policies`),
      inductionSummary,
      selectInduction: () => navigate(`/portal/induction`),
      sopComprehensionSummary: sopComprehension
        ? { totalRequired: sopComprehension.totalRequired, outstanding: sopComprehension.outstanding }
        : null,
      selectSopComprehension: () => navigate(`/portal/sop-comprehension`),
      selectCompetency: () => navigate(`/portal/page?step=competency`),
      selectCvUpload: () => navigate(`/portal/page?step=profile`),
      selectDeclaration: (k) => navigate(`/portal/declaration/${k}`),
      gate: portal.gate ?? null,
    });
  }, [portal, token, stepStatuses, navigate, policies, inductionSummary, sopComprehension]);

  const stageLocked = !!portal?.gate && portal.gate.complianceApproved === false;

  // Slug of the SOP whose comprehension MCQ should pop up. Set after
  // a successful acknowledge of a SOP-tagged induction item; cleared
  // when the dialog closes.
  const [pendingComprehensionSlug, setPendingComprehensionSlug] = useState<string | null>(null);

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ policyId, events }: { policyId: string; events: PolicyReadEventPayload[]; slug?: string | null }) => {
      // Reuses the existing /policies/:id/acknowledge endpoint — it
      // works for any policy id, induction-tagged or otherwise, and
      // already handles read-event flush + ack idempotency.
      const res = await apiRequest(
        "POST",
        `/api/portal/${token}/policies/${policyId}/acknowledge`,
        { events },
      );
      return await res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}/induction`] });
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}`] });
      toast({ title: "Section acknowledged", description: "Thanks — your acknowledgement has been recorded." });
      // Pop the comprehension MCQ for SOP items immediately after ack
      // — the slug naming convention (`induction:sop-NN-...`) lines up
      // with the MCQ slugs on the server. The dialog itself short-
      // circuits if the candidate has already passed this version.
      const slug = variables?.slug ?? null;
      if (slug && /^induction:sop-\d/.test(slug)) {
        setPendingComprehensionSlug(slug);
      }
    },
    onError: (err: any) => {
      toast({
        title: "Could not record acknowledgement",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const grouped = useMemo(() => {
    const out: Record<string, InductionItem[]> = { part: [], sop: [], appendix: [], unknown: [] };
    for (const it of induction?.policies ?? []) {
      out[it.group ?? "unknown"].push(it);
    }
    return out;
  }, [induction]);

  const content = (
    <div className="space-y-6" data-testid="portal-induction">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
          Compliance
        </p>
        <h1 className="font-serif text-3xl font-light tracking-tight">
          Induction — Livaware Staff Handbook
        </h1>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
          Please read each section below and confirm you've understood it. All
          21 sections must be acknowledged before the Clinical Skills Arcade
          unlocks. Your progress is saved as you go — you can come back any
          time and pick up where you left off.
        </p>
        {induction && (
          <div className="mt-3 flex items-center gap-2">
            {induction.outstanding === 0 ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20" data-testid="badge-induction-complete">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                All {induction.totalRequired} sections acknowledged — Skills Arcade unlocked
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20" data-testid="badge-induction-outstanding">
                <Lock className="h-3.5 w-3.5 mr-1" />
                {induction.outstanding} of {induction.totalRequired} outstanding
              </Badge>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : !induction || induction.policies.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            The induction handbook hasn't been published to this environment yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {GROUP_ORDER.map((g) => {
            const items = grouped[g];
            if (!items || items.length === 0) return null;
            return (
              <section key={g} className="space-y-3" data-testid={`induction-group-${g}`}>
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground/70" />
                  <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
                    {GROUP_LABELS[g]}
                  </h2>
                </div>
                <div className="space-y-3">
                  {items.map((item) => (
                    <InductionCard
                      key={item.id}
                      token={token!}
                      item={item}
                      onAcknowledge={(events) => acknowledgeMutation.mutate({ policyId: item.id, events, slug: item.slug })}
                      acknowledgePending={acknowledgeMutation.isPending}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );

  if (!token) return null;
  if (!portal) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-32 w-72" />
      </div>
    );
  }

  return (
    <PortalShell
      token={token}
      candidateName={portal.nurse.fullName}
      groups={groups}
      activeKey="induction:handbook"
    >
      {stageLocked ? <StageLockedCard label="Induction (Staff Handbook)" /> : content}
      <SopComprehensionDialog
        token={token}
        sopSlug={pendingComprehensionSlug}
        open={!!pendingComprehensionSlug}
        onClose={() => setPendingComprehensionSlug(null)}
      />
    </PortalShell>
  );
}
