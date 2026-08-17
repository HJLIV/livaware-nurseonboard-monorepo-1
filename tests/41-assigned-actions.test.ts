import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

async function loginFresh(app: Express, username: string, password: string) {
  const agent = supertest.agent(app);
  const res = await agent.post("/api/auth/login").send({ username, password });
  expect(res.status).toBe(200);
  return agent;
}

describe("Assigned actions — reflections & witness statements (task 212)", () => {
  let app: Express;
  let admin: supertest.Agent;
  let superAdmin: supertest.Agent;
  let nurseId: string;

  beforeAll(async () => {
    app = (await getTestApp()).app;
    admin = await loginFresh(app, "admin", "admin");
    superAdmin = await loginFresh(app, "superadmin", "superpass");
    const nurse = await createTestNurse(admin);
    nurseId = nurse.id;
  });

  it("super admin can assign a reflection; email is dispatched-but-suppressed in test mode", async () => {
    const res = await superAdmin
      .post(`/api/admin/nurses/${nurseId}/assigned-actions`)
      .send({
        type: "reflection",
        framework: "gibbs",
        focusContext: "The medication near-miss on 10 Aug",
        instructions: "Please complete this before Friday.",
      });
    expect(res.status).toBe(201);
    expect(res.body.action.type).toBe("reflection");
    expect(res.body.action.framework).toBe("gibbs");
    expect(res.body.action.status).toBe("assigned");
    // Test mode suppresses the actual Graph send but the flow still runs.
    expect(res.body.email).toBeDefined();
    expect(res.body.email.sent).toBe(false);

    const audit = await admin.get(`/api/nurses/${nurseId}/audit-log`);
    expect(
      audit.body.some(
        (l: any) => l.module === "assigned_actions" && l.action === "assigned_action_assigned",
      ),
    ).toBe(true);
    expect(
      audit.body.some(
        (l: any) =>
          l.module === "assigned_actions" &&
          l.action === "assigned_action_email_sent" &&
          l.detail?.suppressed === true,
      ),
    ).toBe(true);
  });

  it("super admin can assign a witness statement; event details are mandatory", async () => {
    const missing = await superAdmin
      .post(`/api/admin/nurses/${nurseId}/assigned-actions`)
      .send({ type: "witness_statement" });
    expect(missing.status).toBe(400);

    const res = await superAdmin
      .post(`/api/admin/nurses/${nurseId}/assigned-actions`)
      .send({
        type: "witness_statement",
        eventDetails: "Fall in the patient's bathroom, 12 Aug, ~14:00",
        pointsToAddress: "Who was present? What observations did you take?",
      });
    expect(res.status).toBe(201);
    expect(res.body.action.type).toBe("witness_statement");
    expect(res.body.action.framework).toBeNull();
    expect(res.body.action.status).toBe("assigned");
  });

  it("regular admins cannot assign or mark reviewed", async () => {
    const assign = await admin
      .post(`/api/admin/nurses/${nurseId}/assigned-actions`)
      .send({ type: "reflection", framework: "kolb" });
    expect(assign.status).toBe(403);

    const list = await admin.get(`/api/admin/nurses/${nurseId}/assigned-actions`);
    expect(list.status).toBe(200);
    const submitted = list.body.find((a: any) => a.status === "submitted");
    if (submitted) {
      const review = await admin.post(`/api/admin/assigned-actions/${submitted.id}/review`);
      expect(review.status).toBe(403);
    }
  });

  it("admin list shows assigned actions with prompts", async () => {
    const list = await admin.get(`/api/admin/nurses/${nurseId}/assigned-actions`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    const reflection = list.body.find((a: any) => a.type === "reflection");
    expect(reflection.prompts.length).toBe(6); // Gibbs cycle stages
    const witness = list.body.find((a: any) => a.type === "witness_statement");
    expect(witness.prompts.map((p: any) => p.key)).toEqual([
      "account",
      "actions_taken",
      "outcome",
    ]);
  });

  it("portal: nurse can list outstanding actions and fetch one with prompts (flips to in_progress)", async () => {
    const link = await createPortalLink(admin, nurseId, "onboard");
    const token = link.token as string;
    expect(typeof token).toBe("string");

    const list = await supertest(app).get(`/api/portal/${token}/assigned-actions`);
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    // List payload must not leak the response/telemetry fields.
    expect(list.body[0].response).toBeUndefined();

    const target = list.body.find((a: any) => a.type === "reflection");
    const detail = await supertest(app).get(
      `/api/portal/${token}/assigned-actions/${target.id}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.prompts.length).toBe(6);
    expect(detail.body.frameworkLabel).toContain("Gibbs");
    expect(detail.body.status).toBe("in_progress"); // first-open flip
    expect(detail.body.focusContext).toContain("medication near-miss");
  });

  it("portal: submit stores answers + integrity telemetry and clears outstanding", async () => {
    const link = await createPortalLink(admin, nurseId, "onboard");
    const token = link.token as string;
    const list = await supertest(app).get(`/api/portal/${token}/assigned-actions`);
    const reflection = list.body.find((a: any) => a.type === "reflection");

    const answers: Record<string, string> = {};
    for (const key of ["description", "feelings", "evaluation", "analysis", "conclusion", "action_plan"]) {
      answers[key] = `Typed answer for ${key}.`;
    }
    const submit = await supertest(app)
      .post(`/api/portal/${token}/assigned-actions/${reflection.id}/submit`)
      .send({ answers, pasteAttempts: 2, keystrokeCount: 210, maxBurstChars: 34 });
    expect(submit.status).toBe(200);
    expect(submit.body.status).toBe("submitted");
    expect(submit.body.pasteAttempts).toBe(2);
    expect(submit.body.keystrokeCount).toBe(210);
    expect(submit.body.maxBurstChars).toBe(34);
    expect(submit.body.response.answers.description).toContain("Typed answer");

    // Re-submitting is rejected.
    const again = await supertest(app)
      .post(`/api/portal/${token}/assigned-actions/${reflection.id}/submit`)
      .send({ answers });
    expect(again.status).toBe(400);

    // Outstanding count drops for the hub widget.
    const after = await supertest(app).get(`/api/portal/${token}/assigned-actions`);
    expect(
      after.body.filter((a: any) => a.status === "assigned" || a.status === "in_progress").length,
    ).toBe(list.body.length - 1);

    const audit = await admin.get(`/api/nurses/${nurseId}/audit-log`);
    expect(
      audit.body.some(
        (l: any) => l.module === "assigned_actions" && l.action === "assigned_action_submitted",
      ),
    ).toBe(true);
  });

  it("portal: submit requires every prompt to be answered", async () => {
    const link = await createPortalLink(admin, nurseId, "onboard");
    const token = link.token as string;
    const list = await supertest(app).get(`/api/portal/${token}/assigned-actions`);
    const witness = list.body.find((a: any) => a.type === "witness_statement");

    const res = await supertest(app)
      .post(`/api/portal/${token}/assigned-actions/${witness.id}/submit`)
      .send({ answers: { account: "Only one section answered" }, honestyDeclarationAccepted: true });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/every section/i);
  });

  it("portal: witness statement submit is rejected without the honesty declaration", async () => {
    const link = await createPortalLink(admin, nurseId, "onboard");
    const token = link.token as string;
    const list = await supertest(app).get(`/api/portal/${token}/assigned-actions`);
    const witness = list.body.find((a: any) => a.type === "witness_statement");
    const answers = {
      account: "I was on shift and heard a noise from the bathroom.",
      actions_taken: "I called for help and assessed the patient.",
      outcome: "The patient was uninjured; incident form completed.",
    };

    const noDecl = await supertest(app)
      .post(`/api/portal/${token}/assigned-actions/${witness.id}/submit`)
      .send({ answers });
    expect(noDecl.status).toBe(400);
    expect(noDecl.body.message).toMatch(/declaration/i);

    const withDecl = await supertest(app)
      .post(`/api/portal/${token}/assigned-actions/${witness.id}/submit`)
      .send({ answers, honestyDeclarationAccepted: true, keystrokeCount: 420 });
    expect(withDecl.status).toBe(200);
    expect(withDecl.body.status).toBe("submitted");
    expect(withDecl.body.honestyDeclarationAccepted).toBe(true);
  });

  it("super admin can mark a submission reviewed; reviewed rows reject review", async () => {
    const list = await admin.get(`/api/admin/nurses/${nurseId}/assigned-actions`);
    const submitted = list.body.find((a: any) => a.status === "submitted");
    expect(submitted).toBeDefined();

    const review = await superAdmin.post(`/api/admin/assigned-actions/${submitted.id}/review`);
    expect(review.status).toBe(200);
    expect(review.body.status).toBe("reviewed");
    expect(review.body.reviewedBy).toMatch(/superadmin/);

    const again = await superAdmin.post(`/api/admin/assigned-actions/${submitted.id}/review`);
    expect(again.status).toBe(400);

    const audit = await admin.get(`/api/nurses/${nurseId}/audit-log`);
    expect(
      audit.body.some(
        (l: any) => l.module === "assigned_actions" && l.action === "assigned_action_reviewed",
      ),
    ).toBe(true);
  });

  it("portal gating: bad token 404s and one nurse's token cannot reach another nurse's action", async () => {
    const bad = await supertest(app).get(`/api/portal/not-a-real-token/assigned-actions`);
    expect(bad.status).toBe(404);

    // A second nurse's token must not see the first nurse's actions.
    const other = await createTestNurse(admin);
    const otherLink = await createPortalLink(admin, other.id, "onboard");
    const adminList = await admin.get(`/api/admin/nurses/${nurseId}/assigned-actions`);
    const foreignId = adminList.body[0].id;
    const cross = await supertest(app).get(
      `/api/portal/${otherLink.token}/assigned-actions/${foreignId}`,
    );
    expect(cross.status).toBe(404);
    const crossSubmit = await supertest(app)
      .post(`/api/portal/${otherLink.token}/assigned-actions/${foreignId}/submit`)
      .send({ answers: { account: "x" } });
    expect(crossSubmit.status).toBe(404);
  });

  it("unauthenticated requests to admin routes are rejected", async () => {
    const res = await supertest(app).get(`/api/admin/nurses/${nurseId}/assigned-actions`);
    expect(res.status).toBe(401);
    const assign = await supertest(app)
      .post(`/api/admin/nurses/${nurseId}/assigned-actions`)
      .send({ type: "reflection", framework: "gibbs" });
    expect(assign.status).toBe(401);
  });
});
