import { Switch, Route, Redirect, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient, getQueryFn } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { lazy, Suspense } from "react";

import Dashboard from "@/pages/dashboard";
import NursesPage from "@/pages/nurses";

function NurseDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Redirect to={`/candidates/${id}`} />;
}
import AuditPage from "@/pages/audit";
import AdminGuidePage from "@/pages/admin-guide";
import AdminPreboard from "@/pages/preboard/admin-preboard";
import PortalHub from "@/pages/portal/portal-hub";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/app-layout";
import { useAuthRole } from "@/lib/use-auth-role";

function ArcadeRouteSwitch() {
  const { isAdmin, isLoading } = useAuthRole();
  if (isLoading) return null;
  return isAdmin ? <ArcadeAdminOverview /> : <ArcadeNurseDashboard />;
}

// Lazy-load heavier pages for better initial load
const CandidateDetail = lazy(() => import("@/pages/candidate-detail"));
const CandidatesPage = lazy(() => import("@/pages/candidates"));
const PipelinePage = lazy(() => import("@/pages/pipeline"));
const PortalPage = lazy(() => import("@/pages/portal"));
const PortalSignIn = lazy(() => import("@/pages/portal/sign-in"));
const RefereeForm = lazy(() => import("@/pages/referee-form"));

// Skills Arcade (Clinical Skills)
const ArcadeNurseDashboard = lazy(() => import("@/pages/arcade/nurse-dashboard"));
const ArcadeScenarioPlayer = lazy(() => import("@/pages/arcade/scenario-player"));
const ArcadeTrainerRemediation = lazy(() => import("@/pages/arcade/trainer-remediation"));
const ArcadeWalkthrough = lazy(() => import("@/pages/arcade/walkthrough"));
const PortalArcade = lazy(() => import("@/pages/portal/portal-arcade"));
const PortalArcadeScenario = lazy(() => import("@/pages/portal/portal-arcade-scenario"));
const ArcadeAdminModules = lazy(() => import("@/pages/arcade/admin-modules"));
const ArcadeAdminOverview = lazy(() => import("@/pages/arcade/admin-overview"));
const ArcadeAdminReports = lazy(() => import("@/pages/arcade/admin-reports"));
const ArcadeAdminUsers = lazy(() => import("@/pages/arcade/admin-users"));
const DocumentsPage = lazy(() => import("@/pages/documents"));
const DocumentsReviewPage = lazy(() => import("@/pages/documents-review"));

// Nurse Preboard
const PreboardAssessment = lazy(() => import("@/pages/preboard/assessment"));

// Compliance Matrix Reports
const OnboardingMatrixPage = lazy(() => import("@/pages/reports/onboarding-matrix"));
const TrainingMatrixPage = lazy(() => import("@/pages/reports/training-matrix"));
const CompetencyMatrixPage = lazy(() => import("@/pages/reports/competency-matrix"));

// Admin platform settings
const AdminSettingsPage = lazy(() => import("@/pages/admin-settings"));
const AdminPoliciesPage = lazy(() => import("@/pages/admin-policies"));
const PortalPoliciesPage = lazy(() => import("@/pages/portal/policies"));
const PortalInductionPage = lazy(() => import("@/pages/portal/induction"));
const PortalSopComprehensionPage = lazy(() => import("@/pages/portal/sop-comprehension"));

// Super admin
const SuperAdminActivityPage = lazy(() => import("@/pages/super-admin/activity"));

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="h-8 w-8 border-2 border-[#C8A96E] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: authData, isLoading } = useQuery<{ authenticated: boolean; username: string; role?: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  if (isLoading || !authData) {
    return <LoadingSpinner />;
  }
  if (authData.role !== "admin" && authData.role !== "super_admin") {
    // Non-admins are redirected to the dashboard rather than shown a NotFound,
    // matching the task brief's "non-admins are redirected" requirement and
    // giving signed-in users a clear next destination.
    return <Redirect to="/" />;
  }
  return <Component />;
}

// Super-admin-only route guard. Mirrors AdminRoute but rejects regular
// admins as well — used for routes like /super-admin/activity that the
// brief reserves for the single fixed super-admin account.
function SuperAdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { data: authData, isLoading } = useQuery<{ authenticated: boolean; username: string; role?: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  if (isLoading || !authData) return <LoadingSpinner />;
  if (authData.role !== "super_admin") return <Redirect to="/" />;
  return <Component />;
}

function AuthenticatedRouter() {
  const queryClient = useQueryClient();
  const { data: authData, isLoading } = useQuery<{ authenticated: boolean; username: string; role?: string } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 0,
    retry: false,
  });

  const handleLogin = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const isAuthenticated = authData?.authenticated;

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Switch>
        {/* Public portal & referee routes - no auth required */}
        <Route path="/portal/sign-in" component={PortalSignIn} />
        {/* Tokenless canonical portal routes (cookie-session auth).
            Order matters with wouter <Switch>: more-specific paths
            MUST come before the catch-all /portal/:token below, or
            wouter will match e.g. /portal/arcade as token="arcade". */}
        <Route path="/portal/arcade" component={PortalArcade} />
        <Route path="/portal/arcade/scenario/:assignmentId" component={PortalArcadeScenario} />
        <Route path="/portal/arcade/walkthrough/:id">{() => <ArcadeWalkthrough />}</Route>
        <Route path="/portal/page" component={() => <PortalPage />} />
        <Route path="/portal/policies" component={() => <PortalPoliciesPage />} />
        <Route path="/portal/induction" component={() => <PortalInductionPage />} />
        <Route path="/portal/sop-comprehension" component={() => <PortalSopComprehensionPage />} />
        <Route path="/portal" component={() => <PortalHub />} />
        {/* Legacy tokenized portal routes — kept for back-compat with
            existing bootstrap links and external email links. */}
        <Route path="/portal/page/:token" component={PortalPage} />
        <Route path="/portal/policies/:token" component={PortalPoliciesPage} />
        <Route path="/portal/induction/:token" component={PortalInductionPage} />
        <Route path="/portal/sop-comprehension/:token" component={PortalSopComprehensionPage} />
        <Route path="/portal/:token/arcade" component={PortalArcade} />
        <Route path="/portal/:token/arcade/scenario/:assignmentId" component={PortalArcadeScenario} />
        <Route path="/portal/:token/arcade/walkthrough/:id">{() => <ArcadeWalkthrough />}</Route>
        <Route path="/portal/:token" component={PortalHub} />
        <Route path="/referee/:token" component={RefereeForm} />
        <Route path="/preboard/assessment" component={PreboardAssessment} />

        <Route>
          {isAuthenticated ? (
            <Switch>
              {/* Core dashboard */}
              <Route path="/" component={Dashboard} />

              {/* Nurse management */}
              <Route path="/nurses" component={NursesPage} />
              <Route path="/nurses/:id" component={NurseDetailRedirect} />
              <Route path="/candidates" component={CandidatesPage} />
              <Route path="/candidates/:id" component={CandidateDetail} />
              <Route path="/pipeline" component={PipelinePage} />

              {/* Pre-board & on-board */}
              <Route path="/preboard" component={AdminPreboard} />
              <Route path="/preboard/assessment" component={PreboardAssessment} />

              {/* Skills Arcade (Clinical Skills) */}
              <Route path="/arcade">{() => <AppLayout><ArcadeRouteSwitch /></AppLayout>}</Route>
              <Route path="/arcade/scenario/:id">{() => <AppLayout><ArcadeScenarioPlayer /></AppLayout>}</Route>
              <Route path="/arcade/walkthrough/:id">{() => <AppLayout><ArcadeWalkthrough /></AppLayout>}</Route>
              <Route path="/arcade/trainer">{() => <AppLayout><ArcadeTrainerRemediation /></AppLayout>}</Route>
              <Route path="/arcade/admin/modules">{() => <AppLayout><ArcadeAdminModules /></AppLayout>}</Route>
              <Route path="/arcade/admin/reports">{() => <AppLayout><ArcadeAdminReports /></AppLayout>}</Route>
              <Route path="/arcade/admin/users">{() => <AppLayout><ArcadeAdminUsers /></AppLayout>}</Route>

              {/* Documents */}
              {/* The /review path must be registered BEFORE /documents so wouter
                  matches it first — otherwise "/documents" would catch it. */}
              <Route path="/documents/review">{() => <AdminRoute component={DocumentsReviewPage} />}</Route>
              <Route path="/documents">{() => <AdminRoute component={DocumentsPage} />}</Route>

              {/* Compliance Matrix Reports (admin only) */}
              <Route path="/reports/onboarding">{() => <AppLayout><AdminRoute component={OnboardingMatrixPage} /></AppLayout>}</Route>
              <Route path="/reports/training">{() => <AppLayout><AdminRoute component={TrainingMatrixPage} /></AppLayout>}</Route>
              <Route path="/reports/competency">{() => <AppLayout><AdminRoute component={CompetencyMatrixPage} /></AppLayout>}</Route>

              {/* Platform settings (admin only) */}
              <Route path="/settings">{() => <AppLayout><AdminRoute component={AdminSettingsPage} /></AppLayout>}</Route>
              <Route path="/admin/policies">{() => <AppLayout><AdminRoute component={AdminPoliciesPage} /></AppLayout>}</Route>

              {/* Super Admin */}
              <Route path="/super-admin/activity">{() => <SuperAdminRoute component={SuperAdminActivityPage} />}</Route>

              {/* Audit */}
              <Route path="/audit" component={AuditPage} />

              {/* Admin Guide */}
              <Route path="/guide" component={AdminGuidePage} />

              <Route component={NotFound} />
            </Switch>
          ) : (
            <LoginPage onLogin={handleLogin} />
          )}
        </Route>
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <AuthenticatedRouter />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
