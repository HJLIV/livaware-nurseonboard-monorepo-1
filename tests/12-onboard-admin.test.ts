import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestCandidate } from "./helpers";

describe("Onboard Admin Endpoint Routes", () => {
  let app: Express;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  // T60
  it("T60: POST /api/candidates/:id/nmc-verify — admin triggers NMC verification (mocked)", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/nmc-verify`).send({
      pin: "18A1234C",
      registrationStatus: "Registered",
      registeredName: "Test Nurse",
    });
    expect(res.status).toBe(201);
    expect(res.body.pin).toBe("18A1234C");
    expect(res.body.status).toBe("verified");
  });

  // T61
  it("T61: POST /api/candidates/:id/dbs-live-check — admin triggers DBS check requires fields", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/dbs-live-check`).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/required/i);
  });

  // T62
  it("T62: POST /api/candidates/:id/documents — admin uploads document record", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/documents`).send({
      type: "Training Certificate",
      filename: "cert.pdf",
      filePath: "/api/uploads/cert.pdf",
      category: "training_certificate",
      uploadedBy: "admin",
    });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("Training Certificate");
  });

  // T63
  it("T63: PATCH /api/mandatory-training/:id — updates training record status", async () => {
    const candidate = await createTestCandidate(agent);
    const createRes = await agent.post(`/api/candidates/${candidate.id}/mandatory-training`).send({
      moduleName: "Moving & Handling",
      completedDate: "2024-01-01",
      status: "completed",
    });
    const trainingId = createRes.body.id;
    const res = await agent.patch(`/api/mandatory-training/${trainingId}`).send({
      status: "expired",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("expired");
  });

  // T64
  it("T64: POST /api/candidates/:id/references — creates a reference request", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/references`).send({
      refereeName: "Dr John Smith",
      refereeEmail: "referee@example.com",
      refereeOrg: "NHS",
      refereeRole: "Line Manager",
    });
    expect(res.status).toBe(201);
    expect(res.body.refereeName).toBe("Dr John Smith");
  });

  // T65
  it("T65: POST /api/candidates/:id/references/draft-email — generates reference email draft", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/references/draft-email`).send({
      refereeName: "Dr Smith",
      refereeEmail: "smith@example.com",
    });
    expect(res.status).toBe(200);
    expect(res.body.subject).toBeDefined();
    expect(res.body.body).toBeDefined();
  });

  // T66
  it("T66: PATCH /api/references/:id — updates reference outcome", async () => {
    const candidate = await createTestCandidate(agent);
    const createRes = await agent.post(`/api/candidates/${candidate.id}/references`).send({
      refereeName: "Dr Brown",
      refereeEmail: "brown@example.com",
    });
    const refId = createRes.body.id;
    const res = await agent.patch(`/api/references/${refId}`).send({ outcome: "received" });
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("received");
  });

  // T67
  it("T67: POST /api/candidates/:id/health-declaration — admin submits health declaration", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/health-declaration`).send({
      completed: true,
      ohReferralRequired: false,
      declarations: { fit_for_work: true },
    });
    expect(res.status).toBe(201);
    expect(res.body.completed).toBe(true);
  });
});
