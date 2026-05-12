import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { KeyRound, LogOut, Send } from "lucide-react";

interface PortalSessionRow {
  id: string;
  issuedAt: string;
  expiresAt: string;
  lastSeenAt: string;
  ip: string | null;
  userAgent: string | null;
  issuedVia: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

interface PortalSessionsResponse {
  nurseId: string;
  lastSignIn: {
    issuedAt: string;
    issuedVia: string;
    ip: string | null;
    userAgent: string | null;
    revokedAt: string | null;
  } | null;
  sessions: PortalSessionRow[];
}

interface AuditEntry {
  id: string;
  action: string;
  module: string;
  timestamp: string;
  detail: any;
  agentName: string | null;
}

const PORTAL_AUTH_ACTIONS = new Set([
  "portal_session_issued",
  "portal_signed_out",
  "portal_sessions_revoked",
  "portal_code_requested",
  "portal_code_verified",
  "portal_code_verify_failed",
  "portal_code_email",
  "portal_code_sent_by_admin",
  "portal_bootstrap_claimed",
  "portal_code_rate_limited",
]);

function fmt(d: string | null | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString(); } catch { return d; }
}

export function PortalAccessPanel({ candidateId }: { candidateId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [lastDevCode, setLastDevCode] = useState<string | null>(null);

  const { data, isLoading } = useQuery<PortalSessionsResponse>({
    queryKey: [`/api/nurses/${candidateId}/portal-sessions`],
  });

  const { data: audit } = useQuery<AuditEntry[]>({
    queryKey: [`/api/nurses/${candidateId}/audit-log`],
  });

  const recentEvents = (audit || [])
    .filter((a) => a.module === "portal_auth" || PORTAL_AUTH_ACTIONS.has(a.action))
    .slice(0, 10);

  const sendCode = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/nurses/${candidateId}/portal-auth/send-code`, {}),
    onSuccess: async (res) => {
      const body = await (res as Response).json().catch(() => ({}));
      if (body?.devCode) setLastDevCode(body.devCode);
      toast({
        title: body?.emailSent ? "Sign-in code emailed" : "Sign-in code generated",
        description: body?.emailSent
          ? "The nurse will receive a 6-digit code that expires in 10 minutes."
          : "Email is not configured — share the dev code manually.",
      });
      qc.invalidateQueries({ queryKey: [`/api/nurses/${candidateId}/audit-log`] });
      qc.invalidateQueries({ queryKey: [`/api/nurses/${candidateId}/portal-sessions`] });
    },
    onError: (err: any) => toast({ title: "Send failed", description: err?.message, variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/nurses/${candidateId}/portal-auth/revoke-all`, { reason: "admin_force_signout" }),
    onSuccess: () => {
      toast({ title: "All portal sessions revoked", description: "The nurse will need to sign in again." });
      qc.invalidateQueries({ queryKey: [`/api/nurses/${candidateId}/portal-sessions`] });
      qc.invalidateQueries({ queryKey: [`/api/nurses/${candidateId}/audit-log`] });
    },
    onError: (err: any) => toast({ title: "Could not revoke", description: err?.message, variant: "destructive" }),
  });

  return (
    <Card data-testid="portal-access-panel">
      <CardHeader>
        <CardTitle className="font-serif text-lg font-light tracking-tight flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-muted-foreground" />
          Portal access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/60">Last sign-in</p>
                <p className="text-sm">
                  {data?.lastSignIn ? (
                    <>
                      {fmt(data.lastSignIn.issuedAt)} · <Badge variant="outline" className="ml-1">{data.lastSignIn.issuedVia}</Badge>
                      {data.lastSignIn.ip && <span className="text-muted-foreground"> · {data.lastSignIn.ip}</span>}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Never signed in</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={sendCode.isPending} onClick={() => sendCode.mutate()} data-testid="button-send-portal-code">
                  <Send className="w-3.5 h-3.5 mr-1.5" /> Send sign-in code
                </Button>
                <Button size="sm" variant="destructive" disabled={revoke.isPending} onClick={() => revoke.mutate()} data-testid="button-revoke-portal-sessions">
                  <LogOut className="w-3.5 h-3.5 mr-1.5" /> Force sign-out
                </Button>
              </div>
            </div>
            {lastDevCode && (
              <p className="text-xs text-muted-foreground">
                Dev code (no email configured): <code className="font-mono">{lastDevCode}</code>
              </p>
            )}

            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/60 mb-2">
                Recent sign-in sessions
              </p>
              {(data?.sessions || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No portal sessions yet.</p>
              ) : (
                <div className="overflow-x-auto rounded border border-border/40">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">When</th>
                        <th className="px-2 py-1.5 text-left font-medium">Via</th>
                        <th className="px-2 py-1.5 text-left font-medium">IP</th>
                        <th className="px-2 py-1.5 text-left font-medium">User-agent</th>
                        <th className="px-2 py-1.5 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.sessions || []).slice(0, 10).map((s) => {
                        const status = s.revokedAt
                          ? `Revoked${s.revokedReason ? ` (${s.revokedReason})` : ""}`
                          : new Date(s.expiresAt).getTime() < Date.now()
                            ? "Expired"
                            : "Active";
                        return (
                          <tr key={s.id} className="border-t border-border/40">
                            <td className="px-2 py-1.5 whitespace-nowrap">{fmt(s.issuedAt)}</td>
                            <td className="px-2 py-1.5"><Badge variant="outline" className="text-[10px]">{s.issuedVia}</Badge></td>
                            <td className="px-2 py-1.5 font-mono text-[11px]">{s.ip || "—"}</td>
                            <td className="px-2 py-1.5 max-w-[220px] truncate text-muted-foreground" title={s.userAgent || ""}>
                              {s.userAgent || "—"}
                            </td>
                            <td className="px-2 py-1.5">
                              <Badge variant={status === "Active" ? "default" : "outline"} className="text-[10px]">{status}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground/60 mb-2">Recent portal events</p>
              {recentEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No portal activity yet.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {recentEvents.map((e) => (
                    <li key={e.id} className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1.5">
                      <span className="font-mono text-xs">{e.action}</span>
                      <span className="text-xs text-muted-foreground">{fmt(e.timestamp)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
