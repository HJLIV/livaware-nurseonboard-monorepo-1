import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getStageDisplayName } from "@shared/schema";

interface StatusBadgeProps {
  status: string;
  isStage?: boolean;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  not_started: {
    label: "Not Started",
    className: "bg-gray-500/15 text-gray-400 border-gray-500/20",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  },
  cleared: {
    label: "Cleared",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  },
  competent: {
    label: "Competent",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  },
  flagged: {
    label: "Flagged",
    className: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  },
  escalated: {
    label: "Escalated",
    className: "bg-red-500/15 text-red-400 border-red-500/20",
  },
  blocked: {
    label: "Blocked",
    className: "bg-red-500/15 text-red-400 border-red-500/20",
  },
  remediation: {
    label: "Remediation",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  },
  preboard: {
    label: "Applicant",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  },
  onboard: {
    label: "Candidate",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  },
  skills_arcade: {
    label: "Skills Arcade",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  },
};

export function StatusBadge({ status, isStage, className }: StatusBadgeProps) {
  if (!status) return null;
  const config = statusConfig[status] || {
    label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    className: "bg-gray-500/15 text-gray-400 border-gray-500/20",
  };

  const label = isStage ? getStageDisplayName(status) : config.label;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[11px] font-medium capitalize",
        config.className,
        className,
      )}
    >
      {label}
    </Badge>
  );
}
