// Nurse-facing portal page that shows the admin-managed master list of
// policies and lets the nurse acknowledge each one. Mirrors the look &
// feel of the rest of the portal (PortalShell sidebar + serif eyebrow).

import { useMemo, useRef } from "react";
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
import { CheckCircle2, FileText, ExternalLink, AlertCircle } from "lucide-react";
import { PolicyBody } from "@/components/policy-body";

function PolicyCard({
  token,
  policy: p,
  onAcknowledge,
  acknowledgePending,
}: {
  token: string;
  policy: PortalPolicy;
  onAcknowledge: (events: PolicyReadEventPayload[]) => void;
  acknowledgePending: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const isAcked = p.acknowledged;
  const needsRe = p.needsReacknowledgement;
  // Track only while the policy is awaiting (re-)acknowledgement; once
  // it's settled we don't need any more signal.
  const trackingEnabled = p.requireAcknowledgement && (!isAcked || needsRe);
  const tracker = usePolicyReadTracking({
    token,
    policyId: p.id,
    enabled: trackingEnabled,
    cardRef,
    bodyRef,
  });

  const handleAcknowledge = () => {
    // Drain pending events synchronously and pass them to the
    // acknowledge POST so the server can ingest them transactionally
    // before rolling up the summary — avoids a race against the
    // fire-and-forget sendBeacon path.
    const pending = tracker.drainPending();
    onAcknowledge(pending);
  };

  return (
    <Card
      ref={cardRef}
      data-testid={`policy-card-${p.id}`}
      className={isAcked ? "ring-1 ring-emerald-500/15" : needsRe ? "ring-1 ring-amber-500/30" : ""}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold">{p.title}</h3>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                v{p.version}
              </span>
            </div>
            {needsRe && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Updated since you last acknowledged (was v{p.acknowledgedVersion}). Please re-acknowledge.
              </p>
            )}
          </div>
          {isAcked && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Acknowledged
            </Badge>
          )}
        </div>

        {p.body && (
          <div
            ref={bodyRef}
            className="mb-3 max-h-64 overflow-y-auto pr-2"
          >
            <PolicyBody body={p.body} data-testid={`policy-body-${p.id}`} />
          </div>
        )}

        {p.pdfUrl && (
          <a
            href={p.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => tracker.notePdfOpen()}
            className="text-xs text-primary inline-flex items-center gap-1 mb-3 hover:underline"
          >
            <FileText className="h-3.5 w-3.5" />
            Open full PDF
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {p.requireAcknowledgement && (
          <div className="flex items-center justify-between gap-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              {isAcked && p.acknowledgedAt
                ? `Acknowledged on ${new Date(p.acknowledgedAt).toLocaleDateString()}`
                : "Confirm you have read and understood this policy."}
            </p>
            {!isAcked && (
              <Button
                size="sm"
                onClick={handleAcknowledge}
                disabled={acknowledgePending}
                data-testid={`button-acknowledge-${p.id}`}
              >
                {needsRe ? "Re-acknowledge" : "I have read & understood"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface PortalPolicy {
  id: string;
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
}

interface PoliciesResponse {
  policies: PortalPolicy[];
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
  // Task 114: induction-summary block, present once the 21-section
  // gate has been provisioned for this nurse. Optional so older
  // server payloads still type-check.
  induction?: { unlocked: boolean; total: number; outstanding: number };
  gate?: {
    unlocked: boolean;
    stageCompleted?: boolean;
    complianceApproved?: boolean;
    prerequisites: { examinationCompleted: boolean; competencyDeclared: boolean; cvReviewed: boolean };
  } | null;
  token: string;
}

export default function PortalPoliciesPage() {
  const [, paramsWithToken] = useRoute("/portal/policies/:token");
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
  const { data: policies, isLoading } = useQuery<PoliciesResponse>({
    queryKey: [`/api/portal/${token}/policies`],
    enabled: !!token && stageUnlocked,
  });

  const { data: sopComprehension } = useQuery<{ totalRequired: number; outstanding: number }>({
    queryKey: [`/api/portal/${token}/sop-comprehension`],
    enabled: !!token && stageUnlocked,
  });

  const stepStatuses = (onboardingState?.stepStatuses as Record<string, string>) || {};

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal || !token) return [];
    return buildPortalGroups({
      token,
      serviceAgreementSigned: (portal as any)?.serviceAgreement?.signed,
      selectServiceAgreement: () => navigate(`/portal/service-agreement`),
      journey: portal.journey,
      stepStatuses,
      selectOverview: () => navigate(`/portal`),
      selectOnboardingStep: (stepKey) =>
        navigate(`/portal/page?step=${stepKey}`),
      policiesSummary: policies
        ? { totalRequired: policies.totalRequired, outstanding: policies.outstanding }
        : null,
      selectPolicies: () => navigate(`/portal/policies`),
      inductionSummary: portal.induction
        ? {
            total: portal.induction.total,
            outstanding: portal.induction.outstanding,
            unlocked: portal.induction.unlocked,
          }
        : null,
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
  }, [portal, token, stepStatuses, navigate, policies, sopComprehension]);

  const stageLocked = !!portal?.gate && portal.gate.complianceApproved === false;

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ policyId, events }: { policyId: string; events: PolicyReadEventPayload[] }) => {
      const res = await apiRequest(
        "POST",
        `/api/portal/${token}/policies/${policyId}/acknowledge`,
        { events },
      );
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}/policies`] });
      toast({ title: "Policy acknowledged", description: "Thanks — your acknowledgement has been recorded." });
    },
    onError: (err: any) => {
      toast({
        title: "Could not record acknowledgement",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const content = (
    <div className="space-y-6" data-testid="portal-policies">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
          Compliance
        </p>
        <h1 className="font-serif text-3xl font-light tracking-tight">
          Policies to read &amp; sign
        </h1>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
          Please read each policy below and confirm you've understood it. Your
          acknowledgements are recorded against your record and form part of
          your compliance file.
        </p>
        {policies && (
          <div className="mt-3 flex items-center gap-2">
            {policies.outstanding === 0 ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                All up to date
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                {policies.outstanding} of {policies.totalRequired} outstanding
              </Badge>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : !policies || policies.policies.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No policies have been published yet. Please check back later.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {policies.policies.map((p) => (
            <PolicyCard
              key={p.id}
              token={token!}
              policy={p}
              onAcknowledge={(events) => acknowledgeMutation.mutate({ policyId: p.id, events })}
              acknowledgePending={acknowledgeMutation.isPending}
            />
          ))}
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
      activeKey="induction:policies"
    >
      {stageLocked ? <StageLockedCard label="Policies to read & sign" /> : content}
    </PortalShell>
  );
}
