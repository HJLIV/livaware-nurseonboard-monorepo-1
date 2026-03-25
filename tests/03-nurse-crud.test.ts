import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse } from "./helpers";

describe("Nurse CRUD Routes", () => {
  let agent: supertest.Agent;
  let testNurseId: string;

  beforeAll(async () => {
    const { app } = await getTestApp();
    agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  // T9
  it("T9: GET /api/nurses — lists all nurses (authenticated)", async () => {
    const res = await agent.get("/api/nurses");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // T10
  it("T10: POST /api/nurses — creates a new nurse with valid data", async () => {
    const nurse = await createTestNurse(agent);
    expect(nurse.id).toBeDefined();
    expect(nurse.fullName).toMatch(/Test Nurse/);
    expect(nurse.email).toMatch(/testnurse/);
    expect(nurse.currentStage).toBe("preboard");
    testNurseId = nurse.id;
  });

  // T11
  it("T11: POST /api/nurses — fails with missing required fields", async () => {
    const res = await agent.post("/api/nurses").send({ phone: "123" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  // T12
  it("T12: GET /api/nurses/:id — returns specific nurse", async () => {
    const nurse = await createTestNurse(agent);
    const res = await agent.get(`/api/nurses/${nurse.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(nurse.id);
    expect(res.body.fullName).toBe(nurse.fullName);
  });

  // T13
  it("T13: GET /api/nurses/:id — returns 404 for nonexistent nurse", async () => {
    const res = await agent.get("/api/nurses/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });

  // T14
  it("T14: PATCH /api/nurses/:id — updates nurse fields", async () => {
    const nurse = await createTestNurse(agent);
    const res = await agent.patch(`/api/nurses/${nurse.id}`).send({ phone: "07700999999" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("07700999999");
  });

  // T15
  it("T15: DELETE /api/nurses/:id — removes a nurse", async () => {
    const nurse = await createTestNurse(agent);
    const res = await agent.delete(`/api/nurses/${nurse.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const getRes = await agent.get(`/api/nurses/${nurse.id}`);
    expect(getRes.status).toBe(404);
  });

  // T16
  it("T16: DELETE /api/nurses/:id — returns 404 for nonexistent nurse", async () => {
    const res = await agent.delete("/api/nurses/00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(404);
  });
});
