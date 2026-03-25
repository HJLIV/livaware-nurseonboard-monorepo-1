import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  User,
  FileText,
  Loader2,
  ClipboardCheck,
  ArrowLeft,
  ShieldAlert,
  XCircle,
  Info,
  CalendarDays,
  TrendingUp,
} from "lucide-react";

interface RemediationItem {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  moduleName: string;
  moduleId: string;
  status: string;
  lockedAt: string;
  failedAttempts: number;
  majorErrors: number;
  completedAt: string | null;
}

interface CaseDetails {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  moduleName: string;
  moduleId: string;
  status: string;
  lockedAt: string;
  completedAt: string | null;
  attempts: Array<{
    id: string;
    startedAt: string;
    submittedAt: string | null;
    result: string | null;
    minorCount: number;
    majorCount: number;
  }>;
  notes: Array<{
    id: string;
    note: string;
    trainingDate: string | null;
    competencyOutcome: string | null;
    createdAt: string;
  }>;
  totalMajors: number;
  totalMinors: number;
}

export default function TrainerRemediation() {
  const { toast } = useToast();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [outcome, setOutcome] = useState<string>("");
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);

  const { data: cases, isLoading } = useQuery<RemediationItem[]>({
    queryKey: ["/api/trainer/remediation-queue"],
  });

  const { data: caseDetails, isLoading: loadingDetails } = useQuery<CaseDetails>({
    queryKey: ["/api/trainer/remediation", selectedCaseId, "details"],
    enabled: !!selectedCaseId,
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({ caseId, note }: { caseId: string; note: string }) => {
      await apiRequest("POST", `/api/trainer/remediation/${caseId}/note`, { note });
    },
    onSuccess: () => {
      toast({ title: "Note added" });
      setNoteText("");
      setShowNoteDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/remediation-queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/remediation", selectedCaseId, "details"] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async ({ caseId, competencyOutcome }: { caseId: string; competencyOutcome: string }) => {
      await apiRequest("POST", `/api/trainer/remediation/${caseId}/complete`, { competencyOutcome });
    },
    onSuccess: () => {
      toast({ title: "Remediation completed", description: "Clearance status updated." });
      setShowCompleteDialog(false);
      setSelectedCaseId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/trainer/remediation-queue"] });
    },
  });

  const openCases = cases?.filter((c) => c.status !== "completed") ?? [];
  const completedCases = cases?.filter((c) => c.status === "completed") ?? [];

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
    );
  }

  if (selectedCaseId) {
    const caseItem = cases?.find((c) => c.id === selectedCaseId);

    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setSelectedCaseId(null)} data-testid="button-back-queue">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to queue
        </Button>

        {loadingDetails ? (
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-48" />
          </div>
        ) : caseDetails ? (
          <>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-11 h-11 rounded-md bg-amber-500/10 shrink-0">
                      <User className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <h1 className="text-lg font-bold" data-testid="text-case-nurse-name">{caseDetails.userName}</h1>
                      <p className="text-xs text-muted-foreground">{caseDetails.userEmail}</p>
                      <p className="text-sm font-medium mt-1" data-testid="text-case-module">{caseDetails.moduleName}</p>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={caseDetails.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400"}
                    data-testid="badge-case-status"
                  >
                    {caseDetails.status === "completed" ? (
                      <><CheckCircle2 className="w-3 h-3 mr-1" /> Completed</>
                    ) : caseDetails.status === "in_progress" ? (
                      <><Clock className="w-3 h-3 mr-1" /> In Progress</>
                    ) : (
                      <><AlertTriangle className="w-3 h-3 mr-1" /> Awaiting Training</>
                    )}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <div className="p-3 bg-muted/50 rounded-md">
                    <p className="text-xs text-muted-foreground">Total Attempts</p>
                    <p className="text-lg font-bold" data-testid="text-total-attempts">{caseDetails.attempts.length}</p>
                  </div>
                  <div className="p-3 bg-destructive/5 rounded-md">
                    <p className="text-xs text-muted-foreground">Total Major Errors</p>
                    <p className="text-lg font-bold text-destructive" data-testid="text-total-majors">{caseDetails.totalMajors}</p>
                  </div>
                  <div className="p-3 bg-amber-500/5 rounded-md">
                    <p className="text-xs text-muted-foreground">Total Minor Errors</p>
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400" data-testid="text-total-minors">{caseDetails.totalMinors}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-md">
                    <p className="text-xs text-muted-foreground">Locked Since</p>
                    <p className="text-sm font-semibold" data-testid="text-locked-since">{new Date(caseDetails.lockedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Attempt Timeline</h2>
                {caseDetails.attempts.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center text-sm text-muted-foreground">No attempts recorded</CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {caseDetails.attempts.map((att, i) => (
                      <Card key={att.id} data-testid={`card-attempt-${i}`}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${
                                att.result === "pass" ? "bg-emerald-500" : att.result === "fail" ? "bg-destructive" : "bg-muted-foreground"
                              }`} />
                              <span className="text-sm font-medium">
                                Attempt {caseDetails.attempts.length - i}
                              </span>
                              <Badge variant="secondary" className={
                                att.result === "pass"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : att.result === "fail"
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-muted text-muted-foreground"
                              }>
                                {att.result === "pass" ? "Pass" : att.result === "fail" ? "Fail" : "Incomplete"}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {att.submittedAt ? new Date(att.submittedAt).toLocaleString() : new Date(att.startedAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                            <span className="text-destructive">{att.majorCount} major</span>
                            <span className="text-amber-600 dark:text-amber-400">{att.minorCount} minor</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {caseDetails.attempts.length >= 2 && (
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-muted-foreground" />
                        <p className="text-xs font-medium text-muted-foreground">Pattern Summary</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {caseDetails.totalMajors > caseDetails.totalMinors
                          ? "Repeated major errors suggest a fundamental gap in understanding of this procedure. Focus face-to-face training on critical safety steps."
                          : caseDetails.totalMinors > 6
                            ? "High minor error count suggests the procedure is partially understood but needs refinement. Focus on technique and sequencing."
                            : "Error pattern shows a mix of issues. Review each attempt's feedback to identify the specific areas that need practice."}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Training Notes</h2>
                {caseDetails.notes.length === 0 ? (
                  <Card>
                    <CardContent className="p-6 text-center text-sm text-muted-foreground">No training notes recorded yet</CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {caseDetails.notes.map((note) => (
                      <Card key={note.id} data-testid={`card-note-${note.id}`}>
                        <CardContent className="p-3">
                          <p className="text-sm">{note.note}</p>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {new Date(note.createdAt).toLocaleString()}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {caseDetails.status !== "completed" && (
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => {
                    setNoteText("");
                    setShowNoteDialog(true);
                  }}
                  data-testid="button-add-note"
                >
                  <FileText className="w-4 h-4 mr-1" /> Add Training Note
                </Button>
                <Button
                  onClick={() => {
                    setOutcome("");
                    setShowCompleteDialog(true);
                  }}
                  data-testid="button-record-signoff"
                >
                  <ClipboardCheck className="w-4 h-4 mr-1" /> Record Sign-off
                </Button>
              </div>
            )}
          </>
        ) : null}

        {showNoteDialog && selectedCaseId && (
          <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Training Note</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {caseItem?.userName} &#8212; {caseItem?.moduleName}
                </p>
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Record training details, observations, or feedback..."
                  className="min-h-[100px]"
                  data-testid="textarea-note"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNoteDialog(false)}>Cancel</Button>
                <Button
                  onClick={() => addNoteMutation.mutate({ caseId: selectedCaseId, note: noteText })}
                  disabled={!noteText.trim() || addNoteMutation.isPending}
                  data-testid="button-save-note"
                >
                  {addNoteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  Save Note
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {showCompleteDialog && selectedCaseId && (
          <Dialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Competency Sign-off</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {caseItem?.userName} &#8212; {caseItem?.moduleName}
                </p>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Observed Competency Outcome</label>
                  <Select value={outcome} onValueChange={setOutcome}>
                    <SelectTrigger data-testid="select-outcome">
                      <SelectValue placeholder="Select outcome" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cleared">Cleared &#8212; Safe for independent practice</SelectItem>
                      <SelectItem value="restricted">Restricted &#8212; Needs more supervision</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Training and assessment notes..."
                  className="min-h-[80px]"
                  data-testid="textarea-signoff-note"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCompleteDialog(false)}>Cancel</Button>
                <Button
                  onClick={() => completeMutation.mutate({
                    caseId: selectedCaseId,
                    competencyOutcome: outcome,
                  })}
                  disabled={!outcome || completeMutation.isPending}
                  data-testid="button-confirm-signoff"
                >
                  {completeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                  Confirm Sign-off
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">Pre-Induction</p>
        <h1 className="font-serif text-2xl font-light tracking-tight" data-testid="text-remediation-title">Remediation Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Nurses requiring face-to-face training and sign-off
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Open Cases</p>
            <p className="font-serif text-2xl font-light mt-1 text-amber-600 dark:text-amber-400" data-testid="text-open-cases">{openCases.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Completed</p>
            <p className="font-serif text-2xl font-light mt-1 text-emerald-600 dark:text-emerald-400" data-testid="text-completed-cases">{completedCases.length}</p>
          </CardContent>
        </Card>
      </div>

      {openCases.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-3" />
            <p className="text-muted-foreground">No open remediation cases</p>
          </CardContent>
        </Card>
      )}

      {openCases.map((c) => (
        <Card key={c.id} className="hover-elevate cursor-pointer" data-testid={`card-remediation-${c.id}`} onClick={() => setSelectedCaseId(c.id)}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-amber-500/10 shrink-0">
                  <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm" data-testid={`text-nurse-name-${c.id}`}>{c.userName}</h3>
                  <p className="text-xs text-muted-foreground">{c.userEmail}</p>
                  <p className="text-xs text-muted-foreground mt-1">Module: <strong className="text-foreground">{c.moduleName}</strong></p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Clock className="w-3 h-3 mr-1" />
                {c.status === "open" ? "Awaiting Training" : "In Progress"}
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span>{c.failedAttempts} failed attempts</span>
              <span>Locked {new Date(c.lockedAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center justify-end mt-2">
              <Button size="sm" variant="ghost" data-testid={`button-view-${c.id}`}>
                View details
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {completedCases.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mt-4">Completed Cases</h2>
          {completedCases.map((c) => (
            <Card key={c.id} className="opacity-75 hover-elevate cursor-pointer" data-testid={`card-completed-${c.id}`} onClick={() => setSelectedCaseId(c.id)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="font-semibold text-sm">{c.userName}</h3>
                    <p className="text-xs text-muted-foreground">{c.moduleName}</p>
                  </div>
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Completed
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
