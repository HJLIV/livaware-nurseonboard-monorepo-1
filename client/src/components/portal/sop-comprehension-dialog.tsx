// Modal that pops up immediately after a candidate acknowledges a SOP
// induction section, presenting the matching single-best-answer
// comprehension MCQ. Keeps the read-then-check flow together inside
// the induction page rather than as a separate sidebar surface.
//
// Behaviour:
// - If the candidate has already passed this SOP's MCQ at the current
//   question version, the dialog auto-dismisses (no annoying re-prompt).
// - Wrong answer → inline explanation + "Try again" (unlimited retries).
// - Correct answer → success state + "Continue" closes the dialog and
//   refreshes the induction list / sop-comprehension summary.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, BookOpen } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

interface PortalQuestion {
  sopSlug: string;
  sopTitle: string;
  version: string;
  vignette: string;
  options: { id: string; label: string }[];
  status: "not_attempted" | "passed" | "failed";
  attemptCount: number;
}
interface ComprehensionResponse {
  questions: PortalQuestion[];
  totalRequired: number;
  passed: number;
  outstanding: number;
}
interface AnswerResponse {
  ok: true;
  sopSlug: string;
  chosenOptionId: string;
  isCorrect: boolean;
  attemptCount: number;
  explanation: string;
  correctOptionId: string | null;
}

export function SopComprehensionDialog({
  token,
  sopSlug,
  open,
  onClose,
}: {
  token: string;
  // Slug of the SOP whose comprehension MCQ to show. `null` keeps the
  // dialog closed (caller still controls `open` for clarity).
  sopSlug: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [chosen, setChosen] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AnswerResponse | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  // Reset internal state every time the dialog is (re-)opened for a
  // new slug, so a previous question's selection doesn't leak through.
  useEffect(() => {
    if (open) {
      setChosen(null);
      setFeedback(null);
      setAcknowledged(false);
    }
  }, [open, sopSlug]);

  const { data, isLoading } = useQuery<ComprehensionResponse>({
    queryKey: [`/api/portal/${token}/sop-comprehension`],
    enabled: open && !!sopSlug,
  });

  const question = useMemo<PortalQuestion | null>(() => {
    if (!data || !sopSlug) return null;
    return data.questions.find((q) => q.sopSlug === sopSlug) ?? null;
  }, [data, sopSlug]);

  // One-shot question: if the candidate has already attempted this
  // SOP's MCQ at the current version (pass or fail), don't re-show
  // the dialog — admins see the result on the candidate page.
  useEffect(() => {
    if (open && question && question.status !== "not_attempted" && !feedback) {
      onClose();
    }
  }, [open, question, feedback, onClose]);

  const submit = useMutation({
    mutationFn: async (chosenOptionId: string): Promise<AnswerResponse> => {
      const res = await apiRequest(
        "POST",
        `/api/portal/${token}/sop-comprehension/${encodeURIComponent(sopSlug!)}/answer`,
        { chosenOptionId },
      );
      return await res.json();
    },
    onSuccess: (res) => {
      setFeedback(res);
      queryClient.invalidateQueries({ queryKey: [`/api/portal/${token}/sop-comprehension`] });
      toast({
        title: res.isCorrect ? "Correct" : "Not quite",
        description: res.isCorrect
          ? "Comprehension check passed."
          : "Read the explanation and try again.",
        variant: res.isCorrect ? "default" : "destructive",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Could not record answer",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const correctOptionId = feedback?.correctOptionId ?? null;
  const showAnswered = !!feedback;

  return (
    <Dialog open={open && !!sopSlug} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl" data-testid="sop-comp-dialog">
        <DialogHeader>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/60">
            <BookOpen className="h-3.5 w-3.5" />
            Comprehension check
          </div>
          <DialogTitle className="font-serif text-xl font-light tracking-tight">
            {question ? question.sopTitle : "Loading…"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            One quick scenario — pick the single best action. You only get one
            attempt per SOP; the explanation appears immediately so you can
            learn from it either way.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !question ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-foreground/90">{question.vignette}</p>

            <div className="space-y-2">
              {question.options.map((opt) => {
                const isChosen = chosen === opt.id;
                const isFeedbackChosen = feedback && feedback.chosenOptionId === opt.id;
                const isCorrectReveal = correctOptionId === opt.id && showAnswered;
                const isWrongChosen = isFeedbackChosen && feedback && !feedback.isCorrect;
                const tone = isCorrectReveal
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : isWrongChosen
                    ? "border-red-500/40 bg-red-500/5"
                    : isChosen
                      ? "border-primary/50 bg-primary/5"
                      : "border-border";
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={showAnswered || submit.isPending}
                    onClick={() => setChosen(opt.id)}
                    className={`w-full text-left rounded border ${tone} px-3 py-2.5 text-sm transition-colors hover-elevate disabled:cursor-not-allowed`}
                    data-testid={`dialog-option-${opt.id}`}
                  >
                    <span className="flex items-start gap-2">
                      <span className="text-xs font-mono text-muted-foreground/60 mt-0.5">
                        {opt.id.toUpperCase()}.
                      </span>
                      <span className="flex-1">{opt.label}</span>
                      {isCorrectReveal && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />}
                      {isWrongChosen && <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                    </span>
                  </button>
                );
              })}
            </div>

            {feedback && (
              <div
                className={`rounded border px-3 py-2.5 text-sm space-y-2 ${feedback.isCorrect ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400" : "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-400"}`}
                data-testid="dialog-feedback"
              >
                <p className="font-medium">
                  {feedback.isCorrect ? "Correct" : "Not quite"}
                </p>
                {correctOptionId && (() => {
                  const correctOpt = question.options.find((o) => o.id === correctOptionId);
                  if (!correctOpt) return null;
                  return (
                    <p className="leading-relaxed" data-testid="dialog-correct-answer">
                      <span className="font-medium">Correct answer — {correctOpt.id.toUpperCase()}:</span>{" "}
                      {correctOpt.label}
                    </p>
                  );
                })()}
                <div>
                  <p className="font-medium mb-0.5">Why:</p>
                  <p className="leading-relaxed">{feedback.explanation}</p>
                </div>
              </div>
            )}

            {showAnswered && (
              <label
                className="flex items-start gap-2 rounded border border-border bg-muted/30 px-3 py-2.5 text-sm cursor-pointer hover-elevate"
                data-testid="dialog-ack-row"
              >
                <Checkbox
                  checked={acknowledged}
                  onCheckedChange={(v) => setAcknowledged(v === true)}
                  data-testid="dialog-ack-checkbox"
                  className="mt-0.5"
                />
                <span className="leading-relaxed">
                  I have read the correct answer and the explanation, and I understand
                  the right course of action for this scenario.
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {!showAnswered && (
            <Button
              onClick={() => chosen && submit.mutate(chosen)}
              disabled={!chosen || submit.isPending || !question}
              data-testid="dialog-submit-comp"
            >
              Submit answer
            </Button>
          )}
          {showAnswered && (
            <Button
              onClick={onClose}
              disabled={!acknowledged}
              data-testid="dialog-continue-comp"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Continue
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
