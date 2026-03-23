import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  ClipboardCheck,
  ShieldCheck,
  Gamepad2,
  CheckCircle2,
  Circle,
  ArrowRight,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

interface PortalData {
  nurse: {
    id: string;
    fullName: string;
    email: string;
    currentStage: string;
  };
  journey: {
    preboard: { status: string; actionUrl?: string; label: string };
    onboard: { status: string; actionUrl?: string; label: string };
    skillsArcade: { status: string; actionUrl?: string; label: string };
  };
  token: string;
}

const journeyConfig = [
  {
    key: "preboard" as const,
    label: "Preboard Assessment",
    description: "Complete your initial assessment and screening",
    icon: ClipboardCheck,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
  },
  {
    key: "onboard" as const,
    label: "Onboarding",
    description: "Complete orientation and compliance training",
    icon: ShieldCheck,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
  },
  {
    key: "skillsArcade" as const,
    label: "Skills Arcade",
    description: "Demonstrate competency in required clinical skills",
    icon: Gamepad2,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
  },
];

export default function PortalHub() {
  const [, params] = useRoute("/portal/:token");
  const token = params?.token;

  const { data: portal, isLoading, error } = useQuery<PortalData>({
    queryKey: [`/api/portal/${token}`],
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-5 w-64 mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !portal) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-6">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <span className="text-xl text-destructive">!</span>
            </div>
            <h2 className="text-lg font-semibold mb-2">Portal Not Found</h2>
            <p className="text-sm text-muted-foreground">
              This portal link is invalid or has expired. Please contact your
              administrator for a new link.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { nurse, journey } = portal;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <span className="text-sm font-bold text-primary-foreground">L</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold">Livaware Portal</h1>
              <p className="text-xs text-muted-foreground">
                Nurse Onboarding Journey
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Welcome back,</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            {nurse.fullName}
          </h2>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Current stage:</span>
            <StatusBadge status={nurse.currentStage} />
          </div>
        </div>

        {/* Journey Checklist */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Your Journey
          </h3>

          {journeyConfig.map((stage) => {
            const data = journey[stage.key];
            const isCompleted =
              data.status === "completed" ||
              data.status === "cleared" ||
              data.status === "competent";
            const isActive = data.status === "in_progress";
            const Icon = stage.icon;

            return (
              <Card
                key={stage.key}
                className={cn(
                  "transition-all",
                  isActive && "ring-1 ring-primary/30 border-primary/20",
                )}
              >
                <CardContent className="flex items-center gap-4 py-5">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg shrink-0",
                      isCompleted
                        ? "bg-emerald-500/10"
                        : isActive
                          ? stage.bgColor
                          : "bg-muted",
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Icon
                        className={cn(
                          "h-5 w-5",
                          isActive ? stage.color : "text-muted-foreground",
                        )}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{stage.label}</p>
                      <StatusBadge status={data.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {stage.description}
                    </p>
                  </div>

                  {data.actionUrl && isActive && (
                    <Link href={data.actionUrl}>
                      <Button size="sm" className="shrink-0">
                        {data.label || "Continue"}
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  )}

                  {isCompleted && (
                    <Badge
                      variant="outline"
                      className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0"
                    >
                      Done
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-xs text-muted-foreground">
            Need help? Contact your administrator or supervisor.
          </p>
        </div>
      </div>
    </div>
  );
}
