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

async function getGraphClient(): Promise<Client> {
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

export async function sendPortalInviteEmail(
  recipientEmail: string,
  recipientName: string,
  portalUrl: string,
  expiresAt: Date
) {
  const client = await getGraphClient();

  const expiryFormatted = expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const htmlBody = `
    <div style="font-family: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #020121;">
      <div style="background: #0a0a2e; padding: 28px 32px; text-align: center; border-bottom: 1px solid #1e1e5a;">
        <h1 style="color: #F0ECE4; font-family: 'Georgia', serif; font-size: 24px; font-weight: 400; margin: 0 0 4px; letter-spacing: -0.01em;">NurseOnboard</h1>
        <p style="color: #8A8A94; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin: 0;">Livaware Ltd — Secure Onboarding Portal</p>
      </div>

      <div style="padding: 32px;">
        <p style="font-size: 16px; color: #F0ECE4; margin-bottom: 8px;">Dear ${recipientName},</p>

        <p style="font-size: 14px; color: #E0DCD4; line-height: 1.85;">
          Welcome to Livaware Ltd. We are pleased to invite you to complete your onboarding through our secure NurseOnboard portal. This process covers all the pre-employment checks required under CQC Regulation 19 / Schedule 3.
        </p>

        <p style="font-size: 14px; color: #E0DCD4; line-height: 1.85;">
          Please click the button below to access your personal onboarding portal. You will be asked to complete 11 steps including identity verification, NMC PIN, DBS details, right to work, competency declarations, mandatory training, and more.
        </p>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #C8A96E, #b8944e); color: #020121; text-decoration: none; padding: 14px 52px; border-radius: 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase;">
            Open Your Onboarding Portal
          </a>
        </div>

        <div style="background: #0d0d38; border-left: 3px solid #b8944e; padding: 18px 20px; border-radius: 0 6px 6px 0; margin: 24px 0;">
          <p style="font-size: 11px; color: #C8A96E; margin: 0 0 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase;">What you will need</p>
          <ul style="font-size: 13px; color: #E0DCD4; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>Your NMC PIN number</li>
            <li>DBS certificate (number and scan)</li>
            <li>Passport, visa or right to work document (scan/photo)</li>
            <li>CV (PDF format preferred)</li>
            <li>Training certificates for all 15 mandatory modules</li>
            <li>Professional indemnity insurance details</li>
            <li>Two professional referee contact details</li>
            <li>Immunisation records (if available)</li>
          </ul>
        </div>

        <p style="font-size: 13px; color: #8A8A94; line-height: 1.6;">
          This link is personal to you — please do not share it with anyone else. It will expire on <strong style="color: #C8A96E;">${expiryFormatted}</strong>. You can save your progress at any time and return to complete the remaining steps later.
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
      subject: `Livaware Ltd — Complete Your Nurse Onboarding`,
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
          <a href="${refereeFormUrl}" style="display: inline-block; background: linear-gradient(135deg, #C8A96E, #b8944e); color: #020121; text-decoration: none; padding: 14px 52px; border-radius: 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase;">
            Complete Reference Form
          </a>
        </div>

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

  const bodyText = customBody || getDefaultReferenceEmailBody(refereeName, candidateName);
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
