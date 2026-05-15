import type { Express } from "express";
import { z } from "zod";
import { requireAdmin, requireSuperAdmin } from "../middleware";
import {
  PLATFORM_UPDATE_KEY,
  LAUNCH_ANNOUNCEMENT_KEY,
  PORTAL_PUBLIC_URL,
  getLaunchVideoUrl,
  getOrSeedTemplate,
  getTemplateDefault,
  isKnownTemplateKey,
  renderAnnouncement,
  sendPlatformUpdateAnnouncement,
  sendLaunchAnnouncement,
} from "../announcements";
import { storage } from "../storage";

const SAMPLE_NAME = "Sample Nurse";

const templateUpdateSchema = z.object({
  subject: z.string().min(1, "subject is required").max(500),
  bodyHtml: z.string().min(1, "bodyHtml is required"),
  bodyText: z.string().min(1, "bodyText is required"),
});

async function activeRecipientCount(): Promise<number> {
  const nurses = await storage.getCandidates();
  return nurses.filter((n) => !!n.email && !!n.fullName && n.currentStage !== "withdrawn").length;
}

export function registerAnnouncementRoutes(app: Express) {
  // ---------- Editable template CRUD ----------
  app.get("/api/admin/email-templates/:key", requireAdmin, async (req, res) => {
    const key = String(req.params.key);
    if (!isKnownTemplateKey(key)) {
      return res.status(404).json({ error: "Unknown template key" });
    }
    const tpl = await getOrSeedTemplate(key);
    const def = getTemplateDefault(key);
    res.json({
      key: tpl.key,
      subject: tpl.subject,
      bodyHtml: tpl.bodyHtml,
      bodyText: tpl.bodyText,
      updatedAt: tpl.updatedAt,
      updatedBy: tpl.updatedBy,
      defaults: def,
    });
  });

  app.put("/api/admin/email-templates/:key", requireSuperAdmin, async (req, res) => {
    const key = String(req.params.key);
    if (!isKnownTemplateKey(key)) {
      return res.status(404).json({ error: "Unknown template key" });
    }
    const parsed = templateUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid template", details: parsed.error.flatten() });
    }
    const agentName = (req.session as any)?.displayName || (req.session as any)?.username || "super_admin";
    const updated = await storage.upsertEmailTemplate({
      key,
      subject: parsed.data.subject,
      bodyHtml: parsed.data.bodyHtml,
      bodyText: parsed.data.bodyText,
      updatedBy: agentName,
    });
    await storage.createAuditLog({
      nurseId: null,
      module: "announcements",
      action: "email_template_updated",
      agentName,
      detail: { key, subjectPreview: parsed.data.subject.slice(0, 120) },
    });
    res.json(updated);
  });

  // ---------- Platform update announcement ----------
  app.get("/api/admin/announcements/platform-update/preview", requireAdmin, async (_req, res) => {
    const rendered = await renderAnnouncement(PLATFORM_UPDATE_KEY, {
      NAME: SAMPLE_NAME,
      PORTAL_URL: PORTAL_PUBLIC_URL,
    });
    res.json({
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      recipientCount: await activeRecipientCount(),
      portalUrl: PORTAL_PUBLIC_URL,
    });
  });

  app.post("/api/admin/announcements/platform-update/send", requireSuperAdmin, async (req, res) => {
    try {
      const agentName = (req.session as any)?.displayName || (req.session as any)?.username || "super_admin";
      const result = await sendPlatformUpdateAnnouncement({ agentName });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to send announcement" });
    }
  });

  // ---------- Launch announcement ----------
  app.get("/api/admin/announcements/launch/preview", requireAdmin, async (_req, res) => {
    const videoUrl = getLaunchVideoUrl();
    const rendered = await renderAnnouncement(LAUNCH_ANNOUNCEMENT_KEY, {
      NAME: SAMPLE_NAME,
      PORTAL_URL: PORTAL_PUBLIC_URL,
      VIDEO_URL: videoUrl,
    });
    res.json({
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      recipientCount: await activeRecipientCount(),
      videoUrl: videoUrl || null,
      portalUrl: PORTAL_PUBLIC_URL,
    });
  });

  app.post("/api/admin/announcements/launch/send", requireSuperAdmin, async (req, res) => {
    try {
      const agentName = (req.session as any)?.displayName || (req.session as any)?.username || "super_admin";
      const result = await sendLaunchAnnouncement({ agentName });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to send announcement" });
    }
  });
}
