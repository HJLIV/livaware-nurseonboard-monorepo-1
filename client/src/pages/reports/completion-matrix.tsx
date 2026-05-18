import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowUpDown, Search, Activity } from "lucide-react";
import { STAGE_DISPLAY_NAMES } from "@shared/schema";

type SectionKey =
  | "preboard"
  | "onboarding"
  | "training"
  | "references"
  | "policies"
  | "arcade";

interface SectionStat {
  pct: number;
  label: string;
}

interface CompletionRow {
  id: string;
  name: string;
  email: string;
  band: number | null;
  currentStage: string;
  onboardStatus: string | null;
  updatedAt: string | null;
  sections: Record<SectionKey, SectionStat>;
  overall: { pct: number };
}

interface CompletionResponse {
  generatedAt: string;
  nurses: CompletionRow[];
}

type SortKey = "name" | "stage" | "overall" | "updated";
type SortDir = "asc" | "desc";

function pctTone(pct: number): string {
  if (pct >= 90) return "bg-emerald-500";
  if (pct >= 60) return "bg-primary";
  if (pct >= 30) return "bg-amber-500";
  return "bg-rose-500";
}

function pctBadgeTone(pct: number): string {
  if (pct >= 90) return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (pct >= 60) return "border-primary/30 bg-primary/10 text-primary";
  if (pct >= 30) return "border-amber-500/30 bg-amber-500/10 text-amber-400";
  return "border-rose-500/30 bg-rose-500/10 text-rose-400";
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export default function CompletionMatrixPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("overall");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data, isLoading, error } = useQuery<CompletionResponse>({
    queryKey: ["/api/admin/reports/completion-matrix"],
  });

  const rows = useMemo(() => {
    if (!data?.nurses) return [];
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? data.nurses.filter(
          (n) =>
            n.name.toLowerCase().includes(needle) ||
            n.email.toLowerCase().includes(needle),
        )
      : data.nurses.slice();

    const cmp = (a: CompletionRow, b: CompletionRow) => {
      let r = 0;
      switch (sortKey) {
        case "name":
          r = a.name.localeCompare(b.name);
          break;
        case "stage":
          r = a.currentStage.localeCompare(b.currentStage);
          break;
        case "overall":
          r = a.overall.pct - b.overall.pct;
          break;
        case "updated": {
          const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          r = ta - tb;
          break;
        }
      }
      return sortDir === "asc" ? r : -r;
    };
    filtered.sort(cmp);
    return filtered;
  }, [data, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "overall" ? "asc" : "asc");
    }
  };

  const avgOverall = useMemo(() => {
    if (!data?.nurses?.length) return 0;
    return Math.round(
      data.nurses.reduce((acc, n) => acc + n.overall.pct, 0) / data.nurses.length,
    );
  }, [data]);

  const stalledCount = useMemo(
    () => (data?.nurses ?? []).filter((n) => n.overall.pct < 60 && n.currentStage !== "completed").length,
    [data],
  );

  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* Page header */}
      <div className="animate-fade-in-up">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60 mb-1.5">
          Reports
        </p>
        <h1 className="font-serif text-2xl md:text-3xl font-light tracking-tight text-foreground">
          Completion overview
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Single overall % per nurse, rolled up from preboard assessment, onboarding steps, training, references, policies and Skills Arcade. Click any row to open that nurse.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-fade-in-up animate-delay-100">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mb-1">
              Roster size
            </p>
            <p className="font-serif text-2xl font-light">{data?.nurses?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mb-1">
              Average completion
            </p>
            <p className="font-serif text-2xl font-light">{avgOverall}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mb-1">
              Stalled (&lt;60%, not yet completed)
            </p>
            <p className="font-serif text-2xl font-light">{stalledCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Matrix */}
      <Card className="animate-fade-in-up animate-delay-200">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="font-serif text-lg font-light tracking-tight">
                Per-nurse completion
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Sorted lowest-first by default so stalled nurses surface at the top
              </CardDescription>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="pl-8 h-9 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          ) : error ? (
            <p className="text-sm text-rose-400 py-6">
              Failed to load completion matrix.
            </p>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <Activity className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground/60">No nurses match your search.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortBtn label="Nurse" active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")} />
                    </TableHead>
                    <TableHead>
                      <SortBtn label="Stage" active={sortKey === "stage"} dir={sortDir} onClick={() => toggleSort("stage")} />
                    </TableHead>
                    <TableHead className="w-[40%]">
                      <SortBtn label="Overall" active={sortKey === "overall"} dir={sortDir} onClick={() => toggleSort("overall")} />
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">Sections</TableHead>
                    <TableHead className="text-right">
                      <SortBtn label="Updated" active={sortKey === "updated"} dir={sortDir} onClick={() => toggleSort("updated")} />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((n) => (
                    <TableRow
                      key={n.id}
                      className="cursor-pointer hover:bg-muted/40 transition-colors"
                      onClick={() => navigate(`/nurses/${n.id}`)}
                      data-testid={`completion-row-${n.id}`}
                    >
                      <TableCell className="py-3">
                        <div className="font-medium text-sm">{n.name}</div>
                        <div className="text-[11px] text-muted-foreground/70">{n.email}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                          {STAGE_DISPLAY_NAMES?.[n.currentStage as keyof typeof STAGE_DISPLAY_NAMES] ?? n.currentStage}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden min-w-[80px]">
                            <div
                              className={`h-full ${pctTone(n.overall.pct)} transition-all duration-500`}
                              style={{ width: `${n.overall.pct}%` }}
                            />
                          </div>
                          <Badge variant="outline" className={`shrink-0 tabular-nums text-[11px] font-semibold ${pctBadgeTone(n.overall.pct)}`}>
                            {n.overall.pct}%
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1.5">
                          {(Object.entries(n.sections) as [SectionKey, SectionStat][]).map(([key, s]) => (
                            <span
                              key={key}
                              title={`${key}: ${s.label}`}
                              className={`text-[10px] px-1.5 py-0.5 rounded border ${pctBadgeTone(s.pct)} tabular-nums`}
                            >
                              {sectionShortName(key)} {s.pct}%
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground/70 tabular-nums">
                        {formatRelative(n.updatedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {data?.generatedAt && (
            <p className="text-[10px] text-muted-foreground/50 mt-3">
              Generated {new Date(data.generatedAt).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SortBtn({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={`h-7 px-1.5 text-[11px] uppercase tracking-wide font-semibold ${active ? "text-foreground" : "text-muted-foreground/70"}`}
    >
      {label}
      <ArrowUpDown className={`ml-1 h-3 w-3 ${active ? "opacity-100" : "opacity-40"} ${active && dir === "desc" ? "rotate-180" : ""}`} />
    </Button>
  );
}

function sectionShortName(key: SectionKey): string {
  switch (key) {
    case "preboard": return "Assess";
    case "onboarding": return "Onboard";
    case "training": return "Training";
    case "references": return "Refs";
    case "policies": return "Policies";
    case "arcade": return "Arcade";
  }
}
