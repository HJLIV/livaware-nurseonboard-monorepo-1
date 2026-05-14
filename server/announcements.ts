import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient, isOutlookConfigured } from "./outlook";
import { storage } from "./storage";

const SENDER_EMAIL = process.env.AZURE_AD_SENDER_EMAIL || "onboarding@livaware.co.uk";

export const PLATFORM_UPDATE_SUBJECT =
  "Livaware Ltd — Important update to your nurse portal";

export interface AnnouncementResult {
  attempted: number;
  sent: number;
  failed: { nurseId: string; email: string; error: string }[];
}

export function buildPlatformUpdateHtml(recipientName: string): string {
  return `
    <div style="font-family: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #020121;">
      <div style="background: #0a0a2e; padding: 28px 32px; text-align: center; border-bottom: 1px solid #1e1e5a;">
        <h1 style="color: #F0ECE4; font-family: 'Georgia', serif; font-size: 24px; font-weight: 400; margin: 0 0 4px; letter-spacing: -0.01em;">NurseOnboard</h1>
        <p style="color: #8A8A94; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin: 0;">Livaware Ltd — Platform Update</p>
      </div>

      <div style="padding: 32px;">
        <p style="font-size: 16px; color: #F0ECE4; margin-bottom: 8px;">Dear ${recipientName},</p>

        <p style="font-size: 14px; color: #E0DCD4; line-height: 1.85;">
          We've made some important changes to your Livaware nurse portal that we want you to know about. Nothing you've already submitted has been lost — your existing progress and documents are all still safely on file.
        </p>

        <h2 style="color: #C8A96E; font-family: 'Georgia', serif; font-size: 18px; font-weight: 400; margin: 28px 0 8px;">What's changed</h2>

        <div style="background: #0d0d38; border-left: 3px solid #b8944e; padding: 16px 20px; border-radius: 0 6px 6px 0; margin: 14px 0;">
          <p style="font-size: 13px; color: #C8A96E; margin: 0 0 6px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;">1. Clinical Skills Arcade</p>
          <p style="font-size: 13px; color: #E0DCD4; line-height: 1.7; margin: 0;">
            Your assigned scenario modules are available in your portal under <strong>Skills Arcade</strong>. Please complete any outstanding modules — your trainer can see your progress and will follow up on anything you miss.
          </p>
        </div>

        <div style="background: #0d0d38; border-left: 3px solid #b8944e; padding: 16px 20px; border-radius: 0 6px 6px 0; margin: 14px 0;">
          <p style="font-size: 13px; color: #C8A96E; margin: 0 0 6px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;">2. Policies &amp; SOP comprehension</p>
          <p style="font-size: 13px; color: #E0DCD4; line-height: 1.7; margin: 0;">
            We now publish all policies and Standard Operating Procedures (SOPs) you must read directly in your portal. After reading each one you'll be asked a short comprehension question to confirm you've understood it. These are <strong>required</strong> before you can be released to work.
          </p>
          <p style="font-size: 12px; color: #8A8A94; line-height: 1.6; margin: 8px 0 0;">
            Please note: the <em>Policies</em> and <em>Induction (SOPs)</em> sections only unlock after we've reviewed and approved your onboarding. You may see them as <strong>"Locked"</strong> in your sidebar until then — that's expected.
          </p>
        </div>

        <div style="background: #0d0d38; border-left: 3px solid #b8944e; padding: 16px 20px; border-radius: 0 6px 6px 0; margin: 14px 0;">
          <p style="font-size: 13px; color: #C8A96E; margin: 0 0 6px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;">3. Availability (coming soon)</p>
          <p style="font-size: 13px; color: #E0DCD4; line-height: 1.7; margin: 0;">
            Very soon you'll be able to set your AM / PM / Night availability for the months ahead directly in the portal. We'll email you again as soon as this is live with instructions on how to use it.
          </p>
        </div>

        <h2 style="color: #C8A96E; font-family: 'Georgia', serif; font-size: 18px; font-weight: 400; margin: 28px 0 8px;">What you need to do</h2>

        <ul style="font-size: 13px; color: #E0DCD4; line-height: 1.85; padding-left: 20px; margin: 8px 0 16px;">
          <li>Sign in to your portal and finish any outstanding <strong>Assessment</strong> items (clinical examination, competency declaration, CV upload).</li>
          <li>Work through your assigned <strong>Skills Arcade</strong> modules.</li>
          <li>Once your onboarding is approved, complete the <strong>Policies</strong> and <strong>SOP comprehension</strong> sections.</li>
          <li>Watch out for our follow-up email about <strong>Availability</strong>.</li>
        </ul>

        <p style="font-size: 13px; color: #8A8A94; line-height: 1.6;">
          If you've lost your portal link, just reply to this email and we'll send you a fresh one. If you have any questions about the changes or what's expected of you, our onboarding team is happy to help.
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
      </div>
    </div>
  `;
}

export function buildPlatformUpdatePlainText(recipientName: string): string {
  return [
    `Dear ${recipientName},`,
    "",
    "We've made some important changes to your Livaware nurse portal. Nothing you've already submitted has been lost.",
    "",
    "WHAT'S CHANGED",
    "",
    "1) Clinical Skills Arcade — your assigned scenario modules are available under Skills Arcade in your portal.",
    "",
    "2) Policies & SOP comprehension — all policies and SOPs you must read are now in your portal, each followed by a short comprehension question. These are required before you can be released to work. They unlock only after we've reviewed and approved your onboarding, so they may show as 'Locked' until then.",
    "",
    "3) Availability (coming soon) — soon you'll be able to set your AM/PM/Night availability for months ahead. We'll email you again when it goes live.",
    "",
    "WHAT YOU NEED TO DO",
    " - Sign in and finish your Assessment items (clinical examination, competency declaration, CV upload).",
    " - Work through your Skills Arcade modules.",
    " - Once approved, complete Policies and SOP comprehension.",
    " - Watch for our follow-up email about Availability.",
    "",
    "If you've lost your portal link, reply to this email and we'll send a fresh one.",
    "",
    "Kind regards,",
    "Livaware Onboarding Team",
  ].join("\n");
}

async function sendOne(
  client: Client,
  recipientEmail: string,
  recipientName: string,
): Promise<void> {
  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject: PLATFORM_UPDATE_SUBJECT,
      body: { contentType: "HTML", content: buildPlatformUpdateHtml(recipientName) },
      toRecipients: [
        { emailAddress: { address: recipientEmail, name: recipientName } },
      ],
    },
    saveToSentItems: true,
  });
}

export async function sendPlatformUpdateAnnouncement(opts: {
  agentName: string;
}): Promise<AnnouncementResult> {
  if (!isOutlookConfigured()) {
    throw new Error("Outlook is not configured (Azure AD env vars missing).");
  }
  const client = await getGraphClient();
  const nurses = await storage.getCandidates();
  const recipients = nurses.filter(
    (n) => !!n.email && !!n.fullName && n.currentStage !== "withdrawn",
  );
  const result: AnnouncementResult = { attempted: recipients.length, sent: 0, failed: [] };

  for (const n of recipients) {
    try {
      await sendOne(client, n.email!, n.fullName);
      result.sent += 1;
      await storage.createAuditLog({
        nurseId: n.id,
        action: "platform_update_announcement_sent",
        agentName: opts.agentName,
        detail: { subject: PLATFORM_UPDATE_SUBJECT, email: n.email },
      });
    } catch (err: any) {
      const message = err?.message || String(err);
      result.failed.push({ nurseId: n.id, email: n.email!, error: message });
    }
  }
  return result;
}
