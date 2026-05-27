// ─────────────────────────────────────────────────────────────────────────
// Broadcast announcement senders.
//
// The editable prose for each announcement (subject + per-section text
// fields) is owned by the unified email-template registry
// (`server/email-templates.ts`). This module is now just the SEND-loop:
// per-recipient rendering, per-recipient try/catch, audit logging.
//
// Public API kept for backwards compatibility (tests, routes):
//   PLATFORM_UPDATE_KEY, LAUNCH_ANNOUNCEMENT_KEY, PORTAL_PUBLIC_URL,
//   getLaunchVideoUrl(), isKnownTemplateKey(), getOrSeedTemplate(),
//   getTemplateDefault(), renderAnnouncement(),
//   sendPlatformUpdateAnnouncement(), sendLaunchAnnouncement(),
//   buildPlatformUpdateHtml / *PlainText, buildLaunchAnnouncementHtml / *PlainText
// ─────────────────────────────────────────────────────────────────────────

import type { Client } from "@microsoft/microsoft-graph-client";
import { getGraphClient, isOutlookConfigured } from "./outlook";
import { storage } from "./storage";
import {
  renderEmail,
  getTemplate,
  isKnownEmailTemplateKey,
  getDefaultFieldValues,
  resolveTemplate,
  type RenderedEmail,
} from "./email-templates";

const SENDER_EMAIL =
  process.env.AZURE_AD_SENDER_EMAIL || "onboarding@livaware.co.uk";

export const PLATFORM_UPDATE_KEY = "platform_update_announcement";
export const LAUNCH_ANNOUNCEMENT_KEY = "launch_announcement";

export const PORTAL_PUBLIC_URL =
  process.env.PORTAL_PUBLIC_URL || "https://onboard.livaware.co.uk";

export function getLaunchVideoUrl(): string | undefined {
  const raw = (process.env.PLATFORM_VIDEO_URL || "").trim();
  return raw || undefined;
}

export interface AnnouncementResult {
  attempted: number;
  sent: number;
  failed: Array<{ nurseId: string; email: string; error: string }>;
}

// ─── Back-compat shims (delegate to the unified registry) ────────────

export function isKnownTemplateKey(key: string): boolean {
  return isKnownEmailTemplateKey(key);
}

export function getTemplateDefault(key: string) {
  const def = getTemplate(key);
  if (!def) return undefined;
  return {
    subject: def.defaultSubject,
    fields: getDefaultFieldValues(def),
  };
}

export async function getOrSeedTemplate(key: string) {
  const resolved = await resolveTemplate(key);
  return {
    key,
    subject: resolved.subject,
    fields: resolved.fields,
    updatedBy: resolved.updatedBy,
    updatedAt: resolved.updatedAt,
  };
}

export interface RenderedAnnouncement {
  subject: string;
  html: string;
  text: string;
}

export async function renderAnnouncement(
  key: string,
  tokens: Record<string, string | undefined>,
): Promise<RenderedAnnouncement> {
  const cleanTokens: Record<string, string> = {};
  for (const [k, v] of Object.entries(tokens)) {
    if (v !== undefined && v !== null) cleanTokens[k] = String(v);
  }
  const rendered: RenderedEmail = await renderEmail(key, cleanTokens);
  return { subject: rendered.subject, html: rendered.html, text: rendered.text };
}

// ─── Senders ─────────────────────────────────────────────────────────

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
  const result: AnnouncementResult = {
    attempted: recipients.length,
    sent: 0,
    failed: [],
  };
  for (const n of recipients) {
    try {
      const rendered = await renderAnnouncement(PLATFORM_UPDATE_KEY, {
        NAME: n.fullName,
        PORTAL_URL: PORTAL_PUBLIC_URL,
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
      result.failed.push({
        nurseId: n.id,
        email: n.email!,
        error: err?.message || String(err),
      });
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
  const result: AnnouncementResult = {
    attempted: recipients.length,
    sent: 0,
    failed: [],
  };
  const videoUrl = getLaunchVideoUrl();
  let renderedSubject = "";
  for (const n of recipients) {
    try {
      const rendered = await renderAnnouncement(LAUNCH_ANNOUNCEMENT_KEY, {
        NAME: n.fullName,
        PORTAL_URL: PORTAL_PUBLIC_URL,
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
        detail: {
          subject: rendered.subject,
          email: n.email,
          videoUrl,
          portalUrl: PORTAL_PUBLIC_URL,
        },
      });
    } catch (err: any) {
      result.failed.push({
        nurseId: n.id,
        email: n.email!,
        error: err?.message || String(err),
      });
    }
  }
  await storage.createAuditLog({
    nurseId: null,
    module: "announcements",
    action: "launch_announcement_run",
    agentName: opts.agentName,
    detail: {
      subject: renderedSubject,
      attempted: result.attempted,
      sent: result.sent,
      failed: result.failed.length,
    },
  });
  return result;
}

// ─── Legacy HTML builders kept for tests ─────────────────────────────

export async function buildPlatformUpdateHtml(recipientName: string): Promise<string> {
  const r = await renderAnnouncement(PLATFORM_UPDATE_KEY, {
    NAME: recipientName,
    PORTAL_URL: PORTAL_PUBLIC_URL,
  });
  return r.html;
}
export async function buildPlatformUpdatePlainText(recipientName: string): Promise<string> {
  const r = await renderAnnouncement(PLATFORM_UPDATE_KEY, {
    NAME: recipientName,
    PORTAL_URL: PORTAL_PUBLIC_URL,
  });
  return r.text;
}
export async function buildLaunchAnnouncementHtml(
  recipientName: string,
  videoUrl?: string,
): Promise<string> {
  const r = await renderAnnouncement(LAUNCH_ANNOUNCEMENT_KEY, {
    NAME: recipientName,
    PORTAL_URL: PORTAL_PUBLIC_URL,
    VIDEO_URL: videoUrl,
  });
  return r.html;
}
export async function buildLaunchAnnouncementPlainText(
  recipientName: string,
  videoUrl?: string,
): Promise<string> {
  const r = await renderAnnouncement(LAUNCH_ANNOUNCEMENT_KEY, {
    NAME: recipientName,
    PORTAL_URL: PORTAL_PUBLIC_URL,
    VIDEO_URL: videoUrl,
  });
  return r.text;
}
