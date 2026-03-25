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

// Lazy-load heavier pages for better initial load
const CandidateDetail = lazy(() => import("@/pages/candidate-detail"));
const CandidatesPage = lazy(() => import("@/pages/candidates"));
const PipelinePage = lazy(() => import("@/pages/pipeline"));
const PortalPage = lazy(() => import("@/pages/portal"));
const RefereeForm = lazy(() => import("@/pages/referee-form"));

// Clinical Skills Arcade
const ArcadeNurseDashboard = lazy(() => import("@/pages/arcade/nurse-dashboard"));
const ArcadeScenarioPlayer = lazy(() => import("@/pages/arcade/scenario-player"));
const ArcadeTrainerRemediation = lazy(() => import("@/pages/arcade/trainer-remediation"));
const ArcadeWalkthrough = lazy(() => import("@/pages/arcade/walkthrough"));
const ArcadeAdminModules = lazy(() => import("@/pages/arcade/admin-modules"));
const ArcadeAdminReports = lazy(() => import("@/pages/arcade/admin-reports"));
const ArcadeAdminUsers = lazy(() => import("@/pages/arcade/admin-users"));

// Nurse Preboard
const PreboardAssessment = lazy(() => import("@/pages/preboard/assessment"));

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="h-8 w-8 border-2 border-[#C8A96E] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AuthenticatedRouter() {
  const queryClient = useQueryClient();
  const { data: authData, isLoading } = useQuery<{ authenticated: boolean; username: string } | null>({
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
        <Route path="/portal/:token" component={PortalHub} />
        <Route path="/portal/page/:token" component={PortalPage} />
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

              {/* Clinical Skills Arcade */}
              <Route path="/arcade">{() => <AppLayout><ArcadeNurseDashboard /></AppLayout>}</Route>
              <Route path="/arcade/scenario/:id">{() => <AppLayout><ArcadeScenarioPlayer /></AppLayout>}</Route>
              <Route path="/arcade/walkthrough/:id">{() => <AppLayout><ArcadeWalkthrough /></AppLayout>}</Route>
              <Route path="/arcade/trainer">{() => <AppLayout><ArcadeTrainerRemediation /></AppLayout>}</Route>
              <Route path="/arcade/admin/modules">{() => <AppLayout><ArcadeAdminModules /></AppLayout>}</Route>
              <Route path="/arcade/admin/reports">{() => <AppLayout><ArcadeAdminReports /></AppLayout>}</Route>
              <Route path="/arcade/admin/users">{() => <AppLayout><ArcadeAdminUsers /></AppLayout>}</Route>

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
