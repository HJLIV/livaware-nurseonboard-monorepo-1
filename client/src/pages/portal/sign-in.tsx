import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NurseSignIn } from "@/components/auth/nurse-sign-in";

export default function PortalSignIn() {
  const [, navigate] = useLocation();
  const [initialEmail, setInitialEmail] = useState<string | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const e = params.get("email");
    if (e) setInitialEmail(e);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/portal/auth/me", { credentials: "include" });
        if (cancelled || !r.ok) return;
        // Re-resolve the nurse's per-nurse portal URL each time so we
        // follow whatever their freshest portal link points at.
        let target = "/portal";
        try {
          const r2 = await fetch("/api/portal/auth/portal-url", { credentials: "include" });
          if (r2.ok) {
            const j2 = await r2.json().catch(() => ({}));
            if (typeof j2?.url === "string" && j2.url) target = j2.url;
          }
        } catch { /* ignore — fall back to /portal */ }
        if (!cancelled) navigate(target);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Basecamp</p>
          <CardTitle className="font-serif text-2xl font-light tracking-tight">
            Sign in to your portal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NurseSignIn
            initialEmail={initialEmail}
            onSuccess={(url) => navigate(url || "/portal")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
