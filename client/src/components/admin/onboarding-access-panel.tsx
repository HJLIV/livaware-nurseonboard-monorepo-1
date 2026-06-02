import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Lock, LockOpen, CheckCircle2, XCircle } from "lucide-react";

interface GateState {
  unlocked: boolean;
  mode: "auto" | "manual";
  unlockedAt: string | null;
  unlockedBy: string | null;
  lockedReason: string | null;
  complianceApproved: boolean;
  complianceApprovedAt: string | null;
  complianceApprovedBy: string | null;
  graceAccess?: boolean;
  graceAccessUpdatedAt?: string | null;
  graceAccessUpdatedBy?: string | null;
  prerequisites: {
    examinationCompleted: boolean;
    competencyDeclared: boolean;
    cvReviewed: boolean;
  };
}

export function OnboardingAccessPanel({ candidateId }: { candidateId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [relockOpen, setRelockOpen] = useState(false);
  const [relockReason, setRelockReason] = useState("");

  const { data: state } = useQuery<GateState>({
    queryKey: [`/api/nurses/${candidateId}/onboarding-access`],
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: [`/api/nurses/${candidateId}/onboarding-access`] });

  const unlock = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/nurses/${candidateId}/onboarding-access/unlock`, {}),
    onSuccess: () => {
      invalidate();
      toast({ title: "Onboarding unlocked", description: "Candidate can now access onboarding." });
    },
  });

  const relock = useMutation({
    mutationFn: async (reason: string) =>
      apiRequest("POST", `/api/nurses/${candidateId}/onboarding-access/relock`, { reason }),
    onSuccess: () => {
      invalidate();
      setRelockOpen(false);
      setRelockReason("");
      toast({ title: "Onboarding re-locked" });
    },
    onError: (err: any) => {
      toast({ title: "Could not re-lock", description: err?.message, variant: "destructive" });
    },
  });

  const setMode = useMutation({
    mutationFn: async (mode: "auto" | "manual") =>
      apiRequest("PUT", `/api/nurses/${candidateId}/onboarding-access/mode`, { mode }),
    onSuccess: () => invalidate(),
  });

  const markCv = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/nurses/${candidateId}/cv-review`, {}),
    onSuccess: () => {
      invalidate();
      toast({ title: "CV marked as reviewed" });
    },
  });

  const approveCompliance = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/nurses/${candidateId}/compliance-approval`, {}),
    onSuccess: () => {
      invalidate();
      toast({
        title: "Compliance approved",
        description: "Induction & Training is now unlocked for the nurse.",
      });
    },
  });

  const revokeCompliance = useMutation({
    mutationFn: async () =>
      apiRequest("DELETE", `/api/nurses/${candidateId}/compliance-approval`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Compliance approval revoked" });
    },
  });

  const setGraceAccess = useMutation({
    mutationFn: async (enabled: boolean) =>
      apiRequest("PUT", `/api/nurses/${candidateId}/grace-access`, { enabled }),
    onSuccess: (_d, enabled) => {
      invalidate();
      toast({
        title: enabled ? "Early access granted" : "Early access removed",
        description: enabled
          ? "Training, Invoicing and Availability are open for this nurse."
          : "Training, Invoicing and Availability now follow the normal gates again.",
      });
    },
  });

  const reopenCv = useMutation({
    mutationFn: async () =>
      apiRequest("DELETE", `/api/nurses/${candidateId}/cv-review`),
    onSuccess: () => {
      invalidate();
      toast({ title: "CV review reopened" });
    },
  });

  if (!state) return null;

  const Pre = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center gap-1.5 text-xs">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-muted-foreground/60" />
      )}
      <span className={ok ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );

  return (
    <Card data-testid="card-onboarding-access" className="border-card-border">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {state.unlocked ? (
              <LockOpen className="h-4 w-4 text-emerald-500" />
            ) : (
              <Lock className="h-4 w-4 text-amber-500" />
            )}
            Onboarding access
            <Badge
              variant={state.unlocked ? "default" : "outline"}
              data-testid="badge-onboarding-access-status"
            >
              {state.unlocked ? "Unlocked" : "Locked"}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="auto-unlock-mode" className="text-xs text-muted-foreground">
              Auto-unlock
            </Label>
            <Switch
              id="auto-unlock-mode"
              data-testid="switch-auto-unlock-mode"
              checked={state.mode === "auto"}
              onCheckedChange={(v) => setMode.mutate(v ? "auto" : "manual")}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid gap-1.5 sm:grid-cols-3">
          <Pre ok={state.prerequisites.examinationCompleted} label="Clinical examination" />
          <Pre ok={state.prerequisites.competencyDeclared} label="Clinical competency declared" />
          <Pre ok={state.prerequisites.cvReviewed} label="CV reviewed by admin" />
        </div>
        {state.unlocked && state.unlockedAt && (
          <p className="text-[11px] text-muted-foreground">
            Unlocked {new Date(state.unlockedAt).toLocaleString()}
            {state.unlockedBy ? ` by ${state.unlockedBy}` : ""}
          </p>
        )}
        {!state.unlocked && state.lockedReason && (
          <p className="text-[11px] text-amber-500">Re-locked: {state.lockedReason}</p>
        )}
        <div className="rounded-md border border-card-border/60 bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              {state.complianceApproved ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Lock className="h-4 w-4 text-amber-500" />
              )}
              <span className="font-medium">Compliance approval</span>
              <Badge
                variant={state.complianceApproved ? "default" : "outline"}
                data-testid="badge-compliance-approval-status"
              >
                {state.complianceApproved ? "Approved" : "Not approved"}
              </Badge>
            </div>
            {state.complianceApproved ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => revokeCompliance.mutate()}
                data-testid="button-revoke-compliance"
                tooltip="Removes compliance approval and re-locks Induction & Training for this nurse."
              >
                Revoke approval
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => approveCompliance.mutate()}
                data-testid="button-approve-compliance"
                tooltip="Confirms compliance is met and unlocks Induction & Training for this nurse."
              >
                Approve compliance
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Unlocks Induction &amp; Training (Policies, Training docs, Livaware
            modules, Induction handbook, SOP, Skills Arcade) for the nurse.
            {state.complianceApproved && state.complianceApprovedAt && (
              <> Approved {new Date(state.complianceApprovedAt).toLocaleString()}
                {state.complianceApprovedBy ? ` by ${state.complianceApprovedBy}` : ""}.</>
            )}
          </p>
        </div>
        <div className="rounded-md border border-card-border/60 bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm">
              {state.graceAccess ? (
                <LockOpen className="h-4 w-4 text-emerald-500" />
              ) : (
                <Lock className="h-4 w-4 text-muted-foreground/60" />
              )}
              <span className="font-medium">Early access (grace)</span>
              <Badge
                variant={state.graceAccess ? "default" : "outline"}
                data-testid="badge-grace-access-status"
              >
                {state.graceAccess ? "On" : "Off"}
              </Badge>
            </div>
            <Switch
              data-testid="switch-grace-access"
              checked={state.graceAccess === true}
              onCheckedChange={(v) => setGraceAccess.mutate(v)}
              disabled={setGraceAccess.isPending}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Opens the whole Training section (Mandatory Training, Internal
            Training, Clinical Skills Arcade), Invoicing and Availability for
            this nurse before compliance approval, induction completion and the
            Nurse stage are reached. The Assessment gate still applies.
            {state.graceAccess && state.graceAccessUpdatedAt && (
              <> Enabled {new Date(state.graceAccessUpdatedAt).toLocaleString()}
                {state.graceAccessUpdatedBy ? ` by ${state.graceAccessUpdatedBy}` : ""}.</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {state.prerequisites.cvReviewed ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => reopenCv.mutate()}
              data-testid="button-reopen-cv"
              tooltip="Marks the CV as not yet reviewed so it returns to the review queue."
            >
              Reopen CV review
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markCv.mutate()}
              data-testid="button-mark-cv-reviewed"
              tooltip="Confirms you've reviewed this candidate's CV — one of the unlock prerequisites."
            >
              Mark CV reviewed
            </Button>
          )}
          {state.unlocked ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRelockOpen(true)}
              data-testid="button-relock-onboarding"
              tooltip="Re-locks onboarding access. Candidate loses Onboarding, Compliance and Skills Arcade until unlocked again."
            >
              Re-lock onboarding
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => unlock.mutate()}
              data-testid="button-unlock-onboarding"
              tooltip="Manually opens onboarding access for this candidate, bypassing auto-unlock prerequisites."
            >
              Unlock onboarding
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={relockOpen} onOpenChange={setRelockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-lock onboarding access</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Provide a reason. The candidate will lose access to Onboarding,
            Compliance and Skills Arcade until you unlock again.
          </p>
          <Textarea
            value={relockReason}
            onChange={(e) => setRelockReason(e.target.value)}
            placeholder="Reason for re-locking…"
            rows={3}
            data-testid="textarea-relock-reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRelockOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!relockReason.trim() || relock.isPending}
              onClick={() => relock.mutate(relockReason.trim())}
              data-testid="button-confirm-relock"
            >
              Re-lock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
