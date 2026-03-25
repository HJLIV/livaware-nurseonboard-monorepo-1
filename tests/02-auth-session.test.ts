import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp } from "./helpers";

describe("Auth Session Routes", () => {
  let app: Express;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
  });

  // T6
  it("T6: GET /api/auth/me — returns user info when authenticated", async () => {
    const agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.username).toBe("admin");
    expect(res.body.role).toBe("admin");
  });

  // T7
  it("T7: GET /api/auth/me — returns 401 when not authenticated", async () => {
    const agent = supertest.agent(app);
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.authenticated).toBe(false);
  });

  // T8
  it("T8: Protected route access without auth returns 401", async () => {
    const agent = supertest.agent(app);
    const res = await agent.get("/api/nurses");
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/not authenticated/i);
  });
});
