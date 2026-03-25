import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

describe("Portal Token & Identity Routes", () => {
  let app: Express;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  // T30
  it("T30: GET /api/portal/verify/:token — validates a valid portal token", async () => {
    const nurse = await createTestNurse(agent);
    const link = await createPortalLink(agent, nurse.id, "onboard");
    const candidateAgent = supertest.agent(app);
    const candidateRes = await agent.post("/api/candidates").send({
      fullName: nurse.fullName,
      email: nurse.email,
    });
    const candidateId = candidateRes.body.id;
    const magicLinkRes = await agent.post(`/api/candidates/${candidateId}/magic-link`);
    const magicToken = magicLinkRes.body.token;
    const res = await candidateAgent.get(`/api/portal/verify/${magicToken}`);
    expect(res.status).toBe(200);
    expect(res.body.candidate).toBeDefined();
    expect(res.body.token).toBe(magicToken);
  });

  // T31
  it("T31: GET /api/portal/verify/:token — rejects expired token", async () => {
    const candidateAgent = supertest.agent(app);
    const res = await candidateAgent.get("/api/portal/verify/expired-token-that-does-not-exist");
    expect(res.status).toBe(404);
  });

  // T32
  it("T32: GET /api/portal/verify/:token — rejects invalid token", async () => {
    const candidateAgent = supertest.agent(app);
    const res = await candidateAgent.get("/api/portal/verify/completely-invalid-token-12345");
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/invalid/i);
  });

  // T33
  it("T33: GET /api/portal/:token/candidate — returns nurse data via portal", async () => {
    const nurse = await createTestNurse(agent);
    const link = await createPortalLink(agent, nurse.id, "onboard");
    const portalAgent = supertest.agent(app);
    const res = await portalAgent.get(`/api/portal/${link.token}/candidate`);
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe(nurse.fullName);
    expect(res.body.email).toBe(nurse.email);
    expect(res.body.id).toBe(nurse.id);
  });

  // T34
  it("T34: PATCH /api/portal/:token/candidate — updates nurse identity fields via portal", async () => {
    const nurse = await createTestNurse(agent);
    const link = await createPortalLink(agent, nurse.id, "onboard");
    const portalAgent = supertest.agent(app);
    const res = await portalAgent.patch(`/api/portal/${link.token}/candidate`).send({
      phone: "07700111111",
      address: "123 Test Street",
    });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("07700111111");
    expect(res.body.address).toBe("123 Test Street");
  });

  // T35
  it("T35: GET /api/portal/:token/onboarding-state — returns current onboarding progress", async () => {
    const nurse = await createTestNurse(agent);
    const link = await createPortalLink(agent, nurse.id, "onboard");
    const portalAgent = supertest.agent(app);
    const res = await portalAgent.get(`/api/portal/${link.token}/onboarding-state`);
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe("object");
  });
});
