// Per-nurse admin panel for the 21 induction items (task 114).
// Mounted on candidate-detail and nurse-detail pages. Shows the
// acknowledgement matrix plus the silent time-tracking columns
// (total active seconds, longest session, distinct sessions,
// scrolled-to-end, last read). Visible to both admins and
// super-admins; nurses never see these — the portal endpoints omit
// the read-behaviour fields entirely.

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, BookOpen, AlertCircle, Clock } from "lucide-react";

interface InductionRow {
  id: string;
  // The induction-progress endpoint surfaces the source slug
  // (e.g. "induction:sop-01-antt") which we use to pair the row with
  // its comprehension MCQ outcome below.
  slug?: string | null;
  title: string;
  version: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedVersion: string | null;
  needsReacknowledgement: boolean;
  totalActiveSeconds?: number | null;
  sessionCount?: number | null;
  scrolledToEnd?: boolean | null;
  longestSessionSeconds?: number | null;
  lastReadAt?: string | null;
}
interface InductionProgressResponse {
  policies: InductionRow[];
  totalRequired: number;
  outstanding: number;
  canViewReadBehaviour: boolean;
}
interface SopComprehensionRow {
  sopSlug: string;
  sopTitle?: string;
  vignette?: string;
  status: "passed" | "failed" | "not_attempted";
  attemptCount: number;
  lastAttemptAt: string | null;
  chosenOptionId?: string | null;
  chosenOptionLabel?: string | null;
  chosenWasCorrect?: boolean | null;
  chosenExplanation?: string | null;
  correctOptionId?: string | null;
  correctOptionLabel?: string | null;
  correctExplanation?: string | null;
}
interface SopComprehensionResponse {
  questions: SopComprehensionRow[];
}

function fmtSeconds(s: number | null | undefined): string {
  if (s == null) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

export function InductionProgressPanel({ candidateId }: { candidateId: string }) {
  const { data, isLoading } = useQuery<InductionProgressResponse>({
    queryKey: [`/api/nurses/${candidateId}/induction-progress`],
    enabled: !!candidateId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  // Pair each induction row with its SOP comprehension MCQ outcome
  // (task #114 follow-up) so the admin sees pass/fail inline rather
  // than having to scan a separate panel. Polled on the same 5s
  // cadence so a candidate's just-submitted MCQ appears here within
  // seconds without an admin refresh.
  const { data: comp } = useQuery<SopComprehensionResponse>({
    queryKey: [`/api/nurses/${candidateId}/sop-comprehension`],
    enabled: !!candidateId,
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const compBySlug = new Map<string, SopComprehensionRow>();
  for (const q of comp?.questions ?? []) compBySlug.set(q.sopSlug, q);

  return (
    <Card data-testid="induction-progress-panel">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <BookOpen className="h-4 w-4 text-muted-foreground/70" />
          Induction (Staff Handbook)
          {data && (
            data.outstanding === 0 ? (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Complete
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                {data.outstanding} of {data.totalRequired} outstanding
              </Badge>
            )
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !data || data.policies.length === 0 ? (
          <p className="text-xs text-muted-foreground">No induction items configured.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground/70 uppercase tracking-wider text-[10px]">
                  <th className="px-2 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Section</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Comprehension</th>
                  <th className="px-2 py-2 font-medium">Acknowledged</th>
                  {data.canViewReadBehaviour && (
                    <>
                      <th className="px-2 py-2 font-medium">
                        <Clock className="h-3 w-3 inline mr-1" />
                        Active
                      </th>
                      <th className="px-2 py-2 font-medium">Longest</th>
                      <th className="px-2 py-2 font-medium">Sessions</th>
                      <th className="px-2 py-2 font-medium">Scrolled</th>
                      <th className="px-2 py-2 font-medium">Last read</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.policies.map((row, idx) => (
                  <tr
                    key={row.id}
                    className="border-t border-border/40"
                    data-testid={`induction-row-${row.id}`}
                  >
                    <td className="px-2 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium">{row.title}</div>
                      <div className="text-[10px] text-muted-foreground/70">v{row.version}</div>
                    </td>
                    <td className="px-2 py-2">
                      {row.acknowledged && !row.needsReacknowledgement ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Acked
                        </Badge>
                      ) : row.needsReacknowledgement ? (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Stale (was v{row.acknowledgedVersion})
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/20">
                          Outstanding
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top min-w-[260px]">
                      {(() => {
                        const c = row.slug ? compBySlug.get(row.slug) : undefined;
                        if (!c) {
                          // Non-SOP rows (Parts / Appendices) have no MCQ.
                          return <span className="text-muted-foreground/50">—</span>;
                        }
                        if (c.status === "not_attempted") {
                          return (
                            <Badge variant="outline" className="text-muted-foreground/70" data-testid={`comp-inline-${row.slug}`}>
                              Not attempted
                            </Badge>
                          );
                        }
                        const isPass = c.status === "passed";
                        return (
                          <div className="space-y-1.5" data-testid={`comp-inline-${row.slug}`}>
                            <Badge
                              variant="outline"
                              className={isPass
                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                : "bg-red-500/10 text-red-600 border-red-500/20"}
                            >
                              {isPass
                                ? <CheckCircle2 className="h-3 w-3 mr-1" />
                                : <AlertCircle className="h-3 w-3 mr-1" />}
                              {isPass ? "Passed" : "Failed"}
                            </Badge>
                            <div className="text-[11px] leading-relaxed space-y-0.5">
                              <div>
                                <span className="text-muted-foreground/70">Their answer:</span>{" "}
                                <span className={isPass ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                                  {c.chosenOptionId ? `${c.chosenOptionId.toUpperCase()}. ` : ""}
                                  {c.chosenOptionLabel ?? "—"}
                                </span>
                              </div>
                              {!isPass && (
                                <div>
                                  <span className="text-muted-foreground/70">Correct:</span>{" "}
                                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                    {c.correctOptionId ? `${c.correctOptionId.toUpperCase()}. ` : ""}
                                    {c.correctOptionLabel ?? "—"}
                                  </span>
                                </div>
                              )}
                              {c.lastAttemptAt && (
                                <div className="text-[10px] text-muted-foreground/60">
                                  Answered {new Date(c.lastAttemptAt).toLocaleString()}
                                  {c.attemptCount > 1 ? ` · ${c.attemptCount} attempts` : ""}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">
                      {row.acknowledgedAt ? new Date(row.acknowledgedAt).toLocaleString() : "—"}
                    </td>
                    {data.canViewReadBehaviour && (
                      <>
                        <td className="px-2 py-2 tabular-nums">{fmtSeconds(row.totalActiveSeconds ?? null)}</td>
                        <td className="px-2 py-2 tabular-nums">{fmtSeconds(row.longestSessionSeconds ?? null)}</td>
                        <td className="px-2 py-2 tabular-nums">{row.sessionCount ?? "—"}</td>
                        <td className="px-2 py-2">{row.scrolledToEnd ? "✓" : "—"}</td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {row.lastReadAt ? new Date(row.lastReadAt).toLocaleString() : "—"}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground/60 mt-2 px-2">
              Time-on-page metrics are tracked silently in the background and
              are visible to admins only — they are never shown to the nurse.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
