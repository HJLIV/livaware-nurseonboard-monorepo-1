import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import supertest from "supertest";

// Stub Microsoft Graph before any module imports it. The launch sender
// pulls these symbols at call-time via the imported namespace, so a
// vi.mock here is the cleanest way to drive the per-recipient failure
// path without live Azure credentials.
let __stubSendCounter = 0;
let __stubFailOnIndex = -1;
vi.mock("../server/outlook", async () => {
  const actual = await vi.importActual<any>("../server/outlook");
  return {
    ...actual,
    isOutlookConfigured: () => true,
    getGraphClient: async () => ({
      api: (_path: string) => ({
        post: async () => {
          __stubSendCounter += 1;
          if (__stubSendCounter === __stubFailOnIndex) {
            throw new Error("Simulated Graph 429");
          }
          return { id: `msg-${__stubSendCounter}` };
        },
      }),
    }),
  };
});

import { storage } from "../server/storage";
import {
  getTestApp,
  loginAsAdmin,
  createTestNurse,
  cleanupTestData,
} from "./helpers";
import {
  LAUNCH_ANNOUNCEMENT_SUBJECT,
  PORTAL_PUBLIC_URL,
  buildLaunchAnnouncementHtml,
  sendLaunchAnnouncement,
} from "../server/announcements";

// Configure super-admin credentials before the app is built. The auth
// route reads these fresh each request so setting them here is enough
// for `loginAsSuperAdmin` to succeed.
process.env.SUPER_ADMIN_USERNAME = "superadmin";
process.env.SUPER_ADMIN_PASSWORD = "superpass";

async function loginAsSuperAdmin() {
  const { app } = await getTestApp();
  const agent = supertest.agent(app);
  const res = await agent
    .post("/api/auth/login")
    .send({ username: "superadmin", password: "superpass" });
  if (res.status !== 200) {
    throw new Error(`Super admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}

describe("Launch & invoicing announcement", () => {
  let admin: supertest.Agent;
  let nurseAEmail: string;
  let nurseAId: string;

  beforeAll(async () => {
    await getTestApp();
    admin = await loginAsAdmin();
    const nurseA = await createTestNurse(admin);
    nurseAId = nurseA.id;
    nurseAEmail = nurseA.email;
  });

  afterAll(async () => {
    await cleanupTestData(admin);
  });

  it("preview returns subject + recipient count + portal URL", async () => {
    const res = await admin.get("/api/admin/announcements/launch/preview");
    expect(res.status).toBe(200);
    expect(res.body.subject).toBe(LAUNCH_ANNOUNCEMENT_SUBJECT);
    expect(typeof res.body.html).toBe("string");
    expect(typeof res.body.text).toBe("string");
    expect(res.body.recipientCount).toBeGreaterThanOrEqual(1);
    expect(res.body.portalUrl).toBe(PORTAL_PUBLIC_URL);
    expect(res.body.html).toContain(PORTAL_PUBLIC_URL);
    expect(res.body.html).toContain("1 June 2026");
    expect(res.body.text).toContain(PORTAL_PUBLIC_URL);
  });

  it("hides the video block when PLATFORM_VIDEO_URL is unset", async () => {
    const previousVideo = process.env.PLATFORM_VIDEO_URL;
    delete process.env.PLATFORM_VIDEO_URL;
    try {
      const res = await admin.get("/api/admin/announcements/launch/preview");
      expect(res.status).toBe(200);
      expect(res.body.videoUrl).toBeNull();
      expect(res.body.html).not.toContain("Watch the explainer video");
      expect(res.body.html).not.toContain("Watch the 2-minute walkthrough");
    } finally {
      if (previousVideo !== undefined) process.env.PLATFORM_VIDEO_URL = previousVideo;
    }
  });

  it("includes the video block + URL when PLATFORM_VIDEO_URL is set", async () => {
    const previousVideo = process.env.PLATFORM_VIDEO_URL;
    process.env.PLATFORM_VIDEO_URL = "https://video.example.com/launch.mp4";
    try {
      const res = await admin.get("/api/admin/announcements/launch/preview");
      expect(res.status).toBe(200);
      expect(res.body.videoUrl).toBe("https://video.example.com/launch.mp4");
      expect(res.body.html).toContain("https://video.example.com/launch.mp4");
      expect(res.body.html).toContain("Watch the explainer video");
    } finally {
      if (previousVideo === undefined) delete process.env.PLATFORM_VIDEO_URL;
      else process.env.PLATFORM_VIDEO_URL = previousVideo;
    }
  });

  it("buildLaunchAnnouncementHtml hides video block when videoUrl missing", () => {
    const html = buildLaunchAnnouncementHtml("Sample Nurse", { portalUrl: PORTAL_PUBLIC_URL });
    expect(html).not.toContain("Watch the explainer video");
    expect(html).toContain(PORTAL_PUBLIC_URL);
    expect(html).toContain("1 June 2026");
  });

  it("send is blocked for non-super-admin (admin → 403)", async () => {
    const res = await admin.post("/api/admin/announcements/launch/send");
    expect(res.status).toBe(403);
  });

  it("send is blocked for unauthenticated callers (401)", async () => {
    const { app } = await getTestApp();
    const res = await supertest(app).post("/api/admin/announcements/launch/send");
    expect(res.status).toBe(401);
  });

  it("sendLaunchAnnouncement reports per-recipient failures without aborting and writes audit rows", async () => {
    // Make sure we have at least 2 active nurses so we can prove that the
    // batch keeps going past a single failure.
    await createTestNurse(admin);
    __stubSendCounter = 0;
    __stubFailOnIndex = 2;

    // Unique per-run agent name so audit assertions are deterministic
    // regardless of what already exists in the dev/test DB.
    const runAgent = `test_super_admin__failmix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const result = await sendLaunchAnnouncement({ agentName: runAgent });
    expect(result.attempted).toBeGreaterThanOrEqual(2);
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(result.failed.length).toBeGreaterThanOrEqual(1);
    expect(result.sent + result.failed.length).toBe(result.attempted);
    expect(result.failed[0].error).toContain("Simulated Graph 429");

    const allLogs = await storage.getAuditLogs();
    const runLogs = allLogs.filter((l) => l.agentName === runAgent);

    const summary = runLogs.find((l) => l.action === "launch_announcement_run");
    expect(summary).toBeTruthy();
    expect(summary?.module).toBe("announcements");
    const detail = (summary?.detail || {}) as any;
    expect(detail.attempted).toBe(result.attempted);
    expect(detail.sent).toBe(result.sent);
    expect(detail.failed).toBe(result.failed.length);

    const perRecipient = runLogs.filter((l) => l.action === "launch_announcement_sent");
    expect(perRecipient.length).toBe(result.sent);
    for (const row of perRecipient) {
      expect(row.module).toBe("announcements");
    }

    __stubFailOnIndex = -1;
    void nurseAId;
    void nurseAEmail;
  });

  it("send route succeeds for super admin via the stubbed sender", async () => {
    __stubSendCounter = 0;
    __stubFailOnIndex = -1;
    const sa = await loginAsSuperAdmin();
    const res = await sa.post("/api/admin/announcements/launch/send");
    expect(res.status).toBe(200);
    expect(res.body.attempted).toBeGreaterThanOrEqual(1);
    expect(res.body.sent).toBe(res.body.attempted);
    expect(res.body.failed).toEqual([]);
  });

  describe("editable email templates", () => {
    it("GET seeds the row from the built-in default and returns defaults alongside", async () => {
      const res = await admin.get("/api/admin/email-templates/launch_announcement");
      expect(res.status).toBe(200);
      expect(res.body.key).toBe("launch_announcement");
      expect(res.body.subject).toBe(LAUNCH_ANNOUNCEMENT_SUBJECT);
      expect(typeof res.body.bodyHtml).toBe("string");
      expect(typeof res.body.bodyText).toBe("string");
      expect(res.body.defaults?.subject).toBe(LAUNCH_ANNOUNCEMENT_SUBJECT);
    });

    it("GET 404s on an unknown template key", async () => {
      const res = await admin.get("/api/admin/email-templates/not_a_real_key");
      expect(res.status).toBe(404);
    });

    it("PUT is blocked for non-super-admin (admin → 403)", async () => {
      const res = await admin
        .put("/api/admin/email-templates/launch_announcement")
        .send({ subject: "x", bodyHtml: "<p>x</p>", bodyText: "x" });
      expect(res.status).toBe(403);
    });

    it("PUT by super admin persists, flows into preview, and writes an audit row", async () => {
      const sa = await loginAsSuperAdmin();

      // Capture the seeded defaults up front so we can restore them at
      // the end regardless of what we write.
      const seedRes = await admin.get("/api/admin/email-templates/launch_announcement");
      expect(seedRes.status).toBe(200);
      const defaults = seedRes.body.defaults;
      expect(defaults?.subject).toBeTruthy();
      expect(defaults?.bodyHtml).toBeTruthy();
      expect(defaults?.bodyText).toBeTruthy();

      const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newSubject = `Edited launch subject ${stamp}`;
      const newHtml = `<p>Hi {{NAME}} — edited body ${stamp}. Sign in: {{PORTAL_URL}}</p>`;
      const newText = `Hi {{NAME}} — edited body ${stamp}. Sign in: {{PORTAL_URL}}`;

      try {
        const putRes = await sa.put("/api/admin/email-templates/launch_announcement").send({
          subject: newSubject,
          bodyHtml: newHtml,
          bodyText: newText,
        });
        expect(putRes.status).toBe(200);
        expect(putRes.body.subject).toBe(newSubject);

        const previewRes = await admin.get("/api/admin/announcements/launch/preview");
        expect(previewRes.status).toBe(200);
        expect(previewRes.body.subject).toBe(newSubject);
        expect(previewRes.body.html).toContain(`edited body ${stamp}`);
        expect(previewRes.body.html).toContain("Sample Nurse");
        expect(previewRes.body.html).toContain(PORTAL_PUBLIC_URL);

        const allLogs = await storage.getAuditLogs();
        const updateLogs = allLogs.filter(
          (l) =>
            l.module === "announcements" &&
            l.action === "email_template_updated" &&
            (l.detail as any)?.subjectPreview === newSubject,
        );
        expect(updateLogs.length).toBeGreaterThanOrEqual(1);
      } finally {
        // Always restore the built-in defaults so other tests in this
        // file (and future runs) see the canonical launch copy.
        await sa.put("/api/admin/email-templates/launch_announcement").send({
          subject: defaults.subject,
          bodyHtml: defaults.bodyHtml,
          bodyText: defaults.bodyText,
        });
      }
    });
  });
});
