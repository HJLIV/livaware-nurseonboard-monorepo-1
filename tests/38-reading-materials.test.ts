// Task — Admin-added reading materials with read tracking.
// Reading materials live in the shared `policies` table (category="reading")
// and reuse the policy read-event + acknowledgement pipeline.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Express } from "express";
import supertest from "supertest";
import {
  getTestApp,
  loginAsAdmin,
  loginAsTeam,
  createTestNurse,
  createPortalLink,
  cleanupTestData,
} from "./helpers";

async function approveCompliance(agent: supertest.Agent, nurseId: string) {
  const res = await agent.post(`/api/nurses/${nurseId}/compliance-approval`).send({});
  expect([200, 409]).toContain(res.status);
}

describe("Reading materials — admin CRUD + portal read tracking", () => {
  let app: Express;
  let request: supertest.Agent;
  let admin: supertest.Agent;
  let team: supertest.Agent;
  let superAdmin: supertest.Agent;
  let materialId: string;
  let nurseId: string;
  let portalToken: string;

  beforeAll(async () => {
    const t = await getTestApp();
    app = t.app;
    request = t.request;
    admin = await loginAsAdmin();
    team = await loginAsTeam();
    // Super admin is a separate fixed account in tests.
    superAdmin = supertest.agent(app);
    await superAdmin.post("/api/auth/login").send({ username: "superadmin", password: "superpass" });

    const nurse = await createTestNurse(admin);
    nurseId = nurse.id;
    await approveCompliance(admin, nurseId);
    const link = await createPortalLink(admin, nurseId);
    portalToken = link.token;
  }, 60000);

  afterAll(async () => {
    if (materialId) {
      try { await superAdmin.delete(`/api/admin/reading-materials/${materialId}`); } catch {}
    }
    await cleanupTestData(admin);
  });

  // ── CRUD gating ─────────────────────────────────────────────────
  it("rejects unauthenticated list", async () => {
    const res = await supertest(app).get("/api/admin/reading-materials");
    expect(res.status).toBe(401);
  });

  it("rejects create by non-super-admin (team)", async () => {
    const res = await team
      .post("/api/admin/reading-materials")
      .field("title", "Nope")
      .field("body", "not allowed");
    expect(res.status).toBe(403);
  });

  it("super admin can create a reading material from pasted text", async () => {
    const res = await superAdmin
      .post("/api/admin/reading-materials")
      .field("title", "Test Winter Guidance")
      .field("body", "# Winter guidance\n\nPlease read this carefully.")
      .field("readingCategory", "Guidance")
      .field("version", "1.0");
    expect(res.status).toBe(201);
    expect(res.body.category).toBe("reading");
    expect(res.body.readingCategory).toBe("Guidance");
    materialId = res.body.id;
  });

  it("rejects create with no content at all", async () => {
    const res = await superAdmin
      .post("/api/admin/reading-materials")
      .field("title", "Empty item");
    expect(res.status).toBe(400);
  });

  it("regular admin CAN list reading materials", async () => {
    const res = await admin.get("/api/admin/reading-materials");
    expect(res.status).toBe(200);
    expect(res.body.some((m: any) => m.id === materialId)).toBe(true);
  });

  it("reading rows do NOT leak into the legacy admin policies list", async () => {
    const res = await admin.get("/api/admin/policies");
    expect(res.status).toBe(200);
    expect(res.body.some((p: any) => p.id === materialId)).toBe(false);
  });

  it("super admin can update; team cannot", async () => {
    const forbidden = await team
      .patch(`/api/admin/reading-materials/${materialId}`)
      .send({ title: "Hacked" });
    expect(forbidden.status).toBe(403);

    const res = await superAdmin
      .patch(`/api/admin/reading-materials/${materialId}`)
      .send({ title: "Test Winter Guidance v2", readingCategory: "Newsletter" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Test Winter Guidance v2");
    expect(res.body.readingCategory).toBe("Newsletter");
  });

  // ── Portal surface ──────────────────────────────────────────────
  it("portal lists reading materials (not legacy policies list)", async () => {
    const res = await request.get(`/api/portal/${portalToken}/reading-materials`);
    expect(res.status).toBe(200);
    const item = res.body.policies.find((p: any) => p.id === materialId);
    expect(item).toBeTruthy();
    expect(item.readingCategory).toBe("Newsletter");
    expect(item.acknowledged).toBe(false);
    expect(res.body.outstanding).toBeGreaterThanOrEqual(1);

    // and NOT in the legacy portal policies list
    const legacy = await request.get(`/api/portal/${portalToken}/policies`);
    expect(legacy.status).toBe(200);
    expect(legacy.body.policies.some((p: any) => p.id === materialId)).toBe(false);
  });

  it("ingests read events for a reading item via the shared endpoint", async () => {
    const res = await request
      .post(`/api/portal/${portalToken}/policies/${materialId}/read-events`)
      .send({
        events: [
          { type: "session", durationMs: 42000, sessionId: "sess-reading-1" },
          { type: "scroll_end", sessionId: "sess-reading-1" },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.inserted).toBe(2);
  });

  it("acknowledges a reading item and rolls up read stats", async () => {
    const res = await request
      .post(`/api/portal/${portalToken}/policies/${materialId}/acknowledge`)
      .send({ events: [] });
    expect([200, 201]).toContain(res.status);

    const list = await request.get(`/api/portal/${portalToken}/reading-materials`);
    const item = list.body.policies.find((p: any) => p.id === materialId);
    expect(item.acknowledged).toBe(true);
  });

  it("writes a reading-specific audit entry on acknowledgement", async () => {
    const res = await admin.get(`/api/nurses/${nurseId}/audit-log`);
    expect(res.status).toBe(200);
    const entry = res.body.find(
      (l: any) => l.action === "reading_material_acknowledged" && l.detail?.policyId === materialId,
    );
    expect(entry).toBeTruthy();
    expect(entry.module).toBe("portal");
  });

  // ── Admin visibility ────────────────────────────────────────────
  it("per-item nurse-status shows the nurse as read, with behaviour stats for super admin", async () => {
    const res = await superAdmin.get(`/api/admin/reading-materials/${materialId}/nurse-status`);
    expect(res.status).toBe(200);
    expect(res.body.canViewReadBehaviour).toBe(true);
    const row = res.body.nurses.find((n: any) => n.nurseId === nurseId);
    expect(row).toBeTruthy();
    expect(row.acknowledged).toBe(true);
    expect(row.totalActiveSeconds).toBeGreaterThanOrEqual(42);
  });

  it("per-item nurse-status hides behaviour fields from regular admins", async () => {
    const res = await admin.get(`/api/admin/reading-materials/${materialId}/nurse-status`);
    expect(res.status).toBe(200);
    expect(res.body.canViewReadBehaviour).toBe(false);
    const row = res.body.nurses.find((n: any) => n.nurseId === nurseId);
    expect(row.acknowledged).toBe(true);
    expect(row.totalActiveSeconds).toBeUndefined();
  });

  it("per-nurse reading progress endpoint returns the item", async () => {
    const res = await admin.get(`/api/nurses/${nurseId}/reading-materials-progress`);
    expect(res.status).toBe(200);
    const item = res.body.policies.find((p: any) => p.id === materialId);
    expect(item).toBeTruthy();
    expect(item.acknowledged).toBe(true);
  });

  it("file download 404s when no source file was uploaded", async () => {
    const res = await admin.get(`/api/admin/reading-materials/${materialId}/file`);
    expect(res.status).toBe(404);
  });

  // ── Delete ──────────────────────────────────────────────────────
  it("delete is super-admin only and cleans up", async () => {
    const forbidden = await team.delete(`/api/admin/reading-materials/${materialId}`);
    expect(forbidden.status).toBe(403);

    const res = await superAdmin.delete(`/api/admin/reading-materials/${materialId}`);
    expect(res.status).toBe(200);
    const list = await admin.get("/api/admin/reading-materials");
    expect(list.body.some((m: any) => m.id === materialId)).toBe(false);
    materialId = "";
  });
});
