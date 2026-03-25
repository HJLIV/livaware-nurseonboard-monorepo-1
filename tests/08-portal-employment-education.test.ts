import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

describe("Portal Employment & Education History Routes", () => {
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

  // T36
  it("T36: GET /api/portal/:token/employment-history — lists employment records", async () => {
    const res = await supertest(app).get(`/api/portal/${portalToken}/employment-history`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T37
  it("T37: POST /api/portal/:token/employment-history — adds employment record", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/employment-history`).send({
      employer: "NHS Trust",
      jobTitle: "Staff Nurse",
      startDate: "2020-01-01",
    });
    expect(res.status).toBe(201);
    expect(res.body.employer).toBe("NHS Trust");
  });

  // T38
  it("T38: DELETE /api/portal/:token/employment-history/:id — removes employment record", async () => {
    const createRes = await supertest(app).post(`/api/portal/${portalToken}/employment-history`).send({
      employer: "Private Hospital",
      jobTitle: "Nurse",
      startDate: "2019-06-01",
    });
    const id = createRes.body.id;
    const delRes = await supertest(app).delete(`/api/portal/${portalToken}/employment-history/${id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
  });

  // T39
  it("T39: GET /api/portal/:token/education-history — lists education records", async () => {
    const res = await supertest(app).get(`/api/portal/${portalToken}/education-history`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T40
  it("T40: POST /api/portal/:token/education-history — adds education record", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/education-history`).send({
      institution: "University of London",
      qualification: "BSc Nursing",
    });
    expect(res.status).toBe(201);
    expect(res.body.institution).toBe("University of London");
  });

  // T41
  it("T41: DELETE /api/portal/:token/education-history/:id — removes education record", async () => {
    const createRes = await supertest(app).post(`/api/portal/${portalToken}/education-history`).send({
      institution: "Open University",
      qualification: "MSc Healthcare",
    });
    const id = createRes.body.id;
    const delRes = await supertest(app).delete(`/api/portal/${portalToken}/education-history/${id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);
  });
});
