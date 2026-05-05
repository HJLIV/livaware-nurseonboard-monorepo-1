// Admin "chase outstanding training" workflow.
//
// Three pieces:
//   1. computeOutstandingTrainingForNurse — wraps the shared
//      training-status helper (the same one the Training Matrix endpoint
//      uses) so the chase email can never list a different set of modules
//      than the matrix shows.
//   2. sendTrainingChaseEmail — generates a one-shot portal upload link,
//      renders the email (subject/body filled from token template), sends it
//      via Microsoft Graph, persists a `trainingNotifications` row + audit
//      log so the matrix can show "Last chased N days ago".
//   3. scanMailboxForChaseRepliesAll — extension of the mailbox scan that
//      only looks at nurses with an active chase notification. It classifies
//      each attachment FIRST and only invokes the training-extraction
//      pipeline when the classifier matched at least one expected module
//      with high confidence. Otherwise the attachment is saved as a flagged
//      document (documents.aiStatus = 'warning', code
//      `chase_reply_low_confidence`) so it lands in the existing admin
//      review queue without ever silently mutating training records.

import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import {
  documents,
  portalLinks,
  MANDATORY_TRAINING_MODULES,
  TRAINING_CHASE_SCHEDULE_SETTING_KEY,
  migrateLegacyTrainingChaseRecipients,
  type Candidate,
  type TrainingNotification,
  type TrainingChaseScheduleSettings,
} from "@shared/schema";
import {
  getGraphClient,
  isOutlookConfigured,
  listMailboxAttachmentsForCandidate,
  downloadMailboxAttachment,
} from "./outlook";
import { ingestExistingFile, saveBufferIntoUploads, applyChaseReplyTrainingUpsert } from "./document-ingest";
import { classifyDocumentSmart } from "./document-ai";
import { computeOutstandingTrainingForRecords, type OutstandingModule } from "./training-status";
import { renderEmailMarkdown } from "@shared/email-markdown";

export type { OutstandingModule } from "./training-status";

const SENDER_EMAIL = process.env.AZURE_AD_SENDER_EMAIL || "onboarding@livaware.co.uk";

// Where the weekly-chase and reply-scan admin summary emails should land.
// The two jobs each have their OWN configurable recipient list (managed in
// /settings) so e.g. compliance can receive the weekly digest while on-call
// admins receive the reply-scan alerts. Each list independently falls back
// to the shared sender mailbox when the operator hasn't picked any
// recipients. Storage is read directly here (rather than importing the
// scheduler's getter) to avoid a circular import — the scheduler already
// depends on this module. The legacy single `summaryRecipients` field is
// migrated on read so older app_settings rows seed both lists.
async function loadChaseScheduleSettings(): Promise<Partial<TrainingChaseScheduleSettings>> {
  const stored = await storage.getAppSetting<
    Partial<TrainingChaseScheduleSettings> & { summaryRecipients?: unknown }
  >(TRAINING_CHASE_SCHEDULE_SETTING_KEY);
  return migrateLegacyTrainingChaseRecipients(stored);
}

function pickRecipientsOrFallback(configured: unknown): string[] {
  if (Array.isArray(configured) && configured.length > 0) {
    const cleaned = configured
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter((x) => x.length > 0);
    if (cleaned.length > 0) return cleaned;
  }
  return [SENDER_EMAIL];
}

export async function resolveWeeklyChaseSummaryRecipients(): Promise<string[]> {
  try {
    const settings = await loadChaseScheduleSettings();
    return pickRecipientsOrFallback(settings.weeklyChaseSummaryRecipients);
  } catch (err: any) {
    console.warn(
      "[training-notifications] failed to load weekly-chase summary recipients, falling back to sender mailbox:",
      err?.message || err,
    );
    return [SENDER_EMAIL];
  }
}

export async function resolveReplyScanSummaryRecipients(): Promise<string[]> {
  try {
    const settings = await loadChaseScheduleSettings();
    return pickRecipientsOrFallback(settings.replyScanSummaryRecipients);
  } catch (err: any) {
    console.warn(
      "[training-notifications] failed to load reply-scan summary recipients, falling back to sender mailbox:",
      err?.message || err,
    );
    return [SENDER_EMAIL];
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Outstanding-training computation (delegates to shared helper)
// ─────────────────────────────────────────────────────────────────────────

export async function computeOutstandingTrainingForNurse(nurseId: string): Promise<OutstandingModule[]> {
  const records = await storage.getMandatoryTraining(nurseId);
  return computeOutstandingTrainingForRecords(records);
}

// ─────────────────────────────────────────────────────────────────────────
// 2. Email rendering + sending
// ─────────────────────────────────────────────────────────────────────────

export const TRAINING_CHASE_DEFAULT_SUBJECT =
  "Outstanding mandatory training — action required";

export const TRAINING_CHASE_DEFAULT_BODY =
  `Dear **{{NAME}}**,

According to our records, the following mandatory training modules are either missing, have expired, or are about to expire:

{{MODULES_LIST}}

To remain compliant with our CQC obligations, please send us your latest certificates as soon as possible. **You have two options:**

1. **Reply directly to this email** with the certificate(s) attached. They will be filed against your record automatically.
2. **Or upload them via your secure portal link below** — no login required.

**Secure upload link:** {{PORTAL_URL}}
This link is personal to you and expires on **{{PORTAL_EXPIRY}}**.

If you have any questions, just reply to this email.

Kind regards,
Livaware Onboarding Team`;

export interface ChaseEmailRenderInput {
  nurseName: string;
  modules: OutstandingModule[];
  portalUrl: string;
  portalExpiresAt: Date;
}

export function renderChaseEmail(
  template: { subject: string; body: string },
  input: ChaseEmailRenderInput,
): { subject: string; body: string } {
  // Each module becomes a markdown bullet item with the module name in
  // bold so the shared markdown renderer can lift the whole {{MODULES_LIST}}
  // into a real <ul> with <strong> module names — matching the design
  // requirement that modules appear as a proper bullet list, not flat text.
  const moduleLines = input.modules
    .map((m) => `- **${m.moduleName}** — ${m.label}`)
    .join("\n");
  const expiryFmt = input.portalExpiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const tokenMap: Record<string, string> = {
    "{{NAME}}": input.nurseName,
    "{{MODULES_LIST}}": moduleLines || "- (no modules listed)",
    "{{COUNT}}": String(input.modules.length),
    "{{PORTAL_URL}}": input.portalUrl,
    "{{PORTAL_EXPIRY}}": expiryFmt,
  };
  const apply = (s: string) =>
    Object.entries(tokenMap).reduce((acc, [k, v]) => acc.split(k).join(v), s);
  return { subject: apply(template.subject), body: apply(template.body) };
}

// Used by the admin-summary email builders below for raw values that
// should NOT be markdown-rendered (candidate names, error strings, etc.).
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render a chase-email body (already token-substituted markdown) into the
 * full HTML email envelope sent to nurses. Uses the shared email-markdown
 * renderer so admin-typed `**bold**`, bullet lists and the bold-by-default
 * key phrases (greeting name, expiry date, "two options" lead-in, secure
 * upload link label) all render as real HTML — not literal asterisks.
 */
export function buildChaseEmailHtml(
  bodyMarkdown: string,
  portalUrl: string,
  portalExpiryFormatted: string,
): string {
  const bodyHtml = renderEmailMarkdown(bodyMarkdown);

  return `
    <div style="font-family:'Be Vietnam Pro','Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#020121;">
      <div style="background:#0a0a2e;padding:28px 32px;text-align:center;border-bottom:1px solid #1e1e5a;">
        <h1 style="color:#F0ECE4;font-family:'Georgia',serif;font-size:24px;font-weight:400;margin:0 0 4px;letter-spacing:-0.01em;">NurseOnboard</h1>
        <p style="color:#8A8A94;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;margin:0;">Livaware Ltd — Mandatory Training Reminder</p>
      </div>
      <div style="padding:32px;">
        ${bodyHtml}
        <div style="text-align:center;margin:28px 0;">
          <a href="${portalUrl}" style="display:inline-block;background-color:#C8A96E;background-image:linear-gradient(135deg,#C8A96E,#b8944e);color:#020121;text-decoration:none;padding:14px 52px;border-radius:4px;font-size:12px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;">
            Upload Certificates
          </a>
          <p style="font-size:11px;color:#8A8A94;margin-top:10px;">Link expires ${portalExpiryFormatted}</p>
        </div>
        <p style="font-size:12px;color:#8A8A94;line-height:1.6;">
          You can also reply to this email with the certificates attached and we will file them automatically against your record.
        </p>
      </div>
      <div style="background:#0a0a2e;padding:16px 32px;text-align:center;border-top:1px solid #1e1e5a;">
        <p style="font-size:11px;color:#8A8A94;margin:0;">Livaware Ltd — Secure Nurse Onboarding · CQC Regulation 19 / Schedule 3 Compliant</p>
      </div>
    </div>
  `;
}

interface SendChaseOpts {
  nurse: Candidate;
  template: { subject: string; body: string };
  modules: OutstandingModule[];
  sentBy: string;
  portalBaseUrl: string;
}

/** Mint a per-nurse secure portal upload link (30-day expiry, "onboard"
 *  module). Used by both /prepare (preview) and send. */
export async function mintChasePortalLinkForNurse(opts: {
  nurseId: string;
  sentBy: string;
  portalBaseUrl: string;
}): Promise<{ token: string; portalUrl: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(portalLinks).values({
    nurseId: opts.nurseId,
    token,
    module: "onboard",
    expiresAt,
    createdBy: opts.sentBy,
  });
  const portalUrl = `${opts.portalBaseUrl.replace(/\/$/, "")}/portal/${token}`;
  return { token, portalUrl, expiresAt };
}

export interface SendChaseResult {
  notification: TrainingNotification;
  modulesIncluded: string[];
  recipientEmail: string;
  portalUrl: string;
  portalExpiresAt: Date;
}

/**
 * Send a single chase email to one nurse and persist the notification.
 * Throws if Outlook isn't configured or the candidate has no email on file.
 */
export async function sendTrainingChaseEmail(opts: SendChaseOpts): Promise<SendChaseResult> {
  if (!isOutlookConfigured()) {
    throw new Error("Outlook integration not configured (set AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET).");
  }
  if (!opts.nurse.email) {
    throw new Error(`Candidate ${opts.nurse.fullName} has no email address on file.`);
  }
  if (opts.modules.length === 0) {
    throw new Error(`Candidate ${opts.nurse.fullName} has no outstanding mandatory training to chase.`);
  }

  const minted = await mintChasePortalLinkForNurse({
    nurseId: opts.nurse.id,
    sentBy: opts.sentBy,
    portalBaseUrl: opts.portalBaseUrl,
  });
  const { token, portalUrl, expiresAt } = minted;
  const expiryFmt = expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  // Render final subject/body from the (possibly admin-edited) template.
  const rendered = renderChaseEmail(opts.template, {
    nurseName: opts.nurse.fullName,
    modules: opts.modules,
    portalUrl,
    portalExpiresAt: expiresAt,
  });
  const html = buildChaseEmailHtml(rendered.body, portalUrl, expiryFmt);

  // Use createMessage → send instead of sendMail so we can capture the
  // Graph conversationId. The reply scanner uses it to restrict ingest
  // to attachments that arrived in the same Outlook thread.
  const client = await getGraphClient();
  let conversationId: string | null = null;
  try {
    const draft: any = await client.api(`/users/${SENDER_EMAIL}/messages`).post({
      subject: rendered.subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [{ emailAddress: { address: opts.nurse.email, name: opts.nurse.fullName } }],
    });
    conversationId = draft?.conversationId ?? null;
    await client.api(`/users/${SENDER_EMAIL}/messages/${draft.id}/send`).post({});
  } catch (e: any) {
    // Fall back to sendMail if createMessage flow fails — we lose
    // conversationId but the chase still goes out.
    console.warn("[sendTrainingChaseEmail] createMessage→send failed, falling back to sendMail:", e?.message || e);
    await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
      message: {
        subject: rendered.subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: opts.nurse.email, name: opts.nurse.fullName } }],
      },
      saveToSentItems: true,
    });
  }

  const modulesIncluded = opts.modules.map((m) => m.moduleName);
  const notification = await storage.createTrainingNotification({
    nurseId: opts.nurse.id,
    sentBy: opts.sentBy,
    recipientEmail: opts.nurse.email,
    subject: rendered.subject,
    body: rendered.body,
    modulesIncluded,
    portalLinkToken: token,
    portalLinkExpiresAt: expiresAt,
    conversationId,
  });

  await storage.createAuditLog({
    nurseId: opts.nurse.id,
    action: "training_notification_sent",
    agentName: opts.sentBy,
    detail: {
      modulesIncluded,
      moduleCount: modulesIncluded.length,
      recipientEmail: opts.nurse.email,
      subject: rendered.subject,
      portalLinkExpiresAt: expiresAt.toISOString(),
    },
  });

  return { notification, modulesIncluded, recipientEmail: opts.nurse.email, portalUrl, portalExpiresAt: expiresAt };
}

// ─────────────────────────────────────────────────────────────────────────
// 3. Mailbox scan for chase-email replies
// ─────────────────────────────────────────────────────────────────────────

const SUPPORTED_INGEST_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function inferMime(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i < 0) return "application/octet-stream";
  return EXT_MIME[filename.slice(i).toLowerCase()] || "application/octet-stream";
}

/**
 * Mark a document for admin review. Uses Drizzle directly so the jsonb
 * `aiIssues` payload doesn't require an `as any` cast on the typed
 * storage.updateDocument helper.
 */
interface ReviewIssue {
  code: string;
  message: string;
  expectedModules: string[];
  matchedModules: string[];
  confidence: string;
  sourceMessageId: string;
}
async function flagDocumentForReview(documentId: string, issue: ReviewIssue): Promise<void> {
  try {
    // Merge — never overwrite. The background triggerDocumentAnalysis call
    // launched by ingestExistingFile may finish either before or after this
    // function runs. We need both sets of aiIssues to survive: the AI's
    // completeness findings AND the chase-reply review marker (so admins
    // can filter by `chase_reply_*` codes in the review queue).
    const existing = await storage.getDocument(documentId);
    const prior = Array.isArray(existing?.aiIssues) ? (existing!.aiIssues as any[]) : [];
    // Drop any stale chase-reply marker before re-adding so re-scans don't
    // accumulate duplicates.
    const filtered = prior.filter(
      (e) =>
        !e ||
        typeof e !== "object" ||
        (e.code !== "chase_reply_low_confidence" &&
          e.code !== "chase_reply_upsert_failed" &&
          e.code !== "chase_reply_auto_attached"),
    );
    const merged = [...filtered, issue];
    // Don't downgrade an already-failing AI status to warning; otherwise
    // surface as warning so the review queue picks it up.
    const newStatus = existing?.aiStatus === "fail" ? "fail" : "warning";
    await db
      .update(documents)
      .set({
        aiStatus: newStatus,
        aiIssues: merged,
        aiAnalyzedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
  } catch (e: any) {
    console.warn("[flagDocumentForReview] failed:", e?.message || e);
  }
}

export interface ChaseReplyOutcome {
  filename: string;
  documentId: string;
  matchedModules: string[];
  expectedModules: string[];
  autoAttached: boolean;
  needsReview: boolean;
  messageId: string;
  /** Modules whose existing mandatoryTraining row was updated. */
  modulesUpdated: string[];
  /** Modules for which a brand-new mandatoryTraining row was created. */
  modulesCreated: string[];
}

export interface ChaseReplyScanSummary {
  nurseId: string;
  candidateName: string;
  candidateEmail: string;
  notificationSentAt: string | null;
  modulesExpected: string[];
  attachmentsFound: number;
  attachmentsProcessed: number;
  attachmentsSkippedAlreadyOnFile: number;
  autoAttachedCount: number;
  needsReviewCount: number;
  errors: string[];
  outcomes: ChaseReplyOutcome[];
}

export async function scanMailboxForChaseRepliesForCandidate(
  nurseId: string,
  notification: TrainingNotification,
): Promise<ChaseReplyScanSummary> {
  const candidate = await storage.getCandidate(nurseId);
  if (!candidate) throw new Error("Candidate not found");

  const expectedModules = Array.isArray(notification.modulesIncluded)
    ? (notification.modulesIncluded as string[])
    : [];

  const summary: ChaseReplyScanSummary = {
    nurseId,
    candidateName: candidate.fullName,
    candidateEmail: candidate.email || "",
    notificationSentAt: notification.sentAt?.toISOString?.() || null,
    modulesExpected: expectedModules,
    attachmentsFound: 0,
    attachmentsProcessed: 0,
    attachmentsSkippedAlreadyOnFile: 0,
    autoAttachedCount: 0,
    needsReviewCount: 0,
    errors: [],
    outcomes: [],
  };

  if (!candidate.email) {
    summary.errors.push("Candidate has no email on file");
    return summary;
  }

  let refs;
  try {
    refs = await listMailboxAttachmentsForCandidate(candidate.email);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (/Mail\.Read|forbidden|insufficient|access_denied/i.test(msg)) {
      summary.errors.push("Mailbox access not granted (need Mail.Read.All application permission).");
    } else {
      summary.errors.push(`Mailbox search failed: ${msg}`);
    }
    return summary;
  }

  // Only inbound (from nurse) attachments received after the chase. If we
  // captured the chase email's conversationId at send time, restrict to
  // that Outlook thread so we don't ingest unrelated emails the nurse
  // happens to send to/from us.
  const sentAtMs = notification.sentAt?.getTime?.() || 0;
  const candidateEmailLower = candidate.email.toLowerCase();
  const conversationId = notification.conversationId;
  const fresh = refs.filter((r) => {
    if (r.fromAddress && r.fromAddress !== candidateEmailLower) return false;
    if (conversationId && r.conversationId && r.conversationId !== conversationId) return false;
    if (!r.receivedDateTime) return true;
    const t = new Date(r.receivedDateTime).getTime();
    return !isNaN(t) && t >= sentAtMs;
  });
  summary.attachmentsFound = fresh.length;
  if (fresh.length === 0) return summary;

  // Intersect snapshot modules with currently-outstanding ones so we
  // don't auto-attach over modules the nurse already completed by
  // another route between send and reply.
  let currentOutstanding: string[] = expectedModules;
  try {
    const current = await computeOutstandingTrainingForNurse(nurseId);
    currentOutstanding = current.map((m) => m.moduleName);
  } catch (e: any) {
    console.warn("[scanMailboxForChaseRepliesForCandidate] recompute failed; using snapshot:", e?.message || e);
  }
  const stillOutstanding = new Set(currentOutstanding);
  const expectedSet = new Set(expectedModules.filter((m) => stillOutstanding.has(m)));
  const moduleNames = MANDATORY_TRAINING_MODULES.map((m) => m.name);

  for (const ref of fresh) {
    // Dedupe by Graph (messageId, attachmentId), not filename.
    const alreadyProcessed = await storage.hasProcessedChaseAttachment(
      nurseId,
      ref.messageId,
      ref.attachmentId,
    );
    if (alreadyProcessed) {
      summary.attachmentsSkippedAlreadyOnFile += 1;
      continue;
    }
    try {
      const { buffer, filename, contentType } = await downloadMailboxAttachment(ref.messageId, ref.attachmentId);
      const abs = saveBufferIntoUploads(buffer, filename);
      const mimeType = SUPPORTED_INGEST_MIMES.has(contentType) ? contentType : inferMime(filename);

      let preClassification: Awaited<ReturnType<typeof classifyDocumentSmart>> | null = null;
      try {
        preClassification = await classifyDocumentSmart(abs, mimeType, moduleNames);
      } catch (e: any) {
        console.warn("[scanMailboxForChaseRepliesForCandidate] classifier failed:", e?.message || e);
      }

      const matched = preClassification?.matchedTrainingModules ?? [];
      const matchedExpected = matched.filter((m) => expectedSet.has(m));
      const confidence = preClassification?.confidence ?? "none";
      const highConfidence = confidence === "high";
      // Auto-attach as soon as we have an expected-module match. We default
      // expiry to 1 year from completion (see applyChaseReplyTrainingUpsert),
      // so any false-positive self-corrects within a year — and admins are
      // shown a "please confirm" indicator on the matrix for non-high-
      // confidence auto-attaches via flagDocumentForReview below.
      const eligibleForAutoAttach = matchedExpected.length > 0;

      const ingest = await ingestExistingFile({
        nurseId,
        absolutePath: abs,
        originalFilename: filename,
        mimeType,
        source: "chase_reply",
        uploadedBy: "AI Chase Recovery",
        preClassification: preClassification ?? undefined,
        skipTrainingExtraction: true,
      });

      // Auto-attach is only true if the upsert actually succeeded.
      let autoAttached = false;
      let upsertError: string | null = null;
      let upsertSummary: { updated: string[]; created: string[] } = { updated: [], created: [] };
      if (eligibleForAutoAttach) {
        try {
          upsertSummary = await applyChaseReplyTrainingUpsert({
            nurseId,
            documentId: ingest.documentId,
            absolutePath: abs,
            mimeType,
            matchedExpectedModules: matchedExpected,
          });
          autoAttached = true;
        } catch (e: any) {
          upsertError = e?.message || String(e);
          console.warn("[scanMailboxForChaseRepliesForCandidate] training upsert failed:", upsertError);
        }
      }

      // ALWAYS surface chase-reply attachments on the review queue / matrix
      // so admins keep a human-in-the-loop audit trail for every reply,
      // success or fail:
      //   - upsert failed         → chase_reply_upsert_failed (red, needs review)
      //   - no module matched     → chase_reply_low_confidence (red, needs review)
      //   - auto-attached         → chase_reply_auto_attached  (amber, please confirm)
      //                             (regardless of classifier confidence)
      let reviewCode:
        | "chase_reply_upsert_failed"
        | "chase_reply_low_confidence"
        | "chase_reply_auto_attached";
      let reviewMessage: string;
      if (upsertError) {
        reviewCode = "chase_reply_upsert_failed";
        reviewMessage = `Training upsert failed for modules (${matchedExpected.join(", ")}): ${upsertError}. Please review and apply manually.`;
      } else if (!autoAttached) {
        reviewCode = "chase_reply_low_confidence";
        reviewMessage = matched.length === 0
          ? "This file arrived in reply to a training-chase email but the classifier could not confidently identify a mandatory training module. Please review and assign manually."
          : `Classifier matched modules (${matched.join(", ")}) with ${confidence} confidence; expected one of (${expectedModules.join(", ") || "(none)"}). Please review.`;
      } else {
        const touched = [...upsertSummary.created, ...upsertSummary.updated];
        reviewCode = "chase_reply_auto_attached";
        reviewMessage = `Auto-attached to ${touched.length === 1 ? "module" : "modules"} ${touched.join(", ")} with a default 1-year expiry from completion (classifier confidence: ${confidence}). Please confirm the module assignment and expiry date.`;
      }

      await flagDocumentForReview(ingest.documentId, {
        code: reviewCode,
        message: reviewMessage,
        expectedModules,
        matchedModules: matched,
        confidence,
        sourceMessageId: ref.messageId,
      });

      try {
        await storage.recordProcessedChaseAttachment({
          nurseId,
          messageId: ref.messageId,
          attachmentId: ref.attachmentId,
          documentId: ingest.documentId,
          autoAttached,
        });
      } catch (e: any) {
        console.warn("[scanMailboxForChaseRepliesForCandidate] dedup record failed:", e?.message || e);
      }

      // The summary/outcome's `needsReview` flag = "couldn't auto-attach,
      // admin must triage manually". Successful auto-attaches are already
      // counted under `autoAttachedCount` and surfaced as the amber
      // "please confirm" indicator on the matrix — they're not red.
      const needsReview = !autoAttached;
      summary.attachmentsProcessed += 1;
      if (autoAttached) summary.autoAttachedCount += 1;
      if (needsReview) summary.needsReviewCount += 1;
      summary.outcomes.push({
        filename,
        documentId: ingest.documentId,
        matchedModules: matched,
        expectedModules,
        autoAttached,
        needsReview,
        messageId: ref.messageId,
        modulesUpdated: upsertSummary.updated,
        modulesCreated: upsertSummary.created,
      });
    } catch (err: any) {
      summary.errors.push(`${ref.filename}: ${err?.message || String(err)}`);
    }
  }

  if (summary.attachmentsProcessed > 0) {
    await storage.createAuditLog({
      nurseId,
      action: "training_chase_reply_processed",
      agentName: "AI Chase Recovery",
      detail: {
        attachmentsProcessed: summary.attachmentsProcessed,
        autoAttachedCount: summary.autoAttachedCount,
        needsReviewCount: summary.needsReviewCount,
        modulesExpected: expectedModules,
        notificationSentAt: summary.notificationSentAt,
      },
    });
  }

  return summary;
}

export interface BulkChaseReplyScanSummary {
  scannedNurses: number;
  totalAttachmentsFound: number;
  totalAttachmentsProcessed: number;
  totalAutoAttached: number;
  totalNeedsReview: number;
  perNurse: ChaseReplyScanSummary[];
  errors: string[];
}

export async function scanMailboxForChaseRepliesAll(triggeredBy: string): Promise<BulkChaseReplyScanSummary> {
  const summary: BulkChaseReplyScanSummary = {
    scannedNurses: 0,
    totalAttachmentsFound: 0,
    totalAttachmentsProcessed: 0,
    totalAutoAttached: 0,
    totalNeedsReview: 0,
    perNurse: [],
    errors: [],
  };

  if (!isOutlookConfigured()) {
    summary.errors.push("Outlook integration not configured.");
    return summary;
  }

  const latestByNurse = await storage.getLatestTrainingNotifications();
  for (const [nurseId, notification] of Array.from(latestByNurse.entries())) {
    try {
      const r = await scanMailboxForChaseRepliesForCandidate(nurseId, notification);
      summary.scannedNurses += 1;
      summary.totalAttachmentsFound += r.attachmentsFound;
      summary.totalAttachmentsProcessed += r.attachmentsProcessed;
      summary.totalAutoAttached += r.autoAttachedCount;
      summary.totalNeedsReview += r.needsReviewCount;
      summary.perNurse.push(r);
    } catch (err: any) {
      summary.errors.push(`${nurseId}: ${err?.message || String(err)}`);
    }
  }

  // Only email the admin summary when there's something worth reporting —
  // either attachments were actually ingested, or per-nurse errors
  // occurred. This keeps the periodic auto-scan from sending a "scan
  // complete" email every 30 minutes when nothing happened.
  const hasOutcomes = summary.totalAttachmentsProcessed > 0 || summary.errors.length > 0;
  if (hasOutcomes) {
    try {
      await sendChaseScanAdminSummary(summary, triggeredBy);
    } catch (err: any) {
      console.warn("[scanMailboxForChaseRepliesAll] admin summary email failed:", err?.message || err);
    }
  }
  return summary;
}

async function sendChaseScanAdminSummary(summary: BulkChaseReplyScanSummary, triggeredBy: string) {
  const client = await getGraphClient();
  const reviewRows = summary.perNurse
    .filter((s) => s.needsReviewCount > 0)
    .map(
      (s) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(s.candidateName)}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${s.attachmentsProcessed}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#16a34a;">${s.autoAttachedCount}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;color:#b45309;font-weight:600;">${s.needsReviewCount}</td>
        </tr>`,
    )
    .join("");
  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;">
      <h2 style="color:#020121;">Training-chase mailbox scan complete</h2>
      <p>Triggered by <strong>${escapeHtml(triggeredBy)}</strong> on ${new Date().toLocaleString("en-GB")}.</p>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;">
        <tr><td style="padding:4px 8px;color:#555;">Nurses scanned</td><td style="padding:4px 8px;">${summary.scannedNurses}</td></tr>
        <tr><td style="padding:4px 8px;color:#555;">Attachments found</td><td style="padding:4px 8px;">${summary.totalAttachmentsFound}</td></tr>
        <tr><td style="padding:4px 8px;color:#555;">Attachments ingested</td><td style="padding:4px 8px;">${summary.totalAttachmentsProcessed}</td></tr>
        <tr><td style="padding:4px 8px;color:#555;">Auto-attached</td><td style="padding:4px 8px;color:#16a34a;font-weight:600;">${summary.totalAutoAttached}</td></tr>
        <tr><td style="padding:4px 8px;color:#555;">Needs review</td><td style="padding:4px 8px;color:#b45309;font-weight:600;">${summary.totalNeedsReview}</td></tr>
      </table>
      ${reviewRows.length ? `
        <h3 style="margin-top:24px;color:#b45309;">Items needing review</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f3f4f6;text-align:left;">
            <th style="padding:6px 8px;">Candidate</th>
            <th style="padding:6px 8px;">Processed</th>
            <th style="padding:6px 8px;">Auto-attached</th>
            <th style="padding:6px 8px;">Needs review</th>
          </tr></thead>
          <tbody>${reviewRows}</tbody>
        </table>
        <p style="font-size:12px;color:#6b7280;margin-top:8px;">
          Open the candidate's documents tab — these files were saved with an "AI warning" status and the issue code <code>chase_reply_low_confidence</code>.
        </p>
      ` : `<p style="color:#16a34a;">All processed attachments were auto-attached. No manual review required.</p>`}
    </div>
  `;
  const recipients = await resolveReplyScanSummaryRecipients();
  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject: `Training chase scan — ${summary.totalAutoAttached} auto-attached, ${summary.totalNeedsReview} needs review`,
      body: { contentType: "HTML", content: html },
      toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
    },
    saveToSentItems: false,
  });
}
