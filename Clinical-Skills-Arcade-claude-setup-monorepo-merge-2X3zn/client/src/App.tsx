import { Switch, Route } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient, getQueryFn } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import Dashboard from "@/pages/dashboard";
import NursesPage from "@/pages/nurses";
import NurseDetail from "@/pages/nurse-detail";
import AuditPage from "@/pages/audit";
import AdminPreboard from "@/pages/preboard/admin-preboard";
import PortalHub from "@/pages/portal/portal-hub";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";

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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-[#C8A96E] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isAuthenticated = authData?.authenticated;

  return (
    <Switch>
      {/* Portal routes - no auth required */}
      <Route path="/portal/:token" component={PortalHub} />

      <Route>
        {isAuthenticated ? (
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/nurses" component={NursesPage} />
            <Route path="/nurses/:id" component={NurseDetail} />
            <Route path="/preboard" component={AdminPreboard} />
            <Route path="/audit" component={AuditPage} />
            <Route component={NotFound} />
          </Switch>
        ) : (
          <LoginPage onLogin={handleLogin} />
        )}
      </Route>
    </Switch>
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
