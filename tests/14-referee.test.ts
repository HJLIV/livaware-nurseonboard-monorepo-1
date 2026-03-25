import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

describe("Referee Routes", () => {
  let app: Express;
  let agent: supertest.Agent;
  let refereeToken: string;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });

    const nurse = await createTestNurse(agent);
    const link = await createPortalLink(agent, nurse.id, "onboard");

    const refRes = await supertest(app)
      .post(`/api/portal/${link.token}/references`)
      .send({
        refereeName: "Dr Referee Happy",
        refereeEmail: `referee-happy-${Date.now()}@test.example.com`,
        refereeOrg: "Test Hospital",
        refereeRole: "Manager",
        relationship: "Line Manager",
      });
    expect(refRes.status).toBe(201);
    const referenceId = refRes.body.id;

    const { db } = await import("../server/db");
    const { refereeTokens } = await import("../shared/schema");
    const { eq } = await import("drizzle-orm");
    const [tokenRecord] = await db
      .select()
      .from(refereeTokens)
      .where(eq(refereeTokens.referenceId, referenceId))
      .limit(1);
    refereeToken = tokenRecord?.token || "";
  });

  // T73
  it("T73: GET /api/referee/:token — rejects invalid token with 404", async () => {
    const refereeAgent = supertest.agent(app);
    const res = await refereeAgent.get("/api/referee/invalid-referee-token-12345");
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  // T74
  it("T74: GET /api/referee/:token — retrieves valid referee form with candidate details", async () => {
    expect(refereeToken).toBeTruthy();
    const refereeAgent = supertest.agent(app);
    const res = await refereeAgent.get(`/api/referee/${refereeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.candidateName).toBeDefined();
    expect(res.body.refereeName).toBeDefined();
    expect(res.body.completed).toBe(false);
  });

  // T75
  it("T75: POST /api/referee/:token/submit — rejects submission with invalid token", async () => {
    const refereeAgent = supertest.agent(app);
    const res = await refereeAgent.post("/api/referee/invalid-token/submit").send({
      ratings: { clinicalSkills: 5, communication: 4, professionalism: 5 },
      freeTextResponses: { comments: "Excellent nurse" },
    });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  // T76
  it("T76: POST /api/referee/:token/submit — submits a valid referee form", async () => {
    expect(refereeToken).toBeTruthy();
    const refereeAgent = supertest.agent(app);
    const res = await refereeAgent.post(`/api/referee/${refereeToken}/submit`).send({
      ratings: { clinicalSkills: 5, communication: 4, professionalism: 5, teamwork: 4, reliability: 5 },
      freeTextResponses: { strengths: "Very capable", areasForImprovement: "None noted", additionalComments: "Highly recommend" },
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();

    const formRes = await refereeAgent.get(`/api/referee/${refereeToken}`);
    expect(formRes.status).toBe(410);
  });
});
