import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  PortalShell,
  buildPortalGroups,
  type PortalSidebarGroup,
} from "@/components/layout/portal-shell";
import { RosterTabs } from "@/components/portal/roster-tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Clock, Lock } from "lucide-react";

interface ShiftRow {
  id: string;
  date: string;
  patient: string;
  slotLabel: string;
  startTime: string;
  endTime: string;
  minutes: number;
}

interface MyShiftsData {
  nurseId: string;
  today: string;
  months: { month: string; shifts: ShiftRow[]; totalMinutes: number; totalHours: number }[];
  totalShifts: number;
  totalMinutes: number;
}

interface PortalShape {
  nurse: { id: string; fullName: string; currentStage: string };
  journey: any;
  gate?: any;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric" });
}

function dayLabel(dateIso: string): string {
  return new Date(dateIso + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function PortalMyShiftsPage() {
  const [, navigate] = useLocation();

  const { data: portal, error: portalError } = useQuery<PortalShape>({
    queryKey: [`/api/portal/me`],
    queryFn: async () => {
      const res = await fetch("/api/portal/me", { credentials: "include" });
      if (res.status === 401) throw new Error("not_signed_in");
      if (!res.ok) throw new Error("Portal not available");
      return res.json();
    },
    retry: false,
  });
  const notSignedIn = (portalError as Error | null)?.message === "not_signed_in";

  const eligible =
    portal?.nurse.currentStage === "completed" || portal?.gate?.graceAccess === true;

  const { data, isLoading, error } = useQuery<MyShiftsData>({
    queryKey: [`/api/portal/me/my-shifts`],
    enabled: !!portal && !notSignedIn && eligible,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/portal/me/my-shifts`);
      return res.json();
    },
  });

  const groups = useMemo<PortalSidebarGroup[]>(() => {
    if (!portal) return [];
    return buildPortalGroups({
      token: "me",
      serviceAgreementSigned: (portal as any)?.serviceAgreement?.signed,
      selectServiceAgreement: () => navigate(`/portal/service-agreement`),
      journey: portal.journey,
      stepStatuses: {},
      gate: portal.gate ?? null,
      availabilityEnabled: eligible,
      invoicesEnabled: eligible,
      selectInvoices: () => navigate(`/portal/invoices`),
      selectOverview: () => navigate(`/portal`),
      selectOnboardingStep: (k) => navigate(`/portal/page?step=${k}`),
      selectAvailability: () => navigate(`/portal/availability`),
      selectPolicies: () => navigate(`/portal/policies`),
      selectInduction: () => navigate(`/portal/induction`),
      selectSopComprehension: () => navigate(`/portal/sop-comprehension`),
      selectCompetency: () => navigate(`/portal/page?step=competency`),
      selectCvUpload: () => navigate(`/portal/page?step=cv`),
      selectDeclaration: (k) => navigate(`/portal/declaration/${k}`),
    });
  }, [portal, navigate, eligible]);

  const today = data?.today || "";
  const upcoming = useMemo(() => {
    if (!data) return 0;
    return data.months.reduce(
      (n, m) => n + m.shifts.filter((s) => s.date >= today).length,
      0,
    );
  }, [data, today]);

  return (
    <PortalShell
      token="me"
      candidateName={portal?.nurse.fullName || ""}
      groups={groups}
      activeKey="rostering:my-shifts"
    >
      <div className="space-y-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Rostering</p>
          <h1 className="font-serif text-2xl font-light tracking-tight" data-testid="heading-my-shifts">
            My Shifts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All the days you're rostered to work — past and upcoming — grouped by month.
            If anything looks wrong, contact the office.
          </p>
        </div>

        <RosterTabs active="my-shifts" />

        {!eligible && portal && (
          <Card>
            <CardContent className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0" />
              My Shifts becomes available once you've reached the Nurse stage.
            </CardContent>
          </Card>
        )}

        {eligible && isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {eligible && !!error && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Could not load your shifts. Please try again later.
            </CardContent>
          </Card>
        )}

        {eligible && data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Total shifts</p>
                  <p className="font-serif text-2xl font-light" data-testid="stat-total-shifts">{data.totalShifts}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Total hours</p>
                  <p className="font-serif text-2xl font-light">{Math.round((data.totalMinutes / 60) * 10) / 10}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Upcoming</p>
                  <p className="font-serif text-2xl font-light">{upcoming}</p>
                </CardContent>
              </Card>
            </div>

            {data.months.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-sm text-muted-foreground">
                  <CalendarDays className="h-6 w-6 mx-auto mb-2 opacity-40" />
                  You have no rostered shifts yet.
                </CardContent>
              </Card>
            )}

            {data.months.map((m) => (
              <Card key={m.month}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-baseline justify-between">
                    <h2 className="font-serif text-lg font-light">{monthLabel(m.month)}</h2>
                    <span className="text-xs text-muted-foreground">
                      {m.shifts.length} shift{m.shifts.length === 1 ? "" : "s"} · {m.totalHours} hrs
                    </span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {m.shifts.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-3 py-2 text-sm"
                        data-testid={`shift-row-${s.id}`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {dayLabel(s.date)}
                            {s.date >= today && (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-primary">Upcoming</span>
                            )}
                          </p>
                          <p className="text-muted-foreground truncate">
                            {s.patient} · {s.slotLabel}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                          <Clock className="h-3.5 w-3.5" />
                          <span>
                            {s.startTime}–{s.endTime}
                          </span>
                          <span className="text-xs">({Math.round((s.minutes / 60) * 10) / 10}h)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </PortalShell>
  );
}
