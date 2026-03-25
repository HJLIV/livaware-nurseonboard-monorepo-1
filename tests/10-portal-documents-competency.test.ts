import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

describe("Portal Document & Competency Routes", () => {
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

  // T48
  it("T48: POST /api/portal/:token/documents — uploads a document via portal", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/documents`).send({
      type: "DBS Certificate",
      filename: "dbs-cert.pdf",
      filePath: "/api/uploads/test.pdf",
      category: "dbs",
    });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("DBS Certificate");
  });

  // T49
  it("T49: GET /api/portal/:token/documents — lists documents for the nurse", async () => {
    const res = await supertest(app).get(`/api/portal/${portalToken}/documents`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T50
  it("T50: POST /api/portal/:token/competency-declarations — submits competency self-assessment", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/competency-declarations`).send({
      competencyName: "Medication Administration",
      domain: "Clinical",
      selfAssessedLevel: "level_3",
    });
    expect(res.status).toBe(201);
    expect(res.body.competencyName).toBe("Medication Administration");
    expect(res.body.domain).toBe("Clinical");
  });

  // T51
  it("T51: GET /api/portal/:token/competency-declarations — returns declared competencies", async () => {
    const res = await supertest(app).get(`/api/portal/${portalToken}/competency-declarations`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T52
  it("T52: POST /api/portal/:token/health-declaration — submits health declaration", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/health-declaration`).send({
      completed: true,
      ohReferralRequired: false,
      declarations: { fit_for_work: true },
    });
    expect(res.status).toBe(201);
    expect(res.body.completed).toBe(true);
  });

  // T53
  it("T53: GET /api/portal/:token/health-declaration — returns health declaration status", async () => {
    const res = await supertest(app).get(`/api/portal/${portalToken}/health-declaration`);
    expect(res.status).toBe(200);
  });
});
