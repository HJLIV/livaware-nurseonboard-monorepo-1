import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse, createPortalLink, createTestCandidate } from "./helpers";

describe("Portal NMC & DBS Verification Routes", () => {
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

  // T42
  it("T42: POST /api/portal/:token/dbs-verification — submits DBS number for verification", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/dbs-verification`).send({
      certificateNumber: "001234567890",
      certificateType: "Enhanced",
    });
    expect(res.status).toBe(201);
    expect(res.body.certificateNumber).toBe("001234567890");
    expect(res.body.certificateType).toBe("Enhanced");
    expect(res.body.id).toBeDefined();
  });

  // T43
  it("T43: POST /api/portal/:token/dbs-verification — fails with missing certificate number", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/dbs-verification`).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/certificateNumber/i);
  });

  // T44
  it("T44: POST /api/candidates/:id/nmc-verify — fails with invalid PIN format", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/nmc-verify`).send({
      pin: "INVALID",
      registrationStatus: "Registered",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid.*pin/i);
  });

  // T45
  it("T45: POST /api/candidates/:id/nmc-verify — fails with missing pin", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/nmc-verify`).send({
      registrationStatus: "Registered",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/pin.*required/i);
  });

  // T46
  it("T46: GET /api/candidates/:id/nmc-verification — retrieves NMC verification status", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.get(`/api/candidates/${candidate.id}/nmc-verification`);
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe("object");
  });

  // T47
  it("T47: POST /api/portal/:token/nmc-parse-pdf — rejects request without file upload", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/nmc-parse-pdf`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no file/i);
  });
});
