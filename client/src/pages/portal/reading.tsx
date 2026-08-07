// Nurse-facing portal page for admin-added reading materials. Mirrors the
// policies page: same invisible read-time tracking (the materials live in
// the shared `policies` table, so the read-events + acknowledge endpoints
// are reused verbatim) and the same acknowledgement flow.

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
import { CheckCircle2, FileText, ExternalLink, AlertCircle, Download, BookOpen } from "lucide-react";
import { PolicyBody } from "@/components/policy-body";

interface PortalReadingItem {
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
  readingCategory: string | null;
  hasSourceFile: boolean;
  sourceFileName: string | null;
}

interface ReadingResponse {
  policies: PortalReadingItem[];
  totalRequired: number;
  outstanding: number;
}

function ReadingCard({
  token,
  item: p,
  onAcknowledge,
  acknowledgePending,
}: {
  token: string;
  item: PortalReadingItem;
  onAcknowledge: (events: PolicyReadEventPayload[]) => void;
  acknowledgePending: boolean;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const isAcked = p.acknowledged;
  const needsRe = p.needsReacknowledgement;
  const trackingEnabled = p.requireAcknowledgement && (!isAcked || needsRe);
  // Reading materials share the policies read-event pipeline — the hook
  // posts to /api/portal/:token/policies/:id/read-events, which accepts
  // any row in the shared policies table.
  const tracker = usePolicyReadTracking({
    token,
    policyId: p.id,
    enabled: trackingEnabled,
    cardRef,
    bodyRef,
  });

  const handleAcknowledge = () => {
    const pending = tracker.drainPending();
    onAcknowledge(pending);
  };

  return (
    <Card
      ref={cardRef}
      data-testid={`reading-card-${p.id}`}
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
              {p.readingCategory && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {p.readingCategory}
                </Badge>
              )}
            </div>
            {needsRe && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Updated since you last confirmed (was v{p.acknowledgedVersion}). Please re-confirm.
              </p>
            )}
          </div>
          {isAcked && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Read
            </Badge>
          )}
        </div>

        {p.body && (
          <div ref={bodyRef} className="mb-3 max-h-64 overflow-y-auto pr-2">
            <PolicyBody body={p.body} data-testid={`reading-body-${p.id}`} />
          </div>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          {p.hasSourceFile && (
            <a
              href={`/api/portal/${token}/reading-materials/${p.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => tracker.notePdfOpen()}
              className="text-xs text-primary inline-flex items-center gap-1 mb-3 hover:underline"
              data-testid={`reading-file-link-${p.id}`}
            >
              <Download className="h-3.5 w-3.5" />
              {p.sourceFileName ? `Open ${p.sourceFileName}` : "Open original document"}
            </a>
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
              Open link
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {p.requireAcknowledgement && (
          <div className="flex items-center justify-between gap-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              {isAcked && p.acknowledgedAt
                ? `Confirmed on ${new Date(p.acknowledgedAt).toLocaleDateString()}`
                : "Confirm you have read and understood this material."}
            </p>
            {!isAcked && (
              <Button
                size="sm"
                onClick={handleAcknowledge}
                disabled={acknowledgePending}
                data-testid={`button-acknowledge-reading-${p.id}`}
              >
                {needsRe ? "Re-confirm" : "I have read & understood"}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface PortalData {
  nurse: { id: string; fullName: string; email: string; currentStage: string };
  journey: {
    preboard: { status: string; actionUrl?: string; label: string };
    onboard: { status: string; actionUrl?: string; label: string };
    skillsArcade: { status: string; actionUrl?: string; label: string };
  };
  induction?: { unlocked: boolean; total: number; outstanding: number };
  gate?: any | null;
  token: string;
}

export default function PortalReadingPage() {
  const [, paramsWithToken] = useRoute("/portal/reading/:token");
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
  const { data: reading, isLoading } = useQuery<ReadingResponse>({
    queryKey: [`/api/portal/${token}/reading-materials`],
    enabled: !!token && stageUnlocked,
  });

  const stepStatuses = (onboardingState?.stepStatuses as Record<string, string>) || {};

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal || !token) return [];
    return buildPortalGroups({
      token,
      serviceAgreementSigned: (portal as any)?.serviceAgreement?.signed,
      selectServiceAgreement: () => navigate(`/portal/service-agreement`),
      agreementsSummary: (portal as any)?.agreements ?? null,
      selectAgreements: () => navigate(`/portal/agreements`),
      journey: portal.journey,
      stepStatuses,
      selectOverview: () => navigate(`/portal`),
      selectOnboardingStep: (stepKey) => navigate(`/portal/page?step=${stepKey}`),
      selectPolicies: () => navigate(`/portal/policies`),
      readingSummary: reading
        ? { totalRequired: reading.totalRequired, outstanding: reading.outstanding }
        : null,
      selectReading: () => navigate(`/portal/reading`),
      inductionSummary: portal.induction
        ? {
            total: portal.induction.total,
            outstanding: portal.induction.outstanding,
            unlocked: portal.induction.unlocked,
          }
        : null,
      selectInduction: () => navigate(`/portal/induction`),
      selectSopComprehension: () => navigate(`/portal/sop-comprehension`),
      selectCompetency: () => navigate(`/portal/page?step=competency`),
      selectCvUpload: () => navigate(`/portal/page?step=profile`),
      selectDeclaration: (k) => navigate(`/portal/declaration/${k}`),
      gate: portal.gate ?? null,
    });
  }, [portal, token, stepStatuses, navigate, reading]);

  const stageLocked = !!portal?.gate && portal.gate.complianceApproved === false;

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ policyId, events }: { policyId: string; events: PolicyReadEventPayload[] }) => {
      // Shared acknowledge endpoint — reading materials live in the same
      // table as policies, so the server handles them identically (with a
      // reading-specific audit action).
      const res = await apiRequest(
        "POST",
        `/api/portal/${token}/policies/${policyId}/acknowledge`,
        { events },
      );
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}/reading-materials`] });
      toast({ title: "Marked as read", description: "Thanks — your confirmation has been recorded." });
    },
    onError: (err: any) => {
      toast({
        title: "Could not record confirmation",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const content = (
    <div className="space-y-6" data-testid="portal-reading">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
          Compliance
        </p>
        <h1 className="font-serif text-3xl font-light tracking-tight">
          Reading materials
        </h1>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
          Documents and other reading your employer has shared with you.
          Please read each item and confirm you've understood it — your
          confirmations are recorded against your record.
        </p>
        {reading && reading.totalRequired > 0 && (
          <div className="mt-3 flex items-center gap-2">
            {reading.outstanding === 0 ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                All up to date
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                {reading.outstanding} of {reading.totalRequired} outstanding
              </Badge>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : !reading || reading.policies.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
            No reading materials have been published yet. Please check back later.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reading.policies.map((p) => (
            <ReadingCard
              key={p.id}
              token={token!}
              item={p}
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
      activeKey="induction:reading"
    >
      {stageLocked ? <StageLockedCard label="Reading materials" /> : content}
    </PortalShell>
  );
}
