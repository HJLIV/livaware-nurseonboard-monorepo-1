import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

describe("Task 121 — Onboarding declarations", () => {
  let admin: supertest.Agent;

  beforeAll(async () => {
    await getTestApp();
    admin = supertest.agent((await getTestApp()).app);
    await admin.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  async function makeNurseAndPortal() {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const token: string = link.token || link.portalLink?.token;
    expect(token).toBeTruthy();
    return { nurse, token, anon: supertest.agent((await getTestApp()).app) };
  }

  it("portal lists all six declarations as not_started for a fresh nurse", async () => {
    const { token, anon } = await makeNurseAndPortal();
    const res = await anon.get(`/api/portal/${token}/declarations`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(6);
    expect(res.body.completed).toBe(0);
    expect(res.body.outstanding).toBe(6);
    const keys = res.body.items.map((i: any) => i.key).sort();
    expect(keys).toEqual([
      "age_and_eligibility",
      "data_protection",
      "epp_declaration",
      "occupational_health",
      "rehab_of_offenders",
      "working_time_directive",
    ]);
    expect(res.body.items.every((i: any) => i.status === "not_started")).toBe(true);
  });

  it("portal can fetch a declaration definition with questions", async () => {
    const { token, anon } = await makeNurseAndPortal();
    const res = await anon.get(`/api/portal/${token}/declarations/data_protection`);
    expect(res.status).toBe(200);
    expect(res.body.declaration.key).toBe("data_protection");
    expect(Array.isArray(res.body.declaration.questions)).toBe(true);
    expect(res.body.declaration.questions.length).toBeGreaterThan(5);
    expect(res.body.latest).toBeNull();
  });

  it("portal can save a draft, then list shows status=draft", async () => {
    const { token, anon } = await makeNurseAndPortal();
    const draft = await anon
      .put(`/api/portal/${token}/declarations/working_time_directive/draft`)
      .send({ answers: { current_weekly_hours: 37.5 } });
    expect(draft.status).toBe(200);
    expect(draft.body.latest.status).toBe("draft");
    expect(draft.body.latest.version).toBe(1);

    const list = await anon.get(`/api/portal/${token}/declarations`);
    const wtd = list.body.items.find((i: any) => i.key === "working_time_directive");
    expect(wtd.status).toBe("draft");
  });

  it("portal submit rejects when answers fail validation", async () => {
    const { token, anon } = await makeNurseAndPortal();
    const res = await anon
      .post(`/api/portal/${token}/declarations/age_and_eligibility/submit`)
      .send({ answers: {}, signatureName: "Jane Test" });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it("portal submit requires a typed signature", async () => {
    const { token, anon } = await makeNurseAndPortal();
    const res = await anon
      .post(`/api/portal/${token}/declarations/working_time_directive/submit`)
      .send({ answers: {
        current_weekly_hours: 37.5, works_other_jobs: false,
        opt_choice: "opt_in", opt_effective_date: "2026-01-01",
        acknowledge_withdrawal: true, acknowledge_rest_breaks: true,
      } });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].questionId).toBe("__signature__");
  });

  it("portal submit succeeds end-to-end and generates a PDF document", async () => {
    const { nurse, token, anon } = await makeNurseAndPortal();
    const submit = await anon
      .post(`/api/portal/${token}/declarations/working_time_directive/submit`)
      .send({
        answers: {
          current_weekly_hours: 40, works_other_jobs: false,
          opt_choice: "opt_out", opt_effective_date: "2026-02-01",
          acknowledge_withdrawal: true, acknowledge_rest_breaks: true,
        },
        signatureName: "Jane Test",
      });
    expect(submit.status).toBe(200);
    expect(submit.body.latest.status).toBe("submitted");
    expect(submit.body.latest.signatureName).toBe("Jane Test");
    expect(submit.body.pdfDocumentId).toBeTruthy();

    // Admin sees the submission in the per-nurse list and on the doc list
    const adminList = await admin.get(`/api/nurses/${nurse.id}/declarations`);
    const wtd = adminList.body.items.find((i: any) => i.key === "working_time_directive");
    expect(wtd.status).toBe("submitted");
    expect(wtd.pdfDocumentId).toBe(submit.body.pdfDocumentId);

    const docs = await admin.get(`/api/candidates/${nurse.id}/documents`);
    expect(docs.status).toBe(200);
    const pdfDoc = (docs.body as any[]).find((d) => d.id === submit.body.pdfDocumentId);
    expect(pdfDoc).toBeTruthy();
    expect(pdfDoc.category).toBe("declaration");
  });

  it("portal cannot edit or re-submit after submission until admin re-opens", async () => {
    const { nurse, token, anon } = await makeNurseAndPortal();
    const valid = {
      answers: {
        current_weekly_hours: 36, works_other_jobs: false,
        opt_choice: "opt_in", opt_effective_date: "2026-03-01",
        acknowledge_withdrawal: true, acknowledge_rest_breaks: true,
      },
      signatureName: "Alex Test",
    };
    const first = await anon
      .post(`/api/portal/${token}/declarations/working_time_directive/submit`).send(valid);
    expect(first.status).toBe(200);

    const editAttempt = await anon
      .put(`/api/portal/${token}/declarations/working_time_directive/draft`)
      .send({ answers: valid.answers });
    expect(editAttempt.status).toBe(409);

    const reSubmit = await anon
      .post(`/api/portal/${token}/declarations/working_time_directive/submit`).send(valid);
    expect(reSubmit.status).toBe(409);

    // Admin reopen requires reason
    const noReason = await admin
      .post(`/api/nurses/${nurse.id}/declarations/working_time_directive/reopen`)
      .send({});
    expect(noReason.status).toBe(400);

    const reopen = await admin
      .post(`/api/nurses/${nurse.id}/declarations/working_time_directive/reopen`)
      .send({ reason: "Hours changed — please re-confirm" });
    expect(reopen.status).toBe(200);
    expect(reopen.body.previous.status).toBe("reopened");
    expect(reopen.body.next.version).toBe(2);
    expect(reopen.body.next.status).toBe("draft");

    // Candidate now sees v2 draft pre-populated and can re-submit
    const fetched = await anon.get(`/api/portal/${token}/declarations/working_time_directive`);
    expect(fetched.body.latest.version).toBe(2);
    expect(fetched.body.latest.status).toBe("draft");
    expect(fetched.body.latest.answers.current_weekly_hours).toBe(36);

    const resubmit = await anon
      .post(`/api/portal/${token}/declarations/working_time_directive/submit`)
      .send({ ...valid, answers: { ...valid.answers, current_weekly_hours: 38 } });
    expect(resubmit.status).toBe(200);
    expect(resubmit.body.latest.version).toBe(2);

    const history = await admin
      .get(`/api/nurses/${nurse.id}/declarations/working_time_directive/history`);
    expect(history.body.length).toBe(2);
    expect(history.body[0].version).toBe(2);
    expect(history.body[1].version).toBe(1);
  });

  it("audit log captures saved_draft, submitted, reopened actions", async () => {
    const { nurse, token, anon } = await makeNurseAndPortal();
    await anon.put(`/api/portal/${token}/declarations/data_protection/draft`)
      .send({ answers: { ack_uk_gdpr: true } });

    const logs = await admin.get(`/api/nurses/${nurse.id}/audit-log`);
    expect(logs.status).toBe(200);
    const actions = (logs.body as any[]).map((l) => l.action);
    expect(actions).toContain("declaration_saved_draft");
  });
});
