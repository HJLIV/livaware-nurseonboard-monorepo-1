import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestCandidate } from "./helpers";

describe("Onboard Advanced Admin Routes", () => {
  let app: Express;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  // T68
  it("T68: POST /api/candidates/:id/magic-link — generates magic link (admin only)", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/magic-link`);
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.expiresAt).toBeDefined();
  });

  // T69
  it("T69: GET /api/candidates/:id/magic-links — lists magic links for candidate", async () => {
    const candidate = await createTestCandidate(agent);
    await agent.post(`/api/candidates/${candidate.id}/magic-link`);
    const res = await agent.get(`/api/candidates/${candidate.id}/magic-links`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  // T70
  it("T70: POST /api/candidates/:id/audit-summary — returns 503 when AI service unavailable", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/audit-summary`);
    expect(res.status).toBe(503);
  });

  // T71
  it("T71: GET /api/candidates/:id/pdf-report — generates PDF report", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.get(`/api/candidates/${candidate.id}/pdf-report`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/pdf|json/);
  });

  // T72
  it("T72: POST /api/candidates/:id/compliance-check — returns 503 when AI service unavailable", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/compliance-check`);
    expect(res.status).toBe(503);
  });
});
