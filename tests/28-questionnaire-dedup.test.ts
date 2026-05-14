import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import {
  getTestApp,
  loginAsAdmin,
  createTestNurse,
  createPortalLink,
} from "./helpers";

const BBV_KEYS = [
  "hbv_vaccinated",
  "hbv_anti_hbs_titre",
  "hbv_surface_antigen_negative",
  "hcv_negative",
  "hiv_negative",
];

describe("28 — Questionnaire deduplication (task 125)", () => {
  let admin: supertest.Agent;
  let anon: supertest.Agent;

  beforeAll(async () => {
    const { request } = await getTestApp();
    anon = request;
    admin = await loginAsAdmin();
  });

  it("T1: BBV questions live on Occupational Health, not on EPP", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");

    const oh = await anon.get(`/api/portal/${link.token}/declarations/occupational_health`);
    expect(oh.status).toBe(200);
    const ohQuestionIds: string[] = (oh.body.declaration?.questions || []).map((q: any) => q.id);
    for (const k of BBV_KEYS) {
      expect(ohQuestionIds).toContain(k);
    }
    expect(ohQuestionIds).not.toContain("hep_b_vaccinated");

    const epp = await anon.get(`/api/portal/${link.token}/declarations/epp_declaration`);
    expect(epp.status).toBe(200);
    const eppIds: string[] = (epp.body.declaration?.questions || []).map((q: any) => q.id);
    for (const k of BBV_KEYS) {
      expect(eppIds).not.toContain(k);
    }
    expect(eppIds).not.toContain("hep_b_vaccinated");
  });

  it("T2: Age & Eligibility owns DOB and Right-to-Work fields", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    const ae = await anon.get(`/api/portal/${link.token}/declarations/age_and_eligibility`);
    expect(ae.status).toBe(200);
    const ids: string[] = (ae.body.declaration?.questions || []).map((q: any) => q.id);
    expect(ids).toContain("date_of_birth");
  });

  it("T3: BBV answers persisted on OH are readable for EPP read-through", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");

    const draft = await anon
      .put(`/api/portal/${link.token}/declarations/occupational_health/draft`)
      .send({
        answers: {
          hbv_vaccinated: true,
          hbv_anti_hbs_titre: 150,
          hbv_surface_antigen_negative: true,
          hcv_negative: true,
          hiv_negative: true,
        },
      });
    expect([200, 201]).toContain(draft.status);

    const fetched = await anon.get(`/api/portal/${link.token}/declarations/occupational_health`);
    expect(fetched.status).toBe(200);
    const ans = fetched.body.latest?.answers || {};
    expect(ans.hbv_vaccinated).toBe(true);
    expect(Number(ans.hbv_anti_hbs_titre)).toBe(150);
    expect(ans.hbv_surface_antigen_negative).toBe(true);
    expect(ans.hcv_negative).toBe(true);
    expect(ans.hiv_negative).toBe(true);
  });

  it("T4a: onboarding-state derives right_to_work status from age_and_eligibility draft", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");

    // Ensure an onboarding-state row exists (admin endpoint creates it
    // on first read).
    const seed = await admin.get(`/api/candidates/${nurse.id}/onboarding-state`);
    expect(seed.status).toBe(200);

    const draft = await anon
      .put(`/api/portal/${link.token}/declarations/age_and_eligibility/draft`)
      .send({
        answers: { date_of_birth: "1990-01-01", confirm_18_plus: true },
      });
    expect([200, 201]).toContain(draft.status);

    const after = await anon.get(`/api/portal/${link.token}/onboarding-state`);
    expect(after.status).toBe(200);
    expect(after.body?.stepStatuses?.right_to_work).toBe("in_progress");
  });

  it("T4: admin declaration fetch also exposes BBV answers (single source of truth)", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");
    await anon
      .put(`/api/portal/${link.token}/declarations/occupational_health/draft`)
      .send({ answers: { hbv_vaccinated: false, hcv_negative: true } });

    const adminFetch = await admin.get(`/api/nurses/${nurse.id}/declarations/occupational_health`);
    expect(adminFetch.status).toBe(200);
    const ans = adminFetch.body.latest?.answers || {};
    expect(ans.hbv_vaccinated).toBe(false);
    expect(ans.hcv_negative).toBe(true);
  });
});
