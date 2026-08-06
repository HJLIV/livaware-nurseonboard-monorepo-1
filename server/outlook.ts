import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import { renderEmail } from "./email-templates";

const TENANT_ID = process.env.AZURE_AD_TENANT_ID;
const CLIENT_ID = process.env.AZURE_AD_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_AD_CLIENT_SECRET;
const SENDER_EMAIL = process.env.AZURE_AD_SENDER_EMAIL || "onboarding@livaware.co.uk";

function createMsalApp(): ConfidentialClientApplication {
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Azure AD credentials not configured (AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET)");
  }
  return new ConfidentialClientApplication({
    auth: {
      clientId: CLIENT_ID,
      authority: `https://login.microsoftonline.com/${TENANT_ID}`,
      clientSecret: CLIENT_SECRET,
    },
  });
}

export async function getGraphClient(): Promise<Client> {
  const app = createMsalApp();
  const result = await app.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });

  if (!result?.accessToken) {
    throw new Error("Failed to acquire access token for Microsoft Graph");
  }

  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => result.accessToken,
    },
  });
}

export function isOutlookConfigured(): boolean {
  return !!(TENANT_ID && CLIENT_ID && CLIENT_SECRET);
}

// Never hit the real Microsoft Graph send API during automated tests —
// otherwise every created test nurse/candidate fires a live applicant
// welcome email, and broadcast tests email every non-withdrawn nurse in the
// dev database (hundreds of emails per run). Outbound sends are suppressed
// under Vitest; mailbox *reads* are left untouched.
export function isEmailSendingSuppressed(): boolean {
  return process.env.NODE_ENV === "test" || !!process.env.VITEST;
}

function formatExpiry(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

async function sendViaTemplate(opts: {
  key: string;
  tokens: Record<string, string>;
  to: { email: string; name: string };
  subjectOverride?: string;
}): Promise<void> {
  if (isEmailSendingSuppressed()) return;
  const client = await getGraphClient();
  const rendered = await renderEmail(opts.key, opts.tokens);
  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject: opts.subjectOverride || rendered.subject,
      body: { contentType: "HTML", content: rendered.html },
      toRecipients: [{ emailAddress: { address: opts.to.email, name: opts.to.name } }],
    },
    saveToSentItems: true,
  });
}

// ─── Super-admin mass email broadcast (task 186) ─────────────────────
// One message per recipient; attachments are inlined as base64
// fileAttachments. Callers handle per-recipient failure isolation.
export async function sendMassEmailMessage(opts: {
  recipientEmail: string;
  recipientName: string;
  subject: string;
  html: string;
  attachments: Array<{ name: string; contentType: string; contentBytes: string }>;
}): Promise<void> {
  if (isEmailSendingSuppressed()) return;
  const client = await getGraphClient();
  const message: any = {
    subject: opts.subject,
    body: { contentType: "HTML", content: opts.html },
    toRecipients: [{ emailAddress: { address: opts.recipientEmail, name: opts.recipientName } }],
  };
  if (opts.attachments.length > 0) {
    message.attachments = opts.attachments.map((a) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.name,
      contentType: a.contentType || "application/octet-stream",
      contentBytes: a.contentBytes,
    }));
  }
  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message,
    saveToSentItems: true,
  });
}

export async function sendRosterShiftChangeEmail(opts: {
  recipientEmail: string;
  recipientName: string;
  change: "added" | "removed";
  dateFormatted: string;
  slotLabel: string;
  timeRange: string;
  patientFirstName: string;
  portalUrl: string;
}) {
  await sendViaTemplate({
    key: "roster_shift_change",
    tokens: {
      NAME: opts.recipientName,
      FIRST_NAME: (opts.recipientName || "").trim().split(/\s+/)[0] || "there",
      ADDED: opts.change === "added" ? "1" : "",
      REMOVED: opts.change === "removed" ? "1" : "",
      DATE: opts.dateFormatted,
      SLOT_LABEL: opts.slotLabel,
      TIME_RANGE: opts.timeRange,
      PATIENT_FIRST_NAME: opts.patientFirstName,
      PORTAL_URL: opts.portalUrl,
    },
    to: { email: opts.recipientEmail, name: opts.recipientName },
  });
}

export async function sendPortalInviteEmail(
  recipientEmail: string,
  recipientName: string,
  portalUrl: string,
  expiresAt: Date,
  _stage?: string,
) {
  void _stage;
  await sendViaTemplate({
    key: "portal_invite",
    tokens: {
      NAME: recipientName,
      FIRST_NAME: (recipientName || "").trim().split(/\s+/)[0] || "there",
      PORTAL_URL: portalUrl,
      EXPIRY: formatExpiry(expiresAt),
    },
    to: { email: recipientEmail, name: recipientName },
  });
}

export async function sendOnboardingUnlockedEmail(
    recipientEmail: string,
    recipientName: string,
    portalUrl: string,
  ) {
    await sendViaTemplate({
      key: "onboarding_unlocked",
      tokens: {
        NAME: recipientName,
        FIRST_NAME: (recipientName || "").trim().split(/\s+/)[0] || "there",
        PORTAL_URL: portalUrl,
      },
      to: { email: recipientEmail, name: recipientName },
    });
  }

  export async function sendApplicantWelcomeEmail(
    recipientEmail: string,
    recipientName: string,
    portalUrl: string,
    expiresAt: Date,
  ) {
    await sendViaTemplate({
      key: "applicant_welcome",
      tokens: {
        NAME: recipientName,
        FIRST_NAME: (recipientName || "").trim().split(/\s+/)[0] || "there",
        PORTAL_URL: portalUrl,
        EXPIRY: formatExpiry(expiresAt),
      },
      to: { email: recipientEmail, name: recipientName },
    });
  }

  export async function sendOutstandingNudgeEmail(
    recipientEmail: string,
    recipientName: string,
    items: string[],
  ) {
    await sendViaTemplate({
      key: "outstanding_nudge",
      tokens: {
        NAME: recipientName,
        FIRST_NAME: (recipientName || "").trim().split(/\s+/)[0] || "there",
        ITEMS_LIST: (items || []).filter(Boolean).join("\n"),
      },
      to: { email: recipientEmail, name: recipientName },
    });
  }

  export async function sendSignInReminderEmail(
    recipientEmail: string,
    recipientName: string,
  ) {
    await sendViaTemplate({
      key: "sign_in_reminder",
      tokens: {
        NAME: recipientName,
        FIRST_NAME: (recipientName || "").trim().split(/\s+/)[0] || "there",
        EMAIL: recipientEmail,
      },
      to: { email: recipientEmail, name: recipientName },
    });
  }

  export async function sendPortalSignInCodeEmail(
    recipientEmail: string,
    recipientName: string,
    code: string,
    expiresAt: Date,
  ) {
    const minutesLeft = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));
    await sendViaTemplate({
      key: "portal_sign_in_code",
      tokens: {
        NAME: recipientName,
        CODE: code,
        MINUTES: String(minutesLeft),
      },
      to: { email: recipientEmail, name: recipientName },
    });
  }

  export async function sendDocumentUploadNotification(
    candidateName: string,
    category: string,
    uploadedBy: string,
    originalFilename: string,
    fileBuffer: Buffer,
    mimeType: string,
  ) {
    if (isEmailSendingSuppressed()) return;
    const client = await getGraphClient();
    const timestamp = new Date().toLocaleString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    const uploaderLabel = uploadedBy === "nurse" ? "Nurse (via portal)" : "Admin";
    const tokens = {
      CANDIDATE_NAME: candidateName,
      CATEGORY: category,
      FILENAME: originalFilename,
      UPLOADER: uploaderLabel,
      TIMESTAMP: timestamp,
    };
    const { renderEmail } = await import("./email-templates");
    const rendered = await renderEmail("document_upload_notification", tokens);

    await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
      message: {
        subject: rendered.subject,
        body: { contentType: 'HTML', content: rendered.html },
        toRecipients: [{ emailAddress: { address: SENDER_EMAIL, name: 'Livaware Onboarding' } }],
        attachments: [{
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: originalFilename,
          contentType: mimeType || 'application/octet-stream',
          contentBytes: fileBuffer.toString('base64'),
        }],
      },
      saveToSentItems: false,
    });
  }

  export async function sendInvoiceSubmittedEmail(opts: {
    invoiceNumber: string;
    nurseName: string;
    nurseEmail: string;
    totalAmountGbp: string;
    totalHours: string;
    pdfBuffer: Buffer;
    recipientEmail?: string;
  }): Promise<void> {
    if (isEmailSendingSuppressed()) return;
    const client = await getGraphClient();
    const recipient = opts.recipientEmail || process.env.INVOICE_RECIPIENT_EMAIL || "invoices@livaware.co.uk";
    const tokens = {
      INVOICE_NUMBER: opts.invoiceNumber,
      NURSE_NAME: opts.nurseName,
      NURSE_EMAIL: opts.nurseEmail,
      TOTAL_HOURS: opts.totalHours,
      TOTAL_AMOUNT: opts.totalAmountGbp,
    };
    const rendered = await renderEmail("invoice_submitted", tokens);
    await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
      message: {
        subject: rendered.subject,
        body: { contentType: "HTML", content: rendered.html },
        toRecipients: [{ emailAddress: { address: recipient, name: "Livaware Invoices" } }],
        attachments: [{
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: `${opts.invoiceNumber}.pdf`,
          contentType: "application/pdf",
          contentBytes: opts.pdfBuffer.toString("base64"),
        }],
      },
      saveToSentItems: true,
    });
  }

  
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildReferenceRequestHtml(
  bodyText: string,
  refereeFormUrl: string,
  expiryFormatted: string
): string {
  const paragraphs = bodyText.split(/\n\n+/).filter(Boolean);
  const bodyHtml = paragraphs
    .map(p => {
      const safe = escapeHtml(p).replace(/\n/g, "<br />");
      return `<p style="font-size: 14px; color: #E0DCD4; line-height: 1.85;">${safe}</p>`;
    })
    .join("\n");

  return `
    <div style="font-family: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #020121;">
      <div style="background: #0a0a2e; padding: 28px 32px; text-align: center; border-bottom: 1px solid #1e1e5a;">
        <h1 style="color: #F0ECE4; font-family: 'Georgia', serif; font-size: 24px; font-weight: 400; margin: 0 0 4px; letter-spacing: -0.01em;">NurseOnboard</h1>
        <p style="color: #8A8A94; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin: 0;">Livaware Ltd — Reference Request</p>
      </div>

      <div style="padding: 32px;">
        ${bodyHtml}

        <div style="text-align: center; margin: 28px 0;">
          <a href="${refereeFormUrl}" style="display: inline-block; background-color: #C8A96E; background-image: linear-gradient(135deg, #C8A96E, #b8944e); color: #020121; text-decoration: none; padding: 14px 52px; border-radius: 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase;">
            Complete Reference Form
          </a>
        </div>

        <p style="font-size: 12px; color: #8A8A94; line-height: 1.6; word-break: break-all;">
          If the button above does not work, copy and paste this link into your browser:<br />
          <a href="${refereeFormUrl}" style="color: #C8A96E; text-decoration: underline;">${refereeFormUrl}</a>
        </p>

        <p style="font-size: 13px; color: #8A8A94; line-height: 1.6;">
          This link is unique to this reference request — please do not share it. It will expire on <strong style="color: #C8A96E;">${expiryFormatted}</strong>. The form typically takes 10–15 minutes to complete.
        </p>
      </div>

      <div style="background: #0a0a2e; padding: 16px 32px; text-align: center; border-top: 1px solid #1e1e5a;">
        <p style="font-size: 11px; color: #8A8A94; margin: 0;">
          Livaware Ltd — Secure Nurse Onboarding &middot; CQC Regulation 19 / Schedule 3 Compliant
        </p>
        <p style="font-size: 11px; color: #8A8A94; margin: 4px 0 0;">
          This is an automated message. Please do not reply directly to this email.
        </p>
      </div>
    </div>
  `;
}

export function getDefaultReferenceEmailBody(refereeName: string, candidateName: string): string {
  return `Dear ${refereeName},

We are writing to request a professional reference for ${candidateName}, who has applied for a nursing position with Livaware Ltd. They have provided your details as a professional referee.

Under CQC Regulation 19 (Schedule 3), we are required to obtain satisfactory references covering character, conduct, clinical competence, and suitability for the role. We would be grateful if you could complete our secure online reference form.

The form covers professional relationship and capacity, clinical ability and competency ratings, reliability, communication, and teamwork, conduct and fitness to practise, sickness absence record, and clinical competency assessment matching our framework. It typically takes 10–15 minutes to complete.

Your responses will be treated as confidential and used solely for the purpose of pre-employment screening in accordance with CQC requirements. If you have any questions, please contact our onboarding team.

Kind regards,
Livaware Onboarding Team`;
}

export function getReminderReferenceEmailBody(
  refereeName: string,
  candidateName: string,
  originalSentAt: Date | null | undefined,
  formUrl: string,
  expiresAt: Date,
): string {
  const expiryFormatted = expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const sentLine = originalSentAt
    ? `We initially wrote to you on ${originalSentAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })} to request a professional reference for ${candidateName}.`
    : `We previously wrote to you to request a professional reference for ${candidateName}.`;
  return `Dear ${refereeName},

Just a gentle reminder that we are still awaiting your reference for ${candidateName}.

${sentLine} If you have already responded, please accept our thanks and ignore this message.

We would be very grateful if you could complete our short, secure online reference form at your earliest convenience — it usually takes 10–15 minutes. Your responses help us meet our CQC Regulation 19 (Schedule 3) duties before ${candidateName} can begin work.

You can complete the form here: ${formUrl}

This secure link will remain valid until ${expiryFormatted}. If you have any questions or need the link resent, please reply to our onboarding team.

With thanks for your time,
Livaware Onboarding Team`;
}


  export async function sendReferenceRequestEmail(
    refereeEmail: string,
    refereeName: string,
    candidateName: string,
    refereeFormUrl: string,
    expiresAt: Date,
    customSubject?: string,
    customBody?: string,
  ) {
    // When the caller provides an explicit body (admin override / reminder
    // template) we render it directly with the legacy reference scaffold so
    // their per-instance prose wins. Otherwise we fall through to the
    // template registry so the editable defaults are used.
    if (customBody) {
      if (isEmailSendingSuppressed()) return;
      const client = await getGraphClient();
      const bodyText = customBody.replace(/\[FORM_URL\]/g, refereeFormUrl);
      const subject = customSubject || `Livaware Ltd — Reference Request for ${candidateName}`;
      const htmlBody = buildReferenceRequestHtml(bodyText, refereeFormUrl, formatExpiry(expiresAt));
      await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
        message: {
          subject,
          body: { contentType: 'HTML', content: htmlBody },
          toRecipients: [{ emailAddress: { address: refereeEmail, name: refereeName } }],
        },
        saveToSentItems: true,
      });
      return;
    }
    await sendViaTemplate({
      key: "reference_request",
      tokens: {
        REFEREE_NAME: refereeName,
        CANDIDATE_NAME: candidateName,
        FORM_URL: refereeFormUrl,
        EXPIRY: formatExpiry(expiresAt),
      },
      to: { email: refereeEmail, name: refereeName },
      subjectOverride: customSubject,
    });
  }

  export async function sendNurseInviteEmail(
    recipientEmail: string,
    recipientName: string,
    tempPassword: string,
    invitedBy: string,
  ) {
    await sendViaTemplate({
      key: "nurse_invite",
      tokens: {
        NAME: recipientName,
        EMAIL: recipientEmail,
        PASSWORD: tempPassword,
        INVITED_BY: invitedBy,
      },
      to: { email: recipientEmail, name: recipientName },
    });
  }

  export async function sendArcadeAssignmentEmail(opts: {
    recipientEmail: string;
    recipientName: string;
    moduleNames: string[];
    assignedBy: string;
    portalUrl: string;
    expiryFormatted: string;
  }) {
    const subjectModules =
      opts.moduleNames.length === 1
        ? opts.moduleNames[0]
        : `${opts.moduleNames.length} new modules`;
    await sendViaTemplate({
      key: "arcade_assignment",
      tokens: {
        NAME: opts.recipientName,
        ASSIGNED_BY: opts.assignedBy,
        MODULE_COUNT: String(opts.moduleNames.length),
        MODULES_LIST: opts.moduleNames.join("\n"),
        PORTAL_URL: opts.portalUrl,
        EXPIRY: opts.expiryFormatted,
      },
      to: { email: opts.recipientEmail, name: opts.recipientName },
      subjectOverride: `Skills Arcade — ${subjectModules} assigned to you`,
    });
  }


// ─────────────────────────────────────────────────────────────────────────
// Mailbox reading (document recovery): list messages with attachments from a
// given email address and download attachment bytes.
//
// REQUIRES the Azure app registration to have the application permission
// `Mail.ReadBasic.All` or `Mail.Read.All` granted with admin consent.
// ─────────────────────────────────────────────────────────────────────────

export interface MailboxAttachmentRef {
  messageId: string;
  receivedDateTime: string | null;
  subject: string | null;
  attachmentId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** Sender email (lowercased), used to distinguish inbound vs outbound. */
  fromAddress: string | null;
  /** Graph conversationId — used to restrict the chase-reply scan to the
   *  same Outlook thread as the original chase email. */
  conversationId: string | null;
}

/**
 * Find every message in SENDER_EMAIL's mailbox that involves `candidateEmail`
 * (either from or to) and has at least one file attachment, then return a
 * flat list of attachment references.
 */
export async function listMailboxAttachmentsForCandidate(candidateEmail: string): Promise<MailboxAttachmentRef[]> {
  if (!candidateEmail) return [];
  const SENDER_EMAIL = process.env.AZURE_AD_SENDER_EMAIL || "onboarding@livaware.co.uk";
  const client = await getGraphClient();

  // Search both directions. /messages?$search supports KQL-style queries.
  // We use $search rather than $filter because attachments + from/to filters
  // require ConsistencyLevel: eventual and complex query strings.
  const safeEmail = candidateEmail.replace(/"/g, '\\"');
  const query = `"from:${safeEmail}" OR "to:${safeEmail}"`;

  const results: MailboxAttachmentRef[] = [];
  let nextLink: string | null = `/users/${SENDER_EMAIL}/messages?$search=${encodeURIComponent(query)}&$top=50&$select=id,subject,receivedDateTime,hasAttachments,from,conversationId`;
  let page = 0;
  while (nextLink && page < 10) {
    page += 1;
    const resp: any = await client
      .api(nextLink)
      .header("ConsistencyLevel", "eventual")
      .get();

    const messages: any[] = resp?.value || [];
    for (const msg of messages) {
      if (!msg.hasAttachments) continue;
      try {
        const att: any = await client
          .api(`/users/${SENDER_EMAIL}/messages/${msg.id}/attachments?$select=id,name,contentType,size,isInline`)
          .get();
        for (const a of att?.value || []) {
          if (a.isInline) continue;
          // Only file attachments (skip item attachments / reference attachments)
          if (a["@odata.type"] && !String(a["@odata.type"]).includes("fileAttachment")) continue;
          const fromAddress: string | null =
            (msg.from?.emailAddress?.address && String(msg.from.emailAddress.address).toLowerCase()) || null;
          results.push({
            messageId: msg.id,
            subject: msg.subject ?? null,
            receivedDateTime: msg.receivedDateTime ?? null,
            attachmentId: a.id,
            filename: a.name || "attachment",
            contentType: a.contentType || "application/octet-stream",
            sizeBytes: a.size || 0,
            fromAddress,
            conversationId: msg.conversationId ?? null,
          });
        }
      } catch (attErr: any) {
        console.warn(`[listMailboxAttachmentsForCandidate] Could not read attachments for message ${msg.id}:`, attErr.message);
      }
    }

    nextLink = resp?.["@odata.nextLink"] || null;
    // Graph returns absolute URLs in @odata.nextLink, but the SDK's .api()
    // accepts both relative and absolute, so this works either way.
  }

  return results;
}

export async function downloadMailboxAttachment(messageId: string, attachmentId: string): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const SENDER_EMAIL = process.env.AZURE_AD_SENDER_EMAIL || "onboarding@livaware.co.uk";
  const client = await getGraphClient();
  const att: any = await client
    .api(`/users/${SENDER_EMAIL}/messages/${messageId}/attachments/${attachmentId}`)
    .get();

  if (!att?.contentBytes) {
    throw new Error(`Attachment ${attachmentId} on message ${messageId} has no contentBytes`);
  }
  return {
    buffer: Buffer.from(att.contentBytes, "base64"),
    filename: att.name || "attachment",
    contentType: att.contentType || "application/octet-stream",
  };
}
