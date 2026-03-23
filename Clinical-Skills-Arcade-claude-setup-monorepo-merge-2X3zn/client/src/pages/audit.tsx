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
import { Search, ScrollText } from "lucide-react";

interface AuditLog {
  id: number;
  module: string;
  action: string;
  nurseId?: number;
  nurseName?: string;
  detail?: string;
  agent?: string;
  createdAt: string;
}

const moduleColors: Record<string, string> = {
  admin: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  preboard: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  onboard: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  "skills-arcade": "bg-amber-500/15 text-amber-400 border-amber-500/20",
  portal: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
};

const moduleOptions = [
  { value: "all", label: "All Modules" },
  { value: "admin", label: "Admin" },
  { value: "preboard", label: "Preboard" },
  { value: "onboard", label: "Onboard" },
  { value: "skills-arcade", label: "Skills Arcade" },
  { value: "portal", label: "Portal" },
];

const actionOptions = [
  { value: "all", label: "All Actions" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "login", label: "Login" },
  { value: "logout", label: "Logout" },
  { value: "submit", label: "Submit" },
  { value: "complete", label: "Complete" },
  { value: "escalate", label: "Escalate" },
  { value: "flag", label: "Flag" },
];

export default function AuditPage() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const { data: logs, isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs"],
  });

  const filtered = logs?.filter((log) => {
    if (moduleFilter !== "all" && log.module !== moduleFilter) return false;
    if (actionFilter !== "all" && log.action !== actionFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (log.nurseName?.toLowerCase().includes(q) ?? false) ||
        (log.detail?.toLowerCase().includes(q) ?? false) ||
        (log.agent?.toLowerCase().includes(q) ?? false) ||
        log.module.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Trail</h1>
          <p className="text-muted-foreground">
            Activity log across all platform modules
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Module" />
            </SelectTrigger>
            <SelectContent>
              {moduleOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              {actionOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Audit Entries */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filtered && filtered.length > 0 ? (
              <div className="divide-y divide-border">
                {filtered.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    <Badge
                      variant="outline"
                      className={
                        moduleColors[log.module] ||
                        "bg-gray-500/15 text-gray-400 border-gray-500/20"
                      }
                    >
                      {log.module}
                    </Badge>
                    <Badge variant="secondary" className="text-[11px] shrink-0">
                      {log.action}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {log.nurseName && (
                          <span className="text-sm font-medium truncate">
                            {log.nurseName}
                          </span>
                        )}
                        {log.detail && (
                          <span className="text-sm text-muted-foreground truncate">
                            {log.detail}
                          </span>
                        )}
                      </div>
                    </div>
                    {log.agent && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        by {log.agent}
                      </span>
                    )}
                    <time className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {new Date(log.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ScrollText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  {search || moduleFilter !== "all" || actionFilter !== "all"
                    ? "No logs match your filters"
                    : "No audit logs recorded yet"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
