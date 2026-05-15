import { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient, isOutlookConfigured } from "./outlook";
import { storage } from "./storage";

const SENDER_EMAIL = process.env.AZURE_AD_SENDER_EMAIL || "onboarding@livaware.co.uk";

export const PLATFORM_UPDATE_KEY = "platform_update_announcement";
export const LAUNCH_ANNOUNCEMENT_KEY = "launch_announcement";

export const PORTAL_PUBLIC_URL =
  process.env.PORTAL_PUBLIC_URL || "https://onboard.livaware.co.uk";

export function getLaunchVideoUrl(): string | undefined {
  const v = process.env.PLATFORM_VIDEO_URL;
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

export interface AnnouncementResult {
  attempted: number;
  sent: number;
  failed: { nurseId: string; email: string; error: string }[];
}

// ==================== Default templates ====================
// These are the seed values written to the email_templates table the
// first time each template is requested. After that the Super Admin can
// edit them in /settings and the DB row wins.

export const PLATFORM_UPDATE_DEFAULT = {
  subject: "Livaware Ltd — Important update to your nurse portal",
  bodyHtml: `
    <div style="font-family: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #020121;">
      <div style="background: #0a0a2e; padding: 28px 32px; text-align: center; border-bottom: 1px solid #1e1e5a;">
        <h1 style="color: #F0ECE4; font-family: 'Georgia', serif; font-size: 24px; font-weight: 400; margin: 0 0 4px; letter-spacing: -0.01em;">NurseOnboard</h1>
        <p style="color: #8A8A94; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin: 0;">Livaware Ltd — Platform Update</p>
      </div>

      <div style="padding: 32px;">
        <p style="font-size: 16px; color: #F0ECE4; margin-bottom: 8px;">Dear {{NAME}},</p>

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
          <p style="font-size: 13px; color: #C8A96E; margin: 0 0 6px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;">3. Availability</p>
          <p style="font-size: 13px; color: #E0DCD4; line-height: 1.7; margin: 0;">
            You can now set your <strong>Day &amp; Night</strong> availability for the months ahead directly in the portal under <strong>Availability</strong>. Keeping it up to date helps us match you to the right shifts.
          </p>
        </div>

        <div style="background: #0d0d38; border-left: 3px solid #b8944e; padding: 16px 20px; border-radius: 0 6px 6px 0; margin: 14px 0;">
          <p style="font-size: 13px; color: #C8A96E; margin: 0 0 6px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;">4. Invoicing</p>
          <p style="font-size: 13px; color: #E0DCD4; line-height: 1.7; margin: 0;">
            Submit your timesheets and invoices directly in the portal under <strong>Finance → Invoices</strong>, and download a PDF copy of every submission. From <strong>1 June 2026</strong>, this is the only accepted route — the legacy invoicing system is being deprecated end of <strong>May 2026</strong>.
          </p>
        </div>

        <h2 style="color: #C8A96E; font-family: 'Georgia', serif; font-size: 18px; font-weight: 400; margin: 28px 0 8px;">What you need to do</h2>

        <ul style="font-size: 13px; color: #E0DCD4; line-height: 1.85; padding-left: 20px; margin: 8px 0 16px;">
          <li>Sign in to your portal and finish any outstanding <strong>Assessment</strong> items (clinical examination, competency declaration, CV upload).</li>
          <li>Work through your assigned <strong>Skills Arcade</strong> modules.</li>
          <li>Once your onboarding is approved, complete the <strong>Policies</strong> and <strong>SOP comprehension</strong> sections.</li>
          <li>Set your <strong>Day &amp; Night availability</strong> for the months ahead.</li>
          <li>From 1 June 2026, submit all timesheets and invoices via <strong>Finance → Invoices</strong> in the portal.</li>
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
  `,
  bodyText: [
    `Dear {{NAME}},`,
    "",
    "We've made some important changes to your Livaware nurse portal. Nothing you've already submitted has been lost.",
    "",
    "WHAT'S CHANGED",
    "",
    "1) Clinical Skills Arcade — your assigned scenario modules are available under Skills Arcade in your portal.",
    "",
    "2) Policies & SOP comprehension — all policies and SOPs you must read are now in your portal, each followed by a short comprehension question. These are required before you can be released to work. They unlock only after we've reviewed and approved your onboarding, so they may show as 'Locked' until then.",
    "",
    "3) Availability — set your Day & Night availability for the months ahead under Availability in the portal.",
    "",
    "4) Invoicing — submit timesheets and invoices under Finance > Invoices in the portal. From 1 June 2026 this is the only accepted route; the legacy invoicing system is being deprecated end of May 2026.",
    "",
    "WHAT YOU NEED TO DO",
    " - Sign in and finish your Assessment items (clinical examination, competency declaration, CV upload).",
    " - Work through your Skills Arcade modules.",
    " - Once approved, complete Policies and SOP comprehension.",
    " - Set your Day & Night availability for the months ahead.",
    " - From 1 June 2026, submit all timesheets and invoices via Finance > Invoices in the portal.",
    "",
    "If you've lost your portal link, reply to this email and we'll send a fresh one.",
    "",
    "Kind regards,",
    "Livaware Onboarding Team",
  ].join("\n"),
};

export const LAUNCH_ANNOUNCEMENT_DEFAULT = {
  subject: "Livaware NurseOnboard — Your new portal is live (and important invoicing change)",
  bodyHtml: `
    <div style="font-family: 'Be Vietnam Pro', 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #020121;">
      <div style="background: #0a0a2e; padding: 28px 32px; text-align: center; border-bottom: 1px solid #1e1e5a;">
        <h1 style="color: #F0ECE4; font-family: 'Georgia', serif; font-size: 24px; font-weight: 400; margin: 0 0 4px; letter-spacing: -0.01em;">NurseOnboard</h1>
        <p style="color: #8A8A94; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; margin: 0;">Livaware Ltd — Platform Launch</p>
      </div>

      <div style="padding: 32px;">
        <p style="font-size: 16px; color: #F0ECE4; margin-bottom: 8px;">Dear {{NAME}},</p>

        <p style="font-size: 14px; color: #E0DCD4; line-height: 1.85;">
          Your new <strong style="color:#F0ECE4;">Livaware NurseOnboard</strong> portal is live. It is the single home for your compliance, training, availability, and from now on — your timesheets and invoices.
        </p>

        {{#VIDEO_URL}}
        <h2 style="color: #C8A96E; font-family: 'Georgia', serif; font-size: 18px; font-weight: 400; margin: 28px 0 8px;">Watch the 2-minute walkthrough</h2>
        <p style="font-size: 13px; color: #E0DCD4; line-height: 1.85; margin: 0 0 14px;">
          The quickest way to get oriented is to watch our short explainer video — it covers everything new in under two minutes.
        </p>
        <div style="text-align: center; margin: 18px 0 28px;">
          <a href="{{VIDEO_URL}}" style="display: inline-block; background-color: #0d0d38; border: 1px solid #C8A96E; color: #C8A96E; text-decoration: none; padding: 14px 36px; border-radius: 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase;">
            ▶ Watch the explainer video
          </a>
        </div>
        {{/VIDEO_URL}}

        <h2 style="color: #C8A96E; font-family: 'Georgia', serif; font-size: 18px; font-weight: 400; margin: 28px 0 8px;">How to use the platform</h2>

        <ul style="font-size: 13px; color: #E0DCD4; line-height: 1.85; padding-left: 20px; margin: 8px 0 16px;">
          <li><strong style="color:#F0ECE4;">Compliance &amp; documents</strong> — keep your NMC, DBS, right-to-work and certificates on file in one place.</li>
          <li><strong style="color:#F0ECE4;">Declarations</strong> — confirm your competencies and health declarations whenever they're due.</li>
          <li><strong style="color:#F0ECE4;">Skills Arcade</strong> — work through assigned scenario modules at your own pace.</li>
          <li><strong style="color:#F0ECE4;">Availability</strong> — set your day &amp; night availability for the months ahead.</li>
          <li><strong style="color:#F0ECE4;">Invoicing</strong> — submit timesheets and download a paid PDF for every shift you work.</li>
        </ul>

        <h2 style="color: #C8A96E; font-family: 'Georgia', serif; font-size: 18px; font-weight: 400; margin: 28px 0 8px;">Sign in to see your profile</h2>

        <p style="font-size: 13px; color: #E0DCD4; line-height: 1.85;">
          Open the portal and sign in with the email address we have on file — you'll be sent a 6-digit verification code by email to complete sign-in.
        </p>

        <div style="text-align: center; margin: 18px 0 28px;">
          <a href="{{PORTAL_URL}}" style="display: inline-block; background-color: #C8A96E; background-image: linear-gradient(135deg, #C8A96E, #b8944e); color: #020121; text-decoration: none; padding: 14px 52px; border-radius: 4px; font-size: 12px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase;">
            Sign in to your portal
          </a>
        </div>

        <p style="font-size: 12px; color: #8A8A94; line-height: 1.6; word-break: break-all; text-align:center; margin-top:-12px;">
          <a href="{{PORTAL_URL}}" style="color: #C8A96E; text-decoration: underline;">{{PORTAL_URL}}</a>
        </p>

        <div style="background: #2a1a0a; border-left: 3px solid #C8A96E; padding: 18px 20px; border-radius: 0 6px 6px 0; margin: 24px 0;">
          <p style="font-size: 11px; color: #C8A96E; margin: 0 0 8px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;">Important — invoicing change</p>
          <p style="font-size: 13px; color: #F0ECE4; line-height: 1.7; margin: 0 0 8px;">
            From <strong>1 June 2026</strong>, all timesheets and invoices must be submitted through the new portal under <strong>Finance → Invoices</strong>.
          </p>
          <p style="font-size: 13px; color: #E0DCD4; line-height: 1.7; margin: 0;">
            Our previous invoicing system is being deprecated at the end of <strong>May 2026</strong> and will not accept further submissions after that date. Please make sure any outstanding May timesheets are sent through the old system before then, and submit everything from June onwards via the portal.
          </p>
        </div>

        <h2 style="color: #C8A96E; font-family: 'Georgia', serif; font-size: 18px; font-weight: 400; margin: 28px 0 8px;">Where to get help</h2>

        <p style="font-size: 13px; color: #E0DCD4; line-height: 1.85;">
          If you have any questions, just reply to this email — the onboarding team is happy to help.
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
  `,
  bodyText: [
    `Dear {{NAME}},`,
    "",
    "Your new Livaware NurseOnboard portal is live. It is the single home for your compliance, training, availability, and from now on — your timesheets and invoices.",
    "",
    "{{#VIDEO_URL}}",
    "WATCH THE WALKTHROUGH",
    "The quickest way to get oriented is the 2-minute explainer video: {{VIDEO_URL}}",
    "",
    "{{/VIDEO_URL}}",
    "HOW TO USE THE PLATFORM",
    " - Compliance & documents — NMC, DBS, right-to-work and certificates in one place.",
    " - Declarations — confirm competencies and health declarations when due.",
    " - Skills Arcade — work through assigned scenario modules at your own pace.",
    " - Availability — set your day & night availability for the months ahead.",
    " - Invoicing — submit timesheets and download a paid PDF for every shift.",
    "",
    "SIGN IN TO SEE YOUR PROFILE",
    "Open the portal and sign in with the email we have on file — you'll receive a 6-digit verification code by email to complete sign-in.",
    "{{PORTAL_URL}}",
    "",
    "IMPORTANT — INVOICING CHANGE",
    "From 1 June 2026, all timesheets and invoices must be submitted through the new portal under Finance > Invoices. The previous invoicing system is being deprecated at the end of May 2026 and will not accept further submissions after that date. Please send any outstanding May timesheets through the old system before then, and submit everything from June onwards via the portal.",
    "",
    "WHERE TO GET HELP",
    "Reply to this email — the onboarding team is happy to help.",
    "",
    "Kind regards,",
    "Livaware Onboarding Team",
  ].join("\n"),
};

const TEMPLATE_DEFAULTS: Record<string, { subject: string; bodyHtml: string; bodyText: string }> = {
  [PLATFORM_UPDATE_KEY]: PLATFORM_UPDATE_DEFAULT,
  [LAUNCH_ANNOUNCEMENT_KEY]: LAUNCH_ANNOUNCEMENT_DEFAULT,
};

export function isKnownTemplateKey(key: string): boolean {
  return key in TEMPLATE_DEFAULTS;
}

export function getTemplateDefault(key: string) {
  return TEMPLATE_DEFAULTS[key];
}

/**
 * Returns the persisted template for `key`, seeding the row from the
 * built-in default if it doesn't exist yet. If the underlying table is
 * unavailable (e.g. migration not yet applied in a fresh environment),
 * falls back to the in-memory default so preview/send still work.
 */
export async function getOrSeedTemplate(key: string) {
  const def = TEMPLATE_DEFAULTS[key];
  if (!def) throw new Error(`Unknown email template key: ${key}`);
  try {
    const existing = await storage.getEmailTemplate(key);
    if (existing) return existing;
    return await storage.upsertEmailTemplate({
      key,
      subject: def.subject,
      bodyHtml: def.bodyHtml,
      bodyText: def.bodyText,
      updatedBy: "system_seed",
    });
  } catch (err) {
    console.warn(
      `[announcements] email_templates table unavailable, falling back to in-memory default for "${key}":`,
      (err as any)?.message || err,
    );
    return {
      key,
      subject: def.subject,
      bodyHtml: def.bodyHtml,
      bodyText: def.bodyText,
      updatedBy: "fallback_default",
      updatedAt: new Date(),
    };
  }
}

/**
 * Token renderer. Supports:
 *   {{NAME}}, {{PORTAL_URL}}, {{VIDEO_URL}} — simple substitution
 *   {{#VIDEO_URL}}...{{/VIDEO_URL}} — block kept only when VIDEO_URL is non-empty
 */
export function renderTemplate(
  body: string,
  tokens: { NAME: string; PORTAL_URL: string; VIDEO_URL?: string },
): string {
  let out = body;
  // Conditional blocks first so we don't strip surrounding plain tokens.
  out = out.replace(
    /\{\{#VIDEO_URL\}\}([\s\S]*?)\{\{\/VIDEO_URL\}\}/g,
    tokens.VIDEO_URL ? "$1" : "",
  );
  out = out.replace(/\{\{NAME\}\}/g, tokens.NAME);
  out = out.replace(/\{\{PORTAL_URL\}\}/g, tokens.PORTAL_URL);
  out = out.replace(/\{\{VIDEO_URL\}\}/g, tokens.VIDEO_URL ?? "");
  return out;
}

export interface RenderedAnnouncement {
  subject: string;
  html: string;
  text: string;
}

export async function renderAnnouncement(
  key: string,
  tokens: { NAME: string; PORTAL_URL: string; VIDEO_URL?: string },
): Promise<RenderedAnnouncement> {
  const tpl = await getOrSeedTemplate(key);
  return {
    subject: tpl.subject,
    html: renderTemplate(tpl.bodyHtml, tokens),
    text: renderTemplate(tpl.bodyText, tokens),
  };
}

// ==================== Senders ====================

async function sendOne(
  client: Client,
  recipientEmail: string,
  recipientName: string,
  rendered: RenderedAnnouncement,
): Promise<void> {
  await client.api(`/users/${SENDER_EMAIL}/sendMail`).post({
    message: {
      subject: rendered.subject,
      body: { contentType: "HTML", content: rendered.html },
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
  const portalUrl = PORTAL_PUBLIC_URL;

  for (const n of recipients) {
    try {
      const rendered = await renderAnnouncement(PLATFORM_UPDATE_KEY, {
        NAME: n.fullName,
        PORTAL_URL: portalUrl,
      });
      await sendOne(client, n.email!, n.fullName, rendered);
      result.sent += 1;
      await storage.createAuditLog({
        nurseId: n.id,
        module: "announcements",
        action: "platform_update_announcement_sent",
        agentName: opts.agentName,
        detail: { subject: rendered.subject, email: n.email },
      });
    } catch (err: any) {
      const message = err?.message || String(err);
      result.failed.push({ nurseId: n.id, email: n.email!, error: message });
    }
  }
  return result;
}

export async function sendLaunchAnnouncement(opts: {
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
  const videoUrl = getLaunchVideoUrl();
  const portalUrl = PORTAL_PUBLIC_URL;

  let renderedSubject = "";
  for (const n of recipients) {
    try {
      const rendered = await renderAnnouncement(LAUNCH_ANNOUNCEMENT_KEY, {
        NAME: n.fullName,
        PORTAL_URL: portalUrl,
        VIDEO_URL: videoUrl,
      });
      renderedSubject = rendered.subject;
      await sendOne(client, n.email!, n.fullName, rendered);
      result.sent += 1;
      await storage.createAuditLog({
        nurseId: n.id,
        module: "announcements",
        action: "launch_announcement_sent",
        agentName: opts.agentName,
        detail: { subject: rendered.subject, email: n.email, videoUrl, portalUrl },
      });
    } catch (err: any) {
      const message = err?.message || String(err);
      result.failed.push({ nurseId: n.id, email: n.email!, error: message });
    }
  }

  await storage.createAuditLog({
    nurseId: null,
    module: "announcements",
    action: "launch_announcement_run",
    agentName: opts.agentName,
    detail: {
      subject: renderedSubject || LAUNCH_ANNOUNCEMENT_DEFAULT.subject,
      attempted: result.attempted,
      sent: result.sent,
      failed: result.failed.length,
      videoUrl,
      portalUrl,
    },
  });

  return result;
}

// Back-compat exports kept for the existing test file. They render using
// the seeded defaults rather than touching the database.
export const PLATFORM_UPDATE_SUBJECT = PLATFORM_UPDATE_DEFAULT.subject;
export const LAUNCH_ANNOUNCEMENT_SUBJECT = LAUNCH_ANNOUNCEMENT_DEFAULT.subject;

export function buildPlatformUpdateHtml(recipientName: string): string {
  return renderTemplate(PLATFORM_UPDATE_DEFAULT.bodyHtml, {
    NAME: recipientName,
    PORTAL_URL: PORTAL_PUBLIC_URL,
  });
}
export function buildPlatformUpdatePlainText(recipientName: string): string {
  return renderTemplate(PLATFORM_UPDATE_DEFAULT.bodyText, {
    NAME: recipientName,
    PORTAL_URL: PORTAL_PUBLIC_URL,
  });
}
export function buildLaunchAnnouncementHtml(
  recipientName: string,
  opts: { videoUrl?: string; portalUrl: string },
): string {
  return renderTemplate(LAUNCH_ANNOUNCEMENT_DEFAULT.bodyHtml, {
    NAME: recipientName,
    PORTAL_URL: opts.portalUrl,
    VIDEO_URL: opts.videoUrl,
  });
}
export function buildLaunchAnnouncementPlainText(
  recipientName: string,
  opts: { videoUrl?: string; portalUrl: string },
): string {
  return renderTemplate(LAUNCH_ANNOUNCEMENT_DEFAULT.bodyText, {
    NAME: recipientName,
    PORTAL_URL: opts.portalUrl,
    VIDEO_URL: opts.videoUrl,
  });
}
