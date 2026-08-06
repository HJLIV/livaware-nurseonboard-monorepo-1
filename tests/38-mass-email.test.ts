// Super-admin mass email broadcast (task 186).
//
// Email sending is suppressed under Vitest (isEmailSendingSuppressed), so
// every Graph send "succeeds" — these tests cover auth gating, recipient
// validation, attachment handling, persistence, exclusion of nurses without
// an email address, audit entries, and the history endpoint.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import { eq } from "drizzle-orm";
import {
  getTestApp,
  loginAsAdmin,
  createTestNurse,
  cleanupTestData,
} from "./helpers";

let superAdmin: supertest.Agent;
let admin: supertest.Agent;
let plainAgent: supertest.Agent;

beforeAll(async () => {
  const { app } = await getTestApp();
  plainAgent = supertest.agent(app);
  superAdmin = supertest.agent(app);
  await superAdmin.post("/api/auth/login").send({ username: "superadmin", password: "superpass" });
  admin = await loginAsAdmin();
});

afterAll(async () => {
  await cleanupTestData(admin);
});

describe("mass email — auth gating", () => {
  it("rejects unauthenticated requests", async () => {
    expect((await plainAgent.get("/api/super-admin/mass-email/roster")).status).toBe(401);
    expect((await plainAgent.post("/api/super-admin/mass-email/send")).status).toBe(401);
    expect((await plainAgent.get("/api/super-admin/mass-email/history")).status).toBe(401);
    expect((await plainAgent.post("/api/super-admin/mass-email/preview").send({ body: "x" })).status).toBe(401);
  });

  it("rejects regular admins with 403", async () => {
    expect((await admin.get("/api/super-admin/mass-email/roster")).status).toBe(403);
    expect((await admin.get("/api/super-admin/mass-email/history")).status).toBe(403);
    expect((await admin.post("/api/super-admin/mass-email/preview").send({ body: "x" })).status).toBe(403);
  });
});

describe("mass email — roster", () => {
  it("lists non-archived nurses with an email flag", async () => {
    const nurse = await createTestNurse(admin);
    const res = await superAdmin.get("/api/super-admin/mass-email/roster");
    expect(res.status).toBe(200);
    const row = res.body.nurses.find((n: any) => n.id === nurse.id);
    expect(row).toBeTruthy();
    expect(row.hasEmail).toBe(true);
    expect(row.fullName).toBe(nurse.fullName);
  });

  it("flags nurses without an email address", async () => {
    const nurse = await createTestNurse(admin);
    const { db } = await import("../server/db");
    const { nurses } = await import("../shared/schema");
    await db.update(nurses).set({ email: "" }).where(eq(nurses.id, nurse.id));
    const res = await superAdmin.get("/api/super-admin/mass-email/roster");
    const row = res.body.nurses.find((n: any) => n.id === nurse.id);
    expect(row.hasEmail).toBe(false);
  });
});

describe("mass email — preview", () => {
  it("renders the body into branded HTML", async () => {
    const res = await superAdmin
      .post("/api/super-admin/mass-email/preview")
      .send({ subject: "Hello", body: "First paragraph.\n\nSecond <b>paragraph</b>." });
    expect(res.status).toBe(200);
    expect(res.body.html).toContain("First paragraph.");
    // Raw HTML in the body must be escaped.
    expect(res.body.html).toContain("&lt;b&gt;paragraph&lt;/b&gt;");
    expect(res.body.html).toContain("Livaware");
  });

  it("requires a body", async () => {
    const res = await superAdmin.post("/api/super-admin/mass-email/preview").send({ body: "  " });
    expect(res.status).toBe(400);
  });
});

describe("mass email — send validation", () => {
  it("requires subject, body and recipients", async () => {
    const missingSubject = await superAdmin
      .post("/api/super-admin/mass-email/send")
      .field("body", "Hi")
      .field("nurseIds", JSON.stringify(["x"]));
    expect(missingSubject.status).toBe(400);

    const missingBody = await superAdmin
      .post("/api/super-admin/mass-email/send")
      .field("subject", "Hi")
      .field("nurseIds", JSON.stringify(["x"]));
    expect(missingBody.status).toBe(400);

    const noRecipients = await superAdmin
      .post("/api/super-admin/mass-email/send")
      .field("subject", "Hi")
      .field("body", "Hi")
      .field("nurseIds", JSON.stringify([]));
    expect(noRecipients.status).toBe(400);

    const badJson = await superAdmin
      .post("/api/super-admin/mass-email/send")
      .field("subject", "Hi")
      .field("body", "Hi")
      .field("nurseIds", "not-json");
    expect(badJson.status).toBe(400);
  });

  it("rejects when no selected recipient has an email", async () => {
    const nurse = await createTestNurse(admin);
    const { db } = await import("../server/db");
    const { nurses } = await import("../shared/schema");
    await db.update(nurses).set({ email: "" }).where(eq(nurses.id, nurse.id));
    const res = await superAdmin
      .post("/api/super-admin/mass-email/send")
      .field("subject", "Hi")
      .field("body", "Hi")
      .field("nurseIds", JSON.stringify([nurse.id]));
    expect(res.status).toBe(400);
    expect(res.body.excludedNoEmail).toHaveLength(1);
    expect(res.body.excludedNoEmail[0].nurseId).toBe(nurse.id);
  });
});

describe("mass email — send, persistence & audit", () => {
  it("sends to selected nurses, excludes no-email nurses, persists everything", async () => {
    const nurseA = await createTestNurse(admin);
    const nurseB = await createTestNurse(admin);
    const nurseNoEmail = await createTestNurse(admin);
    const { db } = await import("../server/db");
    const { nurses, auditLogs } = await import("../shared/schema");
    await db.update(nurses).set({ email: "" }).where(eq(nurses.id, nurseNoEmail.id));

    const res = await superAdmin
      .post("/api/super-admin/mass-email/send")
      .field("subject", "Team update")
      .field("body", "Hello everyone.\n\nImportant news.")
      .field("nurseIds", JSON.stringify([nurseA.id, nurseB.id, nurseNoEmail.id, "00000000-0000-0000-0000-000000000000"]))
      .attach("attachments", Buffer.from("%PDF-1.4 test"), {
        filename: "notice.pdf",
        contentType: "application/pdf",
      });

    expect(res.status).toBe(200);
    expect(res.body.sentCount).toBe(2);
    expect(res.body.failedCount).toBe(0);
    expect(res.body.excludedNoEmail).toEqual([
      { nurseId: nurseNoEmail.id, fullName: nurseNoEmail.fullName },
    ]);
    expect(res.body.unknownIds).toEqual(["00000000-0000-0000-0000-000000000000"]);
    expect(res.body.results).toHaveLength(2);
    expect(res.body.results.every((r: any) => r.status === "sent")).toBe(true);

    // Persistence: mass_emails row + per-recipient rows via history.
    const history = await superAdmin.get("/api/super-admin/mass-email/history");
    expect(history.status).toBe(200);
    const send = history.body.sends.find((s: any) => s.id === res.body.id);
    expect(send).toBeTruthy();
    expect(send.subject).toBe("Team update");
    expect(send.body).toContain("Important news.");
    expect(send.recipientCount).toBe(2);
    expect(send.sentCount).toBe(2);
    expect(send.failedCount).toBe(0);
    expect(send.attachments).toHaveLength(1);
    expect(send.attachments[0].originalFilename).toBe("notice.pdf");
    expect(send.excludedNoEmail[0].nurseId).toBe(nurseNoEmail.id);
    expect(send.recipients).toHaveLength(2);
    const recipientIds = send.recipients.map((r: any) => r.nurseId).sort();
    expect(recipientIds).toEqual([nurseA.id, nurseB.id].sort());
    expect(send.recipients.every((r: any) => r.status === "sent")).toBe(true);

    // Audit: one per-nurse entry + a broadcast summary entry.
    const logsA = await db.select().from(auditLogs).where(eq(auditLogs.nurseId, nurseA.id));
    const sentLog = logsA.find((l) => l.action === "mass_email_sent");
    expect(sentLog).toBeTruthy();
    expect((sentLog!.detail as any).massEmailId).toBe(res.body.id);
    expect((sentLog!.detail as any).subject).toBe("Team update");
    expect((sentLog!.detail as any).attachmentNames).toEqual(["notice.pdf"]);

    const summary = await db.select().from(auditLogs).where(eq(auditLogs.action, "mass_email_broadcast"));
    const mine = summary.find((l) => (l.detail as any)?.massEmailId === res.body.id);
    expect(mine).toBeTruthy();
    expect((mine!.detail as any).sentCount).toBe(2);
    expect((mine!.detail as any).excludedNoEmailCount).toBe(1);
  });

  it("keeps attachments out of the uploads download surface", async () => {
    const nurse = await createTestNurse(admin);
    const fs = await import("fs");
    const path = await import("path");
    const { uploadsDir } = await import("../server/middleware");
    const before = new Set(fs.readdirSync(uploadsDir));

    const res = await superAdmin
      .post("/api/super-admin/mass-email/send")
      .field("subject", "Attachment safety")
      .field("body", "Body")
      .field("nurseIds", JSON.stringify([nurse.id]))
      .attach("attachments", Buffer.from("%PDF-1.4 secret"), {
        filename: "secret.pdf",
        contentType: "application/pdf",
      });
    expect(res.status).toBe(200);

    // No file was written to the shared uploads dir during the send.
    const after = fs.readdirSync(uploadsDir).filter((f) => !before.has(f));
    expect(after).toEqual([]);

    // History only retains display metadata — no stored filename to fetch.
    const history = await superAdmin.get("/api/super-admin/mass-email/history");
    const send = history.body.sends.find((s: any) => s.id === res.body.id);
    expect(send.attachments).toEqual([
      { originalFilename: "secret.pdf", mimeType: "application/pdf", sizeBytes: 15 },
    ]);
    expect(send.attachments[0]).not.toHaveProperty("filename");

    // And the attachment cannot be retrieved through /api/uploads.
    const fetchAttempt = await superAdmin.get("/api/uploads/secret.pdf");
    expect([400, 403, 404]).toContain(fetchAttempt.status);
  });

  it("rejects oversized combined attachments", async () => {
    const nurse = await createTestNurse(admin);
    const big = Buffer.alloc(2 * 1024 * 1024, 65); // 2MB each ×2 = 4MB > 3MB cap
    const res = await superAdmin
      .post("/api/super-admin/mass-email/send")
      .field("subject", "Hi")
      .field("body", "Hi")
      .field("nurseIds", JSON.stringify([nurse.id]))
      .attach("attachments", big, { filename: "a.pdf", contentType: "application/pdf" })
      .attach("attachments", big, { filename: "b.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/too large/i);
  });
});
