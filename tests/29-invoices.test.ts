import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import {
  getTestApp,
  loginAsAdmin,
  createTestNurse,
  createPortalLink,
} from "./helpers";

async function makeCompletedNurse(admin: supertest.Agent) {
  const nurse = await createTestNurse(admin);
  await admin.patch(`/api/nurses/${nurse.id}`).send({ currentStage: "completed" });
  return nurse;
}

function baseSubmission(overrides: Partial<any> = {}) {
  return {
    personalDetails: {
      fullName: "Test Nurse",
      address: "1 Care Lane",
      email: "test@example.com",
      phoneNumber: "07000000000",
    },
    bankDetails: {
      accountType: "personal",
      accountName: "Test Nurse",
      bankName: "Bank",
      sortCode: "00-00-00",
      accountNumber: "12345678",
    },
    timesheetEntries: [
      { date: "2026-05-01", startTime: "09:00", endTime: "17:00", patientInitials: "A.B.", location: "Ward 1" },
    ],
    hourlyRatePence: 2500,
    additionalCosts: [],
    paymentNotes: null,
    ...overrides,
  };
}

describe("29 — Nurse Invoices (task 134)", () => {
  let admin: supertest.Agent;
  let anon: supertest.Agent;

  beforeAll(async () => {
    const { request } = await getTestApp();
    anon = request;
    admin = await loginAsAdmin();
  });

  it("T1: portal invoice POST is gated for non-completed nurses", async () => {
    const nurse = await createTestNurse(admin); // stage = preboard
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const res = await anon.post(`/api/portal/${link.token}/invoices`).send(baseSubmission());
    expect(res.status).toBe(403);
  });

  it("T2: completed nurse can submit, list, and read own invoice", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const submit = await anon.post(`/api/portal/${link.token}/invoices`).send(baseSubmission());
    expect(submit.status).toBe(201);
    expect(submit.body.status).toBe("submitted");
    expect(submit.body.totalHours).toBe(8 * 60);
    expect(submit.body.totalAmount).toBe(8 * 2500);
    expect(submit.body.timesheetEntries).toHaveLength(1);

    const list = await anon.get(`/api/portal/${link.token}/invoices`);
    expect(list.status).toBe(200);
    expect(list.body.invoices).toHaveLength(1);

    const detail = await anon.get(`/api/portal/${link.token}/invoices/${submit.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(submit.body.id);
  });

  it("T2b: portal + admin PDF endpoints stream application/pdf", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const submit = await anon.post(`/api/portal/${link.token}/invoices`).send(baseSubmission());
    expect(submit.status).toBe(201);
    const portalPdf = await anon.get(`/api/portal/${link.token}/invoices/${submit.body.id}/pdf`).buffer(true);
    expect(portalPdf.status).toBe(200);
    expect(portalPdf.headers["content-type"]).toMatch(/application\/pdf/);
    expect(Buffer.isBuffer(portalPdf.body) ? portalPdf.body.slice(0, 4).toString() : "").toBe("%PDF");
    const adminPdf = await admin.get(`/api/admin/invoices/${submit.body.id}/pdf`).buffer(true);
    expect(adminPdf.status).toBe(200);
    expect(adminPdf.headers["content-type"]).toMatch(/application\/pdf/);
  });

  it("T3: overnight shift wraps past midnight correctly", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const res = await anon.post(`/api/portal/${link.token}/invoices`).send(baseSubmission({
      timesheetEntries: [
        { date: "2026-05-01", startTime: "20:00", endTime: "06:00", patientInitials: "X", location: "Y" },
      ],
    }));
    expect(res.status).toBe(201);
    expect(res.body.totalHours).toBe(10 * 60); // 20:00 → 06:00 = 10h
  });

  it("T4: nurse cannot read another nurse's invoice", async () => {
    const a = await makeCompletedNurse(admin);
    const b = await makeCompletedNurse(admin);
    const linkA = await createPortalLink(admin, a.id, "onboard");
    const linkB = await createPortalLink(admin, b.id, "onboard");
    const created = await anon.post(`/api/portal/${linkA.token}/invoices`).send(baseSubmission());
    expect(created.status).toBe(201);
    const cross = await anon.get(`/api/portal/${linkB.token}/invoices/${created.body.id}`);
    expect(cross.status).toBe(404);
  });

  it("T5: status transitions submitted → approved → paid → reconciled, audit logged", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const created = await anon.post(`/api/portal/${link.token}/invoices`).send(baseSubmission());
    const id = created.body.id;

    const approve = await admin.patch(`/api/admin/invoices/${id}/status`).send({ status: "approved" });
    expect(approve.status).toBe(200);
    expect(approve.body.status).toBe("approved");
    expect(approve.body.approvedAt).toBeTruthy();

    const paid = await admin.patch(`/api/admin/invoices/${id}/status`).send({ status: "paid" });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("paid");

    const reconNoRef = await admin.patch(`/api/admin/invoices/${id}/status`).send({ status: "reconciled" });
    expect(reconNoRef.status).toBe(400);

    const recon = await admin.patch(`/api/admin/invoices/${id}/status`).send({
      status: "reconciled",
      paymentReference: "BACS-123",
      paymentDate: "2026-05-15",
    });
    expect(recon.status).toBe(200);
    expect(recon.body.status).toBe("reconciled");
    expect(recon.body.paymentReference).toBe("BACS-123");

    const audit = await admin.get(`/api/audit-logs?nurseId=${nurse.id}`);
    expect(audit.status).toBe(200);
    const actions = audit.body.map((a: any) => a.action);
    expect(actions).toContain("invoice_submitted");
    expect(actions).toContain("invoice_approved");
    expect(actions).toContain("invoice_paid");
    expect(actions).toContain("invoice_reconciled");
  });

  it("T6: invalid status transition is rejected (paid → approved)", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const created = await anon.post(`/api/portal/${link.token}/invoices`).send(baseSubmission());
    const id = created.body.id;
    await admin.patch(`/api/admin/invoices/${id}/status`).send({ status: "approved" });
    await admin.patch(`/api/admin/invoices/${id}/status`).send({ status: "paid" });
    const bad = await admin.patch(`/api/admin/invoices/${id}/status`).send({ status: "approved" });
    expect(bad.status).toBe(400);
  });

  it("T7: reject requires reason, terminal", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const created = await anon.post(`/api/portal/${link.token}/invoices`).send(baseSubmission());
    const id = created.body.id;

    const noReason = await admin.patch(`/api/admin/invoices/${id}/status`).send({ status: "rejected" });
    expect(noReason.status).toBe(400);

    const ok = await admin.patch(`/api/admin/invoices/${id}/status`).send({ status: "rejected", rejectedReason: "Hours don't match roster" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("rejected");
    expect(ok.body.rejectedReason).toContain("roster");

    const reopen = await admin.patch(`/api/admin/invoices/${id}/status`).send({ status: "approved" });
    expect(reopen.status).toBe(400);
  });

  it("T8: nurse can withdraw a submitted invoice; not after approval", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const created = await anon.post(`/api/portal/${link.token}/invoices`).send(baseSubmission());
    const id = created.body.id;

    const created2 = await anon.post(`/api/portal/${link.token}/invoices`).send(baseSubmission());
    await admin.patch(`/api/admin/invoices/${created2.body.id}/status`).send({ status: "approved" });
    const blocked = await anon.delete(`/api/portal/${link.token}/invoices/${created2.body.id}`);
    expect(blocked.status).toBe(409);

    const withdraw = await anon.delete(`/api/portal/${link.token}/invoices/${id}`);
    expect(withdraw.status).toBe(200);
  });

  it("T9: admin matrix defaults to completed nurses; stage=all includes others", async () => {
    const completed = await makeCompletedNurse(admin);
    const linkC = await createPortalLink(admin, completed.id, "onboard");
    await anon.post(`/api/portal/${linkC.token}/invoices`).send(baseSubmission());

    const def = await admin.get(`/api/admin/invoices`);
    expect(def.status).toBe(200);
    expect(def.body.invoices.length).toBeGreaterThan(0);
    expect(def.body.nurses.every((n: any) => n.currentStage === "completed")).toBe(true);

    const all = await admin.get(`/api/admin/invoices?stage=all`);
    expect(all.status).toBe(200);
    const stages = new Set(all.body.nurses.map((n: any) => n.currentStage));
    expect(stages.size).toBeGreaterThanOrEqual(1);
  });

  it("T10: CSV export returns one row per invoice with currency in £", async () => {
    const nurse = await makeCompletedNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    await anon.post(`/api/portal/${link.token}/invoices`).send(baseSubmission());
    const csv = await admin.get(`/api/admin/invoices/export.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    const lines = csv.text.split("\n");
    expect(lines[0]).toContain("invoice_id,nurse_id,name");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[1]).toContain("200.00"); // 8h * £25 = £200
  });

  it("T11: stats endpoint groups by status", async () => {
    const res = await admin.get(`/api/admin/invoices/stats`);
    expect(res.status).toBe(200);
    expect(res.body.byStatus).toHaveProperty("submitted");
    expect(res.body.byStatus).toHaveProperty("approved");
    expect(res.body.byStatus).toHaveProperty("paid");
    expect(res.body.byStatus).toHaveProperty("reconciled");
    expect(res.body.byStatus).toHaveProperty("rejected");
  });

  it("T12: missing token returns 401/404 (no anonymous portal write)", async () => {
    const noToken = await anon.post(`/api/portal/me/invoices`).send(baseSubmission());
    expect([401, 403, 404]).toContain(noToken.status);
  });
});
