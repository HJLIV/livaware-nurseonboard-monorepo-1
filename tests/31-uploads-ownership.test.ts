import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getTestApp, createTestNurse } from "./helpers";

// Task 151 — regression: /api/uploads/:filename and
// /api/documents/:id/download must be ownership-checked, never cached,
// and must reject portal sessions that try to read another nurse's
// file.
describe("Uploads ownership & cache controls (Task 151)", () => {
  let app: Express;
  let adminAgent: supertest.Agent;
  let nurseA: any;
  let nurseB: any;
  let docA: any;

  // Helper: forge a portal session row directly so we can simulate a
  // logged-in nurse without exercising the full email-code flow.
  async function mintPortalSessionCookie(nurseId: string): Promise<string> {
    const { db } = await import("../server/db");
    const { portalSessions } = await import("../shared/schema");
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const now = new Date();
    await db.insert(portalSessions).values({
      nurseId,
      sessionTokenHash: tokenHash,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      lastSeenAt: now,
      ip: "127.0.0.1",
      userAgent: "vitest",
      issuedVia: "bootstrap_link",
    });
    return `portal.sid=${token}`;
  }

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    adminAgent = supertest.agent(app);
    await adminAgent.post("/api/auth/login").send({ username: "admin", password: "admin" });

    nurseA = await createTestNurse(adminAgent);
    nurseB = await createTestNurse(adminAgent);

    // Drop a real file into the uploads dir + a documents row pointing at it.
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `task151-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
    fs.writeFileSync(path.join(uploadsDir, filename), "hello-task-151");

    const created = await adminAgent.post(`/api/candidates/${nurseA.id}/documents`).send({
      type: "Test Document",
      filename,
      filePath: `/api/uploads/${filename}`,
      category: "other",
      mimeType: "text/plain",
    });
    docA = created.body;
    expect(docA?.id, `document creation failed: ${JSON.stringify(created.body)}`).toBeTruthy();
  });

  it("rejects path traversal", async () => {
    const res = await supertest(app).get("/api/uploads/..%2Fpackage.json");
    expect([400, 404]).toContain(res.status);
  });

  it("requires authentication for an unknown filename", async () => {
    const res = await supertest(app).get("/api/uploads/does-not-exist-task151.pdf");
    expect(res.status).toBe(401);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });

  it("admin can read a nurse's file with no-store cache headers", async () => {
    const res = await adminAgent.get(`/api/uploads/${docA.filename}`);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/private/);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
    expect(res.text || res.body?.toString?.()).toContain("hello-task-151");
  });

  it("rejects a portal session belonging to a different nurse", async () => {
    const cookieB = await mintPortalSessionCookie(nurseB.id);
    const res = await supertest(app)
      .get(`/api/uploads/${docA.filename}`)
      .set("Cookie", cookieB);
    expect(res.status).toBe(403);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });

  it("allows the owning portal session to read its own file", async () => {
    const cookieA = await mintPortalSessionCookie(nurseA.id);
    const res = await supertest(app)
      .get(`/api/uploads/${docA.filename}`)
      .set("Cookie", cookieA);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });

  it("/api/documents/:id/download requires auth", async () => {
    const res = await supertest(app).get(`/api/documents/${docA.id}/download`);
    expect(res.status).toBe(401);
  });

  it("/api/documents/:id/download lets admin download with no-store", async () => {
    const res = await adminAgent.get(`/api/documents/${docA.id}/download`);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });

  it("/api/documents/:id/download blocks a foreign portal session", async () => {
    const cookieB = await mintPortalSessionCookie(nurseB.id);
    const res = await supertest(app)
      .get(`/api/documents/${docA.id}/download`)
      .set("Cookie", cookieB);
    expect(res.status).toBe(403);
  });

  it("authorizes via an unexpired portal bootstrap link (?portalToken=)", async () => {
    const link = await adminAgent
      .post(`/api/nurses/${nurseA.id}/portal-link`)
      .send({ module: "onboard" });
    expect(link.body.token, `portal-link create failed: ${JSON.stringify(link.body)}`).toBeTruthy();
    const res = await supertest(app).get(
      `/api/uploads/${docA.filename}?portalToken=${link.body.token}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toMatch(/no-store/);
  });

  it("rejects a bootstrap link belonging to a different nurse", async () => {
    const link = await adminAgent
      .post(`/api/nurses/${nurseB.id}/portal-link`)
      .send({ module: "onboard" });
    expect(link.body.token).toBeTruthy();
    const res = await supertest(app).get(
      `/api/uploads/${docA.filename}?portalToken=${link.body.token}`,
    );
    expect(res.status).toBe(403);
  });

  it("scopes referee tokens to the single document linked to that reference", async () => {
    // A referee token must only unlock the one document attached to its
    // reference row (references.documentId), never the nurse's other
    // files. We assert: (a) ALLOW for the linked document via both
    // /api/uploads/:filename and /api/documents/:id/download, (b) DENY
    // for any other document belonging to the same nurse, and (c) DENY
    // for a token whose reference has no linked document.
    const { db } = await import("../server/db");
    const { references, refereeTokens } = await import("../shared/schema");

    // Reference whose documentId IS the test doc on nurse A.
    const linkedTokenStr = `task151-ref-linked-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const [linkedRef] = await db
      .insert(references)
      .values({
        nurseId: nurseA.id,
        refereeName: "T151 Linked Referee",
        refereeEmail: "ref-linked@test.local",
        relationship: "Manager",
        status: "pending",
        documentId: docA.id,
      })
      .returning();
    await db.insert(refereeTokens).values({
      referenceId: linkedRef.id,
      nurseId: nurseA.id,
      token: linkedTokenStr,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const allowedFile = await supertest(app).get(
      `/api/uploads/${docA.filename}?refereeToken=${linkedTokenStr}`,
    );
    expect(allowedFile.status).toBe(200);
    const allowedDoc = await supertest(app).get(
      `/api/documents/${docA.id}/download?refereeToken=${linkedTokenStr}`,
    );
    expect(allowedDoc.status).toBe(200);

    // A different document on the same nurse must remain denied.
    const uploadsDir = path.join(process.cwd(), "uploads");
    const otherFilename = `task151-other-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.txt`;
    fs.writeFileSync(path.join(uploadsDir, otherFilename), "other-doc");
    const otherCreated = await adminAgent
      .post(`/api/candidates/${nurseA.id}/documents`)
      .send({
        type: "Other Test Document",
        filename: otherFilename,
        filePath: `/api/uploads/${otherFilename}`,
        category: "other",
        mimeType: "text/plain",
      });
    const otherDoc = otherCreated.body;
    const deniedOther = await supertest(app).get(
      `/api/uploads/${otherDoc.filename}?refereeToken=${linkedTokenStr}`,
    );
    expect(deniedOther.status).toBe(403);
    const deniedOtherDoc = await supertest(app).get(
      `/api/documents/${otherDoc.id}/download?refereeToken=${linkedTokenStr}`,
    );
    expect(deniedOtherDoc.status).toBe(403);

    // Token whose reference has no linked document → no file access.
    const unlinkedTokenStr = `task151-ref-unlinked-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const [unlinkedRef] = await db
      .insert(references)
      .values({
        nurseId: nurseA.id,
        refereeName: "T151 Unlinked Referee",
        refereeEmail: "ref-unlinked@test.local",
        relationship: "Manager",
        status: "pending",
      })
      .returning();
    await db.insert(refereeTokens).values({
      referenceId: unlinkedRef.id,
      nurseId: nurseA.id,
      token: unlinkedTokenStr,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const deniedUnlinked = await supertest(app).get(
      `/api/uploads/${docA.filename}?refereeToken=${unlinkedTokenStr}`,
    );
    expect(deniedUnlinked.status).toBe(403);
  });

  it("writes a documents-module audit row when a foreign portal is denied", async () => {
    const { db } = await import("../server/db");
    const { auditLogs } = await import("../shared/schema");
    const { eq, and } = await import("drizzle-orm");
    const cookieB = await mintPortalSessionCookie(nurseB.id);
    const res = await supertest(app)
      .get(`/api/uploads/${docA.filename}`)
      .set("Cookie", cookieB);
    expect(res.status).toBe(403);
    // Give the fire-and-forget audit write a moment.
    await new Promise((r) => setTimeout(r, 200));
    const rows = await db
      .select()
      .from(auditLogs)
      .where(
        and(eq(auditLogs.nurseId, nurseA.id), eq(auditLogs.action, "document_fetch_denied")),
      );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.module === "documents")).toBe(true);
  });
});
