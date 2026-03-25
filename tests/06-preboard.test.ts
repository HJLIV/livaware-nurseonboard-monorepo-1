import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp } from "./helpers";

describe("Preboard Routes", () => {
  let app: Express;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
  });

  // T26
  it("T26: GET /api/preboard/assessments — lists all preboard assessments", async () => {
    const agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
    const res = await agent.get("/api/preboard/assessments");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T27
  it("T27: POST /api/assessments — submits a valid preboard assessment", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post("/api/assessments").send({
      nurseName: "Jane Smith",
      nurseEmail: "jane@example.com",
      responses: [
        { questionId: 1, tag: "clinical", domain: "medication", prompt: "Describe your approach", response: "Test answer", timeSpent: 30, timeLimit: 60 },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe("received");
  });

  // T28
  it("T28: POST /api/assessments — fails with missing required fields", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post("/api/assessments").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid/i);
  });

  // T29
  it("T29: POST /api/assessments — validates response format", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post("/api/assessments").send({
      nurseName: "Jane Smith",
      nurseEmail: "jane@example.com",
      responses: [{ questionId: "q1" }],
    });
    expect(res.status).toBe(400);
  });
});
