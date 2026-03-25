import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ScrollText, Clock, User2 } from "lucide-react";

interface AuditLog {
  id: string;
  module: string;
  action: string;
  nurseId?: string;
  agentName?: string;
  detail?: Record<string, unknown> | string;
  timestamp: string;
}

const moduleStyles: Record<string, { badge: string; dot: string }> = {
  admin:          { badge: "bg-purple-500/10 text-purple-400 border-purple-500/15", dot: "bg-purple-400" },
  preboard:       { badge: "bg-blue-500/10 text-blue-400 border-blue-500/15",     dot: "bg-blue-400" },
  onboard:        { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/15", dot: "bg-emerald-400" },
  skills_arcade: { badge: "bg-amber-500/10 text-amber-400 border-amber-500/15",   dot: "bg-amber-400" },
  portal:         { badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/15",       dot: "bg-cyan-400" },
};

const moduleOptions = [
  { value: "all", label: "All Modules" },
  { value: "admin", label: "Admin" },
  { value: "preboard", label: "Preboard" },
  { value: "onboard", label: "Onboard" },
  { value: "skills_arcade", label: "Skills Arcade" },
  { value: "portal", label: "Portal" },
];

const actionOptions = [
  { value: "all", label: "All Actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "login", label: "Login" },
  { value: "microsoft_sso_login", label: "Microsoft SSO Login" },
  { value: "logout", label: "Logout" },
  { value: "submit", label: "Submit" },
  { value: "complete", label: "Complete" },
  { value: "escalate", label: "Escalate" },
  { value: "flag", label: "Flag" },
];

function formatTimeAgo(dateStr: string) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AuditPage() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs"],
  });

  const filtered = logs?.filter((log) => {
    if (moduleFilter !== "all" && log.module !== moduleFilter) return false;
    if (actionFilter !== "all") {
      if (actionFilter === "login") {
        if (log.action !== "login" && log.action !== "microsoft_sso_login") return false;
      } else if (log.action !== actionFilter) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const detailStr = typeof log.detail === "object" ? JSON.stringify(log.detail) : (log.detail || "");
      return (
        (log.agentName?.toLowerCase().includes(q) ?? false) ||
        detailStr.toLowerCase().includes(q) ||
        log.module.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <AppLayout>
      <div className="space-y-7">
        <div className="animate-fade-in-up">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50 mb-1.5">
            System
          </p>
          <h1 className="font-serif text-3xl font-light tracking-tight text-foreground">
            Audit Trail
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Activity log across all platform modules
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 animate-fade-in-up animate-delay-100">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 bg-card border-border/60"
            />
          </div>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-[160px] h-10 bg-card border-border/60">
              <SelectValue placeholder="Module" />
            </SelectTrigger>
            <SelectContent>
              {moduleOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[160px] h-10 bg-card border-border/60">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              {actionOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filtered && (
            <Badge variant="secondary" className="shrink-0 font-semibold tabular-nums ml-auto">
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            </Badge>
          )}
        </div>

        <Card className="animate-fade-in-up animate-delay-200 overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : filtered && filtered.length > 0 ? (
              <div className="divide-y divide-border/50">
                {filtered.map((log, i) => {
                  const style = moduleStyles[log.module] || { badge: "bg-gray-500/10 text-gray-400 border-gray-500/15", dot: "bg-gray-400" };
                  return (
                    <div
                      key={log.id}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/20 transition-colors duration-150 animate-fade-in-up"
                      style={{ animationDelay: `${Math.min(i * 30, 500)}ms` }}
                    >
                      <div className="flex items-center gap-2 shrink-0 w-28">
                        <span className={`h-2 w-2 rounded-full ${style.dot} shrink-0`} />
                        <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wider ${style.badge}`}>
                          {log.module}
                        </Badge>
                      </div>

                      <Badge variant="secondary" className="text-[10px] font-semibold uppercase tracking-wider shrink-0">
                        {log.action}
                      </Badge>

                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        {log.action === "microsoft_sso_login" && typeof log.detail === "object" ? (
                          <span className="text-sm text-muted-foreground/70 truncate inline-flex items-center gap-1.5">
                            <svg viewBox="0 0 21 21" className="h-3 w-3 shrink-0"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
                            {(log.detail as any).displayName || (log.detail as any).email || "Microsoft user"} signed in via Microsoft 365
                          </span>
                        ) : log.detail ? (
                          <span className="text-sm text-muted-foreground/70 truncate">
                            {typeof log.detail === "object" ? Object.entries(log.detail).map(([k, v]) => `${k}: ${v}`).join(", ") : log.detail}
                          </span>
                        ) : null}
                      </div>

                      {log.agentName && (
                        <div className="flex items-center gap-1 shrink-0">
                          <User2 className="h-3 w-3 text-muted-foreground/30" />
                          <span className="text-[11px] text-muted-foreground/50">{log.agentName}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1 shrink-0 min-w-[80px] justify-end">
                        <Clock className="h-3 w-3 text-muted-foreground/30" />
                        <time className="text-[11px] text-muted-foreground/50 tabular-nums">
                          {formatTimeAgo(log.timestamp)}
                        </time>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/8 mb-4">
                  <ScrollText className="h-7 w-7 text-primary/40" />
                </div>
                <p className="font-serif text-lg text-foreground mb-1">
                  {search || moduleFilter !== "all" || actionFilter !== "all" ? "No matching logs" : "No audit logs yet"}
                </p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  {search || moduleFilter !== "all" || actionFilter !== "all"
                    ? "Try adjusting your filters to see more results"
                    : "Activity will appear here as users interact with the platform"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
