// SOP comprehension MCQ — portal (nurse-facing) + admin endpoints.
//
// Task 114 follow-up. Standalone from the Skills Arcade gate by
// design: this is a quick-fire understanding check on each SOP, not a
// gating step. Pass = chose the correct option once; the latest
// attempt at the current question version drives status. All attempts
// are persisted for audit.

import type { Express, Request } from "express";
import { db } from "../db";
import {
  sopComprehensionAttempts,
  type SopComprehensionAttempt,
} from "@shared/schema";
import { and, eq, desc } from "drizzle-orm";
import { requireAdmin, validatePortalToken } from "../middleware";
import { logAction } from "../services/audit";
import {
  SOP_COMPREHENSION_QUESTIONS,
  getSopComprehensionQuestion,
  type SopComprehensionQuestion,
} from "../sop-comprehension-content";

interface PortalQuestion {
  sopSlug: string;
  sopTitle: string;
  version: string;
  vignette: string;
  // Options stripped of `isCorrect` and `explanation` so the nurse
  // can't read the answer out of the response payload.
  options: { id: string; label: string }[];
  status: "not_attempted" | "passed" | "failed";
  attemptCount: number;
  lastAttemptAt: string | null;
  // Reveal-after-answer: only populated for the row(s) the nurse has
  // already answered correctly OR for the most-recent wrong attempt
  // (so the teaching explanation is shown when they retry).
  lastChosenOptionId: string | null;
  lastWasCorrect: boolean | null;
}

function stripOptions(q: SopComprehensionQuestion) {
  return q.options.map((o) => ({ id: o.id, label: o.label }));
}

function agentFor(req: Request): string {
  return req.session?.username || "portal";
}

async function loadAttemptsForNurse(nurseId: string): Promise<SopComprehensionAttempt[]> {
  return db
    .select()
    .from(sopComprehensionAttempts)
    .where(eq(sopComprehensionAttempts.nurseId, nurseId))
    .orderBy(desc(sopComprehensionAttempts.attemptedAt));
}

function buildPortalQuestion(
  q: SopComprehensionQuestion,
  attempts: SopComprehensionAttempt[],
): PortalQuestion {
  const sameVersion = attempts.filter(
    (a) => a.sopSlug === q.sopSlug && a.questionVersion === q.version,
  );
  const passed = sameVersion.find((a) => a.isCorrect) ?? null;
  const latest = sameVersion[0] ?? null;
  const status: PortalQuestion["status"] = passed
    ? "passed"
    : latest
      ? "failed"
      : "not_attempted";
  return {
    sopSlug: q.sopSlug,
    sopTitle: q.sopTitle,
    version: q.version,
    vignette: q.vignette,
    options: stripOptions(q),
    status,
    attemptCount: sameVersion.length,
    lastAttemptAt: latest ? latest.attemptedAt.toISOString() : null,
    lastChosenOptionId: latest ? latest.chosenOptionId : null,
    lastWasCorrect: latest ? latest.isCorrect : null,
  };
}

export function registerSopComprehensionRoutes(app: Express): void {
  // ─── Portal: list questions + per-nurse status ───
  app.get("/api/portal/:token/sop-comprehension", validatePortalToken, async (req, res) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const attempts = await loadAttemptsForNurse(nurseId);
      const questions = SOP_COMPREHENSION_QUESTIONS.map((q) =>
        buildPortalQuestion(q, attempts),
      );
      const passed = questions.filter((q) => q.status === "passed").length;
      res.json({
        questions,
        totalRequired: questions.length,
        passed,
        outstanding: questions.length - passed,
      });
    } catch (err: any) {
      console.error("[sop-comprehension] portal list failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load comprehension questions" });
    }
  });

  // ─── Portal: submit answer ───
  app.post("/api/portal/:token/sop-comprehension/:slug/answer", validatePortalToken, async (req, res) => {
    try {
      const nurseId = (req as any).nurseId as string;
      const slug = String(req.params.slug);
      const chosenOptionId = String(req.body?.chosenOptionId ?? "").trim();
      if (!chosenOptionId) {
        return res.status(400).json({ message: "chosenOptionId is required" });
      }
      const question = getSopComprehensionQuestion(slug);
      if (!question) {
        return res.status(404).json({ message: "Unknown SOP comprehension slug" });
      }
      const option = question.options.find((o) => o.id === chosenOptionId);
      if (!option) {
        return res.status(400).json({ message: "Invalid option id for this question" });
      }
      // attemptCount = prior attempts at the current version + 1
      const prior = await db
        .select()
        .from(sopComprehensionAttempts)
        .where(and(
          eq(sopComprehensionAttempts.nurseId, nurseId),
          eq(sopComprehensionAttempts.sopSlug, slug),
          eq(sopComprehensionAttempts.questionVersion, question.version),
        ));
      const attemptCount = prior.length + 1;
      await db.insert(sopComprehensionAttempts).values({
        nurseId,
        sopSlug: slug,
        questionVersion: question.version,
        chosenOptionId,
        isCorrect: option.isCorrect,
        attemptCount,
        ipAddress: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
      });
      const auditAction = option.isCorrect ? "sop_comprehension_passed" : "sop_comprehension_failed";
      const auditAgent = agentFor(req);
      console.log("[sop-comprehension] audit args:", { nurseId, type: typeof nurseId, auditAction, auditAgent });
      try {
        await logAction(
          nurseId,
          "portal",
          auditAction,
          auditAgent,
          {
            sopSlug: slug,
            sopTitle: question.sopTitle,
            questionVersion: question.version,
            chosenOptionId,
            attemptCount,
          },
        );
      } catch (auditErr: any) {
        // Audit failure must NOT block the candidate's answer flow —
        // the attempt itself is already persisted in
        // sopComprehensionAttempts above. Log and carry on.
        console.error("[sop-comprehension] audit logging failed (non-fatal):", auditErr?.message || auditErr);
      }
      // Echo the correctness + the per-option explanation so the
      // portal can render the teaching feedback inline.
      res.json({
        ok: true,
        sopSlug: slug,
        chosenOptionId,
        isCorrect: option.isCorrect,
        attemptCount,
        explanation: option.explanation,
        // Always reveal the correct option after answering — the
        // teaching value of the question depends on it.
        correctOptionId: question.options.find((o) => o.isCorrect)?.id ?? null,
      });
    } catch (err: any) {
      console.error("[sop-comprehension] answer submit failed:", err);
      res.status(500).json({ message: err?.message || "Failed to record answer" });
    }
  });

  // ─── Admin: per-nurse status ───
  app.get("/api/nurses/:id/sop-comprehension", requireAdmin, async (req, res) => {
    try {
      const nurseId = String(req.params.id);
      const attempts = await loadAttemptsForNurse(nurseId);
      const rows = SOP_COMPREHENSION_QUESTIONS.map((q) => {
        const sameVersion = attempts.filter(
          (a) => a.sopSlug === q.sopSlug && a.questionVersion === q.version,
        );
        const passed = sameVersion.find((a) => a.isCorrect) ?? null;
        const latest = sameVersion[0] ?? null;
        const correctOpt = q.options.find((o) => o.isCorrect) ?? null;
        const chosenOpt = latest
          ? q.options.find((o) => o.id === latest.chosenOptionId) ?? null
          : null;
        return {
          sopSlug: q.sopSlug,
          sopTitle: q.sopTitle,
          version: q.version,
          principle: q.principle,
          vignette: q.vignette,
          status: (passed ? "passed" : latest ? "failed" : "not_attempted") as
            | "passed" | "failed" | "not_attempted",
          attemptCount: sameVersion.length,
          firstPassedAt: passed ? passed.attemptedAt.toISOString() : null,
          lastAttemptAt: latest ? latest.attemptedAt.toISOString() : null,
          // Reveal what the candidate picked vs. the correct answer so the
          // admin panel can show "Chose B (wrong) — Correct: A" inline.
          chosenOptionId: latest?.chosenOptionId ?? null,
          chosenOptionLabel: chosenOpt?.label ?? null,
          chosenWasCorrect: latest?.isCorrect ?? null,
          chosenExplanation: chosenOpt?.explanation ?? null,
          correctOptionId: correctOpt?.id ?? null,
          correctOptionLabel: correctOpt?.label ?? null,
          correctExplanation: correctOpt?.explanation ?? null,
        };
      });
      const passed = rows.filter((r) => r.status === "passed").length;
      res.json({
        questions: rows,
        totalRequired: rows.length,
        passed,
        outstanding: rows.length - passed,
      });
    } catch (err: any) {
      console.error("[sop-comprehension] admin per-nurse failed:", err);
      res.status(500).json({ message: err?.message || "Failed to load comprehension status" });
    }
  });
}
