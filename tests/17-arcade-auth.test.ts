import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp } from "./helpers";

describe("Skills Arcade Auth & Setup Routes", () => {
  let app: Express;
  const arcadeEmail = `arcade-reg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}@test.example.com`;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
  });

  // T87
  it("T87: GET /api/auth/setup-status — returns whether initial setup is done", async () => {
    const agent = supertest.agent(app);
    const res = await agent.get("/api/auth/setup-status");
    expect(res.status).toBe(200);
    expect(typeof res.body.needsSetup).toBe("boolean");
  });

  // T88
  it("T88: POST /api/auth/register — registration validates required fields", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post("/api/auth/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBeDefined();
  });

  // T89
  it("T89: POST /api/auth/register — registration rejects mismatched passwords", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post("/api/auth/register").send({
      name: "Mismatch User",
      email: `arcade-mismatch-${Date.now()}@test.example.com`,
      password: "Password123!",
      confirmPassword: "DifferentPass123!",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/match/i);
  });

  // T90
  it("T90: POST /api/auth/register — successfully registers a new arcade user", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post("/api/auth/register").send({
      name: "Arcade Test User",
      email: arcadeEmail,
      password: "ArcadePass123!",
      confirmPassword: "ArcadePass123!",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Arcade Test User");
    expect(res.body.email).toBe(arcadeEmail);
    expect(res.body.role).toBeDefined();
  });

  // T91
  it("T91: POST /api/auth/register — rejects duplicate email registration", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post("/api/auth/register").send({
      name: "Duplicate User",
      email: arcadeEmail,
      password: "ArcadePass123!",
      confirmPassword: "ArcadePass123!",
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already|exists|duplicate/i);
  });
});
