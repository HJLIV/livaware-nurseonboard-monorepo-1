import type { Express } from "express";
import { z } from "zod";
import { requireAdmin, requireSuperAdmin } from "../middleware";
import {
  PLATFORM_UPDATE_KEY,
  LAUNCH_ANNOUNCEMENT_KEY,
  PORTAL_PUBLIC_URL,
  getLaunchVideoUrl,
  renderAnnouncement,
  sendPlatformUpdateAnnouncement,
  sendLaunchAnnouncement,
} from "../announcements";
import {
  getRegistry,
  getTemplate,
  isKnownEmailTemplateKey,
  getDefaultFieldValues,
  resolveTemplate,
} from "../email-templates";
import { storage } from "../storage";

const SAMPLE_NAME = "Sample Nurse";

const templateUpdateSchema = z.object({
  subject: z.string().min(1).max(500),
  fields: z.record(z.string()),
});

async function activeRecipientCount(): Promise<number> {
  const nurses = await storage.getCandidates();
  return nurses.filter(
    (n) => !!n.email && !!n.fullName && n.currentStage !== "withdrawn",
  ).length;
}

export function registerAnnouncementRoutes(app: Express) {
  // ---------- List all editable templates ----------
  app.get("/api/admin/email-templates", requireAdmin, async (_req, res) => {
    const reg = getRegistry();
    const items = await Promise.all(
      reg.map(async (def) => {
        const resolved = await resolveTemplate(def.key);
        return {
          key: def.key,
          label: def.label,
          description: def.description,
          category: def.category,
          tokens: def.tokens,
          defaultSubject: def.defaultSubject,
          fields: def.fields,
          current: {
            subject: resolved.subject,
            fields: resolved.fields,
            updatedAt: resolved.updatedAt,
            updatedBy: resolved.updatedBy,
          },
        };
      }),
    );
    res.json({ items });
  });

  // ---------- Single template (preview-ready) ----------
  app.get("/api/admin/email-templates/:key", requireAdmin, async (req, res) => {
    const key = String(req.params.key);
    const def = getTemplate(key);
    if (!def) {
      return res.status(404).json({ error: "Unknown template key" });
    }
    const resolved = await resolveTemplate(key);
    res.json({
      key,
      label: def.label,
      description: def.description,
      category: def.category,
      tokens: def.tokens,
      defaultSubject: def.defaultSubject,
      fields: def.fields,
      current: {
        subject: resolved.subject,
        fields: resolved.fields,
        updatedAt: resolved.updatedAt,
        updatedBy: resolved.updatedBy,
      },
      defaults: { subject: def.defaultSubject, fields: getDefaultFieldValues(def) },
    });
  });

  // ---------- Save subject + fields ----------
  app.put("/api/admin/email-templates/:key", requireSuperAdmin, async (req, res) => {
    const key = String(req.params.key);
    const def = getTemplate(key);
    if (!def) {
      return res.status(404).json({ error: "Unknown template key" });
    }
    const parsed = templateUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid template", details: parsed.error.flatten() });
    }
    // Validate field keys against the registry
    const allowed = new Set(def.fields.map((f) => f.name));
    const filteredFields: Record<string, string> = {};
    for (const f of def.fields) {
      const v = parsed.data.fields[f.name];
      filteredFields[f.name] = typeof v === "string" ? v : f.default;
    }
    for (const k of Object.keys(parsed.data.fields)) {
      if (!allowed.has(k)) {
        return res
          .status(400)
          .json({ error: `Unknown field "${k}" for template "${key}"` });
      }
    }

    const agentName =
      (req.session as any)?.displayName ||
      (req.session as any)?.username ||
      "super_admin";

    const updated = await storage.upsertEmailTemplate({
      key,
      subject: parsed.data.subject,
      bodyHtml: "",
      bodyText: "",
      fields: filteredFields as any,
      updatedBy: agentName,
    });

    await storage.createAuditLog({
      nurseId: null,
      module: "announcements",
      action: "email_template_updated",
      agentName,
      detail: { key, subjectPreview: parsed.data.subject.slice(0, 120) },
    });

    res.json({
      key: updated.key,
      subject: updated.subject,
      fields: updated.fields ?? filteredFields,
      updatedAt: updated.updatedAt,
      updatedBy: updated.updatedBy,
    });
  });

  // ---------- Generic preview for any template ----------
  app.get("/api/admin/email-templates/:key/preview", requireAdmin, async (req, res) => {
    const key = String(req.params.key);
    if (!isKnownEmailTemplateKey(key)) {
      return res.status(404).json({ error: "Unknown template key" });
    }
    // Pass best-effort sample tokens. Unknown ones become "".
    const tokens: Record<string, string> = {
      NAME: SAMPLE_NAME,
      FIRST_NAME: "Sample",
      EMAIL: "nurse@example.com",
      PORTAL_URL: PORTAL_PUBLIC_URL,
      VIDEO_URL: getLaunchVideoUrl() || "",
      EXPIRY: "30 June 2026",
      CODE: "123456",
      MINUTES: "10",
      CANDIDATE_NAME: SAMPLE_NAME,
      CATEGORY: "Right to Work",
      FILENAME: "passport.pdf",
      UPLOADER: "Nurse (via portal)",
      TIMESTAMP: new Date().toLocaleString("en-GB"),
      REFEREE_NAME: "Dr Sample Referee",
      FORM_URL: PORTAL_PUBLIC_URL + "/referee/sample",
      INVOICE_NUMBER: "INV-001",
      NURSE_NAME: SAMPLE_NAME,
      NURSE_EMAIL: "nurse@example.com",
      TOTAL_HOURS: "37.5",
      TOTAL_AMOUNT: "£1,250.00",
      ASSIGNED_BY: "Sample Admin",
      INVITED_BY: "Sample Admin",
      PASSWORD: "Temp-Pass-1234",
      MODULE_COUNT: "3",
      MODULES_LIST: "Basic Life Support\nManual Handling\nFire Safety",
      ITEMS_LIST: "Upload your DBS certificate\nComplete the right-to-work declaration",
    };
    const rendered = await renderAnnouncement(key, tokens);
    res.json({
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      recipientCount: await activeRecipientCount(),
    });
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
      const agentName =
        (req.session as any)?.displayName ||
        (req.session as any)?.username ||
        "super_admin";
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
      const agentName =
        (req.session as any)?.displayName ||
        (req.session as any)?.username ||
        "super_admin";
      const result = await sendLaunchAnnouncement({ agentName });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to send announcement" });
    }
  });
}
