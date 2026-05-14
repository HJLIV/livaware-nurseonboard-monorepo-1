// Super Admin → Activity Dashboard.
//
// Three coordinated panels off a single set of filters:
//  - Live activity feed (paged audit log)
//  - Per-actor leaderboard with click-through
//  - Drill-down panel for the selected actor (per-action + per-module
//    breakdowns + that actor's recent activity)

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  Search,
  User2,
  Clock,
  ShieldAlert,
  ChevronRight,
  X,
  BookOpen,
} from "lucide-react";

interface AuditRow {
  id: string;
  module: string;
  action: string;
  nurseId: string | null;
  agentName: string | null;
  detail?: Record<string, unknown> | null;
  timestamp: string;
}

interface ActorRow {
  agentName: string | null;
  count: number;
  lastSeen: string;
}

interface ActorDetail {
  actor: string;
  rows: AuditRow[];
  byAction: Array<{ action: string; count: number }>;
  byModule: Array<{ module: string; count: number }>;
  total: number;
}

const MODULE_OPTIONS = [
  { value: "all", label: "All modules" },
  { value: "admin", label: "Admin" },
  { value: "preboard", label: "Applicant" },
  { value: "onboard", label: "Candidate" },
  { value: "skills_arcade", label: "Skills Arcade" },
  { value: "portal", label: "Portal" },
  { value: "system", label: "System" },
];

const moduleStyles: Record<string, { badge: string; dot: string }> = {
  admin: { badge: "bg-purple-500/10 text-purple-400 border-purple-500/15", dot: "bg-purple-400" },
  preboard: { badge: "bg-blue-500/10 text-blue-400 border-blue-500/15", dot: "bg-blue-400" },
  onboard: { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15", dot: "bg-emerald-400" },
  skills_arcade: { badge: "bg-amber-500/10 text-amber-400 border-amber-500/15", dot: "bg-amber-400" },
  portal: { badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/15", dot: "bg-cyan-400" },
  system: { badge: "bg-rose-500/10 text-rose-400 border-rose-500/15", dot: "bg-rose-400" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function buildQuery(params: Record<string, string | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && v !== "all") u.set(k, v);
  }
  return u.toString();
}

function ActivityRow({ row }: { row: AuditRow }) {
  const style = moduleStyles[row.module] || {
    badge: "bg-gray-500/10 text-gray-400 border-gray-500/15",
    dot: "bg-gray-400",
  };
  const detail = row.detail
    ? typeof row.detail === "object"
      ? Object.entries(row.detail)
          .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
          .join(", ")
      : String(row.detail)
    : "";
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-2 shrink-0 w-28">
        <span className={`h-2 w-2 rounded-full ${style.dot} shrink-0`} />
        <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider ${style.badge}`}>
          {row.module}
        </Badge>
      </div>
      <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wider shrink-0">
        {row.action}
      </Badge>
      <div className="flex-1 min-w-0 text-xs text-muted-foreground/80 truncate">
        {detail}
      </div>
      {row.agentName && (
        <div className="flex items-center gap-1 shrink-0 max-w-[160px]">
          <User2 className="h-3 w-3 text-muted-foreground/40" />
          <span className="text-[11px] text-muted-foreground/60 truncate">{row.agentName}</span>
        </div>
      )}
      <div className="flex items-center gap-1 shrink-0 min-w-[80px] justify-end">
        <Clock className="h-3 w-3 text-muted-foreground/30" />
        <time className="text-[11px] text-muted-foreground/50 tabular-nums">{timeAgo(row.timestamp)}</time>
      </div>
    </div>
  );
}

export default function SuperAdminActivityPage() {
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("all");
  const [action, setAction] = useState("");
  const [agent, setAgent] = useState("");
  const [nurseId, setNurseId] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [selectedActor, setSelectedActor] = useState<string | null>(null);

  const filterParams = useMemo(
    () => ({ q: search, module, action, agent, nurseId, since, until }),
    [search, module, action, agent, nurseId, since, until],
  );

  const { data: feed, isLoading: feedLoading } = useQuery<{
    rows: AuditRow[];
    count: number;
  }>({
    queryKey: ["/api/super-admin/activity", filterParams],
    queryFn: async () => {
      const qs = buildQuery({ ...filterParams, limit: "150" });
      const res = await fetch(`/api/super-admin/activity${qs ? "?" + qs : ""}`);
      if (!res.ok) throw new Error("Failed to load activity");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: actors, isLoading: actorsLoading } = useQuery<{ actors: ActorRow[] }>({
    queryKey: ["/api/super-admin/activity/actors", filterParams],
    queryFn: async () => {
      const qs = buildQuery(filterParams);
      const res = await fetch(`/api/super-admin/activity/actors${qs ? "?" + qs : ""}`);
      if (!res.ok) throw new Error("Failed to load actors");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: drilldown, isLoading: drillLoading } = useQuery<ActorDetail>({
    queryKey: ["/api/super-admin/activity/actor", selectedActor, filterParams],
    enabled: !!selectedActor,
    queryFn: async () => {
      const qs = buildQuery({ ...filterParams, limit: "200" });
      const res = await fetch(
        `/api/super-admin/activity/actor/${encodeURIComponent(selectedActor!)}${qs ? "?" + qs : ""}`,
      );
      if (!res.ok) throw new Error("Failed to load actor activity");
      return res.json();
    },
  });

  const clearFilters = () => {
    setSearch("");
    setModule("all");
    setAction("");
    setAgent("");
    setNurseId("");
    setSince("");
    setUntil("");
  };

  const hasFilters = search || module !== "all" || action || agent || nurseId || since || until;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 mb-1.5 inline-flex items-center gap-2">
            <ShieldAlert className="h-3 w-3 text-amber-400" /> Super Admin
          </p>
          <h1 className="font-serif text-3xl font-light tracking-tight">Activity Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">
            Live oversight of every signed-in admin. Click any actor on the
            right to drill into what they've been doing across the platform.
          </p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
              <div className="md:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search action / agent / detail…"
                  className="pl-9 h-9"
                  data-testid="input-activity-search"
                />
              </div>
              <Select value={module} onValueChange={setModule}>
                <SelectTrigger className="h-9" data-testid="select-activity-module">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODULE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="Action (exact)"
                className="h-9"
                data-testid="input-activity-action"
              />
              <Input
                type="datetime-local"
                value={since}
                onChange={(e) => setSince(e.target.value)}
                className="h-9"
                data-testid="input-activity-since"
              />
              <Input
                type="datetime-local"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className="h-9"
                data-testid="input-activity-until"
              />
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                placeholder="Filter by agent name (exact)"
                className="h-8 max-w-xs"
                data-testid="input-activity-agent"
              />
              <Input
                value={nurseId}
                onChange={(e) => setNurseId(e.target.value)}
                placeholder="Filter by nurse ID"
                className="h-8 max-w-xs"
                data-testid="input-activity-nurse-id"
              />
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-activity-clear" tooltip="Reset every filter on this page back to its default.">
                  <X className="h-3 w-3 mr-1" /> Clear filters
                </Button>
              )}
              <Badge variant="secondary" className="ml-auto tabular-nums">
                {feed?.count ?? 0} events
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Feed */}
          <Card className="lg:col-span-2">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Live activity</h2>
                <span className="text-[11px] text-muted-foreground/60">refreshes every 30s</span>
              </div>
              {feedLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : feed && feed.rows.length > 0 ? (
                <div className="divide-y divide-border/30 max-h-[70vh] overflow-y-auto">
                  {feed.rows.map((row) => (
                    <ActivityRow key={row.id} row={row} />
                  ))}
                </div>
              ) : (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No activity matches the current filters.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actors */}
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
                <User2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Actors</h2>
                <span className="text-[11px] text-muted-foreground/60 ml-auto">
                  click to drill in
                </span>
              </div>
              {actorsLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : actors && actors.actors.length > 0 ? (
                <div className="divide-y divide-border/30 max-h-[70vh] overflow-y-auto">
                  {actors.actors.map((a) => {
                    const name = a.agentName;
                    const display = name || "(system)";
                    const isSelected = !!name && selectedActor === name;
                    const isDrillable = !!name;
                    return (
                      <button
                        key={display}
                        disabled={!isDrillable}
                        title={isDrillable ? undefined : "System / unattributed actions cannot be drilled into"}
                        onClick={() => isDrillable && setSelectedActor(isSelected ? null : name)}
                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/20 transition-colors ${
                          isSelected ? "bg-primary/5" : ""
                        }`}
                        data-testid={`actor-row-${display}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{display}</p>
                          <p className="text-[11px] text-muted-foreground/60">
                            last seen {timeAgo(a.lastSeen)}
                          </p>
                        </div>
                        <Badge variant="secondary" className="tabular-nums">
                          {a.count}
                        </Badge>
                        <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No actors in range.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Drill-down */}
        {selectedActor && (
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
                <User2 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">
                  Drill-down · <span className="text-primary">{selectedActor}</span>
                </h2>
                <Badge variant="secondary" className="tabular-nums">
                  {drilldown?.total ?? 0} events
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedActor(null)}
                  className="ml-auto"
                  data-testid="button-close-actor"
                  tooltip="Close this actor's drill-down panel."
                >
                  <X className="h-3 w-3 mr-1" /> Close
                </Button>
              </div>
              {drillLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : drilldown ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-border/30">
                  <div className="p-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-2 font-semibold">
                      By action
                    </p>
                    <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                      {drilldown.byAction.map((a) => (
                        <div key={a.action} className="flex items-center justify-between text-xs">
                          <span className="truncate">{a.action}</span>
                          <Badge variant="outline" className="tabular-nums shrink-0 ml-2">
                            {a.count}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-2 font-semibold">
                      By module
                    </p>
                    <div className="space-y-1.5">
                      {drilldown.byModule.map((m) => {
                        const style = moduleStyles[m.module];
                        return (
                          <div key={m.module} className="flex items-center justify-between text-xs">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-semibold uppercase tracking-wider ${
                                style?.badge || "bg-gray-500/10 text-gray-400"
                              }`}
                            >
                              {m.module}
                            </Badge>
                            <span className="tabular-nums text-muted-foreground">{m.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="md:col-span-1 max-h-[40vh] overflow-y-auto">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground/60 mb-2 font-semibold p-4 pb-1">
                      Recent
                    </p>
                    <div className="divide-y divide-border/30">
                      {drilldown.rows.slice(0, 50).map((row) => (
                        <ActivityRow key={row.id} row={row} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}
        <InductionEngagementPanel />
      </div>
    </AppLayout>
  );
}

interface InductionEngagementRow {
  nurseId: string;
  fullName: string;
  email: string | null;
  acknowledgedCount: number;
  totalRequired: number;
  completionPct: number;
  totalActiveSeconds: number;
  shortAckCount: number;
  lastReadAt: string | null;
}
interface InductionEngagementResp {
  totalRequired: number;
  shortAckThresholdSeconds: number;
  nurses: InductionEngagementRow[];
}

function fmtDuration(totalSeconds: number) {
  if (!totalSeconds) return "—";
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function InductionEngagementPanel() {
  const { data, isLoading } = useQuery<InductionEngagementResp>({
    queryKey: ["/api/super-admin/induction/engagement"],
    queryFn: async () => {
      const res = await fetch("/api/super-admin/induction/engagement");
      if (!res.ok) throw new Error("Failed to load induction engagement");
      return res.json();
    },
    refetchInterval: 60000,
  });

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Induction & policies — engagement</h2>
          {data && (
            <span className="text-[11px] text-muted-foreground/60">
              {data.totalRequired} required sections · short-ack threshold {data.shortAckThresholdSeconds}s
            </span>
          )}
        </div>
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : data && data.nurses.length > 0 ? (
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 sticky top-0">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Nurse</th>
                  <th className="px-3 py-2 font-medium">Progress</th>
                  <th className="px-3 py-2 font-medium">Active time</th>
                  <th className="px-3 py-2 font-medium">Short acks</th>
                  <th className="px-3 py-2 font-medium">Last read</th>
                </tr>
              </thead>
              <tbody>
                {data.nurses.map((n) => (
                  <tr key={n.nurseId} className="border-t border-border/20 hover:bg-muted/10">
                    <td className="px-3 py-2">
                      <div className="font-medium">{n.fullName || "—"}</div>
                      {n.email && <div className="text-[10px] text-muted-foreground/60">{n.email}</div>}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {n.acknowledgedCount}/{n.totalRequired}{" "}
                      <span className="text-muted-foreground/60">({n.completionPct}%)</span>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{fmtDuration(n.totalActiveSeconds)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {n.shortAckCount > 0 ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/15">
                          {n.shortAckCount}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {n.lastReadAt ? timeAgo(n.lastReadAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-muted-foreground">No induction reads recorded yet.</div>
        )}
      </CardContent>
    </Card>
  );
}
