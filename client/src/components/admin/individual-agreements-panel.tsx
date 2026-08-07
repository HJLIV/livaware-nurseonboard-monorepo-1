// Admin panel: per-nurse Individual Agreements (task 191). Lets an admin
// issue an ad-hoc agreement (project / patient / deployment) by uploading a
// document, see pending/signed/voided status with signature details, void an
// unsigned agreement, or replace its document before signing.

import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Download,
  FilePlus2,
  FileSignature,
  RefreshCcw,
} from "lucide-react";

interface AgreementRow {
  id: string;
  title: string;
  contextType: "project" | "patient" | "deployment" | "other";
  contextLabel: string | null;
  status: "pending" | "signed" | "voided";
  signatureName: string | null;
  signedAt: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  signedPdfDocumentId: string | null;
  createdBy: string | null;
  createdAt: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  sourceDocument: {
    id: string;
    filePath: string | null;
    originalFilename: string | null;
    mimeType: string | null;
  } | null;
}

const CONTEXT_OPTIONS = [
  { value: "project", label: "Project" },
  { value: "patient", label: "Patient" },
  { value: "deployment", label: "Deployment" },
  { value: "other", label: "Other" },
] as const;

function StatusPill({ status }: { status: AgreementRow["status"] }) {
  if (status === "signed") {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Signed
      </Badge>
    );
  }
  if (status === "voided") {
    return (
      <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
        <Ban className="h-3 w-3 mr-1" /> Voided
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
      <AlertCircle className="h-3 w-3 mr-1" /> Awaiting signature
    </Badge>
  );
}

async function postForm(url: string, form: FormData) {
  const res = await fetch(url, { method: "POST", body: form, credentials: "include" });
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = (await res.json())?.message || message;
    } catch {
      /* keep statusText */
    }
    throw new Error(message);
  }
  return res.json();
}

export function IndividualAgreementsPanel({ candidateId }: { candidateId: string }) {
  const { toast } = useToast();
  const listKey = [`/api/nurses/${candidateId}/agreements`];
  const { data, isLoading } = useQuery<{ agreements: AgreementRow[] }>({
    queryKey: listKey,
  });

  const [title, setTitle] = useState("");
  const [contextType, setContextType] = useState<string>("project");
  const [contextLabel, setContextLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const invalidate = () => queryClient.invalidateQueries({ queryKey: listKey });

  const createMutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("contextType", contextType);
      if (contextLabel.trim()) form.append("contextLabel", contextLabel.trim());
      if (file) form.append("file", file);
      return postForm(`/api/nurses/${candidateId}/agreements`, form);
    },
    onSuccess: () => {
      invalidate();
      setTitle("");
      setContextLabel("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast({ title: "Agreement issued", description: "The nurse can now read and sign it in their portal." });
    },
    onError: (err: any) =>
      toast({ title: "Could not create agreement", description: err?.message, variant: "destructive" }),
  });

  const voidMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/agreements/${id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || res.statusText);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Agreement voided" });
    },
    onError: (err: any) =>
      toast({ title: "Could not void agreement", description: err?.message, variant: "destructive" }),
  });

  // Rebuilds the sealed PDF for a signed agreement from the signature already
  // on record — used for agreements signed before the wording was embedded.
  const rebuildMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/agreements/regenerate-signed-pdfs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agreementIds: [id] }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || res.statusText);
      return res.json() as Promise<{ regenerated: number; failed: { reason: string }[] }>;
    },
    onSuccess: (result) => {
      invalidate();
      if (result.regenerated > 0) {
        toast({
          title: "Signed record rebuilt",
          description: "The PDF now contains the full agreement wording and signature details.",
        });
      } else {
        toast({
          title: "Could not rebuild the record",
          description: result.failed?.[0]?.reason || "No record was regenerated.",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) =>
      toast({ title: "Could not rebuild the record", description: err?.message, variant: "destructive" }),
  });

  const replaceMutation = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      return postForm(`/api/agreements/${id}/replace-document`, form);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Document replaced" });
    },
    onError: (err: any) =>
      toast({ title: "Could not replace document", description: err?.message, variant: "destructive" }),
  });

  const rows = data?.agreements ?? [];
  const canCreate = title.trim().length > 1 && !!file;

  return (
    <div className="space-y-6" data-testid="individual-agreements-panel">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <FilePlus2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-medium text-sm">Issue a new individual agreement</h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="agreement-title">Title</Label>
              <Input
                id="agreement-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Night-shift deployment agreement — St Mary's"
                data-testid="input-agreement-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={contextType} onValueChange={setContextType}>
                <SelectTrigger data-testid="select-agreement-context">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTEXT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="agreement-context-label">Reference (optional)</Label>
              <Input
                id="agreement-context-label"
                value={contextLabel}
                onChange={(e) => setContextLabel(e.target.value)}
                placeholder="Project / patient / deployment reference"
                data-testid="input-agreement-context-label"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="agreement-file">Agreement document (PDF or Word)</Label>
              <Input
                id="agreement-file"
                type="file"
                ref={fileInputRef}
                accept=".pdf,.doc,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                data-testid="input-agreement-file"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!canCreate || createMutation.isPending}
              data-testid="button-create-agreement"
            >
              <FileSignature className="h-4 w-4 mr-1.5" />
              {createMutation.isPending ? "Issuing…" : "Issue agreement"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground" data-testid="agreements-admin-empty">
            No individual agreements have been issued for this nurse yet.
          </CardContent>
        </Card>
      ) : (
        rows.map((a) => (
          <Card key={a.id} data-testid={`admin-agreement-${a.id}`}>
            <CardContent className="p-6 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                    {CONTEXT_OPTIONS.find((o) => o.value === a.contextType)?.label}
                    {a.contextLabel ? ` · ${a.contextLabel}` : ""}
                  </p>
                  <h4 className="font-medium">{a.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Issued {new Date(a.createdAt).toLocaleString()}
                    {a.createdBy ? ` by ${a.createdBy}` : ""}
                  </p>
                </div>
                <StatusPill status={a.status} />
              </div>

              {a.status === "signed" && (
                <div className="text-sm text-muted-foreground space-y-0.5">
                  <p>
                    Signed by <span className="text-foreground font-medium">{a.signatureName}</span>
                    {a.signedAt ? ` on ${new Date(a.signedAt).toLocaleString()}` : ""}
                  </p>
                  {a.ipAddress && <p className="text-xs">IP: {a.ipAddress}</p>}
                  {a.userAgent && <p className="text-xs truncate max-w-xl">Device: {a.userAgent}</p>}
                </div>
              )}
              {a.status === "voided" && (
                <p className="text-xs text-muted-foreground">
                  Voided {a.voidedAt ? new Date(a.voidedAt).toLocaleString() : ""}
                  {a.voidedBy ? ` by ${a.voidedBy}` : ""}
                  {a.voidReason ? ` — ${a.voidReason}` : ""}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {a.status === "signed" && a.signedPdfDocumentId && (
                  <Button asChild size="sm">
                    <a
                      href={`/api/documents/${a.signedPdfDocumentId}/download`}
                      target="_blank"
                      rel="noreferrer"
                      data-testid={`link-signed-pdf-${a.id}`}
                    >
                      <Download className="h-3.5 w-3.5 mr-1.5" /> Signed agreement (PDF)
                    </a>
                  </Button>
                )}
                {a.sourceDocument?.filePath && (
                  <Button asChild variant="outline" size="sm">
                    <a href={a.sourceDocument.filePath} target="_blank" rel="noreferrer">
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      {a.status === "signed"
                        ? "Original document"
                        : a.sourceDocument.originalFilename || "Agreement document"}
                    </a>
                  </Button>
                )}
                {a.status === "signed" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => rebuildMutation.mutate(a.id)}
                    disabled={rebuildMutation.isPending}
                    data-testid={`button-rebuild-signed-pdf-${a.id}`}
                  >
                    <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Rebuild signed PDF
                  </Button>
                )}
                {a.status === "pending" && (
                  <>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      className="hidden"
                      ref={(el) => {
                        replaceInputRefs.current[a.id] = el;
                      }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) replaceMutation.mutate({ id: a.id, file: f });
                        e.target.value = "";
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => replaceInputRefs.current[a.id]?.click()}
                      disabled={replaceMutation.isPending}
                      data-testid={`button-replace-${a.id}`}
                    >
                      <RefreshCcw className="h-3.5 w-3.5 mr-1.5" /> Replace document
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm("Void this agreement? The nurse will no longer see it.")) {
                          voidMutation.mutate(a.id);
                        }
                      }}
                      disabled={voidMutation.isPending}
                      data-testid={`button-void-${a.id}`}
                    >
                      <Ban className="h-3.5 w-3.5 mr-1.5" /> Void
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
