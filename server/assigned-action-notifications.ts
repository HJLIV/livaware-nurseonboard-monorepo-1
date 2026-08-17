// Assigned-action assignment emails (task 212).
//
// When a super admin assigns a reflection / witness statement, the nurse
// gets an email with a fresh, time-boxed portal link. Modelled on the
// training-chase sender (server/training-notifications.ts) but deliberately
// simpler: one fixed template with token substitution, sent via the shared
// Graph sendMail path. Sending is BEST-EFFORT — a failed email must never
// fail the assignment itself; the caller audits success/failure.
//
// Like every other outbound sender, mail is auto-suppressed in test mode
// (isEmailSendingSuppressed) so Vitest never touches the real mailbox.

import crypto from "crypto";
import { db } from "./db";
import {
  portalLinks,
  ASSIGNED_ACTION_TYPE_LABELS,
  type Candidate,
  type NurseAssignedAction,
} from "@shared/schema";
import {
  getGraphClient,
  isOutlookConfigured,
  isEmailSendingSuppressed,
} from "./outlook";
import { renderEmailMarkdown } from "@shared/email-markdown";

const SENDER_EMAIL = process.env.AZURE_AD_SENDER_EMAIL || "onboarding@livaware.co.uk";

// How long the per-assignment portal link stays valid. Generous on purpose:
// reflections/witness statements often come with a multi-day deadline.
const PORTAL_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const ASSIGNED_ACTION_DEFAULT_SUBJECT =
  "You've been asked to complete a {{ACTION_TYPE}} — action required";

export const ASSIGNED_ACTION_DEFAULT_BODY =
  `Dear **{{NAME}}**,

{{ACTION_INTRO}}

{{CONTEXT_BLOCK}}

**To complete it, open your secure portal link below** — no login required. You'll be guided through each section, and you can type or dictate your answers.

**Secure portal link:** {{PORTAL_URL}}
This link is personal to you and expires on **{{PORTAL_EXPIRY}}**.

Please note: pasting text into the answer boxes is disabled — your response must be written (or dictated) by you, in your own words.

If you have any questions, just reply to this email.

Kind regards,
Livaware Onboarding Team`;

export interface AssignedActionEmailInput {
  nurse: Candidate;
  action: NurseAssignedAction;
  portalUrl: string;
  portalExpiresAt: Date;
}

function actionIntro(action: NurseAssignedAction): string {
  if (action.type === "reflection") {
    const framework = action.framework
      ? ` using the ${action.framework === "schon" ? "Schön" : action.framework.charAt(0).toUpperCase() + action.framework.slice(1)} reflective framework`
      : "";
    return `As part of your ongoing supervision and professional development, we would like you to complete a **structured reflection**${framework}.`;
  }
  return `We need you to provide a **witness statement** — a factual account, in your own words, of an event you were involved in or witnessed.`;
}

function contextBlock(action: NurseAssignedAction): string {
  const lines: string[] = [];
  if (action.focusContext) lines.push(`**Focus:** ${action.focusContext}`);
  if (action.eventDetails) lines.push(`**Event details:** ${action.eventDetails}`);
  if (action.pointsToAddress) lines.push(`**Please make sure you address:** ${action.pointsToAddress}`);
  if (action.instructions) lines.push(`**Instructions:** ${action.instructions}`);
  return lines.join("\n\n");
}

export function renderAssignedActionEmail(
  template: { subject: string; body: string },
  input: AssignedActionEmailInput,
): { subject: string; body: string } {
  const expiryFmt = input.portalExpiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const tokenMap: Record<string, string> = {
    "{{NAME}}": input.nurse.fullName,
    "{{ACTION_TYPE}}": ASSIGNED_ACTION_TYPE_LABELS[input.action.type] || input.action.type,
    "{{ACTION_INTRO}}": actionIntro(input.action),
    "{{CONTEXT_BLOCK}}": contextBlock(input.action),
    "{{PORTAL_URL}}": input.portalUrl,
    "{{PORTAL_EXPIRY}}": expiryFmt,
  };
  const apply = (s: string) =>
    Object.entries(tokenMap).reduce((acc, [k, v]) => acc.split(k).join(v), s);
  return { subject: apply(template.subject), body: apply(template.body) };
}

/** Full HTML envelope, matching the chase email's visual identity. */
export function buildAssignedActionEmailHtml(
  bodyMarkdown: string,
  portalUrl: string,
  portalExpiryFormatted: string,
  ctaLabel: string,
): string {
  const bodyHtml = renderEmailMarkdown(bodyMarkdown);
  return `
    <div style="font-family:'Be Vietnam Pro','Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#020121;">
      <div style="background:#0a0a2e;padding:28px 32px;text-align:center;border-bottom:1px solid #1e1e5a;">
        <h1 style="color:#F0ECE4;font-family:'Georgia',serif;font-size:24px;font-weight:400;margin:0 0 4px;letter-spacing:-0.01em;">Basecamp</h1>
        <p style="color:#8A8A94;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;margin:0;">Basecamp by Livaware Ltd — Action Required</p>
      </div>
      <div style="padding:32px;">
        ${bodyHtml}
        <div style="text-align:center;margin:28px 0;">
          <a href="${portalUrl}" style="display:inline-block;background-color:#C8A96E;background-image:linear-gradient(135deg,#C8A96E,#b8944e);color:#020121;text-decoration:none;padding:14px 52px;border-radius:4px;font-size:12px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;">
            ${ctaLabel}
          </a>
          <p style="font-size:11px;color:#8A8A94;margin-top:10px;">Link expires ${portalExpiryFormatted}</p>
        </div>
      </div>
      <div style="background:#0a0a2e;padding:16px 32px;text-align:center;border-top:1px solid #1e1e5a;">
        <p style="font-size:11px;color:#8A8A94;margin:0;">Basecamp by Livaware Ltd — Secure Nurse Onboarding · CQC Regulation 19 / Schedule 3 Compliant</p>
      </div>
    </div>
  `;
}

/** Mint a fresh per-assignment portal link ("hub" module, 30-day expiry). */
export async function mintAssignedActionPortalLink(opts: {
  nurseId: string;
  sentBy: string;
  portalBaseUrl: string;
}): Promise<{ token: string; portalUrl: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PORTAL_LINK_TTL_MS);
  await db.insert(portalLinks).values({
    nurseId: opts.nurseId,
    token,
    module: "hub",
    expiresAt,
    createdBy: opts.sentBy,
  });
  const portalUrl = `${opts.portalBaseUrl.replace(/\/$/, "")}/portal/${token}`;
  return { token, portalUrl, expiresAt };
}

/**
 * Send the assignment email. Throws if the nurse has no email or Outlook
 * isn't configured AND sending is not suppressed — the route wraps this in
 * best-effort handling so assignment never fails on mail problems.
 */
export async function sendAssignedActionEmail(opts: {
  nurse: Candidate;
  action: NurseAssignedAction;
  portalBaseUrl: string;
  sentBy: string;
}): Promise<{ portalUrl: string; portalExpiresAt: Date; sent: boolean }> {
  if (!opts.nurse.email) {
    throw new Error(`Candidate ${opts.nurse.fullName} has no email address on file.`);
  }

  const { portalUrl, expiresAt } = await mintAssignedActionPortalLink({
    nurseId: opts.nurse.id,
    sentBy: opts.sentBy,
    portalBaseUrl: opts.portalBaseUrl,
  });
  const expiryFmt = expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const rendered = renderAssignedActionEmail(
    { subject: ASSIGNED_ACTION_DEFAULT_SUBJECT, body: ASSIGNED_ACTION_DEFAULT_BODY },
    { nurse: opts.nurse, action: opts.action, portalUrl, portalExpiresAt: expiresAt },
  );
  const ctaLabel =
    opts.action.type === "witness_statement" ? "Complete Witness Statement" : "Complete Reflection";
  const html = buildAssignedActionEmailHtml(rendered.body, portalUrl, expiryFmt, ctaLabel);

  if (isEmailSendingSuppressed()) {
    return { portalUrl, portalExpiresAt: expiresAt, sent: false };
  }
  if (!isOutlookConfigured()) {
    throw new Error(
      "Outlook integration not configured (set AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET).",
    );
  }
  const client = await getGraphClient();
  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject: rendered.subject,
      body: { contentType: "HTML", content: html },
      toRecipients: [
        { emailAddress: { address: opts.nurse.email, name: opts.nurse.fullName } },
      ],
    },
    saveToSentItems: true,
  });
  return { portalUrl, portalExpiresAt: expiresAt, sent: true };
}
