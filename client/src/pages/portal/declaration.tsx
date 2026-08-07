// Dynamic per-key onboarding declaration form (task 121).
// Renders any declaration from the server registry; supports draft save +
// final submit with typed signature.

import { useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, AlertCircle, FileText, ExternalLink, Upload } from "lucide-react";

interface FileAnswer {
  filename: string;
  originalFilename: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  documentId?: string;
}

interface Question {
  id: string;
  prompt: string;
  type: "boolean" | "enum" | "short_text" | "long_text" | "date" | "number" | "file";
  required: boolean;
  helpText?: string;
  options?: { value: string; label: string }[];
  conditionalOn?: { questionId: string; equals: string | boolean };
  requiredWhenShown?: boolean;
  placeholder?: string;
  maxLength?: number;
}

interface Definition {
  key: string;
  title: string;
  intro: string;
  legalReferences?: string[];
  questions: Question[];
  signaturePrompt: string;
}

interface LatestRecord {
  id: string;
  version: number;
  status: "draft" | "submitted" | "reopened";
  answers: Record<string, unknown>;
  signatureName: string | null;
  submittedAt: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  pdfDocumentId: string | null;
}

interface PortalData {
  nurse: { id: string; fullName: string; email: string; currentStage: string };
  journey: {
    preboard: { status: string; actionUrl?: string; label: string };
    onboard: { status: string; actionUrl?: string; label: string };
    skillsArcade: { status: string; actionUrl?: string; label: string };
  };
  induction?: { unlocked: boolean; total: number; outstanding: number };
  token: string;
}

function BbvSummaryPanel({ token, legacyAnswers }: { token: string; legacyAnswers?: Record<string, any> }) {
  const [, setLocation] = useLocation();
  const { data } = useQuery<any>({
    queryKey: ["/api/portal", token, "declarations", "occupational_health"],
    queryFn: async () => {
      const res = await fetch(`/api/portal/${token}/declarations/occupational_health`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });
  const latest = data?.latest;
  const ohAns = (latest?.answers as Record<string, any> | undefined) || {};
  const legacy = legacyAnswers || {};
  const pick = (k: string) => {
    const v = ohAns[k];
    if (v !== undefined && v !== null && v !== "") return v;
    return legacy[k];
  };
  const ans: Record<string, any> = {
    hbv_vaccinated: pick("hbv_vaccinated") ?? pick("hep_b_vaccinated"),
    hbv_anti_hbs_titre: pick("hbv_anti_hbs_titre"),
    hbv_surface_antigen_negative: pick("hbv_surface_antigen_negative"),
    hcv_negative: pick("hcv_negative"),
    hiv_negative: pick("hiv_negative"),
  };
  const fallbackUsed = Object.keys(ans).some(
    (k) => (ohAns[k] === undefined || ohAns[k] === null || ohAns[k] === "") && ans[k] !== undefined && ans[k] !== null && ans[k] !== "",
  );
  const rows: { id: string; label: string }[] = [
    { id: "hbv_vaccinated", label: "Hepatitis B vaccination course completed" },
    { id: "hbv_anti_hbs_titre", label: "Most recent anti-HBs titre (mIU/mL)" },
    { id: "hbv_surface_antigen_negative", label: "HBsAg negative" },
    { id: "hcv_negative", label: "Hepatitis C negative" },
    { id: "hiv_negative", label: "HIV negative" },
  ];
  const fmt = (v: unknown) => {
    if (v === true) return "Yes";
    if (v === false) return "No";
    if (v === undefined || v === null || v === "") return "Not yet answered";
    return String(v);
  };
  const anyAnswered = rows.some((r) => ans[r.id] !== undefined && ans[r.id] !== null && ans[r.id] !== "");
  return (
    <Card data-testid="bbv-summary-panel">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-semibold">Bloodborne virus (BBV) status</h3>
            <p className="text-xs text-muted-foreground">
              These answers come from your <strong>Occupational Health</strong> questionnaire. Update them there if anything changes — they cannot be edited from this declaration.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {latest?.status && (
              <Badge variant="outline" className="text-[10px]">{latest.status}</Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLocation(`/portal/${token}/declaration/occupational_health`)}
              data-testid="button-open-oh-from-bbv"
            >
              Open Occupational Health
            </Button>
          </div>
        </div>
        {!anyAnswered ? (
          <div
            className="text-xs text-amber-600 dark:text-amber-400"
            data-testid="bbv-summary-empty"
          >
            No BBV answers found yet — please complete the Occupational Health questionnaire first.
          </div>
        ) : (
          <ul className="text-sm divide-y divide-border/60">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-1.5" data-testid={`bbv-summary-${r.id}`}>
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-medium text-foreground text-right">{fmt(ans[r.id])}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function isVisible(q: Question, answers: Record<string, unknown>): boolean {
  if (!q.conditionalOn) return true;
  return answers[q.conditionalOn.questionId] === q.conditionalOn.equals;
}

export default function PortalDeclarationPage() {
  const [, paramsWithToken] = useRoute("/portal/declaration/:token/:key");
  const [, paramsNoToken] = useRoute("/portal/declaration/:key");
  const params = paramsWithToken ?? (paramsNoToken ? { token: "me", ...paramsNoToken } : null);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const token = params?.token;
  const key = params?.key;

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [signatureName, setSignatureName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  const { data: portal } = useQuery<PortalData>({
    queryKey: [`/api/portal/${token}`],
    enabled: !!token,
    retry: false,
  });

  const { data: onboardingState } = useQuery<{ stepStatuses?: Record<string, string> } | null>({
    queryKey: ["/api/portal", token, "onboarding-state"],
    enabled: !!token && !!portal,
  });

  const { data: declarationsList } = useQuery<{ items: { key: string; title: string; status: string }[] }>({
    queryKey: [`/api/portal/${token}/declarations`],
    enabled: !!token,
  });

  const { data: payload, isLoading } = useQuery<{ declaration: Definition; latest: LatestRecord | null }>({
    queryKey: [`/api/portal/${token}/declarations/${key}`],
    enabled: !!token && !!key,
  });

  const stepStatuses = (onboardingState?.stepStatuses as Record<string, string>) || {};

  const def = payload?.declaration;
  const latest = payload?.latest ?? null;
  const submittedLocked = latest?.status === "submitted";

  // Hydrate the form once with the latest server state.
  useEffect(() => {
    if (!hydrated && payload) {
      setAnswers((latest?.answers as Record<string, unknown>) ?? {});
      setSignatureName(latest?.signatureName ?? "");
      setHydrated(true);
    }
  }, [hydrated, payload, latest]);

  const { data: declarationsSummaryData } = useQuery<{
    items: { key: string; title: string; status: "not_started" | "draft" | "submitted" | "reopened" }[];
    total: number; completed: number; outstanding: number;
  }>({
    queryKey: [`/api/portal/${token}/declarations`],
    enabled: !!token,
  });

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
      selectOverview: () => navigate(`/portal/${token === "me" ? "" : token}`),
      selectOnboardingStep: (stepKey) => navigate(`/portal/page?step=${stepKey}`),
      selectPolicies: () => navigate(`/portal/policies${token === "me" ? "" : `/${token}`}`),
      declarationsSummary: declarationsSummaryData ?? null,
      selectDeclaration: (k) =>
        navigate(`/portal/declaration${token === "me" ? "" : `/${token}`}/${k}`),
      selectCompetency: () => navigate(`/portal/page?step=competency`),
      selectCvUpload: () => navigate(`/portal/page?step=profile`),
      selectInduction: () => navigate(`/portal/induction${token === "me" ? "" : `/${token}`}`),
      selectSopComprehension: () => navigate(`/portal/sop-comprehension${token === "me" ? "" : `/${token}`}`),
    });
  }, [portal, token, stepStatuses, navigate, declarationsSummaryData]);

  const draftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "PUT",
        `/api/portal/${token}/declarations/${key}/draft`,
        { answers, signatureName },
      );
      return await res.json();
    },
    onSuccess: () => {
      toast({ title: "Draft saved" });
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}/declarations/${key}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}/declarations`] });
    },
    onError: (err: any) => {
      toast({
        title: "Could not save",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/portal/${token}/declarations/${key}/submit`,
        { answers, signatureName },
      );
      return await res.json();
    },
    onSuccess: () => {
      setErrors({});
      toast({ title: "Declaration submitted", description: "Thank you — your signed declaration has been recorded." });
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}/declarations/${key}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}/declarations`] });
    },
    onError: async (err: any) => {
      // apiRequest throws Error("<status>: <body>"). The body is the JSON
      // payload from the server, which for validation failures contains
      // { error: "validation_failed", errors: [{ questionId, message }] }.
      const map: Record<string, string> = {};
      let topMessage: string | undefined;
      const raw = String(err?.message ?? "");
      const m = raw.match(/^\d+:\s*([\s\S]*)$/);
      const bodyStr = m ? m[1] : raw;
      try {
        const body = JSON.parse(bodyStr);
        if (Array.isArray(body?.errors)) {
          for (const e of body.errors) {
            if (e?.questionId) map[e.questionId] = e.message ?? "Invalid answer.";
          }
        }
        topMessage = body?.message ?? body?.error;
      } catch {
        topMessage = bodyStr;
      }
      setErrors(map);
      toast({
        title: "Could not submit",
        description: Object.keys(map).length
          ? `Please review the ${Object.keys(map).length} highlighted answer(s).`
          : topMessage || "Please try again.",
        variant: "destructive",
      });
    },
  });

  function setAnswer(qid: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [qid]: value }));
    if (errors[qid]) setErrors((prev) => ({ ...prev, [qid]: "" }));
  }

  // Per-question blur autosave: write the current draft to the server when
  // an input loses focus. Silent (no toast) so it doesn't spam the user.
  function autoSaveOnBlur() {
    if (submittedLocked || !hydrated || !token || !key) return;
    apiRequest("PUT", `/api/portal/${token}/declarations/${key}/draft`, {
      answers, signatureName,
    }).catch(() => { /* best effort — explicit Save draft button still works */ });
  }

  async function handleFileUpload(qid: string, file: File) {
    if (!token) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/portal/${token}/upload`, {
        method: "POST", body: fd, credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      const json = (await res.json()) as FileAnswer;
      const next = { ...answers, [qid]: json };
      setAnswers(next);
      if (errors[qid]) setErrors((prev) => ({ ...prev, [qid]: "" }));
      // Persist immediately so the upload survives a refresh.
      apiRequest("PUT", `/api/portal/${token}/declarations/${key}/draft`, {
        answers: next, signatureName,
      }).catch(() => {});
      toast({ title: "File uploaded", description: file.name });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    }
  }

  function renderInput(q: Question) {
    if (submittedLocked) {
      const v = answers[q.id];
      const display =
        q.type === "boolean"
          ? v === true ? "Yes" : v === false ? "No" : "—"
          : q.type === "enum"
            ? q.options?.find((o) => o.value === v)?.label ?? "—"
            : q.type === "file"
              ? (v && (v as FileAnswer).filePath ? (v as FileAnswer).originalFilename : "—")
              : v ? String(v) : "—";
      if (q.type === "file" && v && (v as FileAnswer).filePath) {
        const f = v as FileAnswer;
        return (
          <a href={f.filePath} target="_blank" rel="noopener noreferrer"
             className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" /> {f.originalFilename}
          </a>
        );
      }
      return <p className="text-sm">{display}</p>;
    }
    switch (q.type) {
      case "boolean":
        return (
          <div className="flex gap-2" data-testid={`q-${q.id}`}>
            <Button
              type="button"
              size="sm"
              variant={answers[q.id] === true ? "default" : "outline"}
              onClick={() => { setAnswer(q.id, true); autoSaveOnBlur(); }}
            >Yes</Button>
            <Button
              type="button"
              size="sm"
              variant={answers[q.id] === false ? "default" : "outline"}
              onClick={() => { setAnswer(q.id, false); autoSaveOnBlur(); }}
            >No</Button>
          </div>
        );
      case "enum":
        return (
          <div className="flex flex-col gap-1.5" data-testid={`q-${q.id}`}>
            {q.options?.map((o) => (
              <Button
                key={o.value}
                type="button"
                size="sm"
                variant={answers[q.id] === o.value ? "default" : "outline"}
                className="justify-start"
                onClick={() => { setAnswer(q.id, o.value); autoSaveOnBlur(); }}
              >{o.label}</Button>
            ))}
          </div>
        );
      case "short_text":
        return (
          <Input
            data-testid={`q-${q.id}`}
            value={(answers[q.id] as string) ?? ""}
            placeholder={q.placeholder}
            maxLength={q.maxLength}
            onChange={(e) => setAnswer(q.id, e.target.value)}
            onBlur={autoSaveOnBlur}
          />
        );
      case "long_text":
        return (
          <Textarea
            data-testid={`q-${q.id}`}
            value={(answers[q.id] as string) ?? ""}
            placeholder={q.placeholder}
            maxLength={q.maxLength}
            rows={4}
            onChange={(e) => setAnswer(q.id, e.target.value)}
            onBlur={autoSaveOnBlur}
          />
        );
      case "date":
        return (
          <Input
            type="date"
            data-testid={`q-${q.id}`}
            value={(answers[q.id] as string) ?? ""}
            onChange={(e) => setAnswer(q.id, e.target.value)}
            onBlur={autoSaveOnBlur}
          />
        );
      case "number":
        return (
          <Input
            type="number"
            min={0}
            data-testid={`q-${q.id}`}
            value={(answers[q.id] as number | string) ?? ""}
            placeholder={q.placeholder}
            onChange={(e) => {
              const n = e.target.value === "" ? "" : Number(e.target.value);
              setAnswer(q.id, n === "" ? "" : Number.isFinite(n) ? n : "");
            }}
            onBlur={autoSaveOnBlur}
          />
        );
      case "file": {
        const f = answers[q.id] as FileAnswer | undefined;
        return (
          <div className="flex items-center gap-3" data-testid={`q-${q.id}`}>
            {f && f.filePath ? (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-primary" />
                <a href={f.filePath} target="_blank" rel="noopener noreferrer"
                   className="text-primary hover:underline">
                  {f.originalFilename}
                </a>
                <span className="text-xs text-muted-foreground">
                  ({Math.round(f.fileSize / 1024)} KB)
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No file uploaded</span>
            )}
            <label className="cursor-pointer">
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                data-testid={`q-${q.id}-input`}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(q.id, file);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md border hover:bg-accent">
                <Upload className="h-3.5 w-3.5" /> {f ? "Replace" : "Upload"}
              </span>
            </label>
          </div>
        );
      }
    }
  }

  const content = (
    <div className="space-y-6 max-w-3xl" data-testid="portal-declaration">
      {!def ? (
        isLoading ? <Skeleton className="h-64 w-full" /> : (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            Declaration not found.
          </CardContent></Card>
        )
      ) : (
        <>
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
              Onboarding · Declaration
            </p>
            <h1 className="font-serif text-3xl font-light tracking-tight">{def.title}</h1>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{def.intro}</p>
            {def.legalReferences && def.legalReferences.length > 0 && (
              <p className="text-[11px] text-muted-foreground/70 mt-2">
                References: {def.legalReferences.join("; ")}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {latest?.status === "submitted" && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Submitted
                </Badge>
              )}
              {latest?.status === "draft" && (
                <Badge variant="outline">Draft (v{latest.version})</Badge>
              )}
              {latest?.status === "reopened" && (
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                  <AlertCircle className="h-3.5 w-3.5 mr-1" /> Re-opened by admin — please re-submit
                </Badge>
              )}
              {latest?.pdfDocumentId && submittedLocked && (
                <a
                  href={`/api/documents/${latest.pdfDocumentId}/download`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" /> Open signed PDF <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          {key === "epp_declaration" && (
            <BbvSummaryPanel
              token={token!}
              legacyAnswers={(latest?.answers as Record<string, any>) || undefined}
            />
          )}

          <Card>
            <CardContent className="p-5 space-y-5">
              {def.questions.map((q) => {
                if (!isVisible(q, answers)) return null;
                const err = errors[q.id];
                return (
                  <div key={q.id} className="space-y-1.5">
                    <Label className="text-sm font-medium leading-snug block">
                      {q.prompt}
                      {q.required && !q.conditionalOn && <span className="text-red-500 ml-0.5">*</span>}
                    </Label>
                    {q.helpText && (
                      <p className="text-xs text-muted-foreground">{q.helpText}</p>
                    )}
                    {renderInput(q)}
                    {err && <p className="text-xs text-red-500">{err}</p>}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {!submittedLocked && (
            <Card>
              <CardContent className="p-5 space-y-3">
                <div>
                  <Label className="text-sm font-medium block mb-1.5">
                    Signature <span className="text-red-500">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mb-2">{def.signaturePrompt}</p>
                  <Input
                    data-testid="signature-input"
                    placeholder="Your full legal name"
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                    onBlur={autoSaveOnBlur}
                  />
                  {errors["__signature__"] && (
                    <p className="text-xs text-red-500 mt-1">{errors["__signature__"]}</p>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    onClick={() => draftMutation.mutate()}
                    disabled={draftMutation.isPending || submitMutation.isPending}
                    data-testid="button-save-draft"
                  >
                    {draftMutation.isPending ? "Saving…" : "Save draft"}
                  </Button>
                  <Button
                    onClick={() => submitMutation.mutate()}
                    disabled={draftMutation.isPending || submitMutation.isPending || !signatureName.trim()}
                    data-testid="button-submit-declaration"
                  >
                    {submitMutation.isPending ? "Submitting…" : "Sign & submit"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {submittedLocked && (
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                This declaration was signed by <strong>{latest?.signatureName}</strong> on{" "}
                {latest?.submittedAt ? new Date(latest.submittedAt).toLocaleString() : "—"}.
                If anything has changed, please contact the admin team — they can re-open this form for you.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );

  if (!token || !key) return null;
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
      activeKey={`onboard:${key}`}
    >
      {content}
    </PortalShell>
  );
}
