import { ConfidentialClientApplication } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";

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

const PORTAL_INVITE_SUBJECT = "Livaware Ltd — Your Secure Portal Link";
const PORTAL_INVITE_SUBTITLE = "Livaware Ltd — Secure Nurse Portal";
const PORTAL_INVITE_BUTTON_LABEL = "Open Your Portal";
const PORTAL_INVITE_INFO_TITLE = "What to have handy";
const PORTAL_INVITE_INFO_ITEMS = [
  "Your NMC PIN, if you have one",
  "A right-to-work document (passport, visa or share code)",
  "Any training or qualification certificates you'd like on file",
];

export async function sendPortalInviteEmail(
  recipientEmail: string,
  recipientName: string,
  portalUrl: string,
  expiresAt: Date,
  _stage?: string,
) {
  void _stage;
  const client = await getGraphClient();

  const expiryFormatted = expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const infoItems = PORTAL_INVITE_INFO_ITEMS.map(item => `<li>${item}</li>`).join("\n            ");

  const htmlBody = `
    <div style="font-family: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #020121;">
      <div style="background: #0a0a2e; padding: 28px 32px; text-align: center; border-bottom: 1px solid #1e1e5a;">
        <h1 style="color: #F0ECE4; font-family: 'Georgia', serif; font-size: 24px; font-weight: 400; margin: 0 0 4px; letter-spacing: -0.01em;">NurseOnboard</h1>
        <p style="color: #8A8A94; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin: 0;">${PORTAL_INVITE_SUBTITLE}</p>
      </div>

      <div style="padding: 32px;">
        <p style="font-size: 16px; color: #F0ECE4; margin-bottom: 8px;">Dear ${recipientName},</p>

        <p style="font-size: 14px; color: #E0DCD4; line-height: 1.85;">
          Here is your secure personal link to the Livaware nurse portal. You can use it to pick up wherever you left off, update your details, or share anything we still need from you.
        </p>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${portalUrl}" style="display: inline-block; background-color: #C8A96E; background-image: linear-gradient(135deg, #C8A96E, #b8944e); color: #020121; text-decoration: none; padding: 14px 52px; border-radius: 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase;">
            ${PORTAL_INVITE_BUTTON_LABEL}
          </a>
        </div>

        <p style="font-size: 12px; color: #8A8A94; line-height: 1.6; word-break: break-all;">
          If the button above does not work, copy and paste this link into your browser:<br />
          <a href="${portalUrl}" style="color: #C8A96E; text-decoration: underline;">${portalUrl}</a>
        </p>

        <div style="background: #0d0d38; border-left: 3px solid #b8944e; padding: 18px 20px; border-radius: 0 6px 6px 0; margin: 24px 0;">
          <p style="font-size: 11px; color: #C8A96E; margin: 0 0 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase;">${PORTAL_INVITE_INFO_TITLE}</p>
          <ul style="font-size: 13px; color: #E0DCD4; line-height: 1.8; margin: 0; padding-left: 20px;">
            ${infoItems}
          </ul>
          <p style="font-size: 12px; color: #8A8A94; line-height: 1.6; margin: 12px 0 0;">
            Only share these if you need to — the portal will let you know what (if anything) is still outstanding.
          </p>
        </div>

        <p style="font-size: 13px; color: #8A8A94; line-height: 1.6;">
          This link is personal to you — please do not share it with anyone else. It's a one-time invite that signs you in on this device. After that, you'll sign in any time using your email and a 6-digit code we send you, so you can come back from any device. (For reference, the invite link itself expires on <strong style="color: #C8A96E;">${expiryFormatted}</strong>.)
        </p>

        <p style="font-size: 13px; color: #8A8A94; line-height: 1.6;">
          If you have any questions or difficulty accessing the portal, please contact our onboarding team.
        </p>

        <p style="font-size: 14px; color: #E0DCD4; margin-top: 24px;">
          Kind regards,<br />
          <strong style="color: #F0ECE4;">Livaware Onboarding Team</strong>
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

  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject: PORTAL_INVITE_SUBJECT,
      body: {
        contentType: 'HTML',
        content: htmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: recipientEmail,
            name: recipientName,
          },
        },
      ],
    },
    saveToSentItems: true,
  });
}

// ─── Applicant welcome email ─────────────────────────────────────────
// First-touch email sent when admin registers a new applicant. Warmer
// and more on-brand than the generic portal-invite email because this
// is the candidate's first contact with Livaware — should set the tone
// for the rest of the journey.
const APPLICANT_WELCOME_SUBJECT = "Welcome to Livaware — your journey starts here";

export async function sendApplicantWelcomeEmail(
  recipientEmail: string,
  recipientName: string,
  portalUrl: string,
  expiresAt: Date,
) {
  const client = await getGraphClient();

  const expiryFormatted = expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Use only the first name in the greeting to feel less like a form letter.
  const firstName = (recipientName || "").trim().split(/\s+/)[0] || "there";

  const htmlBody = `
    <div style="font-family: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #020121;">

      <div style="background: linear-gradient(135deg, #0a0a2e 0%, #0d0d38 100%); padding: 36px 32px 32px; text-align: center; border-bottom: 1px solid #1e1e5a;">
        <p style="color: #C8A96E; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; margin: 0 0 8px; font-weight: 500;">Your journey starts here</p>
        <h1 style="color: #F0ECE4; font-family: 'Georgia', serif; font-size: 28px; font-weight: 400; margin: 0 0 6px; letter-spacing: -0.01em;">Livaware</h1>
        <p style="color: #8A8A94; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin: 0;">Nurse Onboarding Portal</p>
      </div>

      <div style="padding: 36px 32px 28px;">
        <p style="font-size: 17px; color: #F0ECE4; margin: 0 0 16px; font-family: 'Georgia', serif; font-weight: 400;">Hello ${firstName},</p>

        <p style="font-size: 14px; color: #E0DCD4; line-height: 1.85; margin: 0 0 16px;">
          A warm welcome to Livaware, and thank you for taking the first step with us. We're delighted you're considering joining our team of nurses, and we've set everything up so that getting to know us is as straightforward as possible.
        </p>

        <p style="font-size: 14px; color: #E0DCD4; line-height: 1.85; margin: 0 0 24px;">
          Your secure personal portal is ready — it's where you'll complete each step of your application in your own time, at your own pace. Tap the button below to open it for the first time and you'll be signed in straight away on this device.
        </p>

        <div style="text-align: center; margin: 32px 0;">
          <a href="${portalUrl}" style="display: inline-block; background-color: #C8A96E; background-image: linear-gradient(135deg, #C8A96E, #b8944e); color: #020121; text-decoration: none; padding: 16px 56px; border-radius: 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.20em; text-transform: uppercase; box-shadow: 0 4px 12px rgba(200, 169, 110, 0.25);">
            Open My Portal
          </a>
        </div>

        <p style="font-size: 12px; color: #8A8A94; line-height: 1.6; word-break: break-all; text-align: center; margin: 0 0 28px;">
          Or paste this link into your browser:<br />
          <a href="${portalUrl}" style="color: #C8A96E; text-decoration: underline;">${portalUrl}</a>
        </p>

        <div style="background: #0d0d38; border-left: 3px solid #C8A96E; padding: 20px 22px; border-radius: 0 6px 6px 0; margin: 0 0 24px;">
          <p style="font-size: 11px; color: #C8A96E; margin: 0 0 12px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase;">Your three steps with us</p>
          <ol style="font-size: 13px; color: #E0DCD4; line-height: 1.85; margin: 0; padding-left: 22px;">
            <li><strong style="color: #F0ECE4;">A short clinical assessment</strong> — around 10–15 minutes online. A friendly first look at how you approach real-world scenarios; you can pause and come back to it any time.</li>
            <li><strong style="color: #F0ECE4;">Share your documents</strong> — passport, right-to-work, NMC PIN and any training certificates. Upload from your phone or laptop, whichever's easier.</li>
            <li><strong style="color: #F0ECE4;">Skills Arcade</strong> — short interactive scenarios so you can show us how you think on the floor, and we get a sense of where you'll shine.</li>
          </ol>
        </div>

        <div style="background: rgba(200, 169, 110, 0.06); border: 1px solid rgba(200, 169, 110, 0.15); padding: 16px 20px; border-radius: 6px; margin: 0 0 24px;">
          <p style="font-size: 12px; color: #C8A96E; margin: 0 0 6px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase;">Good to know</p>
          <p style="font-size: 13px; color: #E0DCD4; line-height: 1.7; margin: 0;">
            This link is personal to you — please keep it private. After this first sign-in, you'll come back any time using your email address and a 6-digit code we send you, so you can pick up from any device. For reference, this initial invite link expires on <strong style="color: #C8A96E;">${expiryFormatted}</strong>.
          </p>
        </div>

        <p style="font-size: 13px; color: #B0AAA0; line-height: 1.7; margin: 0 0 8px;">
          If anything's unclear or you hit a snag along the way, just reply to this email and a real person on our onboarding team will get back to you.
        </p>

        <p style="font-size: 14px; color: #E0DCD4; margin-top: 28px; line-height: 1.7;">
          Looking forward to getting to know you,<br />
          <strong style="color: #F0ECE4;">The Livaware Onboarding Team</strong>
        </p>
      </div>

      <div style="background: #0a0a2e; padding: 18px 32px; text-align: center; border-top: 1px solid #1e1e5a;">
        <p style="font-size: 11px; color: #8A8A94; margin: 0;">
          Livaware Ltd — Secure Nurse Onboarding &middot; CQC Regulation 19 / Schedule 3 Compliant
        </p>
        <p style="font-size: 11px; color: #8A8A94; margin: 4px 0 0;">
          Replies to this email reach our onboarding team directly.
        </p>
      </div>
    </div>
  `;

  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject: APPLICANT_WELCOME_SUBJECT,
      body: { contentType: "HTML", content: htmlBody },
      toRecipients: [
        { emailAddress: { address: recipientEmail, name: recipientName } },
      ],
    },
    saveToSentItems: true,
  });
}

// ─── Portal passwordless sign-in code email (task 107) ───────────────
export async function sendPortalSignInCodeEmail(
  recipientEmail: string,
  recipientName: string,
  code: string,
  expiresAt: Date,
) {
  const client = await getGraphClient();
  const minutesLeft = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));
  const htmlBody = `
    <div style="font-family: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #020121;">
      <div style="background: #0a0a2e; padding: 28px 32px; text-align: center; border-bottom: 1px solid #1e1e5a;">
        <h1 style="color: #F0ECE4; font-family: 'Georgia', serif; font-size: 24px; font-weight: 400; margin: 0 0 4px;">NurseOnboard</h1>
        <p style="color: #8A8A94; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin: 0;">Livaware Ltd — Sign-in code</p>
      </div>
      <div style="padding: 32px;">
        <p style="font-size: 16px; color: #F0ECE4; margin-bottom: 8px;">Dear ${recipientName},</p>
        <p style="font-size: 14px; color: #E0DCD4; line-height: 1.85;">
          Use the code below to sign back in to your Livaware nurse portal. It is valid for the next <strong style="color:#C8A96E;">${minutesLeft} minutes</strong> and can only be used once.
        </p>
        <div style="text-align:center; margin: 28px 0;">
          <div style="display:inline-block; background:#0d0d38; border:1px solid #1e1e5a; padding:18px 32px; border-radius:8px; font-family:'Courier New', monospace; font-size:32px; letter-spacing:0.32em; color:#C8A96E; font-weight:600;">${code}</div>
        </div>
        <p style="font-size:13px; color:#8A8A94; line-height:1.6;">
          If you did not request this code, you can safely ignore this email — your account stays locked until someone enters the code.
        </p>
        <p style="font-size: 14px; color: #E0DCD4; margin-top: 24px;">
          Kind regards,<br/><strong style="color:#F0ECE4;">Livaware Onboarding Team</strong>
        </p>
      </div>
      <div style="background: #0a0a2e; padding: 16px 32px; text-align: center; border-top: 1px solid #1e1e5a;">
        <p style="font-size: 11px; color: #8A8A94; margin: 0;">Livaware Ltd — Secure Nurse Onboarding</p>
        <p style="font-size: 11px; color: #8A8A94; margin: 4px 0 0;">This is an automated message. Please do not reply directly to this email.</p>
      </div>
    </div>
  `;
  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject: "Livaware Ltd — Your portal sign-in code",
      body: { contentType: "HTML", content: htmlBody },
      toRecipients: [{ emailAddress: { address: recipientEmail, name: recipientName } }],
    },
    saveToSentItems: true,
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
  const client = await getGraphClient();

  const timestamp = new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const uploaderLabel = uploadedBy === "nurse" ? "Nurse (via portal)" : "Admin";

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #020121;">Document Upload Notification</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 8px; font-weight: 600; color: #555;">Candidate</td><td style="padding: 8px;">${candidateName}</td></tr>
        <tr><td style="padding: 8px; font-weight: 600; color: #555;">Document Category</td><td style="padding: 8px;">${category}</td></tr>
        <tr><td style="padding: 8px; font-weight: 600; color: #555;">Filename</td><td style="padding: 8px;">${originalFilename}</td></tr>
        <tr><td style="padding: 8px; font-weight: 600; color: #555;">Uploaded By</td><td style="padding: 8px;">${uploaderLabel}</td></tr>
        <tr><td style="padding: 8px; font-weight: 600; color: #555;">Timestamp</td><td style="padding: 8px;">${timestamp}</td></tr>
      </table>
      <p style="font-size: 12px; color: #888;">This is an automated notification from NurseOnboard. The uploaded file is attached to this email.</p>
    </div>
  `;

  const base64Content = fileBuffer.toString('base64');

  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject: `Document Upload — ${candidateName} — ${category}`,
      body: {
        contentType: 'HTML',
        content: htmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: SENDER_EMAIL,
            name: 'Livaware Onboarding',
          },
        },
      ],
      attachments: [
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: originalFilename,
          contentType: mimeType || 'application/octet-stream',
          contentBytes: base64Content,
        },
      ],
    },
    saveToSentItems: false,
  });
}

// ─── Invoice submission email (task #134) ─────────────────────────────
// Sent whenever a nurse (or admin on behalf) submits a timesheet invoice.
// The PDF is attached and a copy of the email is dropped in Sent Items
// so the audit trail in Outlook matches the in-app audit log.
export async function sendInvoiceSubmittedEmail(opts: {
  invoiceNumber: string;
  nurseName: string;
  nurseEmail: string;
  totalAmountGbp: string;
  totalHours: string;
  pdfBuffer: Buffer;
  recipientEmail?: string;
}): Promise<void> {
  const client = await getGraphClient();
  const recipient = opts.recipientEmail || process.env.INVOICE_RECIPIENT_EMAIL || "invoices@livaware.co.uk";
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #020121; padding: 20px 28px; border-bottom: 3px solid #C8A96E;">
        <h1 style="color:#F0ECE4; font-family: Georgia, serif; font-weight: 400; font-size: 22px; margin: 0;">Invoice ${opts.invoiceNumber}</h1>
        <p style="color:#8A8A94; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; margin: 4px 0 0;">Livaware NurseOnboard — New submission</p>
      </div>
      <div style="padding: 24px 28px;">
        <p style="font-size:14px; color:#222; margin: 0 0 16px;">A new nurse timesheet invoice has been submitted.</p>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <tr><td style="padding:6px 0; color:#666;">Invoice</td><td style="padding:6px 0; font-weight:600;">${opts.invoiceNumber}</td></tr>
          <tr><td style="padding:6px 0; color:#666;">Nurse</td><td style="padding:6px 0;">${opts.nurseName} &lt;${opts.nurseEmail}&gt;</td></tr>
          <tr><td style="padding:6px 0; color:#666;">Total hours</td><td style="padding:6px 0;">${opts.totalHours} h</td></tr>
          <tr><td style="padding:6px 0; color:#666;">Total amount</td><td style="padding:6px 0; font-weight:600; color:#020121;">${opts.totalAmountGbp}</td></tr>
        </table>
        <p style="font-size:12px; color:#888; margin:18px 0 0;">The full invoice is attached as a PDF and is also available in the admin platform under Reports → Invoices.</p>
      </div>
    </div>
  `;
  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject: `Invoice ${opts.invoiceNumber} — ${opts.nurseName}`,
      body: { contentType: "HTML", content: html },
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
  customBody?: string
) {
  const client = await getGraphClient();

  const expiryFormatted = expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const rawBody = customBody || getDefaultReferenceEmailBody(refereeName, candidateName);
  const bodyText = rawBody.replace(/\[FORM_URL\]/g, refereeFormUrl);
  const subject = customSubject || `Livaware Ltd — Reference Request for ${candidateName}`;
  const htmlBody = buildReferenceRequestHtml(bodyText, refereeFormUrl, expiryFormatted);

  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject,
      body: {
        contentType: 'HTML',
        content: htmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: refereeEmail,
            name: refereeName,
          },
        },
      ],
    },
    saveToSentItems: true,
  });
}

export async function sendNurseInviteEmail(
  recipientEmail: string,
  recipientName: string,
  tempPassword: string,
  invitedBy: string
) {
  const client = await getGraphClient();

  const htmlBody = `
    <div style="font-family: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #020121;">
      <div style="background: #0a0a2e; padding: 28px 32px; text-align: center; border-bottom: 1px solid #1e1e5a;">
        <h1 style="color: #F0ECE4; font-family: 'Georgia', serif; font-size: 24px; font-weight: 400; margin: 0 0 4px; letter-spacing: -0.01em;">NurseOnboard</h1>
        <p style="color: #8A8A94; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin: 0;">Livaware Ltd — Skills Arcade Invitation</p>
      </div>

      <div style="padding: 32px;">
        <p style="font-size: 16px; color: #F0ECE4; margin-bottom: 8px;">Dear ${recipientName},</p>

        <p style="font-size: 14px; color: #E0DCD4; line-height: 1.85;">
          You have been invited by ${invitedBy} to join the Livaware Skills Arcade — our online training and competency platform for nursing professionals.
        </p>

        <p style="font-size: 14px; color: #E0DCD4; line-height: 1.85;">
          Please use the credentials below to log in and begin your assigned training modules.
        </p>

        <div style="background: #0d0d38; border-left: 3px solid #b8944e; padding: 18px 20px; border-radius: 0 6px 6px 0; margin: 24px 0;">
          <p style="font-size: 11px; color: #C8A96E; margin: 0 0 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase;">Your Login Credentials</p>
          <p style="font-size: 14px; color: #E0DCD4; margin: 4px 0;"><strong style="color: #F0ECE4;">Email:</strong> ${recipientEmail}</p>
          <p style="font-size: 14px; color: #E0DCD4; margin: 4px 0;"><strong style="color: #F0ECE4;">Temporary Password:</strong> ${tempPassword}</p>
        </div>

        <p style="font-size: 13px; color: #8A8A94; line-height: 1.6;">
          For security, please change your password after your first login. If you have any questions, contact the onboarding team.
        </p>

        <p style="font-size: 14px; color: #E0DCD4; margin-top: 24px;">
          Kind regards,<br />
          <strong style="color: #F0ECE4;">Livaware Onboarding Team</strong>
        </p>
      </div>

      <div style="background: #0a0a2e; padding: 16px 32px; text-align: center; border-top: 1px solid #1e1e5a;">
        <p style="font-size: 11px; color: #8A8A94; margin: 0;">
          Livaware Ltd — Secure Nurse Onboarding &middot; Skills Arcade
        </p>
        <p style="font-size: 11px; color: #8A8A94; margin: 4px 0 0;">
          This is an automated message. Please do not reply directly to this email.
        </p>
      </div>
    </div>
  `;

  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject: `Livaware Skills Arcade — Your Login Credentials`,
      body: {
        contentType: 'HTML',
        content: htmlBody,
      },
      toRecipients: [
        {
          emailAddress: {
            address: recipientEmail,
            name: recipientName,
          },
        },
      ],
    },
    saveToSentItems: true,
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
  const client = await getGraphClient();
  const moduleListHtml = opts.moduleNames
    .map(
      (m) =>
        `<li style="font-size: 14px; color: #E0DCD4; line-height: 1.85; margin-bottom: 4px;">${escapeHtml(m)}</li>`,
    )
    .join("");
  const subjectModules =
    opts.moduleNames.length === 1
      ? opts.moduleNames[0]
      : `${opts.moduleNames.length} new modules`;
  const subject = `Skills Arcade — ${subjectModules} assigned to you`;
  const htmlBody = `
    <div style="font-family: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #020121;">
      <div style="background: #0a0a2e; padding: 28px 32px; text-align: center; border-bottom: 1px solid #1e1e5a;">
        <h1 style="color: #F0ECE4; font-family: 'Georgia', serif; font-size: 24px; font-weight: 400; margin: 0 0 4px; letter-spacing: -0.01em;">NurseOnboard</h1>
        <p style="color: #8A8A94; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin: 0;">Livaware Ltd — Skills Arcade Assignment</p>
      </div>

      <div style="padding: 32px;">
        <p style="font-size: 16px; color: #F0ECE4; margin-bottom: 8px;">Dear ${escapeHtml(opts.recipientName)},</p>

        <p style="font-size: 14px; color: #E0DCD4; line-height: 1.85;">
          ${escapeHtml(opts.assignedBy)} has assigned you ${
            opts.moduleNames.length === 1
              ? "a new clinical scenario"
              : `${opts.moduleNames.length} new clinical scenarios`
          } to complete in your Skills Arcade.
        </p>

        <div style="background: #0d0d38; border-left: 3px solid #b8944e; padding: 18px 20px; border-radius: 0 6px 6px 0; margin: 24px 0;">
          <p style="font-size: 11px; color: #C8A96E; margin: 0 0 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase;">New modules</p>
          <ul style="margin: 0; padding-left: 20px;">
            ${moduleListHtml}
          </ul>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${opts.portalUrl}" style="display: inline-block; background-color: #C8A96E; background-image: linear-gradient(135deg, #C8A96E, #b8944e); color: #020121; text-decoration: none; padding: 14px 52px; border-radius: 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase;">
            Open Skills Arcade
          </a>
        </div>

        <p style="font-size: 12px; color: #8A8A94; line-height: 1.6; word-break: break-all;">
          If the button above does not work, copy and paste this link into your browser:<br />
          <a href="${opts.portalUrl}" style="color: #C8A96E; text-decoration: underline;">${opts.portalUrl}</a>
        </p>

        <p style="font-size: 13px; color: #8A8A94; line-height: 1.6;">
          This link is personal to you — please do not share it. It will expire on <strong style="color: #C8A96E;">${opts.expiryFormatted}</strong>. You can save your progress at any time and come back to it later.
        </p>

        <p style="font-size: 14px; color: #E0DCD4; margin-top: 24px;">
          Kind regards,<br />
          <strong style="color: #F0ECE4;">Livaware Onboarding Team</strong>
        </p>
      </div>

      <div style="background: #0a0a2e; padding: 16px 32px; text-align: center; border-top: 1px solid #1e1e5a;">
        <p style="font-size: 11px; color: #8A8A94; margin: 0;">
          Livaware Ltd — Secure Nurse Onboarding &middot; Skills Arcade
        </p>
        <p style="font-size: 11px; color: #8A8A94; margin: 4px 0 0;">
          This is an automated message. Please do not reply directly to this email.
        </p>
      </div>
    </div>
  `;

  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject,
      body: { contentType: "HTML", content: htmlBody },
      toRecipients: [
        { emailAddress: { address: opts.recipientEmail, name: opts.recipientName } },
      ],
    },
    saveToSentItems: true,
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
