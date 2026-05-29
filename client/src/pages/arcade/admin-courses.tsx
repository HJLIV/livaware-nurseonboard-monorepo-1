import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { SuperAdminGate } from "@/components/super-admin-only";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, GraduationCap, Link2, Loader2, Pencil, Users } from "lucide-react";

type SourceType = "internal" | "hbc" | "arcade" | "mandatory";

interface CourseRow {
  id: string;
  title: string;
  description: string;
  sourceType: SourceType;
  sourceRef: string | null;
  category: string | null;
  passThreshold: number | null;
  certificateEnabled: boolean;
  isActive: boolean;
  lessonCount: number;
  questionCount: number;
  assignedCount: number;
  completedCount: number;
}

interface LessonDraft { id?: string; title: string; content: string }
interface QuestionDraft { id?: string; prompt: string; options: string[]; correctIndex: number }

interface SourcesResponse {
  hbc: { ref: string; name: string; group?: string | null }[];
  arcade: { ref: string; name: string }[];
  mandatory: { ref: string; name: string }[];
}

interface NurseRow { id: string; fullName: string; currentStage: string }

const SOURCE_LABEL: Record<SourceType, string> = {
  internal: "In-app course",
  hbc: "HBC training",
  arcade: "Skills Arcade module",
  mandatory: "Mandatory training",
};

const SOURCE_BADGE: Record<SourceType, string> = {
  internal: "bg-primary/15 text-primary",
  hbc: "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200",
  arcade: "bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200",
  mandatory: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
};

function emptyCourse(): Partial<CourseRow> & { lessons: LessonDraft[]; questions: QuestionDraft[] } {
  return {
    title: "", description: "", sourceType: "internal", sourceRef: null,
    category: "", passThreshold: null, certificateEnabled: true, isActive: true,
    lessons: [], questions: [],
  };
}

export default function AdminCoursesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyCourse());
  const [assignFor, setAssignFor] = useState<CourseRow | null>(null);

  const coursesQuery = useQuery<CourseRow[]>({
    queryKey: ["/api/admin/lms/courses"],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  const sourcesQuery = useQuery<SourcesResponse>({
    queryKey: ["/api/admin/lms/sources"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: builderOpen,
  });

  const openNew = () => { setEditingId(null); setDraft(emptyCourse()); setBuilderOpen(true); };
  const openEdit = async (c: CourseRow) => {
    setEditingId(c.id);
    const full = await apiRequest("GET", `/api/admin/lms/courses/${c.id}`).then((r) => r.json());
    setDraft({
      title: full.title, description: full.description, sourceType: full.sourceType,
      sourceRef: full.sourceRef, category: full.category || "", passThreshold: full.passThreshold,
      certificateEnabled: full.certificateEnabled, isActive: full.isActive,
      lessons: (full.lessons || []).map((l: any) => ({ id: l.id, title: l.title, content: l.content })),
      questions: (full.questions || []).map((q: any) => ({ id: q.id, prompt: q.prompt, options: q.options, correctIndex: q.correctIndex })),
    });
    setBuilderOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: any = {
        title: draft.title,
        description: draft.description,
        sourceType: draft.sourceType,
        sourceRef: draft.sourceType === "internal" ? null : draft.sourceRef,
        category: draft.category || null,
        passThreshold: draft.sourceType === "internal" && (draft.questions?.length || 0) > 0 ? draft.passThreshold : null,
        certificateEnabled: draft.certificateEnabled,
        isActive: draft.isActive,
      };
      if (draft.sourceType === "internal") {
        body.lessons = draft.lessons;
        body.questions = draft.questions;
      }
      if (editingId) return apiRequest("PUT", `/api/admin/lms/courses/${editingId}`, body).then((r) => r.json());
      return apiRequest("POST", "/api/admin/lms/courses", body).then((r) => r.json());
    },
    onSuccess: () => {
      toast({ title: editingId ? "Course updated" : "Course created" });
      qc.invalidateQueries({ queryKey: ["/api/admin/lms/courses"] });
      setBuilderOpen(false);
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e.message || e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/admin/lms/courses/${id}`),
    onSuccess: () => { toast({ title: "Course deleted" }); qc.invalidateQueries({ queryKey: ["/api/admin/lms/courses"] }); },
    onError: (e: any) => toast({ title: "Delete failed", description: String(e.message || e), variant: "destructive" }),
  });

  const valid = !!draft.title?.trim() && (draft.sourceType === "internal" || !!draft.sourceRef);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">Training</p>
          <h1 className="font-serif text-3xl font-light tracking-tight flex items-center gap-2">
            <GraduationCap className="h-7 w-7 text-primary" /> Training Courses
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Build in-app courses or link existing training, then assign to nurses with due dates.
          </p>
        </div>
        <SuperAdminGate>
          <Button onClick={openNew} data-testid="button-new-course"><Plus className="h-4 w-4 mr-1" /> New course</Button>
        </SuperAdminGate>
      </div>

      {coursesQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !coursesQuery.data || coursesQuery.data.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground text-sm">
          No training courses yet. Create one to get started.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {coursesQuery.data.map((c) => (
            <Card key={c.id} data-testid={`row-course-${c.id}`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{c.title}</span>
                    <Badge className={SOURCE_BADGE[c.sourceType]} variant="secondary">{SOURCE_LABEL[c.sourceType]}</Badge>
                    {!c.isActive && <Badge variant="outline">Inactive</Badge>}
                    {c.certificateEnabled && <Badge variant="outline">Certificate</Badge>}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {c.sourceType === "internal" && `${c.lessonCount} lesson${c.lessonCount === 1 ? "" : "s"}`}
                    {c.sourceType === "internal" && c.questionCount > 0 && ` · ${c.questionCount} quiz question${c.questionCount === 1 ? "" : "s"}`}
                    {c.sourceType !== "internal" && "Linked course"}
                    {` · ${c.completedCount}/${c.assignedCount} completed`}
                  </div>
                </div>
                <SuperAdminGate>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setAssignFor(c)} data-testid={`button-assign-${c.id}`}>
                      <Users className="h-4 w-4 mr-1" /> Assign
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)} data-testid={`button-edit-${c.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete "${c.title}"? This removes all assignments.`)) deleteMutation.mutate(c.id); }} data-testid={`button-delete-${c.id}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </SuperAdminGate>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Builder dialog */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit course" : "New training course"}</DialogTitle>
            <DialogDescription>In-app courses have lessons and an optional quiz. Linked courses track completion from the source system.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Title</Label>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} data-testid="input-course-title" />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} data-testid="input-course-description" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Course type</Label>
                <Select value={draft.sourceType} onValueChange={(v) => setDraft({ ...draft, sourceType: v as SourceType, sourceRef: null })}>
                  <SelectTrigger data-testid="select-source-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["internal", "hbc", "arcade", "mandatory"] as SourceType[]).map((t) => (
                      <SelectItem key={t} value={t}>{SOURCE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Category (optional)</Label>
                <Input value={draft.category || ""} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="e.g. Clinical" />
              </div>
            </div>

            {draft.sourceType !== "internal" && (
              <div className="grid gap-2">
                <Label className="flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> Linked item</Label>
                <Select value={draft.sourceRef || ""} onValueChange={(v) => setDraft({ ...draft, sourceRef: v })}>
                  <SelectTrigger data-testid="select-source-ref">
                    <SelectValue placeholder={sourcesQuery.isLoading ? "Loading…" : "Select an item to link"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(sourcesQuery.data?.[draft.sourceType as "hbc" | "arcade" | "mandatory"] || []).map((s) => (
                      <SelectItem key={s.ref} value={s.ref}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {draft.sourceType === "internal" && (
              <>
                <LessonEditor lessons={draft.lessons} onChange={(lessons) => setDraft({ ...draft, lessons })} />
                <QuestionEditor
                  questions={draft.questions}
                  passThreshold={draft.passThreshold ?? null}
                  onChangeQuestions={(questions) => setDraft({ ...draft, questions })}
                  onChangeThreshold={(passThreshold) => setDraft({ ...draft, passThreshold })}
                />
              </>
            )}

            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={draft.certificateEnabled} onCheckedChange={(v) => setDraft({ ...draft, certificateEnabled: !!v })} data-testid="checkbox-certificate" />
                Issue certificate on completion
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={draft.isActive} onCheckedChange={(v) => setDraft({ ...draft, isActive: !!v })} data-testid="checkbox-active" />
                Active
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBuilderOpen(false)}>Cancel</Button>
            <Button disabled={!valid || saveMutation.isPending} onClick={() => saveMutation.mutate()} data-testid="button-save-course">
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingId ? "Save changes" : "Create course"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {assignFor && <AssignDialog course={assignFor} onClose={() => setAssignFor(null)} onAssigned={() => { qc.invalidateQueries({ queryKey: ["/api/admin/lms/courses"] }); }} />}
    </div>
  );
}

function LessonEditor({ lessons, onChange }: { lessons: LessonDraft[]; onChange: (l: LessonDraft[]) => void }) {
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Lessons</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lessons, { title: "", content: "" }])} data-testid="button-add-lesson">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add lesson
        </Button>
      </div>
      {lessons.length === 0 && <p className="text-xs text-muted-foreground">No lessons yet.</p>}
      {lessons.map((l, i) => (
        <div key={i} className="rounded-md border p-2 space-y-2 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-6">{i + 1}.</span>
            <Input value={l.title} placeholder="Lesson title" onChange={(e) => { const next = [...lessons]; next[i] = { ...l, title: e.target.value }; onChange(next); }} data-testid={`input-lesson-title-${i}`} />
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(lessons.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
          <Textarea rows={3} value={l.content} placeholder="Lesson content (plain text)" onChange={(e) => { const next = [...lessons]; next[i] = { ...l, content: e.target.value }; onChange(next); }} data-testid={`input-lesson-content-${i}`} />
        </div>
      ))}
    </div>
  );
}

function QuestionEditor({
  questions, passThreshold, onChangeQuestions, onChangeThreshold,
}: {
  questions: QuestionDraft[];
  passThreshold: number | null;
  onChangeQuestions: (q: QuestionDraft[]) => void;
  onChangeThreshold: (n: number | null) => void;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Quiz (optional)</Label>
        <Button type="button" variant="outline" size="sm" onClick={() => onChangeQuestions([...questions, { prompt: "", options: ["", ""], correctIndex: 0 }])} data-testid="button-add-question">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add question
        </Button>
      </div>
      {questions.length === 0 && <p className="text-xs text-muted-foreground">No quiz — course completes when all lessons are read.</p>}
      {questions.length > 0 && (
        <div className="flex items-center gap-2">
          <Label className="text-xs">Pass mark (%)</Label>
          <Input type="number" min={0} max={100} className="w-24" value={passThreshold ?? 80} onChange={(e) => onChangeThreshold(e.target.value === "" ? null : Number(e.target.value))} data-testid="input-pass-threshold" />
        </div>
      )}
      {questions.map((q, i) => (
        <div key={i} className="rounded-md border p-2 space-y-2 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-6">Q{i + 1}</span>
            <Input value={q.prompt} placeholder="Question prompt" onChange={(e) => { const next = [...questions]; next[i] = { ...q, prompt: e.target.value }; onChangeQuestions(next); }} data-testid={`input-question-prompt-${i}`} />
            <Button type="button" variant="ghost" size="icon" onClick={() => onChangeQuestions(questions.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
          <div className="space-y-1 pl-8">
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <input type="radio" name={`correct-${i}`} checked={q.correctIndex === oi} onChange={() => { const next = [...questions]; next[i] = { ...q, correctIndex: oi }; onChangeQuestions(next); }} title="Correct answer" />
                <Input value={opt} placeholder={`Option ${oi + 1}`} onChange={(e) => { const next = [...questions]; const opts = [...q.options]; opts[oi] = e.target.value; next[i] = { ...q, options: opts }; onChangeQuestions(next); }} data-testid={`input-option-${i}-${oi}`} />
                {q.options.length > 2 && <Button type="button" variant="ghost" size="icon" onClick={() => { const next = [...questions]; next[i] = { ...q, options: q.options.filter((_, j) => j !== oi), correctIndex: Math.min(q.correctIndex, q.options.length - 2) }; onChangeQuestions(next); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={() => { const next = [...questions]; next[i] = { ...q, options: [...q.options, ""] }; onChangeQuestions(next); }}>+ Add option</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AssignDialog({ course, onClose, onAssigned }: { course: CourseRow; onClose: () => void; onAssigned: () => void }) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState("");
  const [filter, setFilter] = useState("");

  const nursesQuery = useQuery<NurseRow[]>({
    queryKey: ["/api/candidates"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const nurses = useMemo(() => {
    const list = nursesQuery.data || [];
    const f = filter.trim().toLowerCase();
    return f ? list.filter((n) => n.fullName.toLowerCase().includes(f)) : list;
  }, [nursesQuery.data, filter]);

  const assignMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/admin/lms/assignments", {
      courseId: course.id, nurseIds: Array.from(selected), dueDate: dueDate || null,
    }).then((r) => r.json()),
    onSuccess: (res: any) => {
      toast({ title: `Assigned to ${res.created ?? selected.size} nurse(s)` });
      onAssigned();
      onClose();
    },
    onError: (e: any) => toast({ title: "Assign failed", description: String(e.message || e), variant: "destructive" }),
  });

  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign "{course.title}"</DialogTitle>
          <DialogDescription>Select nurses and an optional due date.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label>Due date (optional)</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="input-due-date" />
          </div>
          <Input placeholder="Search nurses…" value={filter} onChange={(e) => setFilter(e.target.value)} data-testid="input-nurse-filter" />
          <div className="rounded-lg border divide-y max-h-72 overflow-y-auto">
            {nursesQuery.isLoading ? <div className="p-4"><Skeleton className="h-6 w-full" /></div> : nurses.map((n) => (
              <label key={n.id} className="flex items-center gap-3 p-2.5 hover:bg-muted/30 cursor-pointer" data-testid={`assign-nurse-${n.id}`}>
                <Checkbox checked={selected.has(n.id)} onCheckedChange={() => toggle(n.id)} />
                <span className="flex-1 text-sm">{n.fullName}</span>
                <Badge variant="outline" className="text-[10px]">{n.currentStage}</Badge>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={selected.size === 0 || assignMutation.isPending} onClick={() => assignMutation.mutate()} data-testid="button-confirm-assign">
            {assignMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Assign {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
