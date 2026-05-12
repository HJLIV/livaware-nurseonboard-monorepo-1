import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

type Stage = "request" | "verify";
type ErrorState =
  | { kind: "expired"; message: string }
  | { kind: "invalid"; message: string; attemptsRemaining?: number }
  | { kind: "locked"; message: string }
  | { kind: "rate_limited"; message: string }
  | { kind: "generic"; message: string }
  | null;

const RESEND_COOLDOWN_S = 60;

export default function PortalSignIn() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [stage, setStage] = useState<Stage>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [err, setErr] = useState<ErrorState>(null);
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("email");
    if (e) setEmail(e);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/portal/auth/me", { credentials: "include" });
        if (!cancelled && r.ok) navigate("/portal");
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  useEffect(() => {
    return () => { if (cooldownTimer.current) clearInterval(cooldownTimer.current); };
  }, []);

  function startCooldown() {
    setCooldown(RESEND_COOLDOWN_S);
    if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    cooldownTimer.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1) {
          if (cooldownTimer.current) clearInterval(cooldownTimer.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  async function sendCode(): Promise<boolean> {
    setErr(null);
    const r = await fetch("/api/portal/auth/request-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429) {
      setErr({ kind: "rate_limited", message: j?.message || "Too many code requests. Please wait a few minutes." });
      return false;
    }
    if (!r.ok) {
      setErr({ kind: "generic", message: j?.message || "Could not send code." });
      return false;
    }
    if (j.devCode) setDevCode(j.devCode);
    startCooldown();
    return true;
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    try {
      const ok = await sendCode();
      if (ok) {
        setStage("verify");
        toast({ title: "Check your email", description: "We've sent a 6-digit sign-in code." });
      }
    } finally { setBusy(false); }
  }

  async function resend() {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    try {
      const ok = await sendCode();
      if (ok) toast({ title: "New code sent", description: "Check your email for the latest code." });
    } finally { setBusy(false); }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !code) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/portal/auth/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, code }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429 || j?.reason === "locked") {
        setErr({ kind: "locked", message: j?.message || "Too many wrong attempts. Please request a new code." });
        return;
      }
      if (!r.ok) {
        if (j?.reason === "expired") {
          setErr({ kind: "expired", message: "That code has expired — request a new one." });
        } else {
          setErr({
            kind: "invalid",
            message: j?.message || "That code didn't match. Please try again.",
            attemptsRemaining: j?.attemptsRemaining,
          });
        }
        return;
      }
      navigate("/portal");
    } catch (e: any) {
      setErr({ kind: "generic", message: e?.message || "Sign-in failed" });
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Livaware nurse portal</p>
          <CardTitle className="font-serif text-2xl font-light tracking-tight">
            {stage === "request" ? "Sign in to your portal" : "Enter your code"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stage === "request" ? (
            <form onSubmit={requestCode} className="space-y-4" data-testid="form-request-code">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  data-testid="input-email"
                />
              </div>
              {err && (
                <p className="text-xs text-destructive" data-testid="error-message">{err.message}</p>
              )}
              <Button type="submit" disabled={busy} className="w-full" data-testid="button-send-code">
                {busy ? "Sending…" : "Send me a code"}
              </Button>
              <p className="text-xs text-muted-foreground">
                We'll email a 6-digit code to your account address. Codes expire after 10 minutes.
              </p>
            </form>
          ) : (
            <form onSubmit={verifyCode} className="space-y-4" data-testid="form-verify-code">
              <p className="text-xs text-muted-foreground">
                We sent a code to <strong className="text-foreground">{email}</strong>.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  autoFocus
                  data-testid="input-code"
                />
                {devCode && (
                  <p className="text-[11px] text-muted-foreground/70">
                    Dev mode: code is <code className="font-mono">{devCode}</code>
                  </p>
                )}
              </div>
              {err && (
                <p className="text-xs text-destructive" data-testid="error-message">
                  {err.message}
                  {err.kind === "invalid" && typeof err.attemptsRemaining === "number" && err.attemptsRemaining > 0 && (
                    <> ({err.attemptsRemaining} {err.attemptsRemaining === 1 ? "try" : "tries"} remaining)</>
                  )}
                </p>
              )}
              <Button type="submit" disabled={busy || code.length !== 6} className="w-full" data-testid="button-verify-code">
                {busy ? "Verifying…" : "Sign in"}
              </Button>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => { setStage("request"); setCode(""); setDevCode(null); setErr(null); }}
                  className="text-muted-foreground hover:text-foreground underline"
                >
                  Use a different email
                </button>
                <button
                  type="button"
                  onClick={resend}
                  disabled={cooldown > 0 || busy}
                  className="text-muted-foreground hover:text-foreground underline disabled:opacity-50 disabled:no-underline"
                  data-testid="button-resend-code"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
