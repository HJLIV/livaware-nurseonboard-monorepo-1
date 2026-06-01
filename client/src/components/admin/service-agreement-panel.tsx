// Admin panel: per-nurse Service Agreement (Registered Nurse) status (task 170).
// Shows signed status, signer name, signed timestamp, captured identity
// fields + IP/UA, and a link to download the countersigned PDF.

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, FileSignature, AlertCircle, Download } from "lucide-react";

interface AgreementState {
  signed: boolean;
  everSigned?: boolean;
  needsResign?: boolean;
  status: "not_started" | "draft" | "submitted" | "reopened" | string;
  version: number | null;
  currentVersion?: number;
  signerName: string | null;
  signedAt: string | null;
  pdfDocumentId: string | null;
}

interface AgreementField {
  name: string;
  label: string;
}

interface AgreementPayload {
  state: AgreementState;
  fields: AgreementField[];
  answers: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
}

function StatusPill({ signed, needsResign }: { signed: boolean; needsResign?: boolean }) {
  if (signed) {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Signed
      </Badge>
    );
  }
  if (needsResign) {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
        <AlertCircle className="h-3 w-3 mr-1" /> Re-sign required
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
      <AlertCircle className="h-3 w-3 mr-1" /> Not signed
    </Badge>
  );
}

export function ServiceAgreementPanel({ candidateId }: { candidateId: string }) {
  const { data, isLoading } = useQuery<AgreementPayload>({
    queryKey: [`/api/nurses/${candidateId}/service-agreement`],
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  const state = data?.state;
  const fields = data?.fields ?? [];
  const answers = data?.answers ?? {};
  const signed = !!state?.signed;

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="font-serif text-lg font-light tracking-tight">
                Service Agreement (Registered Nurse)
              </h3>
              {state?.version != null && (
                <p className="text-xs text-muted-foreground">
                  Signed version {state.version}
                  {state?.currentVersion != null && state.currentVersion !== state.version
                    ? ` · current version ${state.currentVersion}`
                    : ""}
                </p>
              )}
              {state?.version == null && state?.currentVersion != null && (
                <p className="text-xs text-muted-foreground">Current version {state.currentVersion}</p>
              )}
            </div>
          </div>
          <StatusPill signed={signed} needsResign={state?.needsResign} />
        </div>

        {!signed && state?.needsResign && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            The contract was amended since this nurse signed (they signed version {state.version},
            current is version {state.currentVersion}). They must re-sign before their Service
            Agreement shows as complete, and portal actions are blocked again until they do.
          </p>
        )}

        {!signed && !state?.needsResign && (
          <p className="text-sm text-muted-foreground">
            This nurse has not yet signed the Service Agreement. Portal actions remain blocked until
            it is signed.
          </p>
        )}

        {signed && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
                Signed by
              </div>
              <div className="text-sm">{state?.signerName ?? "—"}</div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
                Signed at
              </div>
              <div className="text-sm">
                {state?.signedAt ? new Date(state.signedAt).toLocaleString() : "—"}
              </div>
            </div>
            {fields.map((f) => {
              const v = answers[f.name];
              if (v === undefined || v === null || v === "") return null;
              return (
                <div key={f.name}>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
                    {f.label}
                  </div>
                  <div className="text-sm">{String(v)}</div>
                </div>
              );
            })}
            {data?.ipAddress && (
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
                  IP address
                </div>
                <div className="text-sm font-mono text-xs">{data.ipAddress}</div>
              </div>
            )}
            {data?.userAgent && (
              <div className="sm:col-span-2">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
                  User agent
                </div>
                <div className="text-xs text-muted-foreground break-all">{data.userAgent}</div>
              </div>
            )}
          </div>
        )}

        {signed && state?.pdfDocumentId && (
          <div>
            <Button asChild variant="outline" size="sm">
              <a
                href={`/api/documents/${state.pdfDocumentId}/download`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-service-agreement-pdf"
              >
                <Download className="h-4 w-4 mr-2" /> Download countersigned PDF
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
