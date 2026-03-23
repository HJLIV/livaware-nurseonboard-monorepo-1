import { cn } from "@/lib/utils";
import { Check, Circle, AlertCircle } from "lucide-react";

interface StepProgressProps {
  stepStatuses: Record<string, string>;
  currentStep?: string;
  compact?: boolean;
}

const stepColors: Record<string, { bg: string; ring: string; icon: string }> = {
  complete: { bg: "bg-emerald-400", ring: "ring-emerald-400/30", icon: "text-white" },
  current: { bg: "bg-primary", ring: "ring-primary/30", icon: "text-white" },
  pending: { bg: "bg-muted-foreground/20", ring: "ring-transparent", icon: "text-muted-foreground/40" },
  flagged: { bg: "bg-amber-400", ring: "ring-amber-400/30", icon: "text-white" },
  blocked: { bg: "bg-destructive", ring: "ring-destructive/30", icon: "text-white" },
};

function getStepStyle(status: string, isCurrent: boolean) {
  if (isCurrent) return stepColors.current;
  if (status === "complete" || status === "completed") return stepColors.complete;
  if (status === "flagged" || status === "escalated") return stepColors.flagged;
  if (status === "blocked") return stepColors.blocked;
  return stepColors.pending;
}

export function StepProgress({ stepStatuses, currentStep, compact }: StepProgressProps) {
  const steps = Object.entries(stepStatuses);
  const size = compact ? "h-2.5 w-2.5" : "h-5 w-5";
  const iconSize = compact ? "h-1.5 w-1.5" : "h-3 w-3";

  return (
    <div className="flex items-center gap-0.5">
      {steps.map(([stepKey, status], i) => {
        const isCurrent = stepKey === currentStep;
        const style = getStepStyle(status, isCurrent);
        const isComplete = status === "complete" || status === "completed";

        return (
          <div key={stepKey} className="flex items-center">
            <div
              className={cn(
                "rounded-full flex items-center justify-center ring-2 transition-all duration-300",
                size,
                style.bg,
                style.ring,
                isCurrent && "scale-110",
              )}
              title={`${stepKey}: ${status}`}
            >
              {!compact && (
                isComplete ? (
                  <Check className={cn(iconSize, style.icon)} />
                ) : status === "flagged" || status === "blocked" ? (
                  <AlertCircle className={cn(iconSize, style.icon)} />
                ) : (
                  <Circle className={cn(iconSize, style.icon)} />
                )
              )}
            </div>
            {i < steps.length - 1 && (
              <div className={cn(
                "h-0.5 transition-colors duration-300",
                compact ? "w-3" : "w-6",
                isComplete ? "bg-emerald-400/50" : "bg-muted-foreground/15",
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
