import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse } from "./helpers";

describe("Nurse Detail Views", () => {
  let agent: supertest.Agent;

  beforeAll(async () => {
    const { app } = await getTestApp();
    agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  // T23
  it("T23: GET /api/nurses/:id/preboard — returns preboard assessment data", async () => {
    const nurse = await createTestNurse(agent);
    const res = await agent.get(`/api/nurses/${nurse.id}/preboard`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T24
  it("T24: GET /api/nurses/:id/onboard — returns onboard compliance data", async () => {
    const nurse = await createTestNurse(agent);
    const res = await agent.get(`/api/nurses/${nurse.id}/onboard`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const stepNames = res.body.map((s: { name: string }) => s.name);
    expect(stepNames).toContain("NMC PIN Verification");
    expect(stepNames).toContain("DBS Check");
  });

  // T25
  it("T25: GET /api/nurses/:id/arcade — returns skills arcade progress", async () => {
    const nurse = await createTestNurse(agent);
    const res = await agent.get(`/api/nurses/${nurse.id}/arcade`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
