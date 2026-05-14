import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

describe("Task 94 — Onboarding access gate", () => {
  let app: Express;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    agent = supertest.agent(result.app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  it("new nurse starts locked with all prerequisites unmet (when re-locked)", async () => {
    // Helper auto-unlocks for legacy compatibility; immediately re-lock to
    // observe the fresh-nurse default state.
    const nurse = await createTestNurse(agent);
    await agent
      .post(`/api/nurses/${nurse.id}/onboarding-access/relock`)
      .send({ reason: "test-default-state" });
    const res = await agent.get(`/api/nurses/${nurse.id}/onboarding-access`);
    expect(res.status).toBe(200);
    expect(res.body.unlocked).toBe(false);
    // Re-lock now flips the nurse to manual mode (the only way the gate
    // stays closed under the post-Task-94 always-open default).
    expect(res.body.mode).toBe("manual");
    expect(res.body.prerequisites).toEqual({
      examinationCompleted: false,
      competencyDeclared: false,
      cvReviewed: false,
    });
  });

  it("admin manual unlock flips gate open and audits onboarding_unlocked", async () => {
    const nurse = await createTestNurse(agent);
    await agent.post(`/api/nurses/${nurse.id}/onboarding-access/relock`).send({ reason: "reset" });
    const unlockRes = await agent
      .post(`/api/nurses/${nurse.id}/onboarding-access/unlock`)
      .send({ note: "early access" });
    expect(unlockRes.status).toBe(200);
    expect(unlockRes.body.unlocked).toBe(true);
    expect(unlockRes.body.unlockedAt).toBeTruthy();

    const audits = await agent.get(`/api/audit-logs?nurseId=${nurse.id}`);
    const actions = (audits.body || []).map((a: any) => a.action);
    expect(actions).toContain("onboarding_unlocked");
  });

  it("re-lock requires a reason and audits onboarding_relocked", async () => {
    const nurse = await createTestNurse(agent);
    await agent.post(`/api/nurses/${nurse.id}/onboarding-access/unlock`).send({});

    const noReason = await agent.post(`/api/nurses/${nurse.id}/onboarding-access/relock`).send({});
    expect(noReason.status).toBe(400);

    const ok = await agent
      .post(`/api/nurses/${nurse.id}/onboarding-access/relock`)
      .send({ reason: "Documents flagged" });
    expect(ok.status).toBe(200);
    expect(ok.body.unlocked).toBe(false);
    expect(ok.body.lockedReason).toBe("Documents flagged");

    const audits = await agent.get(`/api/audit-logs?nurseId=${nurse.id}`);
    const actions = (audits.body || []).map((a: any) => a.action);
    expect(actions).toContain("onboarding_relocked");
  });

  it("CV review marks/reopens the prerequisite and audits", async () => {
    const nurse = await createTestNurse(agent);
    const m = await agent.post(`/api/nurses/${nurse.id}/cv-review`).send({});
    expect(m.status).toBe(200);
    expect(m.body.prerequisites.cvReviewed).toBe(true);

    const r = await agent.delete(`/api/nurses/${nurse.id}/cv-review`);
    expect(r.status).toBe(200);
    expect(r.body.prerequisites.cvReviewed).toBe(false);

    const audits = await agent.get(`/api/audit-logs?nurseId=${nurse.id}`);
    const actions = (audits.body || []).map((a: any) => a.action);
    expect(actions).toContain("cv_marked_reviewed");
    expect(actions).toContain("cv_review_reopened");
  });

  it("mode change from auto→manual is audited", async () => {
    const nurse = await createTestNurse(agent);
    const res = await agent
      .put(`/api/nurses/${nurse.id}/onboarding-access/mode`)
      .send({ mode: "manual" });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe("manual");

    const audits = await agent.get(`/api/audit-logs?nurseId=${nurse.id}`);
    const actions = (audits.body || []).map((a: any) => a.action);
    expect(actions).toContain("unlock_mode_changed");
  });

  it("portal write is gated when locked, allowed when unlocked", async () => {
    const nurse = await createTestNurse(agent);
    // Helper pre-unlocks; flip back to locked + manual for this scenario.
    await agent.put(`/api/nurses/${nurse.id}/onboarding-access/mode`).send({ mode: "manual" });
    await agent.post(`/api/nurses/${nurse.id}/onboarding-access/relock`).send({ reason: "test" });
    const link = await createPortalLink(agent, nurse.id, "onboard");
    const token = link.token;

    // Locked: writing employment-history is blocked with 403 + gate payload.
    const blocked = await supertest(app)
      .post(`/api/portal/${token}/employment-history`)
      .send({ employer: "X", roleTitle: "RN", startDate: "2020-01-01" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe("onboarding_locked");
    expect(blocked.body.gate).toBeTruthy();

    // Reads remain open even when locked.
    const reads = await supertest(app).get(`/api/portal/${token}/employment-history`);
    expect(reads.status).toBe(200);

    // Assessment-group route (cv-upload / competency-declarations GET) stays open.
    const compGet = await supertest(app).get(
      `/api/portal/${token}/competency-declarations`,
    );
    expect(compGet.status).toBe(200);

    // Admin unlocks and the same write now succeeds.
    await agent.post(`/api/nurses/${nurse.id}/onboarding-access/unlock`).send({});
    const allowed = await supertest(app)
      .post(`/api/portal/${token}/employment-history`)
      .send({ employer: "Y", roleTitle: "RN", startDate: "2021-01-01" });
    // Whatever the validation outcome, the gate is no longer the blocker.
    expect(allowed.status).not.toBe(403);
  });

  it("portal hub response includes gate state", async () => {
    const nurse = await createTestNurse(agent);
    const link = await createPortalLink(agent, nurse.id, "onboard");
    const res = await supertest(app).get(`/api/portal/${link.token}`);
    expect(res.status).toBe(200);
    expect(res.body.gate).toBeTruthy();
    expect(typeof res.body.gate.unlocked).toBe("boolean");
    expect(res.body.gate.prerequisites).toBeTruthy();
  });

  it("re-lock requires the nurse to be currently unlocked", async () => {
    const nurse = await createTestNurse(agent);
    await agent.post(`/api/nurses/${nurse.id}/onboarding-access/relock`).send({ reason: "first" });
    const second = await agent
      .post(`/api/nurses/${nurse.id}/onboarding-access/relock`)
      .send({ reason: "second" });
    expect(second.status).toBe(409);
  });
});
