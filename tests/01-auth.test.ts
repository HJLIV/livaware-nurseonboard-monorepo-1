import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp } from "./helpers";

describe("Auth Routes", () => {
  let app: Express;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
  });

  // T1
  it("T1: POST /api/auth/login — successful admin login", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.role).toBe("admin");
    expect(res.body.username).toBe("admin");
  });

  // T2
  it("T2: POST /api/auth/login — successful team login", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post("/api/auth/login").send({ username: "team", password: "teampass" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.role).toBe("team");
  });

  // T3
  it("T3: POST /api/auth/login — invalid credentials returns 401", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post("/api/auth/login").send({ username: "admin", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);
  });

  // T4
  it("T4: POST /api/auth/login — missing fields returns 400", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post("/api/auth/login").send({ username: "admin" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  // T5
  it("T5: POST /api/auth/logout — clears session", async () => {
    const agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
    const logoutRes = await agent.post("/api/auth/logout");
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.ok).toBe(true);
    const meRes = await agent.get("/api/auth/me");
    expect(meRes.status).toBe(401);
  });
});
