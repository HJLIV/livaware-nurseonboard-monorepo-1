import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

// Task 156 — Re-lock portal uploads until preboard examination,
// competency declaration and CV review are all done.
describe("Task 156 — Portal upload gate enforces 3 prerequisites in auto mode", () => {
  let app: Express;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  async function freshLockedNurse() {
    // Helper auto-unlocks; clear that unlock so we observe the auto-mode
    // prerequisite gate (no onboardingUnlockedAt, no manual flip).
    const nurse = await createTestNurse(agent);
    await agent
      .post(`/api/nurses/${nurse.id}/onboarding-access/relock`)
      .send({ reason: "task-156-test-setup" });
    await agent
      .put(`/api/nurses/${nurse.id}/onboarding-access/mode`)
      .send({ mode: "auto" });
    const link = await createPortalLink(agent, nurse.id, "onboard");
    return { nurse, token: link.token as string };
  }

  it("auto-mode nurse with no prerequisites is locked, gated upload routes return 403", async () => {
    const { nurse, token } = await freshLockedNurse();

    const gate = await agent.get(`/api/nurses/${nurse.id}/onboarding-access`);
    expect(gate.status).toBe(200);
    expect(gate.body.mode).toBe("auto");
    expect(gate.body.unlocked).toBe(false);
    expect(gate.body.prerequisites).toEqual({
      examinationCompleted: false,
      competencyDeclared: false,
      cvReviewed: false,
    });

    const docsRes = await supertest(app).post(`/api/portal/${token}/documents`).send({
      type: "Passport",
      filename: "p.pdf",
      filePath: "/api/uploads/p.pdf",
      category: "identity",
    });
    expect(docsRes.status).toBe(403);
    expect(docsRes.body.error).toBe("onboarding_locked");
    expect(docsRes.body.gate).toBeTruthy();

    const trainingRes = await supertest(app)
      .post(`/api/portal/${token}/mandatory-training`)
      .send({ moduleName: "Manual Handling", renewalFrequency: "Annual" });
    expect(trainingRes.status).toBe(403);
    expect(trainingRes.body.error).toBe("onboarding_locked");

    const stepRes = await supertest(app)
      .post(`/api/portal/${token}/steps/identity/complete`)
      .send({});
    expect(stepRes.status).toBe(403);
    expect(stepRes.body.error).toBe("onboarding_locked");
  });

  it("chase-upload is also blocked when the gate is locked", async () => {
    const { token } = await freshLockedNurse();
    // No need to wire a real chase notification — the gate middleware
    // runs first and short-circuits with 403.
    const res = await supertest(app)
      .post(`/api/portal/${token}/chase-upload`)
      .field("moduleName", "Manual Handling");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("onboarding_locked");
  });

  it("competency declaration, CV upload (general doc upload is gated; declarations endpoint is not) and preboard remain open while locked", async () => {
    const { nurse, token } = await freshLockedNurse();

    // 1) Submitting a competency declaration is NOT gated (it's one of
    // the prerequisites a locked nurse must be able to satisfy).
    const decl = await supertest(app)
      .post(`/api/portal/${token}/competency-declarations`)
      .send({
        competencyName: "Medication Administration",
        domain: "Clinical",
        selfAssessedLevel: "level_3",
      });
    expect(decl.status).toBe(201);

    // 2) Reads are always open even when locked.
    const reads = await supertest(app).get(`/api/portal/${token}/documents`);
    expect(reads.status).toBe(200);

    // 3) Admin actions (CV review, preboard completion) stay available
    // to drive prerequisites to satisfied.
    const cv = await agent.post(`/api/nurses/${nurse.id}/cv-review`).send({});
    expect(cv.status).toBe(200);
    expect(cv.body.prerequisites.cvReviewed).toBe(true);
    // Examination + declaration still missing, so still locked.
    expect(cv.body.unlocked).toBe(false);
  });

  it("once all 3 prerequisites flip, maybeAutoUnlock opens the gate and gated routes return 2xx", async () => {
    const { nurse, token } = await freshLockedNurse();

    // Prereq 1: competency declaration (portal route).
    const decl = await supertest(app)
      .post(`/api/portal/${token}/competency-declarations`)
      .send({
        competencyName: "IV Therapy",
        domain: "Clinical",
        selfAssessedLevel: "level_3",
      });
    expect(decl.status).toBe(201);

    // Prereq 2: examination completed — flip via storage to avoid
    // wrestling with the full preboard submission flow in a unit test.
    const { storage } = await import("../server/storage");
    await storage.updateCandidate(nurse.id, { preboardStatus: "completed" });

    // Prereq 3: admin CV review (also triggers maybeAutoUnlock).
    const cv = await agent.post(`/api/nurses/${nurse.id}/cv-review`).send({});
    expect(cv.status).toBe(200);
    expect(cv.body.unlocked).toBe(true);
    expect(cv.body.unlockedAt).toBeTruthy();

    // The previously-blocked upload now succeeds.
    const docsRes = await supertest(app).post(`/api/portal/${token}/documents`).send({
      type: "Passport",
      filename: "p.pdf",
      filePath: "/api/uploads/p.pdf",
      category: "identity",
    });
    expect(docsRes.status).toBe(201);
  });

  it("admin manual unlock is grandfathered — gate stays open even when prerequisites later get cleared", async () => {
    const { nurse, token } = await freshLockedNurse();
    await agent
      .post(`/api/nurses/${nurse.id}/onboarding-access/unlock`)
      .send({ note: "early access" });
    const gate = await agent.get(`/api/nurses/${nurse.id}/onboarding-access`);
    expect(gate.body.unlocked).toBe(true);
    const docsRes = await supertest(app).post(`/api/portal/${token}/documents`).send({
      type: "Passport",
      filename: "p.pdf",
      filePath: "/api/uploads/p.pdf",
      category: "identity",
    });
    expect(docsRes.status).toBe(201);
  });
});
