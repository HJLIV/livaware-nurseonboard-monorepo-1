import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { LogIn, ArrowRight, Activity, ShieldCheck, Gamepad2, ClipboardCheck, GraduationCap, CalendarCheck, FileCheck2 } from "lucide-react";
import { NurseSignIn } from "@/components/auth/nurse-sign-in";

interface LoginPageProps {
  onLogin: () => void;
}

const adminFeatures = [
  { icon: ClipboardCheck, label: "Applicant Assessment", desc: "AI-powered credential verification" },
  { icon: ShieldCheck,   label: "Candidate Onboarding", desc: "Document checks & compliance tracking" },
  { icon: Gamepad2,      label: "Skills Arcade",          desc: "Clinical competency assessments" },
  { icon: Activity,      label: "Audit Trail",           desc: "Full lifecycle activity logging" },
];

const nurseFeatures = [
  { icon: FileCheck2,    label: "Compliance",     desc: "Upload your documents & track what's outstanding" },
  { icon: GraduationCap, label: "Training",        desc: "Complete your mandatory modules at your own pace" },
  { icon: Gamepad2,      label: "Skills Arcade",   desc: "Practise clinical scenarios and earn competencies" },
  { icon: CalendarCheck, label: "Availability",    desc: "Tell us when you're free to work, week by week" },
];

const adminHero = {
  eyebrow: "Clinical Workforce Platform",
  title: (
    <>
      Every nurse's<br />
      <em className="text-shimmer not-italic">journey,</em><br />
      perfected.
    </>
  ),
  blurb: "From first application to full competency — a single platform that guides, tracks, and elevates your clinical workforce.",
};

const nurseHero = {
  eyebrow: "Your nurse portal",
  title: (
    <>
      Your career,<br />
      <em className="text-shimmer not-italic">all in</em><br />
      one place.
    </>
  ),
  blurb: "Stay on top of your compliance, finish your training, sharpen your clinical skills, and share your availability — all from one secure portal.",
};

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<"admin" | "nurse">("admin");
  const { toast } = useToast();

  const { data: ssoStatus } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/auth/microsoft/status"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 60000,
  });

  const ssoEnabled = ssoStatus?.enabled ?? false;

  // If a nurse already has an active portal session, send them straight
  // to their portal instead of showing the unified login screen. We check
  // here (rather than at App.tsx) so the standalone /portal/sign-in page
  // keeps its own existing redirect behaviour.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/portal/auth/me", { credentials: "include" });
        if (cancelled || !r.ok) return;
        // Re-resolve the nurse's personal portal URL on each visit so
        // we follow whatever their freshest portal link points at.
        let target = "/portal";
        try {
          const r2 = await fetch("/api/portal/auth/portal-url", { credentials: "include" });
          if (r2.ok) {
            const j2 = await r2.json().catch(() => ({}));
            if (typeof j2?.url === "string" && j2.url) target = j2.url;
          }
        } catch { /* ignore — fall back to /portal */ }
        if (!cancelled) window.location.assign(target);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) {
      const messages: Record<string, string> = {
        sso_failed: "Microsoft sign-in failed. Please try again.",
        sso_denied: "Sign-in was cancelled or denied.",
        sso_no_code: "No authorization code received. Please try again.",
        sso_no_account: "Could not retrieve your Microsoft account. Please try again.",
        sso_token_failed: "Token exchange failed. Please try again or use local sign-in.",
      };
      toast({
        title: "Sign-in issue",
        description: messages[error] || "An error occurred during sign-in.",
        variant: "destructive",
      });
      window.history.replaceState({}, "", "/");
    }
  }, [toast]);

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      return res.json();
    },
    onSuccess: () => { onLogin(); },
    onError: (error: Error) => {
      toast({
        title: "Access denied",
        description: error.message || "Invalid credentials. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    loginMutation.mutate();
  };

  return (
    <div className="h-screen flex overflow-hidden">

      {/* ── Left Panel: Brand + Features ── */}
      <div className="login-panel-bg noise-overlay relative hidden lg:flex lg:w-[52%] flex-col justify-between p-10 overflow-hidden">

        {/* Decorative circles */}
        <div className="pointer-events-none absolute inset-0">
          <div className="animate-float absolute -top-20 -right-20 w-96 h-96 rounded-full border border-[hsl(39_45%_61%/0.12)]" />
          <div className="animate-float animate-delay-200 absolute top-1/3 -left-16 w-64 h-64 rounded-full border border-[hsl(39_45%_61%/0.08)]" />
          <div className="animate-glow-pulse absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full bg-[hsl(39_45%_50%/0.06)]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-[hsl(39_45%_61%/0.05)]" />
        </div>

        {/* Logo */}
        <div className="relative animate-fade-in-up">
          <img src="/images/livaware-logo-white.png" alt="Livaware" className="h-8 w-auto" />
        </div>

        {/* Hero text */}
        <div key={tab} className="relative min-h-0 flex-1 flex flex-col justify-center space-y-4 animate-fade-in-up animate-delay-100">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(39_45%_61%)] mb-3">
              {(tab === "nurse" ? nurseHero : adminHero).eyebrow}
            </p>
            <h1 className={`font-serif font-light text-white leading-[1.1] tracking-tight ${tab === "nurse" ? "text-3xl xl:text-4xl" : "text-5xl"}`}>
              {(tab === "nurse" ? nurseHero : adminHero).title}
            </h1>
          </div>
          <p className="text-sm text-white/50 max-w-sm leading-relaxed font-light">
            {(tab === "nurse" ? nurseHero : adminHero).blurb}
          </p>

          {tab === "nurse" ? (
            /* Nurse explainer video — replaces the feature list on the nurse tab */
            <div className="max-w-md animate-fade-in-up animate-delay-200">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[hsl(39_45%_61%)] mb-2">
                A two-minute tour
              </p>
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40 shadow-lg">
                <video
                  src="/videos/nurse-explainer.mp4"
                  controls
                  controlsList="nodownload"
                  disablePictureInPicture
                  playsInline
                  preload="metadata"
                  className="w-full aspect-video bg-black"
                />
              </div>
            </div>
          ) : (
            /* Feature list */
            <div className="grid grid-cols-1 gap-3 pt-2">
              {adminFeatures.map((f, i) => (
                <div
                  key={f.label}
                  className={`flex items-center gap-3 animate-fade-in-up animate-delay-${(i + 2) * 100}`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 border border-white/10">
                    <f.icon className="h-3.5 w-3.5 text-[hsl(39_45%_65%)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white/80">{f.label}</p>
                    <p className="text-xs text-white/35">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="relative animate-fade-in animate-delay-500">
          <p className="text-xs text-white/25">
            © {new Date().getFullYear()} Livaware. Trusted by clinical teams.
          </p>
        </div>
      </div>

      {/* ── Right Panel: Sign In Form ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 py-8 bg-background overflow-y-auto">

        {/* Mobile logo */}
        <div className="mb-6 flex items-center gap-3 lg:hidden animate-fade-in-up">
          <img src="/images/livaware-logo-white.png" alt="Livaware" className="h-7 w-auto invert dark:invert-0" />
        </div>

        <div className="w-full max-w-sm animate-fade-in-up animate-delay-100">

          {/* Heading */}
          <div className="mb-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1.5">Livaware</p>
            <h2 className="font-serif text-2xl font-light text-foreground tracking-tight mb-1">
              {tab === "nurse" ? "Welcome, nurse" : "Welcome back"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {tab === "nurse"
                ? "Sign in to your portal to keep your record up to date"
                : "Choose how you sign in"}
            </p>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "admin" | "nurse")} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="admin" data-testid="tab-admin">Admin / staff</TabsTrigger>
              <TabsTrigger value="nurse" data-testid="tab-nurse">I'm a nurse</TabsTrigger>
            </TabsList>

            <TabsContent value="admin" className="mt-0">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Username
                  </Label>
                  <Input
                    id="username"
                    type="text"
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    className="h-11 bg-background border-border/80 focus:border-primary transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="h-11 bg-background border-border/80 focus:border-primary transition-colors"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 gap-2 font-semibold tracking-wide mt-2"
                  disabled={loginMutation.isPending || !username.trim() || !password.trim()}
                >
                  {loginMutation.isPending ? (
                    <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </form>

              {ssoEnabled && (
                <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border/50" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-background px-3 text-xs text-muted-foreground">or</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 gap-3 font-medium"
                    onClick={() => {
                      // Navigate the current tab so that, after Microsoft redirects
                      // back to "/", the user lands on the authenticated app
                      // instead of being left on the login screen in a stale tab.
                      window.location.assign("/api/auth/microsoft/login");
                    }}
                  >
                    <svg viewBox="0 0 21 21" className="h-5 w-5 shrink-0" xmlns="http://www.w3.org/2000/svg">
                      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                    </svg>
                    Sign in with Microsoft 365
                  </Button>
                </>
              )}
            </TabsContent>

            <TabsContent value="nurse" className="mt-0">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  Sign in with your email — we'll send you a 6-digit code.
                </p>
              </div>
              <NurseSignIn onSuccess={(url) => window.location.assign(url || "/portal")} />
            </TabsContent>
          </Tabs>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-background px-3 text-xs text-muted-foreground">Secure access</span>
            </div>
          </div>

          {/* Trust indicators */}
          <div className="flex items-center justify-center gap-6">
            {[
              { icon: ShieldCheck, label: "Encrypted" },
              { icon: Activity,    label: "Audited" },
              { icon: LogIn,       label: "SSO Ready" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
