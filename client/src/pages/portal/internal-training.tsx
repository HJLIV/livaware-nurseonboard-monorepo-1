import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  PortalShell,
  buildPortalGroups,
  type PortalSidebarGroup,
  type PortalGateInfo,
  type JourneyData,
} from "@/components/layout/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FileUpload } from "@/components/shared/file-upload";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Download, GraduationCap, RefreshCw } from "lucide-react";

interface CertificateInfo {
  id: string;
  originalFileName: string | null;
  completedDate: string | null;
  uploadedAt: string;
}
interface TrainingItem {
  key: string;
  label: string;
  certificate: CertificateInfo | null;
}
interface TrainingResponse {
  trainings: TrainingItem[];
}

interface PortalShellData {
  nurse: { id: string; fullName: string; currentStage: string };
  journey: JourneyData;
  gate?: PortalGateInfo | null;
}

export default function PortalInternalTrainingPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Per-training "completion date" inputs (optional), keyed by trainingKey.
  const [dates, setDates] = useState<Record<string, string>>({});
  // Tracks which trainings are in "replace" mode (already uploaded but the
  // nurse wants to upload a newer certificate).
  const [replacing, setReplacing] = useState<Record<string, boolean>>({});

  const { data: portal } = useQuery<PortalShellData>({
    queryKey: [`/api/portal/me`],
    queryFn: async () => (await apiRequest("GET", "/api/portal/me")).json(),
  });

  const { data, isLoading } = useQuery<TrainingResponse>({
    queryKey: [`/api/portal/me/internal-training`],
    queryFn: async () => (await apiRequest("GET", "/api/portal/me/internal-training")).json(),
  });

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal) return [];
    const isCompleted = portal.nurse.currentStage === "completed";
    return buildPortalGroups({
      token: "me",
      serviceAgreementSigned: (portal as any)?.serviceAgreement?.signed,
      selectServiceAgreement: () => navigate(`/portal/service-agreement`),
      journey: portal.journey,
      stepStatuses: {},
      gate: portal.gate ?? null,
      availabilityEnabled: isCompleted,
      invoicesEnabled: isCompleted,
      selectOverview: () => navigate(`/portal`),
      selectOnboardingStep: (k) => navigate(`/portal/page?step=${k}`),
      selectAvailability: () => navigate(`/portal/availability`),
      selectInvoices: () => navigate(`/portal/invoices`),
      selectPolicies: () => navigate(`/portal/policies`),
      selectInduction: () => navigate(`/portal/induction`),
      selectSopComprehension: () => navigate(`/portal/sop-comprehension`),
      selectCompetency: () => navigate(`/portal/page?step=competency`),
      selectCvUpload: () => navigate(`/portal/page?step=cv`),
      selectDeclaration: (k) => navigate(`/portal/declaration/${k}`),
    });
  }, [portal, navigate]);

  const uploadUrlFor = (key: string) => {
    const date = (dates[key] || "").trim();
    const params = new URLSearchParams({ trainingKey: key });
    if (date) params.set("completedDate", date);
    return `/api/portal/me/internal-training?${params.toString()}`;
  };

  const onUploaded = (key: string) => {
    setReplacing((r) => ({ ...r, [key]: false }));
    setDates((d) => ({ ...d, [key]: "" }));
    void qc.invalidateQueries({ queryKey: [`/api/portal/me/internal-training`] });
    toast({ title: "Certificate uploaded", description: "Your training certificate has been saved." });
  };

  return (
    <PortalShell
      token="me"
      candidateName={portal?.nurse.fullName || ""}
      groups={groups}
      activeKey="training:internal_training"
    >
      <div className="space-y-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Training</p>
          <h1
            className="font-serif text-3xl font-light tracking-tight flex items-center gap-2"
            data-testid="heading-portal-internal-training"
          >
            <GraduationCap className="h-7 w-7 text-primary" /> Internal Training
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload your completion certificate for each internal training. You can add an optional completion
            date and replace a certificate at any time.
          </p>
        </div>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="grid gap-3">
            {(data?.trainings ?? []).map((t) => {
              const cert = t.certificate;
              const showUpload = !cert || replacing[t.key];
              return (
                <Card key={t.key} data-testid={`row-internal-training-${t.key}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{t.label}</div>
                        {cert ? (
                          <div className="text-[12px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200 gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Uploaded
                            </Badge>
                            {cert.completedDate && (
                              <span>Completed {new Date(cert.completedDate).toLocaleDateString("en-GB")}</span>
                            )}
                            {cert.originalFileName && <span className="truncate">· {cert.originalFileName}</span>}
                          </div>
                        ) : (
                          <div className="text-[12px] text-muted-foreground mt-1">
                            <Badge variant="outline">Not uploaded yet</Badge>
                          </div>
                        )}
                      </div>
                      {cert && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              window.open(`/api/portal/me/internal-training/${cert.id}/certificate`, "_blank")
                            }
                            data-testid={`button-download-${t.key}`}
                          >
                            <Download className="h-4 w-4 mr-1" /> Download
                          </Button>
                          {!replacing[t.key] && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setReplacing((r) => ({ ...r, [t.key]: true }))}
                              data-testid={`button-replace-${t.key}`}
                            >
                              <RefreshCw className="h-4 w-4 mr-1" /> Replace
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {showUpload && (
                      <div className="space-y-2 border-t pt-3">
                        <div className="flex flex-col gap-1.5 max-w-xs">
                          <label className="text-xs font-medium text-muted-foreground">
                            Completion date (optional)
                          </label>
                          <Input
                            type="date"
                            value={dates[t.key] || ""}
                            onChange={(e) => setDates((d) => ({ ...d, [t.key]: e.target.value }))}
                            data-testid={`input-date-${t.key}`}
                          />
                        </div>
                        <FileUpload
                          uploadUrl={uploadUrlFor(t.key)}
                          accept=".pdf,.jpg,.jpeg,.png,.webp"
                          hint="PDF, JPG, PNG or WEBP up to 10MB"
                          onUploadComplete={() => onUploaded(t.key)}
                          data-testid={`upload-${t.key}`}
                        />
                        {cert && replacing[t.key] && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setReplacing((r) => ({ ...r, [t.key]: false }))}
                            data-testid={`button-cancel-replace-${t.key}`}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PortalShell>
  );
}
