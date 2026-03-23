import { PORTAL_STEPS } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Check, ChevronRight } from "lucide-react";
import logoPath from "@assets/Livaware-new-logotype-1-white_1773243160929.png";

interface PortalLayoutProps {
  candidateName: string;
  stepStatuses: Record<string, string>;
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
  children: React.ReactNode;
}

export function PortalLayout({
  candidateName,
  stepStatuses,
  currentStep,
  onStepClick,
  children,
}: PortalLayoutProps) {
  const completedCount = PORTAL_STEPS.filter(
    (s) => stepStatuses[s.key] === "completed"
  ).length;
  const progressPercent = Math.round((completedCount / PORTAL_STEPS.length) * 100);

  return (
    <div className="min-h-screen bg-background flex flex-col" data-testid="portal-layout">
      <header
        className="sticky top-0 z-50 border-b border-border bg-sidebar"
        data-testid="portal-header"
      >
        <div className="max-w-4xl mx-auto flex items-center gap-3 px-4 py-3 sm:px-6">
          <img src={logoPath} alt="Livaware" className="h-6 w-auto" />
          <div className="h-5 w-px bg-border mx-1" />
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-[0.14em] uppercase text-primary" data-testid="text-portal-title">
              NurseOnboard
            </p>
          </div>
        </div>
      </header>

      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-semibold" data-testid="text-candidate-name">
              {candidateName}
            </h2>
            <span className="text-sm text-muted-foreground" data-testid="text-progress-label">
              {completedCount} of {PORTAL_STEPS.length} steps complete
            </span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2 overflow-hidden" data-testid="portal-progress-bar">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 flex flex-col lg:flex-row gap-6">
          <nav
            className="lg:w-64 shrink-0"
            aria-label="Onboarding steps"
            data-testid="portal-step-nav"
          >
            <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0">
              {PORTAL_STEPS.map((step, idx) => {
                const status = stepStatuses[step.key] || "pending";
                const isCompleted = status === "completed";
                const isActive = idx + 1 === currentStep;

                return (
                  <button
                    key={step.key}
                    onClick={() => onStepClick?.(idx + 1)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors whitespace-nowrap lg:whitespace-normal w-full",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isCompleted
                        ? "text-foreground hover:bg-secondary"
                        : "text-muted-foreground hover:bg-secondary"
                    )}
                    data-testid={`portal-step-${step.key}`}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        isCompleted
                          ? "bg-[#5DB88A]/20 text-[#5DB88A]"
                          : isActive
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-secondary text-muted-foreground"
                      )}
                    >
                      {isCompleted ? <Check className="h-3.5 w-3.5" /> : step.step}
                    </span>
                    <span className="hidden lg:inline">{step.name}</span>
                    {isActive && (
                      <ChevronRight className="h-4 w-4 ml-auto hidden lg:block" />
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          <main id="main-content" className="flex-1 min-w-0" data-testid="portal-content">
            {children}
          </main>
        </div>
      </div>

      <footer className="border-t border-border bg-card py-4 mt-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <p className="text-xs text-muted-foreground text-center">
            Livaware Ltd — Secure Nurse Onboarding Portal
          </p>
        </div>
      </footer>
    </div>
  );
}
