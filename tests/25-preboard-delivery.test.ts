import type { Express } from "express";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import supertest from "supertest";
import { getTestApp, loginAsAdmin, loginAsTeam } from "./helpers";
import { runAiStep, runEmailStep } from "../server/preboard-delivery";
import * as preboardAi from "../server/preboard-ai";
import * as preboardOutlook from "../server/preboard-outlook";
import { db } from "../server/db";
import { preboardAssessments, auditLogs } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

describe("Preboard report delivery (task 111)", () => {
  let app: Express;
  const originalReportEmail = process.env.REPORT_EMAIL;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
  });

  afterAll(() => {
    if (originalReportEmail === undefined) delete process.env.REPORT_EMAIL;
    else process.env.REPORT_EMAIL = originalReportEmail;
  });

  async function createAssessment(): Promise<number> {
    const agent = supertest.agent(app);
    const res = await agent.post("/api/assessments").send({
      nurseName: `Delivery Test ${Date.now()}`,
      nurseEmail: `delivery-${Date.now()}@test.example.com`,
      responses: [
        { questionId: 1, tag: "clinical", domain: "medication", prompt: "Q", response: "A", timeSpent: 10, timeLimit: 60 },
      ],
    });
    expect(res.status).toBe(200);
    return res.body.id as number;
  }

  it("T230: runEmailStep marks assessment as skipped_no_recipient when REPORT_EMAIL is unset", async () => {
    const id = await createAssessment();
    delete process.env.REPORT_EMAIL;

    const updated = await runEmailStep(id);
    expect(updated?.emailStatus).toBe("skipped_no_recipient");
    expect(updated?.emailError).toMatch(/REPORT_EMAIL/);

    // Audit row written for this specific assessment
    const rows = await db.select().from(auditLogs)
      .where(and(eq(auditLogs.module, "preboard"), eq(auditLogs.action, "assessment_email_skipped_no_recipient")))
      .orderBy(desc(auditLogs.timestamp))
      .limit(20);
    const match = rows.find((r) => ((r as unknown as { detail?: { assessmentId?: number } }).detail)?.assessmentId === id);
    expect(match).toBeTruthy();
  });

  it("T231: POST /api/preboard/assessments/:id/rerun-ai requires authentication", async () => {
    const id = await createAssessment();
    const agent = supertest.agent(app);
    const res = await agent.post(`/api/preboard/assessments/${id}/rerun-ai`).send({});
    expect(res.status).toBe(401);
  });

  it("T232: POST /api/preboard/assessments/:id/resend-email requires authentication", async () => {
    const id = await createAssessment();
    const agent = supertest.agent(app);
    const res = await agent.post(`/api/preboard/assessments/${id}/resend-email`).send({});
    expect(res.status).toBe(401);
  });

  it("T232b: rerun-ai and resend-email are forbidden for the team role (admin-only)", async () => {
    const id = await createAssessment();
    const team = await loginAsTeam();
    const r1 = await team.post(`/api/preboard/assessments/${id}/rerun-ai`).send({});
    expect(r1.status).toBe(403);
    process.env.REPORT_EMAIL = "ops@example.com";
    const r2 = await team.post(`/api/preboard/assessments/${id}/resend-email`).send({});
    expect(r2.status).toBe(403);
  });

  it("T233: resend-email returns 400 when REPORT_EMAIL is not configured", async () => {
    const id = await createAssessment();
    delete process.env.REPORT_EMAIL;
    const agent = await loginAsAdmin();
    const res = await agent.post(`/api/preboard/assessments/${id}/resend-email`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/REPORT_EMAIL/);
  });

  it("T234: resend-email returns 404 for unknown assessment id", async () => {
    process.env.REPORT_EMAIL = "ops@example.com";
    const agent = await loginAsAdmin();
    const res = await agent.post(`/api/preboard/assessments/999999999/resend-email`).send({});
    expect(res.status).toBe(404);
  });

  it("T235: rerun-ai returns 404 for unknown assessment id", async () => {
    const agent = await loginAsAdmin();
    const res = await agent.post(`/api/preboard/assessments/999999999/rerun-ai`).send({});
    expect(res.status).toBe(404);
  });

  it("T237: runAiStep persists failed status + audit on terminal AI failure", async () => {
    const id = await createAssessment();
    const spy = vi.spyOn(preboardAi, "analyzeAssessment").mockRejectedValue(
      new Error("Simulated non-transient AI failure"),
    );
    try {
      await expect(runAiStep(id)).rejects.toThrow(/Simulated non-transient/);
      const [row] = await db.select().from(preboardAssessments).where(eq(preboardAssessments.id, id));
      expect(row?.aiStatus).toBe("failed");
      expect(row?.aiError).toMatch(/Simulated non-transient/);
      expect((row?.aiAttempts ?? 0)).toBeGreaterThanOrEqual(1);

      const rows = await db.select().from(auditLogs)
        .where(and(eq(auditLogs.module, "preboard"), eq(auditLogs.action, "assessment_ai_failed")))
        .orderBy(desc(auditLogs.timestamp))
        .limit(20);
      const match = rows.find((r) => ((r as unknown as { detail?: { assessmentId?: number } }).detail)?.assessmentId === id);
      expect(match).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it("T238: runEmailStep persists failed status + audit on terminal email failure", async () => {
    process.env.REPORT_EMAIL = "ops@example.com";
    const id = await createAssessment();
    const spy = vi.spyOn(preboardOutlook, "sendEmail").mockRejectedValue(
      new Error("Simulated SMTP rejection"),
    );
    try {
      await expect(runEmailStep(id)).rejects.toThrow(/Simulated SMTP rejection/);
      const [row] = await db.select().from(preboardAssessments).where(eq(preboardAssessments.id, id));
      expect(row?.emailStatus).toBe("failed");
      expect(row?.emailError).toMatch(/Simulated SMTP rejection/);
      expect((row?.emailAttempts ?? 0)).toBeGreaterThanOrEqual(1);

      const rows = await db.select().from(auditLogs)
        .where(and(eq(auditLogs.module, "preboard"), eq(auditLogs.action, "assessment_email_failed")))
        .orderBy(desc(auditLogs.timestamp))
        .limit(20);
      const match = rows.find((r) => ((r as unknown as { detail?: { assessmentId?: number } }).detail)?.assessmentId === id);
      expect(match).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });

  it("T239: runEmailStep emits an explicit warning when REPORT_EMAIL is unset", async () => {
    const id = await createAssessment();
    delete process.env.REPORT_EMAIL;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await runEmailStep(id);
      const warned = warnSpy.mock.calls.some((args) =>
        args.some((a) => typeof a === "string" && a.includes("REPORT_EMAIL not configured")),
      );
      expect(warned).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("T236: schema persists ai/email delivery columns on submit", async () => {
    const id = await createAssessment();
    // Wait a moment for the fire-and-forget pipeline to at least begin updating columns.
    await new Promise((r) => setTimeout(r, 250));
    const [row] = await db.select().from(preboardAssessments).where(eq(preboardAssessments.id, id));
    expect(row).toBeTruthy();
    // Columns must exist (any value, including null, is fine — but the property must be present).
    expect("aiStatus" in (row as object)).toBe(true);
    expect("emailStatus" in (row as object)).toBe(true);
    expect("aiAttempts" in (row as object)).toBe(true);
    expect("emailAttempts" in (row as object)).toBe(true);
    expect("emailSentAt" in (row as object)).toBe(true);
  });
});
