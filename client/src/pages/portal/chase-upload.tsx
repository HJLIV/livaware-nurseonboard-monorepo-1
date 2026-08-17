import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  CheckCircle2,
  Upload,
  Loader2,
  AlertCircle,
  ShieldCheck,
  FileText,
  PartyPopper,
  Clock,
  Lock,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChaseModule {
  moduleName: string;
  renewalFrequency: string;
  satisfied: boolean;
  status: "red" | "amber" | "green";
  label: string;
}

export interface ChaseGate {
  unlocked: boolean;
  prerequisites: {
    examinationCompleted: boolean;
    competencyDeclared: boolean;
    cvReviewed: boolean;
  };
}

export interface ChaseStatusResponse {
  isChase: boolean;
  sentAt?: string | null;
  portalExpiresAt?: string | null;
  nurseName?: string | null;
  modules?: ChaseModule[];
  allSatisfied?: boolean;
  locked?: boolean;
  gate?: ChaseGate | null;
}

function formatDateGB(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function ModuleRow({
  token,
  module: mod,
  onUploaded,
  locked = false,
}: {
  token: string;
  module: ChaseModule;
  onUploaded: (next: ChaseStatusResponse) => void;
  locked?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("moduleName", mod.moduleName);
      const res = await fetch(`/api/portal/${token}/chase-upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 403 && err?.error === "onboarding_locked") {
          // Refresh chase-status so the page flips to the locked explainer.
          queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}/chase-status`] });
          throw new Error(
            "Your portal is locked while you finish your preboard assessment, competency declaration and CV review.",
          );
        }
        throw new Error(err.message || "Upload failed");
      }
      const result = await res.json();
      onUploaded({
        isChase: true,
        modules: result.modules,
        allSatisfied: result.allSatisfied,
      });
      toast({
        title: `${mod.moduleName} certificate uploaded`,
        description: result.created?.length
          ? "Module recorded as completed."
          : "Existing record updated with the new certificate.",
      });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err.message || "Could not upload certificate",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Card
      className={cn(
        "transition-all",
        mod.satisfied
          ? "border-emerald-500/20 bg-emerald-500/5"
          : mod.status === "red"
            ? "border-red-500/20"
            : "border-amber-500/20",
      )}
      data-testid={`chase-module-${mod.moduleName.replace(/\s+/g, "-").toLowerCase()}`}
    >
      <CardContent className="flex items-center gap-4 py-4">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
            mod.satisfied
              ? "bg-emerald-500/10"
              : mod.status === "red"
                ? "bg-red-500/10"
                : "bg-amber-500/10",
          )}
        >
          {mod.satisfied ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : (
            <FileText
              className={cn(
                "h-5 w-5",
                mod.status === "red" ? "text-red-400" : "text-amber-400",
              )}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{mod.moduleName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] uppercase tracking-wider",
                mod.satisfied
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : mod.status === "red"
                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20",
              )}
            >
              {mod.label}
            </Badge>
            <span className="text-[11px] text-muted-foreground">
              Renewal: {mod.renewalFrequency}
            </span>
          </div>
        </div>

        {mod.satisfied ? (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0"
          >
            Done
          </Badge>
        ) : locked ? (
          <Badge
            variant="outline"
            className="bg-muted/40 text-muted-foreground border-border shrink-0"
            data-testid={`chase-module-locked-${mod.moduleName.replace(/\s+/g, "-").toLowerCase()}`}
          >
            <Lock className="h-3 w-3 mr-1" />
            Locked
          </Badge>
        ) : (
          <label className="cursor-pointer shrink-0">
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFile}
              disabled={uploading}
              data-testid={`input-chase-upload-${mod.moduleName.replace(/\s+/g, "-").toLowerCase()}`}
            />
            <Button size="sm" asChild disabled={uploading}>
              <span>
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                )}
                {uploading ? "Uploading…" : "Upload certificate"}
              </span>
            </Button>
          </label>
        )}
      </CardContent>
    </Card>
  );
}

export default function ChaseUpload({
  token,
  initialData,
}: {
  token: string;
  initialData?: ChaseStatusResponse;
}) {
  const { data, isLoading } = useQuery<ChaseStatusResponse>({
    queryKey: [`/api/portal/${token}/chase-status`],
    enabled: !!token,
    initialData,
  });

  const updateLocal = (next: ChaseStatusResponse) => {
    queryClient.setQueryData<ChaseStatusResponse>(
      [`/api/portal/${token}/chase-status`],
      (prev) => ({
        ...(prev || { isChase: true }),
        ...next,
      }),
    );
    // Also refresh the regular portal queries so any open hub view updates.
    queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/portal", token, "mandatory-training"] });
  };

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Skeleton className="h-10 w-64 mb-3" />
          <Skeleton className="h-5 w-80 mb-8" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const modules = data.modules || [];
  const satisfiedCount = modules.filter((m) => m.satisfied).length;
  const allSatisfied = data.allSatisfied || (modules.length > 0 && satisfiedCount === modules.length);
  const locked = !!data.locked;
  const prereqs = data.gate?.prerequisites;
  const missingPrereqs: string[] = [];
  if (prereqs) {
    if (!prereqs.examinationCompleted) missingPrereqs.push("Finish your preboard clinical examination");
    if (!prereqs.competencyDeclared) missingPrereqs.push("Complete at least one competency self-declaration");
    if (!prereqs.cvReviewed) missingPrereqs.push("Wait for an admin to review your CV");
  }

  return (
    <div className="min-h-screen bg-background" data-testid="page-chase-upload">
      <div className="border-b bg-card">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="flex items-center gap-3">
            <img
              src="/images/livaware-logo-white.png"
              alt="Basecamp by Livaware"
              className="h-7 w-auto invert dark:invert-0"
            />
            <div className="h-6 w-px bg-border" />
            <div>
              <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-primary">Basecamp</p>
              <p className="text-sm font-medium">Outstanding Training</p>
              <p className="text-xs text-muted-foreground">Upload your certificates</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 ring-1 ring-primary/20 mb-4">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <h2 className="font-serif text-2xl font-light tracking-tight mb-2">
            {data.nurseName ? `Hi ${data.nurseName.split(" ")[0]}, ` : ""}
            here's what we still need from you
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {locked
              ? "Your training uploads are paused until you finish the earlier steps below. Once those are cleared, your portal opens automatically and you can upload these certificates."
              : "Upload a PDF or photo of each certificate below. We'll automatically file it against the right training module — no need to label anything."}
          </p>
          {data.sentAt && (
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>Reminder sent {formatDateGB(data.sentAt)}</span>
              {data.portalExpiresAt && (
                <span>· Link valid until {formatDateGB(data.portalExpiresAt)}</span>
              )}
            </div>
          )}
        </div>

        {locked && !allSatisfied && (
          <Card
            className="border-amber-500/30 bg-amber-500/5 mb-6"
            data-testid="chase-locked-explainer"
          >
            <CardContent className="p-5 flex items-start gap-3">
              <Lock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm flex-1">
                <p className="font-medium mb-1">
                  Your portal is locked while you finish the earlier steps
                </p>
                <p className="text-muted-foreground leading-relaxed mb-3">
                  Training uploads open up automatically once your preboard
                  assessment, competency self-rating and CV review are all
                  complete. The reminder we sent you still applies — you just
                  need to clear these first.
                </p>
                {missingPrereqs.length > 0 && (
                  <ul className="text-muted-foreground text-[13px] space-y-1 mb-3 list-disc list-inside">
                    {missingPrereqs.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
                <Button asChild size="sm" variant="outline">
                  <a
                    href={`/portal/${token}`}
                    data-testid="link-chase-locked-portal-hub"
                  >
                    Go to your portal
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {allSatisfied ? (
          <Card className="border-emerald-500/30 bg-emerald-500/5" data-testid="chase-all-done">
            <CardContent className="py-8 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20 mb-4">
                <PartyPopper className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">You're up to date</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Every training module on this reminder is now satisfied. Thank
                you — there's nothing more you need to do here.
              </p>
              <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2">
                {modules.map((m) => (
                  <Badge
                    key={m.moduleName}
                    variant="outline"
                    className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {m.moduleName}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Modules outstanding
              </h3>
              <span
                className="text-xs text-muted-foreground"
                data-testid="chase-progress-label"
              >
                {satisfiedCount} of {modules.length} done
              </span>
            </div>

            {modules.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center">
                  <AlertCircle className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No modules were attached to this reminder.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {modules.map((m) => (
                  <ModuleRow
                    key={m.moduleName}
                    token={token}
                    module={m}
                    onUploaded={updateLocal}
                    locked={locked}
                  />
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-12 text-center">
          <p className="text-xs text-muted-foreground">
            Need help? Reply to the email reminder and we'll be in touch.
          </p>
        </div>
      </div>
    </div>
  );
}
