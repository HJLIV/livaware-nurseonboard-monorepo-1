import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Download, Search, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type CellStatus = "green" | "amber" | "red" | "grey";

export interface MatrixCell {
  status: CellStatus;
  label: string;
  date?: string | null;
}

export interface MatrixCandidate {
  id: string;
  name: string;
  email: string;
  band: number | null;
  onboardStatus: string | null;
  cells: Record<string, MatrixCell>;
}

export interface MatrixColumn {
  key: string;
  label: string;
  group?: string;
}

export interface MatrixResponse {
  generatedAt: string;
  columns: MatrixColumn[];
  candidates: MatrixCandidate[];
}

interface ComplianceMatrixProps {
  endpoint: string;
  title: string;
  description: string;
  /** Section to deep-link into on the candidate-detail page (e.g. "onboarding" or "compliance"). */
  defaultDetailSection: string;
  /** Map a column key to a candidate-detail tab id; if omitted, only ?section= is used. */
  cellToTab?: (columnKey: string) => string | undefined;
  /** Override the section query param per column (rare). */
  cellToSection?: (columnKey: string) => string | undefined;
}

const STATUS_CLASSES: Record<CellStatus, string> = {
  green:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 border-emerald-500/30",
  amber:
    "bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 border-amber-500/30",
  red:
    "bg-red-500/15 text-red-700 dark:text-red-300 hover:bg-red-500/25 border-red-500/30",
  grey:
    "bg-muted/40 text-muted-foreground hover:bg-muted/60 border-muted-foreground/20",
};

const STATUS_DOT: Record<CellStatus, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  grey: "bg-muted-foreground/40",
};

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  // Neutralise CSV formula-injection: prefix any cell starting with =, +, -, @, tab or CR with a single quote.
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ComplianceMatrix({
  endpoint,
  title,
  description,
  defaultDetailSection,
  cellToTab,
  cellToSection,
}: ComplianceMatrixProps) {
  const [search, setSearch] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<MatrixResponse>({
    queryKey: [endpoint],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 60_000,
  });

  const filteredCandidates = useMemo(() => {
    if (!data) return [];
    const term = search.trim().toLowerCase();
    return data.candidates.filter((c) => {
      if (term && !c.name.toLowerCase().includes(term) && !c.email.toLowerCase().includes(term)) {
        return false;
      }
      if (gapsOnly) {
        const hasGap = data.columns.some((col) => {
          const cell = c.cells[col.key];
          return cell && (cell.status === "red" || cell.status === "amber");
        });
        if (!hasGap) return false;
      }
      return true;
    });
  }, [data, search, gapsOnly]);

  const columnGroups = useMemo(() => {
    if (!data) return [] as { group: string; cols: MatrixColumn[] }[];
    const groups: { group: string; cols: MatrixColumn[] }[] = [];
    for (const col of data.columns) {
      const g = col.group ?? "";
      const last = groups[groups.length - 1];
      if (last && last.group === g) {
        last.cols.push(col);
      } else {
        groups.push({ group: g, cols: [col] });
      }
    }
    return groups;
  }, [data]);

  const handleExport = () => {
    if (!data) return;
    const header = ["Candidate", "Email", "Band", "Onboard Status", ...data.columns.map((c) => c.label)];
    const rows: string[][] = [header];
    for (const c of filteredCandidates) {
      rows.push([
        c.name,
        c.email,
        c.band !== null ? `Band ${c.band}` : "",
        c.onboardStatus ?? "",
        ...data.columns.map((col) => {
          const cell = c.cells[col.key];
          if (!cell) return "";
          return `${cell.status.toUpperCase()} — ${cell.label}`;
        }),
      ]);
    }
    const stamp = new Date().toISOString().slice(0, 10);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    downloadCsv(`${slug}-${stamp}.csv`, rows);
  };

  const candidateLink = (candidateId: string, columnKey?: string) => {
    const params = new URLSearchParams();
    const section = (columnKey && cellToSection?.(columnKey)) || defaultDetailSection;
    params.set("section", section);
    if (columnKey) {
      const tab = cellToTab?.(columnKey);
      if (tab) params.set("tab", tab);
    }
    return `/candidates/${candidateId}?${params.toString()}`;
  };

  // Summary tallies (always over the visible rows)
  const summary = useMemo(() => {
    if (!data) return { red: 0, amber: 0, green: 0, grey: 0, total: 0 };
    let red = 0, amber = 0, green = 0, grey = 0;
    for (const c of filteredCandidates) {
      for (const col of data.columns) {
        const cell = c.cells[col.key];
        if (!cell) continue;
        if (cell.status === "red") red++;
        else if (cell.status === "amber") amber++;
        else if (cell.status === "green") green++;
        else grey++;
      }
    }
    return { red, amber, green, grey, total: red + amber + green + grey };
  }, [data, filteredCandidates]);

  return (
    <div className="p-6 space-y-4 max-w-full">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
          {data && (
            <p className="text-xs text-muted-foreground/70 mt-1">
              Generated {new Date(data.generatedAt).toLocaleString("en-GB")} · {data.candidates.length} candidates · {data.columns.length} columns
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh">
            {isFetching ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!data} data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      <Card className="p-3 flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search candidates by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="gaps-only" checked={gapsOnly} onCheckedChange={setGapsOnly} data-testid="switch-gaps-only" />
          <Label htmlFor="gaps-only" className="cursor-pointer text-sm">Show only candidates with gaps</Label>
        </div>
        {data && (
          <div className="flex items-center gap-3 text-xs ml-auto">
            <span className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", STATUS_DOT.green)} /> {summary.green} OK</span>
            <span className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", STATUS_DOT.amber)} /> {summary.amber} Watch</span>
            <span className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", STATUS_DOT.red)} /> {summary.red} Gap</span>
            <span className="inline-flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", STATUS_DOT.grey)} /> {summary.grey} N/A</span>
          </div>
        )}
      </Card>

      {isError && (
        <Card className="p-4 border-destructive/40 bg-destructive/10 text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
          <div>
            <p className="font-medium text-destructive">Could not load report</p>
            <p className="text-muted-foreground">{(error as Error)?.message ?? "Unknown error"}</p>
          </div>
        </Card>
      )}

      {isLoading ? (
        <Card className="p-4 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </Card>
      ) : data ? (
        <Card className="overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-280px)] relative">
            <TooltipProvider delayDuration={150}>
              <table className="border-separate border-spacing-0 text-xs w-max min-w-full">
                <thead>
                  {columnGroups.some((g) => g.group) && (
                    <tr>
                      <th
                        className="sticky left-0 top-0 z-30 bg-card border-b border-r border-border/60 px-3 py-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground/70 min-w-[240px]"
                        rowSpan={2}
                      >
                        Candidate
                      </th>
                      {columnGroups.map((g, gi) => (
                        <th
                          key={`g-${gi}`}
                          colSpan={g.cols.length}
                          className="sticky top-0 z-20 bg-card border-b border-r border-border/60 px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/80 text-center"
                        >
                          {g.group || ""}
                        </th>
                      ))}
                    </tr>
                  )}
                  <tr>
                    {!columnGroups.some((g) => g.group) && (
                      <th className="sticky left-0 top-0 z-30 bg-card border-b border-r border-border/60 px-3 py-2 text-left text-[11px] uppercase tracking-wide text-muted-foreground/70 min-w-[240px]">
                        Candidate
                      </th>
                    )}
                    {data.columns.map((col) => (
                      <th
                        key={col.key}
                        className={cn(
                          "bg-card border-b border-r border-border/60 px-2 py-2 text-[11px] font-medium text-muted-foreground/90 text-center align-bottom min-w-[120px] max-w-[160px]",
                          columnGroups.some((g) => g.group) ? "top-[34px]" : "top-0",
                          "sticky z-10",
                        )}
                      >
                        <div className="leading-tight whitespace-normal">{col.label}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={data.columns.length + 1} className="text-center py-12 text-muted-foreground text-sm">
                        No candidates match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredCandidates.map((c, ri) => (
                      <tr key={c.id} className={ri % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                        <th
                          scope="row"
                          className={cn(
                            "sticky left-0 z-10 border-b border-r border-border/60 px-3 py-2 text-left font-normal min-w-[240px] max-w-[280px]",
                            ri % 2 === 0 ? "bg-background" : "bg-muted/20",
                          )}
                        >
                          <Link href={candidateLink(c.id)} className="block group" data-testid={`link-candidate-${c.id}`}>
                            <div className="font-medium text-sm group-hover:text-primary transition-colors truncate">
                              {c.name}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {c.email}
                              {c.band !== null && <span className="ml-2">Band {c.band}</span>}
                            </div>
                          </Link>
                        </th>
                        {data.columns.map((col) => {
                          const cell = c.cells[col.key];
                          if (!cell) {
                            return (
                              <td
                                key={col.key}
                                className="border-b border-r border-border/60 p-1 text-center"
                              >
                                <div className={cn("rounded px-1.5 py-1 border", STATUS_CLASSES.grey)}>—</div>
                              </td>
                            );
                          }
                          return (
                            <td
                              key={col.key}
                              className="border-b border-r border-border/60 p-1 text-center align-middle"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Link
                                    href={candidateLink(c.id, col.key)}
                                    className={cn(
                                      "block rounded px-1.5 py-1 border text-[10px] font-medium leading-tight transition-colors cursor-pointer truncate",
                                      STATUS_CLASSES[cell.status],
                                    )}
                                    data-testid={`cell-${c.id}-${col.key}`}
                                  >
                                    <span className={cn("inline-block h-1.5 w-1.5 rounded-full mr-1", STATUS_DOT[cell.status])} />
                                    {cell.label}
                                  </Link>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  <div className="font-semibold">{col.label}</div>
                                  <div>{cell.label}</div>
                                  <div className="text-muted-foreground mt-1">Click to open candidate</div>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </TooltipProvider>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
