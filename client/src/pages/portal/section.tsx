// Generic portal section page (task 126).
//
// Renders one of the primary-nav sections (assessment / compliance /
// training) as a flat checklist of items, replacing the legacy
// nested-tabs sidebar. Existing per-step pages remain reachable via
// item.onClick → navigate(...) so URLs and gating are preserved.

import { useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  PortalShell,
  PortalSectionChecklist,
  buildPortalGroups,
  type PortalSidebarGroup,
} from "@/components/layout/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock, ShieldCheck, ClipboardCheck, BookOpenCheck, GraduationCap, Info } from "lucide-react";

interface PortalData {
  nurse: { id: string; fullName: string; email: string; currentStage: string };
  journey: {
    preboard: { status: string; actionUrl?: string; label: string };
    onboard: { status: string; actionUrl?: string; label: string };
    skillsArcade: { status: string; actionUrl?: string; label: string };
  };
  gate?: {
    unlocked: boolean;
    mode: "auto" | "manual";
    stageCompleted?: boolean;
    complianceApproved?: boolean;
    prerequisites: { examinationCompleted: boolean; competencyDeclared: boolean; cvReviewed: boolean };
    lockedReason?: string | null;
  };
  induction?: { unlocked: boolean; total: number; outstanding: number };
  declarations?: { total: number; completed: number };
  token: string;
}

const SECTION_DEFS: Record<
  string,
  { groupKey: string; title: string; eyebrow: string; description: string; icon: typeof ShieldCheck }
> = {
  assessment: {
    groupKey: "assessment",
    title: "Assessment",
    eyebrow: "Step 1",
    description:
      "Your initial clinical examination, competency self-rating, and CV upload. Finishing all three unlocks the rest of your onboarding.",
    icon: ClipboardCheck,
  },
  compliance: {
    groupKey: "onboarding",
    title: "Compliance",
    eyebrow: "Step 2",
    description:
      "Identity, right to work, references, training certificates and the supporting declarations we need on file.",
    icon: ShieldCheck,
  },
  induction: {
    groupKey: "induction",
    title: "Induction",
    eyebrow: "Step 3",
    description:
      "Read the staff handbook, sign off the policies, and pass the SOP comprehension quizzes.",
    icon: BookOpenCheck,
  },
  training: {
    groupKey: "training",
    title: "Training",
    eyebrow: "Step 4",
    description:
      "Mandatory training certificates and the Clinical Skills Arcade — the final step before you're roster-ready.",
    icon: GraduationCap,
  },
};

export default function PortalSectionPage() {
  const [, params] = useRoute<{ section: string }>("/portal/section/:section");
  const [, navigate] = useLocation();
  const sectionKey = params?.section || "assessment";
  const def = SECTION_DEFS[sectionKey];

  const token = "me";

  const { data: portal, isLoading } = useQuery<PortalData>({
    queryKey: [`/api/portal/${token}`],
    enabled: !!def,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/portal/${token}`, { credentials: "include" });
      if (res.status === 410 || res.status === 401) {
        const body = (await res.json().catch(() => ({}))) as {
          redirect?: string;
          email?: string;
          message?: string;
        };
        const dest = body.redirect || "/portal/sign-in";
        const qs = body.email ? `?email=${encodeURIComponent(body.email)}` : "";
        navigate(`${dest}${qs}`);
        throw new Error(body.message || "Sign-in required");
      }
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
  });

  const { data: onboardingState } = useQuery<{ stepStatuses?: Record<string, string> } | null>({
    queryKey: ["/api/portal", token, "onboarding-state"],
    enabled: !!portal,
  });

  const stageUnlocked = portal?.gate?.stageCompleted !== false;

  const { data: policiesData } = useQuery<{ totalRequired: number; outstanding: number }>({
    queryKey: [`/api/portal/${token}/policies`],
    enabled: !!portal && stageUnlocked,
  });

  const { data: sopComprehensionData } = useQuery<{ totalRequired: number; outstanding: number }>({
    queryKey: [`/api/portal/${token}/sop-comprehension`],
    enabled: !!portal && stageUnlocked,
  });

  const { data: declarationsData } = useQuery<{
    items: { key: string; title: string; status: "not_started" | "draft" | "submitted" | "reopened" }[];
    total: number;
    completed: number;
    outstanding: number;
  }>({
    queryKey: [`/api/portal/${token}/declarations`],
    enabled: !!portal,
  });

  const stepStatuses = (onboardingState?.stepStatuses as Record<string, string>) || {};
  const isCompletedStage = portal?.nurse.currentStage === "completed";

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal) return [];
    return buildPortalGroups({
      token,
      serviceAgreementSigned: (portal as any)?.serviceAgreement?.signed,
      selectServiceAgreement: () => navigate(`/portal/service-agreement`),
      journey: portal.journey,
      stepStatuses,
      gate: portal.gate ?? null,
      availabilityEnabled: isCompletedStage,
      selectAvailability: () => navigate(`/portal/availability`),
      selectOverview: () => navigate(`/portal`),
      selectOnboardingStep: (stepKey) => navigate(`/portal/page?step=${stepKey}`),
      selectCompetency: () => navigate(`/portal/page?step=competency`),
      selectCvUpload: () => navigate(`/portal/page?step=profile`),
      policiesSummary: policiesData
        ? { totalRequired: policiesData.totalRequired, outstanding: policiesData.outstanding }
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
      sopComprehensionSummary: sopComprehensionData
        ? { totalRequired: sopComprehensionData.totalRequired, outstanding: sopComprehensionData.outstanding }
        : null,
      selectSopComprehension: () => navigate(`/portal/sop-comprehension`),
      declarationsSummary: declarationsData ?? null,
      selectDeclaration: (key) => navigate(`/portal/declaration/${key}`),
    });
  }, [portal, token, stepStatuses, navigate, policiesData, sopComprehensionData, declarationsData, isCompletedStage]);

  if (!def) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md text-center">
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground">Unknown section.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !portal) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Skeleton className="h-10 w-48 mb-3" />
          <Skeleton className="h-5 w-72 mb-8" />
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const group = groups.find((g) => g.key === def.groupKey);
  const Icon = def.icon;

  // Locked-section explainer. Compliance is locked behind the Assessment
  // gate; Training (induction & policies) is locked behind admin
  // compliance approval.
  const isLocked = !!portal.gate && portal.gate.unlocked === false;
  const stageLocked = !!portal.gate && portal.gate.complianceApproved === false;

  let lockedExplainer: { title: string; body: string } | null = null;
  if (def.groupKey === "onboarding" && isLocked) {
    const prereqs = portal.gate!.prerequisites;
    const remaining: string[] = [];
    if (!prereqs.examinationCompleted) remaining.push("Submit your clinical examination");
    if (!prereqs.competencyDeclared) remaining.push("Complete your competency self-rating");
    if (!prereqs.cvReviewed) remaining.push("Upload your CV (admin will review)");
    lockedExplainer = {
      title: "Compliance is locked while you finish Assessment",
      body:
        remaining.length > 0
          ? `Still to do: ${remaining.join(" · ")}`
          : "Your assessment is being reviewed. We'll unlock this section as soon as it's done.",
    };
  } else if (def.groupKey === "induction" && (isLocked || stageLocked)) {
    lockedExplainer = {
      title: isLocked
        ? "Induction is locked while you finish Assessment"
        : "Induction opens after compliance approval",
      body: isLocked
        ? "Finish the Assessment section first — once submitted, your Compliance pack opens, and Induction follows after admin approval."
        : "Once an admin signs off your compliance pack, the staff handbook, policies and SOP quizzes will appear here.",
    };
  } else if (def.groupKey === "training" && (isLocked || stageLocked)) {
    lockedExplainer = {
      title: isLocked
        ? "Training is locked while you finish Assessment"
        : "Training opens after compliance approval & Induction",
      body: isLocked
        ? "Finish the Assessment section first."
        : "Once an admin signs off your compliance pack, finish the Induction section and Training will open automatically.",
    };
  }

  return (
    <PortalShell
      token={token}
      candidateName={portal.nurse.fullName}
      groups={groups}
      activeKey={sectionKey}
    >
      <div className="space-y-6 max-w-3xl" data-testid={`portal-section-page-${sectionKey}`}>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
            {def.eyebrow}
          </p>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <h1 className="font-serif text-3xl font-light tracking-tight">{def.title}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            {def.description}
          </p>
        </div>

        {lockedExplainer && (
          <Card className="border-amber-500/30 bg-amber-500/5" data-testid="portal-section-locked-explainer">
            <CardContent className="py-4 flex items-start gap-3">
              <Lock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-foreground mb-1">{lockedExplainer.title}</p>
                <p className="text-muted-foreground leading-relaxed">{lockedExplainer.body}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!group ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              <Info className="h-5 w-5 mx-auto mb-2 text-muted-foreground/50" />
              Nothing to do in this section right now.
            </CardContent>
          </Card>
        ) : (
          <PortalSectionChecklist group={group} />
        )}
      </div>
    </PortalShell>
  );
}
