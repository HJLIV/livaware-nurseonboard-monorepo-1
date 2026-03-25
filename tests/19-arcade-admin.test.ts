import type { Express } from "express";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import { getTestApp, cleanupTestData } from "./helpers";

describe("Skills Arcade Admin & Trainer Routes", () => {
  let app: Express;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
  });

  afterAll(async () => {
    const agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
    await cleanupTestData(agent);
  });

  // T97
  it("T97: GET /api/admin/modules — lists all arcade modules (admin)", async () => {
    const agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
    const res = await agent.get("/api/admin/modules");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T98
  it("T98: POST /api/admin/assign — assigns module to registered arcade user", async () => {
    const agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });

    const modulesRes = await agent.get("/api/admin/modules");
    expect(modulesRes.status).toBe(200);
    expect(modulesRes.body.length).toBeGreaterThan(0);
    const moduleId = modulesRes.body[0].id;

    const assignEmail = `assign-nurse-${Date.now()}-${Math.random().toString(36).substring(2, 8)}@test.example.com`;
    const regRes = await supertest.agent(app).post("/api/auth/register").send({
      name: "Assign Test Nurse",
      email: assignEmail,
      password: "AssignNurse123!",
      confirmPassword: "AssignNurse123!",
    });
    expect(regRes.status).toBe(201);
    const userId = regRes.body.id;
    expect(userId).toBeDefined();

    const res = await agent.post("/api/admin/assign").send({
      moduleId,
      userIds: [userId],
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  // T99
  it("T99: GET /api/trainer/remediation-queue — lists nurses needing remediation", async () => {
    const agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
    const res = await agent.get("/api/trainer/remediation-queue");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T100
  it("T100: POST /api/trainer/remediation/:caseId/complete — returns 404 for invalid case", async () => {
    const agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
    const res = await agent.post("/api/trainer/remediation/non-existent-case/complete").send({
      competencyOutcome: "cleared",
    });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});
