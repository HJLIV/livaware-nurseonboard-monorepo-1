import type { Express } from "express";
import { requireAdmin, requireSuperAdmin } from "../middleware";
import {
  PLATFORM_UPDATE_SUBJECT,
  buildPlatformUpdateHtml,
  buildPlatformUpdatePlainText,
  sendPlatformUpdateAnnouncement,
} from "../announcements";
import { storage } from "../storage";

export function registerAnnouncementRoutes(app: Express) {
  app.get("/api/admin/announcements/platform-update/preview", requireAdmin, async (_req, res) => {
    const sampleName = "Sample Nurse";
    const nurses = await storage.getCandidates();
    const recipientCount = nurses.filter(
      (n) => !!n.email && !!n.fullName && n.currentStage !== "withdrawn",
    ).length;
    res.json({
      subject: PLATFORM_UPDATE_SUBJECT,
      html: buildPlatformUpdateHtml(sampleName),
      text: buildPlatformUpdatePlainText(sampleName),
      recipientCount,
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
}
