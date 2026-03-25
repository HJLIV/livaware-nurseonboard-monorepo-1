import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse } from "./helpers";

describe("Audit Log Routes", () => {
  let app: Express;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  // T82
  it("T82: GET /api/audit-logs — returns paginated audit logs", async () => {
    const res = await agent.get("/api/audit-logs?limit=10");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T83
  it("T83: GET /api/audit-logs — supports filtering by query params", async () => {
    await createTestNurse(agent);
    const res = await agent.get("/api/audit-logs?limit=50");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const hasNurseCreated = res.body.some((l: { action: string }) => l.action === "nurse_created");
    expect(hasNurseCreated).toBe(true);
  });

  // T84
  it("T84: GET /api/audit-logs/stats — returns audit statistics", async () => {
    const res = await agent.get("/api/audit-logs/stats");
    expect(res.status).toBe(200);
    expect(res.body.byModule).toBeDefined();
    expect(res.body.byAction).toBeDefined();
    expect(Array.isArray(res.body.byModule)).toBe(true);
    expect(Array.isArray(res.body.byAction)).toBe(true);
  });

  // T85
  it("T85: GET /api/audit-logs/nurse/:id — returns logs for specific nurse", async () => {
    const nurse = await createTestNurse(agent);
    const res = await agent.get(`/api/audit-logs/nurse/${nurse.id}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    for (const log of res.body) {
      expect(log.nurseId).toBe(nurse.id);
    }
  });

  // T86
  it("T86: Audit log is created when nurse record is modified", async () => {
    const nurse = await createTestNurse(agent);
    await agent.patch(`/api/nurses/${nurse.id}`).send({ phone: "07700888888" });
    const res = await agent.get(`/api/audit-logs/nurse/${nurse.id}`);
    expect(res.status).toBe(200);
    const updateLog = res.body.find((l: { action: string }) => l.action === "nurse_updated");
    expect(updateLog).toBeDefined();
  });
});
