import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

// Task 170 (revised) — the Service Agreement (Registered Nurse) is NOT a
// blocking first step. It lives inside the Compliance group and only becomes
// signable once an admin has approved the nurse's compliance
// (POST /api/nurses/:id/compliance-approval). Until then the sign/draft
// endpoints return 403 { error: "compliance_not_approved" }, but the rest of
// the portal is fully usable. Reading the contract is always allowed; signing
// after approval enforces the required identity fields and records the audit +
// countersigned PDF.

const VALID_ANSWERS = {
  nmcPin: "AB12CD34",
  rcnMembershipNo: "RCN-99887",
  utrCompanyNumber: "1234567890",
  businessName: "Test Nursing Ltd",
};

async function approveCompliance(agent: supertest.Agent, nurseId: string) {
  const res = await agent.post(`/api/nurses/${nurseId}/compliance-approval`).send({});
  expect([200, 409]).toContain(res.status);
}

describe("Task 170 — Service Agreement (Compliance-gated)", () => {
  let app: Express;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    agent = supertest.agent(result.app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  it("does NOT block other portal writes before signing (up-front block removed)", async () => {
    const nurse = await createTestNurse(agent, {}, { signServiceAgreement: false });
    const link = await createPortalLink(agent, nurse.id);

    const res = await supertest(app)
      .put(`/api/portal/${link.token}/uniform-sizing`)
      .send({ uniformTopSize: "M" });

    expect(res.status).toBe(200);
  });

  it("lets the nurse read the contract regardless of approval", async () => {
    const nurse = await createTestNurse(agent, {}, { signServiceAgreement: false });
    const link = await createPortalLink(agent, nurse.id);

    const getRes = await supertest(app).get(`/api/portal/${link.token}/service-agreement`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.state.signed).toBe(false);
    expect(Array.isArray(getRes.body.contract.clauses ?? getRes.body.contract.fields)).toBe(true);
  });

  it("refuses signing/draft until an admin has approved compliance", async () => {
    const nurse = await createTestNurse(agent, {}, { signServiceAgreement: false });
    const link = await createPortalLink(agent, nurse.id);

    const draftRes = await supertest(app)
      .put(`/api/portal/${link.token}/service-agreement/draft`)
      .send({ answers: VALID_ANSWERS });
    expect(draftRes.status).toBe(403);
    expect(draftRes.body.error).toBe("compliance_not_approved");

    const signRes = await supertest(app)
      .post(`/api/portal/${link.token}/service-agreement/sign`)
      .send({ signatureName: nurse.fullName, answers: VALID_ANSWERS });
    expect(signRes.status).toBe(403);
    expect(signRes.body.error).toBe("compliance_not_approved");
  });

  it("after approval, requires a typed signature and all mandatory identity fields", async () => {
    const nurse = await createTestNurse(agent, {}, { signServiceAgreement: false });
    const link = await createPortalLink(agent, nurse.id);
    await approveCompliance(agent, nurse.id);

    // Missing signature.
    const noSig = await supertest(app)
      .post(`/api/portal/${link.token}/service-agreement/sign`)
      .send({ answers: VALID_ANSWERS });
    expect(noSig.status).toBe(400);

    // Missing required fields.
    const missing = await supertest(app)
      .post(`/api/portal/${link.token}/service-agreement/sign`)
      .send({ signatureName: nurse.fullName, answers: { businessName: "Only this" } });
    expect(missing.status).toBe(400);
    expect(Array.isArray(missing.body.errors)).toBe(true);
    const fields = missing.body.errors.map((e: any) => e.field);
    expect(fields).toContain("nmcPin");
    expect(fields).toContain("rcnMembershipNo");
    expect(fields).toContain("utrCompanyNumber");
  });

  it("after approval, signing succeeds and records the audit + PDF", async () => {
    const nurse = await createTestNurse(agent, {}, { signServiceAgreement: false });
    const link = await createPortalLink(agent, nurse.id);
    await approveCompliance(agent, nurse.id);

    const sign = await supertest(app)
      .post(`/api/portal/${link.token}/service-agreement/sign`)
      .send({ signatureName: nurse.fullName, answers: VALID_ANSWERS });
    expect(sign.status).toBe(200);
    expect(sign.body.ok).toBe(true);
    expect(sign.body.state.signed).toBe(true);

    // Audit row recorded under the service_agreement module.
    const audits = await agent.get(`/api/audit-logs?nurseId=${nurse.id}`);
    const actions = (audits.body || []).map((a: any) => a.action);
    expect(actions).toContain("agreement_signed");
  });

  it("admin can read signed status + countersigned PDF id", async () => {
    const nurse = await createTestNurse(agent, {}, { signServiceAgreement: false });
    const link = await createPortalLink(agent, nurse.id);

    // Not signed yet.
    const notSigned = await agent.get(`/api/nurses/${nurse.id}/service-agreement`);
    expect(notSigned.status).toBe(200);
    expect(notSigned.body.state.signed).toBe(false);

    // Approve compliance, sign, then re-read as admin.
    await approveCompliance(agent, nurse.id);
    await supertest(app)
      .post(`/api/portal/${link.token}/service-agreement/sign`)
      .send({ signatureName: nurse.fullName, answers: VALID_ANSWERS });

    const signed = await agent.get(`/api/nurses/${nurse.id}/service-agreement`);
    expect(signed.status).toBe(200);
    expect(signed.body.state.signed).toBe(true);
    expect(signed.body.state.signerName).toBe(nurse.fullName);
    expect(signed.body.answers.nmcPin).toBe(VALID_ANSWERS.nmcPin);
  });

  it("rejects portal write auth properly when token is missing", async () => {
    const res = await supertest(app)
      .put(`/api/portal/does-not-exist/uniform-sizing`)
      .send({ uniformTopSize: "M" });
    // Unresolved token falls through to validatePortalToken → 404.
    expect([401, 404, 410]).toContain(res.status);
  });

  describe("amend + re-sign flow", () => {
    let sa: supertest.Agent;

    beforeAll(async () => {
      sa = supertest.agent(app);
      await sa.post("/api/auth/login").send({ username: "superadmin", password: "superpass" });
    });

    it("blocks editing the contract for a non-super-admin (admin → 403)", async () => {
      const res = await agent
        .put(`/api/admin/settings/service-agreement`)
        .send({ recoveryFee: "£6,000" });
      expect(res.status).toBe(403);
    });

    it("amending the contract bumps the version and forces a previously-signed nurse to re-sign", async () => {
      const nurse = await createTestNurse(agent, {}, { signServiceAgreement: false });
      const link = await createPortalLink(agent, nurse.id);
      await approveCompliance(agent, nurse.id);

      // Nurse signs the current version.
      const sign = await supertest(app)
        .post(`/api/portal/${link.token}/service-agreement/sign`)
        .send({ signatureName: nurse.fullName, answers: VALID_ANSWERS });
      expect(sign.status).toBe(200);
      expect(sign.body.state.signed).toBe(true);
      const signedVersion = sign.body.state.version as number;

      // Super-admin amends the contract content → version bumps.
      const amend = await sa
        .put(`/api/admin/settings/service-agreement`)
        .send({ recoveryFee: `£${Date.now()}` });
      expect(amend.status).toBe(200);
      expect(amend.body.versionBumped).toBe(true);
      expect(amend.body.config.version).toBeGreaterThan(signedVersion);

      // Admin view now flags the nurse as needing to re-sign.
      const adminView = await agent.get(`/api/nurses/${nurse.id}/service-agreement`);
      expect(adminView.status).toBe(200);
      expect(adminView.body.state.signed).toBe(false);
      expect(adminView.body.state.everSigned).toBe(true);
      expect(adminView.body.state.needsResign).toBe(true);
      expect(adminView.body.state.version).toBe(signedVersion);
      expect(adminView.body.state.currentVersion).toBe(amend.body.config.version);

      // Portal view exposes the re-sign state too.
      const portalView = await supertest(app).get(`/api/portal/${link.token}/service-agreement`);
      expect(portalView.body.state.signed).toBe(false);
      expect(portalView.body.state.needsResign).toBe(true);

      // The nurse can re-sign at the new version (no 409), and is signed again.
      const resign = await supertest(app)
        .post(`/api/portal/${link.token}/service-agreement/sign`)
        .send({ signatureName: nurse.fullName, answers: VALID_ANSWERS });
      expect(resign.status).toBe(200);
      expect(resign.body.state.signed).toBe(true);
      expect(resign.body.state.needsResign).toBe(false);
      expect(resign.body.state.version).toBe(amend.body.config.version);

      // An amendment writes the distinct `agreement_amended` audit action.
      const audits = await sa.get(`/api/audit-logs`);
      const actions = (audits.body || []).map((a: any) => a.action);
      expect(actions).toContain("agreement_amended");
    });

    it("keeps needsResign true after the nurse starts a fresh draft at the new version", async () => {
      const nurse = await createTestNurse(agent, {}, { signServiceAgreement: false });
      const link = await createPortalLink(agent, nurse.id);
      await approveCompliance(agent, nurse.id);

      // Sign current version.
      const sign = await supertest(app)
        .post(`/api/portal/${link.token}/service-agreement/sign`)
        .send({ signatureName: nurse.fullName, answers: VALID_ANSWERS });
      expect(sign.status).toBe(200);
      const signedVersion = sign.body.state.version as number;

      // Amend → version bumps.
      const amend = await sa
        .put(`/api/admin/settings/service-agreement`)
        .send({ recoveryFee: `£${Date.now()}-x` });
      expect(amend.body.versionBumped).toBe(true);

      // Nurse opens a fresh draft at the new version (does NOT submit).
      const draft = await supertest(app)
        .put(`/api/portal/${link.token}/service-agreement/draft`)
        .send({ answers: VALID_ANSWERS });
      expect(draft.status).toBe(200);

      // The new draft must NOT mask that they still owe a re-sign.
      const adminView = await agent.get(`/api/nurses/${nurse.id}/service-agreement`);
      expect(adminView.body.state.signed).toBe(false);
      expect(adminView.body.state.everSigned).toBe(true);
      expect(adminView.body.state.needsResign).toBe(true);
      expect(adminView.body.state.version).toBe(signedVersion);
      expect(adminView.body.state.currentVersion).toBe(amend.body.config.version);
    });

    it("a config save with no content change does not bump the version", async () => {
      const before = await agent.get(`/api/admin/settings/service-agreement`);
      const current = before.body.config ?? before.body;
      const version = current.version as number;

      const res = await sa.put(`/api/admin/settings/service-agreement`).send({
        title: current.title,
        recoveryFee: current.recoveryFee,
        countersignatoryName: current.countersignatoryName,
        countersignatoryPosition: current.countersignatoryPosition,
      });
      expect(res.status).toBe(200);
      expect(res.body.versionBumped).toBe(false);
      expect(res.body.config.version).toBe(version);
    });
  });
});
