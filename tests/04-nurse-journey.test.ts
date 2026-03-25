import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

describe("Nurse Journey & Portal Link Routes", () => {
  let agent: supertest.Agent;

  beforeAll(async () => {
    const { app } = await getTestApp();
    agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  // T17
  it("T17: POST /api/nurses/:id/portal-link — generates portal link for valid module", async () => {
    const nurse = await createTestNurse(agent);
    const res = await agent.post(`/api/nurses/${nurse.id}/portal-link`).send({ module: "preboard" });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.url).toContain("/portal/");
    expect(res.body.module).toBe("preboard");
  });

  // T18
  it("T18: POST /api/nurses/:id/portal-link — fails for invalid module", async () => {
    const nurse = await createTestNurse(agent);
    const res = await agent.post(`/api/nurses/${nurse.id}/portal-link`).send({ module: "invalid" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid module/i);
  });

  // T19
  it("T19: GET /api/nurses/:id/portal-links — lists portal links for a nurse", async () => {
    const nurse = await createTestNurse(agent);
    await agent.post(`/api/nurses/${nurse.id}/portal-link`).send({ module: "preboard" });
    const res = await agent.get(`/api/nurses/${nurse.id}/portal-links`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  // T20
  it("T20: POST /api/nurses/:id/advance-stage — advances nurse from preboard to onboard", async () => {
    const nurse = await createTestNurse(agent);
    const res = await agent.post(`/api/nurses/${nurse.id}/advance-stage`);
    expect(res.status).toBe(200);
    expect(res.body.currentStage).toBe("onboard");
    expect(res.body.preboardStatus).toBe("completed");
  });

  // T21
  it("T21: POST /api/nurses/:id/advance-stage — fails when at final stage", async () => {
    const nurse = await createTestNurse(agent);
    await agent.post(`/api/nurses/${nurse.id}/advance-stage`);
    await agent.post(`/api/nurses/${nurse.id}/advance-stage`);
    await agent.post(`/api/nurses/${nurse.id}/advance-stage`);
    const res = await agent.post(`/api/nurses/${nurse.id}/advance-stage`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/final stage/i);
  });

  // T22
  it("T22: GET /api/nurses/:id/audit-log — returns audit trail for a nurse", async () => {
    const nurse = await createTestNurse(agent);
    const res = await agent.get(`/api/nurses/${nurse.id}/audit-log`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});
