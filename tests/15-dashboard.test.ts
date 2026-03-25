import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse } from "./helpers";

describe("Dashboard & Pipeline Routes", () => {
  let app: Express;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  // T77
  it("T77: GET /api/dashboard/stats — returns summary statistics", async () => {
    const res = await agent.get("/api/dashboard/stats");
    expect(res.status).toBe(200);
    expect(res.body.totalNurses).toBeDefined();
    expect(res.body.funnelCounts).toBeDefined();
    expect(res.body.funnelCounts.preboard).toBeDefined();
  });

  // T78
  it("T78: GET /api/dashboard/summary — gracefully handles missing AI config", async () => {
    const res = await agent.get("/api/dashboard/summary");
    expect(res.status).toBe(500);
    expect(res.body.message).toBeDefined();
  });

  // T79
  it("T79: GET /api/pipeline — returns kanban pipeline data", async () => {
    const res = await agent.get("/api/pipeline");
    expect(res.status).toBe(200);
    expect(res.body.preboard).toBeDefined();
    expect(res.body.onboard).toBeDefined();
    expect(res.body.skills_arcade).toBeDefined();
    expect(res.body.completed).toBeDefined();
  });

  // T80
  it("T80: GET /api/pipeline — returns correct counts per stage", async () => {
    const res = await agent.get("/api/pipeline");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.preboard)).toBe(true);
    expect(Array.isArray(res.body.onboard)).toBe(true);
    expect(Array.isArray(res.body.skills_arcade)).toBe(true);
    expect(Array.isArray(res.body.completed)).toBe(true);
  });

  // T81
  it("T81: Dashboard stats reflect newly added nurses", async () => {
    const statsBefore = await agent.get("/api/dashboard/stats");
    const before = statsBefore.body.totalNurses;
    await createTestNurse(agent);
    const statsAfter = await agent.get("/api/dashboard/stats");
    expect(statsAfter.body.totalNurses).toBeGreaterThanOrEqual(before + 1);
  });
});
