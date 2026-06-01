// Nurse-facing Service Agreement page (task 170) — the first step of the
// Induction group. It is NOT a blocking step; the rest of the portal is
// usable throughout. The agreement only becomes signable once an admin has
// approved the nurse's compliance (gate.complianceApproved). The nurse must
// scroll through the full 16-clause agreement (read-to-end gate unlocks the
// signing controls), complete the identity fields, and type their full legal
// name to sign. On-screen typed signature only — no upload.

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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, FileSignature, Lock, ShieldCheck } from "lucide-react";

interface ContractClauseItem {
  n: string;
  text: string;
}
interface ContractClause {
  number: string;
  title: string;
  items: ContractClauseItem[];
}
interface ContractField {
  id: "nmcPin" | "rcnMembershipNo" | "utrCompanyNumber" | "businessName";
  label: string;
  required: boolean;
  helpText?: string;
}
interface ServiceAgreementContract {
  key: string;
  version: number;
  title: string;
  preamble: string[];
  clauses: ContractClause[];
  executionNote: string;
  fields: ContractField[];
  countersignatory: { name: string; position: string };
}
interface ServiceAgreementState {
  signed: boolean;
  status: string;
  version: number | null;
  signerName: string | null;
  signedAt: string | null;
  pdfDocumentId: string | null;
}
interface ServiceAgreementResponse {
  contract: ServiceAgreementContract;
  state: ServiceAgreementState;
  latest: {
    id: string;
    version: number;
    status: string;
    answers: Record<string, string> | null;
    signatureName: string | null;
    submittedAt: string | null;
    pdfDocumentId: string | null;
  } | null;
}

interface PortalData {
  nurse: { id: string; fullName: string; email: string; currentStage: string };
  journey: {
    preboard: { status: string; actionUrl?: string; label: string };
    onboard: { status: string; actionUrl?: string; label: string };
    skillsArcade: { status: string; actionUrl?: string; label: string };
  };
  serviceAgreement?: { signed: boolean };
  gate?: any;
  token: string;
}

export default function PortalServiceAgreementPage() {
  const [, paramsWithToken] = useRoute("/portal/service-agreement/:token");
  const params = paramsWithToken ?? { token: "me" };
  const [, navigate] = useLocation();
  const token = params?.token ?? "me";
  const { toast } = useToast();

  const { data: portal } = useQuery<PortalData>({
    queryKey: [`/api/portal/${token}`],
    enabled: !!token,
    retry: false,
  });

  const { data, isLoading } = useQuery<ServiceAgreementResponse>({
    queryKey: [`/api/portal/${token}/service-agreement`],
    enabled: !!token,
    retry: false,
  });

  const signed = data?.state.signed ?? false;
  const complianceApproved = portal?.gate?.complianceApproved === true;

  // ─── Read-to-end gate ──────────────────────────────────────────────
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  useEffect(() => {
    if (signed) return;
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
  }, [signed, data]);

  // ─── Identity fields + signature state ─────────────────────────────
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [signatureName, setSignatureName] = useState("");

  useEffect(() => {
    if (data?.latest?.answers) setAnswers(data.latest.answers as Record<string, string>);
    if (data?.latest?.signatureName) setSignatureName(data.latest.signatureName);
  }, [data?.latest]);

  const fields = data?.contract.fields ?? [];
  const requiredComplete = useMemo(
    () => fields.every((f) => !f.required || (answers[f.id] || "").trim().length > 0),
    [fields, answers],
  );
  const canSign =
    complianceApproved && scrolledToEnd && requiredComplete && signatureName.trim().length > 1;

  const signMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/portal/${token}/service-agreement/sign`, {
        signatureName: signatureName.trim(),
        answers,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}/service-agreement`] });
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}`] });
      toast({
        title: "Service Agreement signed",
        description: "Thank you for signing your Service Agreement.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Could not sign",
        description: err?.message || "Please check the required fields and try again.",
        variant: "destructive",
      });
    },
  });

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal) return [];
    return buildPortalGroups({
      token,
      journey: portal.journey,
      stepStatuses: {},
      gate: portal.gate ?? null,
      serviceAgreementSigned: portal.serviceAgreement?.signed ?? signed,
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
  }, [portal, token, navigate, signed]);

  const contract = data?.contract;

  const signedView = data && signed && (
    <Card className="ring-1 ring-emerald-500/20">
      <CardContent className="p-6 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <h2 className="font-serif text-xl font-light">Service Agreement signed</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          You signed the {contract?.title} (version {data.state.version}) as{" "}
          <span className="font-medium text-foreground">{data.state.signerName}</span>
          {data.state.signedAt
            ? ` on ${new Date(data.state.signedAt).toLocaleString()}`
            : ""}
          . A countersigned copy has been saved to your record.
        </p>
        <p className="text-xs text-muted-foreground">
          Thank you for completing your Service Agreement.
        </p>
      </CardContent>
    </Card>
  );

  const content = (
    <div className="space-y-6" data-testid="portal-service-agreement">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
          Agreement
        </p>
        <h1 className="font-serif text-3xl font-light tracking-tight">
          {contract?.title ?? "Service Agreement"}
        </h1>
        <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
          This is the first step of your induction. Once an admin has approved
          your compliance, please read this Service Agreement in full and sign it
          on screen. Scroll to the end of the agreement to enable the signing
          section.
        </p>
        {!signed && (
          <div className="mt-3">
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-600 border-amber-500/20"
              data-testid="badge-agreement-unsigned"
            >
              <Lock className="h-3.5 w-3.5 mr-1" />
              {complianceApproved
                ? "Not yet signed"
                : "Available once your compliance is approved"}
            </Badge>
          </div>
        )}
      </div>

      {signed ? (
        signedView
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <div
                ref={bodyRef}
                className="max-h-[55vh] overflow-y-auto p-6 space-y-5 text-sm leading-relaxed"
                data-testid="agreement-body"
              >
                {contract?.preamble.map((p, i) => (
                  <p key={`pre-${i}`} className="text-muted-foreground">
                    {p}
                  </p>
                ))}
                {contract?.clauses.map((clause) => (
                  <section key={clause.number} className="space-y-2">
                    <h3 className="font-semibold text-foreground">
                      {clause.number}. {clause.title}
                    </h3>
                    {clause.items.map((item) => (
                      <p key={item.n} className="text-muted-foreground">
                        <span className="font-medium text-foreground/80">{item.n}</span>{" "}
                        {item.text}
                      </p>
                    ))}
                  </section>
                ))}
                {contract && (
                  <p className="pt-2 border-t text-foreground/80 italic">
                    {contract.executionNote}
                  </p>
                )}
                {contract && (
                  <p className="text-xs text-muted-foreground">
                    For and on behalf of Livaware: {contract.countersignatory.name}
                    {contract.countersignatory.position
                      ? ` (${contract.countersignatory.position})`
                      : ""}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {!complianceApproved && (
            <p
              className="text-xs text-amber-600 text-center"
              data-testid="text-compliance-pending"
            >
              You'll be able to sign the Service Agreement once an admin has
              approved your compliance.
            </p>
          )}

          {complianceApproved && !scrolledToEnd && (
            <p className="text-xs text-muted-foreground/70 text-center">
              Scroll to the end of the agreement above to enable signing.
            </p>
          )}

          <Card
            className={
              scrolledToEnd && complianceApproved ? "" : "opacity-50 pointer-events-none"
            }
          >
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-muted-foreground/70" />
                <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
                  Your details & signature
                </h2>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((field) => (
                  <div key={field.id} className="space-y-1.5">
                    <Label htmlFor={`sa-${field.id}`} className="text-sm">
                      {field.label}
                      {field.required && <span className="text-amber-600"> *</span>}
                    </Label>
                    <Input
                      id={`sa-${field.id}`}
                      value={answers[field.id] ?? ""}
                      onChange={(e) =>
                        setAnswers((a) => ({ ...a, [field.id]: e.target.value }))
                      }
                      disabled={!scrolledToEnd || !complianceApproved}
                      data-testid={`input-${field.id}`}
                    />
                    {field.helpText && (
                      <p className="text-[11px] text-muted-foreground/70">{field.helpText}</p>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-1.5 pt-2 border-t">
                <Label htmlFor="sa-signature" className="text-sm">
                  Type your full legal name to sign
                  <span className="text-amber-600"> *</span>
                </Label>
                <Input
                  id="sa-signature"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="e.g. Jane Elizabeth Doe"
                  disabled={!scrolledToEnd || !complianceApproved}
                  className="font-serif text-lg"
                  data-testid="input-signature"
                />
                <p className="text-[11px] text-muted-foreground/70">
                  By typing your name and clicking “Sign agreement”, you confirm you
                  have read, understood, and agree to be bound by this Agreement.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3">
                <Button
                  onClick={() => signMutation.mutate()}
                  disabled={!canSign || signMutation.isPending}
                  data-testid="button-sign-agreement"
                >
                  <ShieldCheck className="h-4 w-4 mr-1.5" />
                  {signMutation.isPending ? "Signing…" : "Sign agreement"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );

  if (!token) return null;
  if (isLoading || !data) {
    return (
      <PortalShell token={token} candidateName={portal?.nurse.fullName || ""} groups={groups} activeKey="onboard:service-agreement">
        <div className="space-y-4">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-[55vh] w-full" />
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      token={token}
      candidateName={portal?.nurse.fullName || ""}
      groups={groups}
      activeKey="onboard:service-agreement"
    >
      {content}
    </PortalShell>
  );
}
