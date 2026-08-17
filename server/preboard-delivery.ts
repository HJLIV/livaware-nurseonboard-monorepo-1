import { db } from "./db";
import { preboardAssessments, type Assessment } from "@shared/schema";
import { eq } from "drizzle-orm";
import { analyzeAssessment } from "./preboard-ai";
import { sendEmail } from "./preboard-outlook";
import { buildEmailHtml } from "./preboard-email-template";
import { generatePdfReport } from "./preboard-pdf-report";
import { getSuspectBurstCharThreshold } from "./preboard-integrity-settings";
import { logAction } from "./services/audit";

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 500;

function getRecipientEmail(): string {
  return process.env.REPORT_EMAIL || "";
}

function isTransientError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err || "")).toLowerCase();
  if (!msg) return false;
  if (
    msg.includes("overloaded") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("econn") ||
    msg.includes("etimedout") ||
    msg.includes("network") ||
    msg.includes("socket hang up") ||
    msg.includes("rate limit") ||
    msg.includes("throttl")
  ) {
    return true;
  }
  // HTTP-style 5xx / 429 codes appearing anywhere in the message.
  if (/\b(429|5\d\d)\b/.test(msg)) return true;
  const status = (err as { status?: number; statusCode?: number } | null)?.status
    ?? (err as { status?: number; statusCode?: number } | null)?.statusCode;
  if (typeof status === "number" && (status === 429 || status >= 500)) return true;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(
  fn: (attempt: number) => Promise<T>,
  label: string,
): Promise<{ value: T; attempts: number }> {
  let lastErr: unknown;
  let attemptsMade = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attemptsMade = attempt;
    try {
      const value = await fn(attempt);
      return { value, attempts: attempt };
    } catch (err) {
      lastErr = err;
      const transient = isTransientError(err);
      const willRetry = transient && attempt < MAX_ATTEMPTS;
      console.error(
        `[Preboard] ${label} attempt ${attempt}/${MAX_ATTEMPTS} failed${willRetry ? " — retrying" : ""}:`,
        err instanceof Error ? err.message : err,
      );
      if (!willRetry) break;
      await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1));
    }
  }
  const err = lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  (err as Error & { attemptsMade?: number }).attemptsMade = attemptsMade;
  throw err;
}

function getAttempts(err: unknown): number {
  const a = (err as { attemptsMade?: number } | null)?.attemptsMade;
  return typeof a === "number" && a > 0 ? a : 1;
}

async function loadAssessment(id: number): Promise<Assessment | undefined> {
  const [row] = await db.select().from(preboardAssessments).where(eq(preboardAssessments.id, id));
  return row;
}

export async function runAiStep(assessmentId: number): Promise<Assessment | undefined> {
  const assessment = await loadAssessment(assessmentId);
  if (!assessment) return undefined;

  await db.update(preboardAssessments)
    .set({ aiStatus: "pending", aiAttemptedAt: new Date() })
    .where(eq(preboardAssessments.id, assessmentId));

  try {
    const { value: analysis, attempts } = await withRetries(
      () => analyzeAssessment(assessment.nurseName, assessment.responses),
      `AI analyse assessment ${assessmentId}`,
    );
    const [updated] = await db.update(preboardAssessments)
      .set({
        aiAnalysis: analysis,
        aiStatus: "ok",
        aiError: null,
        aiAttempts: attempts,
        aiAttemptedAt: new Date(),
      })
      .where(eq(preboardAssessments.id, assessmentId))
      .returning();
    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = getAttempts(err);
    await db.update(preboardAssessments)
      .set({
        aiStatus: "failed",
        aiError: message.slice(0, 1000),
        aiAttempts: attempts,
        aiAttemptedAt: new Date(),
      })
      .where(eq(preboardAssessments.id, assessmentId));
    await logAction(assessment.nurseId ?? null, "preboard", "assessment_ai_failed", "system", {
      assessmentId,
      nurseName: assessment.nurseName,
      attempts,
      error: message.slice(0, 500),
    });
    throw err;
  }
}

export async function runEmailStep(assessmentId: number): Promise<Assessment | undefined> {
  const assessment = await loadAssessment(assessmentId);
  if (!assessment) return undefined;

  const recipient = getRecipientEmail();
  if (!recipient) {
    console.warn(`[Preboard] REPORT_EMAIL not configured — skipping report email for assessment ${assessmentId}`);
    const [updated] = await db.update(preboardAssessments)
      .set({
        emailStatus: "skipped_no_recipient",
        emailError: "REPORT_EMAIL environment variable is not configured",
        emailAttemptedAt: new Date(),
      })
      .where(eq(preboardAssessments.id, assessmentId))
      .returning();
    await logAction(assessment.nurseId ?? null, "preboard", "assessment_email_skipped_no_recipient", "system", {
      assessmentId,
      nurseName: assessment.nurseName,
      attempts: 0,
      error: "REPORT_EMAIL environment variable is not configured",
    });
    return updated;
  }

  await db.update(preboardAssessments)
    .set({ emailStatus: "pending", emailAttemptedAt: new Date() })
    .where(eq(preboardAssessments.id, assessmentId));

  try {
    const { attempts } = await withRetries(async () => {
      const html = buildEmailHtml(assessment);
      let attachments: { name: string; contentType: string; contentBytes: string }[] | undefined;
      try {
        const suspectBurstCharThreshold = await getSuspectBurstCharThreshold();
        const pdfBuffer = await generatePdfReport(assessment, { suspectBurstCharThreshold });
        const safeName = assessment.nurseName.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "_");
        attachments = [{
          name: `Basecamp_Assessment_${safeName}.pdf`,
          contentType: "application/pdf",
          contentBytes: pdfBuffer.toString("base64"),
        }];
      } catch (pdfErr) {
        console.error(`[Preboard] PDF generation failed for assessment ${assessmentId}, sending email without attachment:`, pdfErr);
      }
      await sendEmail(
        recipient,
        `NURSE PREBOARDING ANSWER - ${assessment.nurseName}`,
        html,
        attachments,
      );
    }, `Email assessment ${assessmentId}`);

    const sentAt = new Date();
    const [updated] = await db.update(preboardAssessments)
      .set({
        emailStatus: "sent",
        emailError: null,
        emailAttempts: attempts,
        emailAttemptedAt: sentAt,
        emailSentAt: sentAt,
        emailSent: true,
      })
      .where(eq(preboardAssessments.id, assessmentId))
      .returning();
    console.log(`[Preboard] Email sent for assessment ${assessmentId}`);
    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = getAttempts(err);
    await db.update(preboardAssessments)
      .set({
        emailStatus: "failed",
        emailError: message.slice(0, 1000),
        emailAttempts: attempts,
        emailAttemptedAt: new Date(),
      })
      .where(eq(preboardAssessments.id, assessmentId));
    await logAction(assessment.nurseId ?? null, "preboard", "assessment_email_failed", "system", {
      assessmentId,
      nurseName: assessment.nurseName,
      attempts,
      error: message.slice(0, 500),
    });
    throw err;
  }
}

/**
 * One-time backfill so existing rows (created before task 111) get
 * accurate ai/email status pills instead of "pending". Idempotent — only
 * touches rows where the new columns are still NULL.
 */
export async function backfillDeliveryStatus(): Promise<{ updated: number }> {
  const rows = await db.select({
    id: preboardAssessments.id,
    aiAnalysis: preboardAssessments.aiAnalysis,
    emailSent: preboardAssessments.emailSent,
    aiStatus: preboardAssessments.aiStatus,
    emailStatus: preboardAssessments.emailStatus,
    completedAt: preboardAssessments.completedAt,
  }).from(preboardAssessments);
  let updated = 0;
  for (const r of rows) {
    const patch: Record<string, unknown> = {};
    // Columns are NOT NULL DEFAULT 'pending' after db:push, so legacy
    // rows arrive as 'pending'. Map them deterministically from the
    // legacy aiAnalysis / emailSent / completedAt columns.
    if ((!r.aiStatus || r.aiStatus === "pending") && r.aiAnalysis) {
      patch.aiStatus = "ok";
      patch.aiAttempts = 1;
    }
    if ((!r.emailStatus || r.emailStatus === "pending") && r.emailSent) {
      patch.emailStatus = "sent";
      patch.emailAttempts = 1;
      if (r.completedAt) patch.emailSentAt = r.completedAt;
    }
    if (Object.keys(patch).length > 0) {
      await db.update(preboardAssessments).set(patch).where(eq(preboardAssessments.id, r.id));
      updated++;
    }
  }
  if (updated > 0) {
    console.log(`[Preboard] Backfilled delivery status for ${updated} legacy assessments.`);
  }
  return { updated };
}

export async function runAssessmentDeliveryPipeline(assessmentId: number): Promise<void> {
  let aiOk = false;
  try {
    await runAiStep(assessmentId);
    aiOk = true;
  } catch {
    // already logged + persisted
  }
  if (!aiOk) return;
  try {
    await runEmailStep(assessmentId);
  } catch {
    // already logged + persisted
  }
}
