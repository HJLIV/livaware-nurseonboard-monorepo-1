import type { Express } from "express";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import supertest from "supertest";
import { eq } from "drizzle-orm";
import { getTestApp, createTestNurse, createPortalLink, cleanupTestData } from "./helpers";
import { db } from "../server/db";
import { arcadeUsers } from "@shared/schema";
import { storage as arcadeStorage } from "../server/arcade-storage";

// Coverage for the portal-token-gated arcade endpoints in
// server/routes/portal.ts. Critical because they must resolve the nurse
// from the portal token (not from any platform admin session that may
// happen to be active in the same browser) and never leak another
// nurse's assignment data.
describe("Portal-scoped Skills Arcade endpoints", () => {
  let app: Express;
  let adminAgent: supertest.Agent;

  let nurse1Id: string;
  let nurse1Token: string;
  let nurse1ArcadeUserId: string;

  let nurse2Id: string;
  let nurse2Token: string;

  let moduleId: string;
  let moduleVersionId: string;
  let scenarioId: string;
  let assignmentId: string; // belongs to nurse1

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    adminAgent = supertest.agent(app);
    await adminAgent.post("/api/auth/login").send({ username: "admin", password: "admin" });

    const nurse1 = await createTestNurse(adminAgent);
    nurse1Id = nurse1.id;
    const link1 = await createPortalLink(adminAgent, nurse1Id, "hub");
    nurse1Token = link1.token;

    const nurse2 = await createTestNurse(adminAgent);
    nurse2Id = nurse2.id;
    const link2 = await createPortalLink(adminAgent, nurse2Id, "hub");
    nurse2Token = link2.token;

    // Provision arcade users for both nurses by hitting the dashboard
    // (this is the same lazy-provision path the real portal uses).
    const provisionAgent1 = supertest.agent(app);
    await provisionAgent1.get(`/api/portal/${nurse1Token}/arcade/dashboard`).expect(200);
    const provisionAgent2 = supertest.agent(app);
    await provisionAgent2.get(`/api/portal/${nurse2Token}/arcade/dashboard`).expect(200);

    const [au1] = await db.select().from(arcadeUsers).where(eq(arcadeUsers.nurseId, nurse1Id));
    nurse1ArcadeUserId = au1.id;

    // Build a one-task calculation scenario so we can deterministically
    // pass (correct number) or fail (wrong number → MAJOR error).
    const mod = await arcadeStorage.createModule({
      name: `Portal Arcade Test Module ${Date.now()}`,
      description: "Test-only module for portal arcade flow",
      currentVersion: "1.0.0",
      isActive: true,
      icon: "Calculator",
      color: "blue",
    });
    moduleId = mod.id;
    const mv = await arcadeStorage.createModuleVersion({
      moduleId: mod.id,
      version: "1.0.0",
      configJson: { minorsAllowed: 3, maxFailures: 4 },
    });
    moduleVersionId = mv.id;
    const scenario = await arcadeStorage.createScenario({
      moduleVersionId: mv.id,
      title: "Drug calc",
      contentJson: {
        tasks: [
          {
            id: "calc1",
            type: "calculation",
            title: "Calculate dose",
            description: "Compute result",
            data: {
              question: "What is 2 + 2?",
              formula: "a + b",
              inputs: { a: 2, b: 2 },
              correctAnswer: 4,
              tolerance: 0.01,
              unit: "mg",
              errorClassification: "MAJOR",
              errorRationale: "Incorrect calculation",
            },
          },
        ],
      },
      isActive: true,
    });
    scenarioId = scenario.id;
    const assignment = await arcadeStorage.createAssignment({
      userId: nurse1ArcadeUserId,
      moduleId: mod.id,
      moduleVersionId: mv.id,
      status: "not_started",
    });
    assignmentId = assignment.id;
  });

  afterAll(async () => {
    await cleanupTestData(adminAgent);
  });

  // ─── Token validation ──────────────────────────────────────────────
  it("rejects an invalid portal token with 404", async () => {
    const agent = supertest.agent(app);
    const res = await agent.get(`/api/portal/not-a-real-token/arcade/dashboard`);
    expect(res.status).toBe(404);
  });

  // The whole reason these portal-scoped endpoints exist is so that
  // a platform admin session active in the same browser can never
  // bleed admin identity into the nurse's portal view. Verify that an
  // admin-authenticated agent hitting nurse2's token still only sees
  // nurse2's data — never nurse1's assignment.
  it("ignores any active admin session and scopes strictly to the portal token", async () => {
    const agent = supertest.agent(app);
    const login = await agent
      .post("/api/auth/login")
      .send({ username: "admin", password: "admin" });
    expect(login.status).toBe(200);

    const dash = await agent.get(`/api/portal/${nurse2Token}/arcade/dashboard`);
    expect(dash.status).toBe(200);
    const ids = (dash.body.assignments as Array<{ id: string }>).map((a) => a.id);
    expect(ids).not.toContain(assignmentId);

    const detail = await agent.get(
      `/api/portal/${nurse2Token}/arcade/assignments/${assignmentId}`,
    );
    expect(detail.status).toBe(404);
  });

  // ─── Dashboard ─────────────────────────────────────────────────────
  it("returns only the token nurse's own assignments on the dashboard", async () => {
    const agent1 = supertest.agent(app);
    const res1 = await agent1.get(`/api/portal/${nurse1Token}/arcade/dashboard`);
    expect(res1.status).toBe(200);
    const ids1 = (res1.body.assignments as Array<{ id: string }>).map((a) => a.id);
    expect(ids1).toContain(assignmentId);
    expect(res1.body.stats.totalAssigned).toBeGreaterThanOrEqual(1);

    const agent2 = supertest.agent(app);
    const res2 = await agent2.get(`/api/portal/${nurse2Token}/arcade/dashboard`);
    expect(res2.status).toBe(200);
    const ids2 = (res2.body.assignments as Array<{ id: string }>).map((a) => a.id);
    expect(ids2).not.toContain(assignmentId);
  });

  // ─── Assignment detail ─────────────────────────────────────────────
  it("returns the assignment detail for the owning nurse", async () => {
    const agent = supertest.agent(app);
    const res = await agent.get(`/api/portal/${nurse1Token}/arcade/assignments/${assignmentId}`);
    expect(res.status).toBe(200);
    expect(res.body.moduleName).toBeDefined();
    expect(res.body.status).toBe("not_started");
  });

  it("returns 404 when another nurse tries to view the assignment", async () => {
    const agent = supertest.agent(app);
    const res = await agent.get(`/api/portal/${nurse2Token}/arcade/assignments/${assignmentId}`);
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("returns 404 for an unknown assignment id", async () => {
    const agent = supertest.agent(app);
    const res = await agent.get(`/api/portal/${nurse1Token}/arcade/assignments/non-existent-id`);
    expect(res.status).toBe(404);
  });

  // ─── Start attempt ─────────────────────────────────────────────────
  it("requires assignmentId on start", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post(`/api/portal/${nurse1Token}/arcade/attempts/start`).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/assignmentId/i);
  });

  it("refuses to start an attempt against another nurse's assignment", async () => {
    const agent = supertest.agent(app);
    const res = await agent
      .post(`/api/portal/${nurse2Token}/arcade/attempts/start`)
      .send({ assignmentId });
    expect(res.status).toBe(404);
  });

  // ─── Submit attempt: validation ────────────────────────────────────
  it("validates submit payload format", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post(`/api/portal/${nurse1Token}/arcade/attempts/submit`).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it("returns 404 submitting an unknown attempt id", async () => {
    const agent = supertest.agent(app);
    const res = await agent.post(`/api/portal/${nurse1Token}/arcade/attempts/submit`).send({
      attemptId: "fake-attempt-id",
      responses: [{ taskId: "calc1", type: "calculation", answer: 4 }],
    });
    expect(res.status).toBe(404);
  });

  it("refuses to submit an attempt belonging to another nurse", async () => {
    // Start an attempt as nurse1, then try to submit it via nurse2's token.
    const a1 = supertest.agent(app);
    const startRes = await a1
      .post(`/api/portal/${nurse1Token}/arcade/attempts/start`)
      .send({ assignmentId });
    expect(startRes.status).toBe(200);
    const attemptId = startRes.body.attemptId as string;

    const a2 = supertest.agent(app);
    const submitRes = await a2.post(`/api/portal/${nurse2Token}/arcade/attempts/submit`).send({
      attemptId,
      responses: [{ taskId: "calc1", type: "calculation", answer: 4 }],
    });
    expect(submitRes.status).toBe(404);
  });

  // ─── Scoring + lockout ─────────────────────────────────────────────
  it("scores correct submissions as a pass and locks the assignment after 4 fails", async () => {
    // Use a fresh assignment so the 4-fail counter for this module
    // version is uncontaminated by the earlier "owned-attempt" test.
    const lockoutAssignment = await arcadeStorage.createAssignment({
      userId: nurse1ArcadeUserId,
      moduleId,
      moduleVersionId,
      status: "not_started",
    });

    const agent = supertest.agent(app);

    const start = async () => {
      const res = await agent
        .post(`/api/portal/${nurse1Token}/arcade/attempts/start`)
        .send({ assignmentId: lockoutAssignment.id });
      expect(res.status).toBe(200);
      return res.body.attemptId as string;
    };
    const submit = async (attemptId: string, answer: number) => {
      const res = await agent.post(`/api/portal/${nurse1Token}/arcade/attempts/submit`).send({
        attemptId,
        responses: [{ taskId: "calc1", type: "calculation", answer }],
      });
      expect(res.status).toBe(200);
      return res.body as { passed: boolean; majorCount: number };
    };

    // Pass once: assignment moves to "passed".
    const passAttempt = await start();
    const passResult = await submit(passAttempt, 4);
    expect(passResult.passed).toBe(true);
    let assignmentNow = await arcadeStorage.getAssignment(lockoutAssignment.id);
    expect(assignmentNow?.status).toBe("passed");

    // Now fail 4 times — after the 4th, the matching session-auth
    // /api/nurse/* endpoint locks the assignment and opens a
    // remediation case. The portal endpoint must behave identically.
    for (let i = 0; i < 4; i++) {
      const id = await start();
      const r = await submit(id, 0);
      expect(r.passed).toBe(false);
      expect(r.majorCount).toBeGreaterThan(0);
    }

    assignmentNow = await arcadeStorage.getAssignment(lockoutAssignment.id);
    expect(assignmentNow?.status).toBe("locked");

    // A locked assignment refuses new attempts with 403.
    const lockedStart = await agent
      .post(`/api/portal/${nurse1Token}/arcade/attempts/start`)
      .send({ assignmentId: lockoutAssignment.id });
    expect(lockedStart.status).toBe(403);
    expect(lockedStart.body.message).toMatch(/locked/i);
  });
});
