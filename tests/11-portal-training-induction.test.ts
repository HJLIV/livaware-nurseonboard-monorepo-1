import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

describe("Portal Training & Induction Routes", () => {
  let app: Express;
  let agent: supertest.Agent;
  let portalToken: string;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
    const nurse = await createTestNurse(agent);
    const link = await createPortalLink(agent, nurse.id, "onboard");
    portalToken = link.token;
  });

  // T54
  it("T54: GET /api/portal/:token/mandatory-training — lists required training modules", async () => {
    const res = await supertest(app).get(`/api/portal/${portalToken}/mandatory-training`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T55
  it("T55: POST /api/portal/:token/mandatory-training — records training completion", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/mandatory-training`).send({
      moduleName: "Fire Safety",
      completedDate: "2024-01-15",
      expiryDate: "2025-01-15",
      status: "completed",
    });
    expect(res.status).toBe(201);
    expect(res.body.moduleName).toBe("Fire Safety");
  });

  // T56
  it("T56: GET /api/portal/:token/induction-policies — lists induction policies", async () => {
    const res = await supertest(app).get(`/api/portal/${portalToken}/induction-policies`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T57
  it("T57: POST /api/portal/:token/induction-policies — acknowledges a policy", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/induction-policies`).send({
      policyName: "Safeguarding Policy",
      acknowledged: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.policyName).toBe("Safeguarding Policy");
  });

  // T58
  it("T58: GET /api/portal/:token/professional-indemnity — returns indemnity status", async () => {
    const res = await supertest(app).get(`/api/portal/${portalToken}/professional-indemnity`);
    expect(res.status).toBe(200);
  });

  // T59
  it("T59: POST /api/portal/:token/professional-indemnity — submits indemnity details", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/professional-indemnity`).send({
      provider: "RCN",
      policyNumber: "POL-12345",
      expiryDate: "2025-12-31",
      verified: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.provider).toBe("RCN");
  });
});
