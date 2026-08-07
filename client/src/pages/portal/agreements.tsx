// Nurse-facing Individual Agreements page (task 191). Lists the ad-hoc
// agreements an admin has issued for this nurse (projects, patients,
// deployments). Each pending agreement shows the uploaded document inline
// (PDF) or as a download (Word), requires an explicit "I have read" tick,
// and is signed with the same typed-signature ceremony as the Service
// Agreement. Voided agreements are never shown here.

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { PolicyBody } from "@/components/policy-body";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Download,
  FileSignature,
  FileText,
  ShieldCheck,
} from "lucide-react";

interface AgreementSourceDocument {
  id: string;
  filePath: string | null;
  originalFilename: string | null;
  mimeType: string | null;
}

interface IndividualAgreement {
  id: string;
  title: string;
  contextType: "project" | "patient" | "deployment" | "other";
  contextLabel: string | null;
  status: "pending" | "signed" | "voided";
  signatureName: string | null;
  signedAt: string | null;
  signedPdfDocumentId: string | null;
  createdAt: string;
  sourceDocument: AgreementSourceDocument | null;
  contentMarkdown: string | null;
  extractionError: string | null;
}

interface PortalData {
  nurse: { id: string; fullName: string; email: string; currentStage: string };
  journey: {
    preboard: { status: string; actionUrl?: string; label: string };
    onboard: { status: string; actionUrl?: string; label: string };
    skillsArcade: { status: string; actionUrl?: string; label: string };
  };
  serviceAgreement?: { signed: boolean };
  agreements?: { total: number; outstanding: number };
  gate?: any;
  token: string;
}

const CONTEXT_LABELS: Record<IndividualAgreement["contextType"], string> = {
  project: "Project",
  patient: "Patient",
  deployment: "Deployment",
  other: "Agreement",
};

function AgreementCard({
  agreement,
  token,
}: {
  agreement: IndividualAgreement;
  token: string;
}) {
  const { toast } = useToast();
  const [confirmRead, setConfirmRead] = useState(false);
  const [signatureName, setSignatureName] = useState("");

  const doc = agreement.sourceDocument;
  const isPdf = (doc?.mimeType || "").includes("pdf");
  const signed = agreement.status === "signed";
  const hasInAppContent = !!agreement.contentMarkdown;

  // Read-to-end gate (same ceremony as the Service Agreement): when the
  // agreement is rendered in-app, the nurse must scroll to the end of the
  // document before the signing controls unlock. When we fall back to the
  // raw file view we can't track reading, so the gate is open.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(!hasInAppContent);

  useEffect(() => {
    if (signed || !hasInAppContent) return;
    const el = bodyRef.current;
    if (!el) return;
    const check = () => {
      if (el.scrollHeight <= el.clientHeight + 8) {
        setScrolledToEnd(true);
        return;
      }
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining <= 24) setScrolledToEnd(true);
    };
    const raf = window.requestAnimationFrame(check);
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      window.cancelAnimationFrame(raf);
      el.removeEventListener("scroll", check);
    };
  }, [signed, hasInAppContent]);

  const signMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/portal/${token}/agreements/${agreement.id}/sign`,
        { signatureName: signatureName.trim(), confirmRead },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}/agreements`] });
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}`] });
      toast({
        title: "Agreement signed",
        description: `Thank you for signing “${agreement.title}”.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Could not sign",
        description: err?.message || "Please check the fields and try again.",
        variant: "destructive",
      });
    },
  });

  const canSign = scrolledToEnd && confirmRead && signatureName.trim().length > 1;

  return (
    <Card data-testid={`agreement-card-${agreement.id}`}>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/60">
              {CONTEXT_LABELS[agreement.contextType]}
              {agreement.contextLabel ? ` · ${agreement.contextLabel}` : ""}
            </p>
            <h2 className="font-serif text-xl font-light tracking-tight mt-0.5">
              {agreement.title}
            </h2>
          </div>
          {signed ? (
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
              data-testid={`badge-agreement-signed-${agreement.id}`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Signed
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-600 border-amber-500/20"
              data-testid={`badge-agreement-pending-${agreement.id}`}
            >
              <FileSignature className="h-3.5 w-3.5 mr-1" /> Awaiting your signature
            </Badge>
          )}
        </div>

        {signed ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              You signed this agreement as{" "}
              <span className="font-medium text-foreground">{agreement.signatureName}</span>
              {agreement.signedAt ? ` on ${new Date(agreement.signedAt).toLocaleString()}` : ""}. Your
              signed copy below contains the full agreement and your signature details.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {agreement.signedPdfDocumentId && (
                <Button asChild size="sm">
                  <a
                    href={`/api/documents/${agreement.signedPdfDocumentId}/download`}
                    target="_blank"
                    rel="noreferrer"
                    data-testid={`link-signed-pdf-${agreement.id}`}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download your signed agreement (PDF)
                  </a>
                </Button>
              )}
              {doc?.filePath && (
                <Button asChild variant="outline" size="sm">
                  <a href={doc.filePath} target="_blank" rel="noreferrer">
                    Original document
                  </a>
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            {hasInAppContent ? (
              <>
                <div className="rounded-lg border overflow-hidden">
                  <div
                    ref={bodyRef}
                    className="max-h-[55vh] overflow-y-auto p-6"
                    data-testid={`agreement-body-${agreement.id}`}
                  >
                    <PolicyBody body={agreement.contentMarkdown} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  {!scrolledToEnd ? (
                    <p className="text-xs text-muted-foreground/70">
                      Scroll to the end of the agreement above to enable signing.
                    </p>
                  ) : (
                    <span />
                  )}
                  {doc?.filePath && (
                    <a
                      href={doc.filePath}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground underline inline-flex items-center gap-1"
                      data-testid={`link-original-document-${agreement.id}`}
                    >
                      <Download className="h-3 w-3" /> View original document
                    </a>
                  )}
                </div>
              </>
            ) : doc?.filePath ? (
              isPdf ? (
                <div className="rounded-lg border overflow-hidden">
                  <iframe
                    src={doc.filePath}
                    title={agreement.title}
                    className="w-full h-[55vh] bg-white"
                    data-testid={`agreement-document-${agreement.id}`}
                  />
                </div>
              ) : (
                <div className="rounded-lg border p-4 flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground/70 shrink-0" />
                  <div className="flex-1 min-w-0 text-sm">
                    <p className="font-medium truncate">
                      {doc.originalFilename || "Agreement document"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Download and read this document in full before signing.
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <a href={doc.filePath} target="_blank" rel="noreferrer">
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Open
                    </a>
                  </Button>
                </div>
              )
            ) : (
              <p className="text-sm text-amber-600">
                The agreement document is unavailable. Please contact your administrator.
              </p>
            )}

            <div
              className={`space-y-4 pt-2 border-t ${scrolledToEnd ? "" : "opacity-50 pointer-events-none"}`}
            >
              <div className="flex items-start gap-2.5">
                <Checkbox
                  id={`confirm-${agreement.id}`}
                  checked={confirmRead}
                  onCheckedChange={(v) => setConfirmRead(v === true)}
                  data-testid={`checkbox-confirm-read-${agreement.id}`}
                />
                <Label
                  htmlFor={`confirm-${agreement.id}`}
                  className="text-sm font-normal leading-snug cursor-pointer"
                >
                  I confirm I have read and understood this agreement in full.
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`signature-${agreement.id}`} className="text-sm">
                  Type your full legal name to sign
                  <span className="text-amber-600"> *</span>
                </Label>
                <Input
                  id={`signature-${agreement.id}`}
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="e.g. Jane Elizabeth Doe"
                  disabled={!confirmRead}
                  className="font-serif text-lg"
                  data-testid={`input-signature-${agreement.id}`}
                />
                <p className="text-[11px] text-muted-foreground/70">
                  By typing your name and clicking “Sign agreement”, you confirm you agree to be
                  bound by this agreement.
                </p>
              </div>

              <div className="flex items-center justify-end">
                <Button
                  onClick={() => signMutation.mutate()}
                  disabled={!canSign || signMutation.isPending}
                  data-testid={`button-sign-agreement-${agreement.id}`}
                >
                  <ShieldCheck className="h-4 w-4 mr-1.5" />
                  {signMutation.isPending ? "Signing…" : "Sign agreement"}
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function PortalAgreementsPage() {
  const [, paramsWithToken] = useRoute("/portal/agreements/:token");
  const params = paramsWithToken ?? { token: "me" };
  const [, navigate] = useLocation();
  const token = params?.token ?? "me";

  const { data: portal } = useQuery<PortalData>({
    queryKey: [`/api/portal/${token}`],
    enabled: !!token,
    retry: false,
  });

  const { data, isLoading } = useQuery<{ agreements: IndividualAgreement[] }>({
    queryKey: [`/api/portal/${token}/agreements`],
    enabled: !!token,
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

  const agreements = data?.agreements ?? [];
  const pending = agreements.filter((a) => a.status === "pending");
  const signed = agreements.filter((a) => a.status === "signed");

  const content = (
    <div className="space-y-6" data-testid="portal-agreements">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
          Agreements
        </p>
        <h1 className="font-serif text-3xl font-light tracking-tight">Individual agreements</h1>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
          These are agreements issued specifically to you — for example for a particular project,
          patient, or deployment. Please read each document in full and sign it on screen.
        </p>
      </div>

      {agreements.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground" data-testid="agreements-empty">
            You have no individual agreements at the moment.
          </CardContent>
        </Card>
      )}

      {pending.map((a) => (
        <AgreementCard key={a.id} agreement={a} token={token} />
      ))}
      {signed.map((a) => (
        <AgreementCard key={a.id} agreement={a} token={token} />
      ))}
    </div>
  );

  if (!token) return null;
  if (isLoading || !data) {
    return (
      <PortalShell
        token={token}
        candidateName={portal?.nurse.fullName || ""}
        groups={groups}
        activeKey="induction:agreements"
      >
        <div className="space-y-4">
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
      activeKey="induction:agreements"
    >
      {content}
    </PortalShell>
  );
}
