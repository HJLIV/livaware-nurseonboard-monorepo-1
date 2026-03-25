import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp } from "./helpers";

describe("Skills Arcade Nurse Flow Routes", () => {
  let app: Express;
  let adminAgent: supertest.Agent;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    adminAgent = supertest.agent(app);
    await adminAgent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  // T92
  it("T92: GET /api/nurse/dashboard — returns assigned modules and progress", async () => {
    const res = await adminAgent.get("/api/nurse/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.assignments).toBeDefined();
    expect(Array.isArray(res.body.assignments)).toBe(true);
    expect(res.body.isAdmin).toBe(true);
  });

  // T93
  it("T93: GET /api/nurse/assignments/:id — returns 404 for unknown assignment", async () => {
    const res = await adminAgent.get("/api/nurse/assignments/non-existent-id");
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  // T94
  it("T94: POST /api/nurse/attempts/start — requires assignmentId", async () => {
    const res = await adminAgent.post("/api/nurse/attempts/start").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/assignmentId/i);
  });

  // T95
  it("T95: POST /api/nurse/attempts/submit — requires valid format", async () => {
    const res = await adminAgent.post("/api/nurse/attempts/submit").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid/i);
  });

  // T96
  it("T96: POST /api/nurse/attempts/submit — validates attempt existence", async () => {
    const res = await adminAgent.post("/api/nurse/attempts/submit").send({
      attemptId: "fake-attempt-id",
      responses: [{ taskId: "t1", type: "single_choice", answer: "a" }],
    });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });
});
