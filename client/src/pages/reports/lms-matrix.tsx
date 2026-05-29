import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { SuperAdminGate, SuperAdminViewOnlyBanner } from "@/components/super-admin-only";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { GraduationCap, Loader2, Send, Link as LinkIcon } from "lucide-react";
import { Link } from "wouter";

type CellStatus = "assigned" | "in_progress" | "completed" | "overdue";

interface MatrixCourse { id: string; title: string; sourceType: string; isActive: boolean }
interface MatrixNurse { id: string; fullName: string; currentStage: string }
interface MatrixCell {
  assignmentId: string;
  courseId: string;
  nurseId: string;
  status: CellStatus;
  dueDate: string | null;
  lastChasedAt: string | null;
  certificateDocumentId: string | null;
}
interface MatrixResponse { courses: MatrixCourse[]; nurses: MatrixNurse[]; cells: MatrixCell[] }

const CELL: Record<CellStatus, { dot: string; label: string }> = {
  completed: { dot: "bg-emerald-500", label: "Completed" },
  in_progress: { dot: "bg-amber-500", label: "In progress" },
  assigned: { dot: "bg-slate-400", label: "Assigned" },
  overdue: { dot: "bg-rose-500", label: "Overdue" },
};

export default function LmsMatrixPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [chasing, setChasing] = useState<string | null>(null);

  const { data, isLoading } = useQuery<MatrixResponse>({
    queryKey: ["/api/admin/lms/matrix"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const cellMap = useMemo(() => {
    const m = new Map<string, MatrixCell>();
    (data?.cells || []).forEach((c) => m.set(`${c.nurseId}::${c.courseId}`, c));
    return m;
  }, [data]);

  // Only show nurses with at least one assignment to keep the grid focused.
  const visibleNurses = useMemo(() => {
    if (!data) return [];
    const assigned = new Set((data.cells || []).map((c) => c.nurseId));
    return data.nurses.filter((n) => assigned.has(n.id));
  }, [data]);

  const remindMutation = useMutation({
    mutationFn: async (assignmentId: string) => apiRequest("POST", `/api/admin/lms/assignments/${assignmentId}/remind`).then((r) => r.json()),
    onSuccess: () => { toast({ title: "Reminder sent" }); qc.invalidateQueries({ queryKey: ["/api/admin/lms/matrix"] }); },
    onError: (e: any) => toast({ title: "Reminder failed", description: String(e.message || e), variant: "destructive" }),
    onSettled: () => setChasing(null),
  });

  const remindAllMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/lms/remind-overdue").then((r) => r.json()),
    onSuccess: (res: any) => { toast({ title: `Reminders sent`, description: `${res.sent} sent, ${res.failed} failed` }); qc.invalidateQueries({ queryKey: ["/api/admin/lms/matrix"] }); },
    onError: (e: any) => toast({ title: "Bulk reminder failed", description: String(e.message || e), variant: "destructive" }),
  });

  const summary = useMemo(() => {
    const cells = data?.cells || [];
    return {
      total: cells.length,
      completed: cells.filter((c) => c.status === "completed").length,
      overdue: cells.filter((c) => c.status === "overdue").length,
    };
  }, [data]);

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8 space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Reports</p>
          <h1 className="font-serif text-3xl font-light tracking-tight flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-primary" /> Training Courses
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Completion across every assigned course. Chase outstanding learners.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/arcade/admin/courses">
            <Button variant="outline" size="sm"><LinkIcon className="h-4 w-4 mr-1" /> Course builder</Button>
          </Link>
          <SuperAdminGate>
            <Button size="sm" onClick={() => remindAllMutation.mutate()} disabled={remindAllMutation.isPending || summary.overdue === 0} data-testid="button-remind-all">
              {remindAllMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              Chase all outstanding
            </Button>
          </SuperAdminGate>
        </div>
      </div>

      <SuperAdminViewOnlyBanner />

      <div className="flex gap-3 flex-wrap">
        {([
          ["Assignments", summary.total],
          ["Completed", summary.completed],
          ["Overdue", summary.overdue],
        ] as const).map(([label, n]) => (
          <Card key={label} className="flex-1 min-w-[140px]"><CardContent className="p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground/60">{label}</div>
            <div className="font-serif text-2xl font-light">{n}</div>
          </CardContent></Card>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.courses.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">
          No courses yet. <Link href="/arcade/admin/courses" className="text-primary underline">Create one</Link>.
        </CardContent></Card>
      ) : visibleNurses.length === 0 ? (
        <Card><CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            {data.courses.length === 1 ? "This course hasn't" : "These courses haven't"} been assigned to anyone yet. Assign from the{" "}
            <Link href="/arcade/admin/courses" className="text-primary underline">course builder</Link> to start tracking completion here.
          </p>
          <div className="grid gap-2">
            {data.courses.map((c) => (
              <Link key={c.id} href="/arcade/admin/courses">
                <div className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors cursor-pointer" data-testid={`unassigned-course-${c.id}`}>
                  <GraduationCap className="h-4 w-4 text-primary shrink-0" />
                  <span className="flex-1 font-medium truncate">{c.title}</span>
                  <Badge variant="outline" className="text-[9px]">{c.sourceType}</Badge>
                  {!c.isActive && <Badge variant="outline" className="text-[9px]">Inactive</Badge>}
                </div>
              </Link>
            ))}
          </div>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 bg-card text-left p-3 font-medium min-w-[180px] z-10">Nurse</th>
                {data.courses.map((c) => (
                  <th key={c.id} className="p-3 text-center font-medium min-w-[110px]">
                    <div className="truncate max-w-[140px] mx-auto" title={c.title}>{c.title}</div>
                    <Badge variant="outline" className="text-[9px] mt-1">{c.sourceType}</Badge>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleNurses.map((n) => (
                <tr key={n.id} className="border-b hover:bg-muted/20" data-testid={`matrix-row-${n.id}`}>
                  <td className="sticky left-0 bg-card p-3 font-medium z-10">
                    <Link href={`/nurses/${n.id}`} className="hover:text-primary">{n.fullName}</Link>
                  </td>
                  {data.courses.map((c) => {
                    const cell = cellMap.get(`${n.id}::${c.id}`);
                    if (!cell) return <td key={c.id} className="p-3 text-center text-muted-foreground/30">—</td>;
                    const meta = CELL[cell.status];
                    return (
                      <td key={c.id} className="p-2 text-center" data-testid={`matrix-cell-${n.id}-${c.id}`}>
                        <div className="flex flex-col items-center gap-1">
                          <span className="inline-flex items-center gap-1.5" title={`${meta.label}${cell.dueDate ? ` · due ${cell.dueDate}` : ""}`}>
                            <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                            <span className="text-[11px] text-muted-foreground">{meta.label}</span>
                          </span>
                          {cell.status !== "completed" && (
                            <SuperAdminGate>
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" disabled={chasing === cell.assignmentId} onClick={() => { setChasing(cell.assignmentId); remindMutation.mutate(cell.assignmentId); }} data-testid={`button-remind-${cell.assignmentId}`}>
                                {chasing === cell.assignmentId ? <Loader2 className="h-3 w-3 animate-spin" /> : "Chase"}
                              </Button>
                            </SuperAdminGate>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}
