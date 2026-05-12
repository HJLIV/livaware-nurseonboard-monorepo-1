import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

function getCookie(res: supertest.Response, name: string): string | undefined {
  const raw = res.headers["set-cookie"];
  if (!raw) return undefined;
  const arr = Array.isArray(raw) ? raw : [raw];
  for (const c of arr) {
    const m = new RegExp(`(?:^|; )${name}=([^;]+)`).exec(c as string);
    if (m) return m[1];
  }
  return undefined;
}

describe("Portal passwordless auth (task 107)", () => {
  let app: Express;
  let admin: supertest.Agent;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    admin = supertest.agent(app);
    await admin.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  it("bootstrap: fresh portal link consumes once and issues a portal session cookie", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "preboard");

    const portal = supertest.agent(app);
    const r1 = await portal.get(`/api/portal/${link.token}`);
    expect(r1.status).toBe(200);
    expect(r1.body.firstVisit).toBe(true);
    expect(r1.body.sessionIssued).toBe(true);
    expect(getCookie(r1, "portal.sid")).toBeTruthy();

    // Same agent now has a session cookie — calling with the "me" sentinel
    // works without any URL token.
    const r2 = await portal.get(`/api/portal/auth/me`);
    expect(r2.status).toBe(200);
    expect(r2.body.authenticated).toBe(true);
    expect(r2.body.nurse.id).toBe(nurse.id);

    // Re-using the bootstrap link from a different browser fails with 410.
    const otherBrowser = supertest.agent(app);
    const r3 = await otherBrowser.get(`/api/portal/${link.token}`);
    expect(r3.status).toBe(410);
    expect(r3.body.error).toBe("link_consumed");
    expect(r3.body.email).toBe(nurse.email);
  });

  it("post-bootstrap portal calls require the session cookie", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "onboard");

    const noCookie = supertest.agent(app);
    const r = await noCookie.get(`/api/portal/me/candidate`);
    expect(r.status).toBe(401);

    const portal = supertest.agent(app);
    await portal.get(`/api/portal/${link.token}`); // bootstrap → cookie set
    const r2 = await portal.get(`/api/portal/me/candidate`);
    expect(r2.status).toBe(200);
    expect(r2.body.id).toBe(nurse.id);
  });

  it("request-code returns 200 for unknown email and exposes devCode for known nurse", async () => {
    const nurse = await createTestNurse(admin);
    const portal = supertest.agent(app);

    const unknown = await portal.post("/api/portal/auth/request-code").send({ email: "no-such-nurse@example.com" });
    expect(unknown.status).toBe(200);
    expect(unknown.body.devCode).toBeUndefined();

    const known = await portal.post("/api/portal/auth/request-code").send({ email: nurse.email });
    expect(known.status).toBe(200);
    expect(known.body.devCode).toMatch(/^\d{6}$/);
  });

  it("verify-code: success issues a session; wrong codes lock the active code", async () => {
    const nurse = await createTestNurse(admin);
    const portal = supertest.agent(app);
    const r = await portal.post("/api/portal/auth/request-code").send({ email: nurse.email });
    const code = r.body.devCode as string;
    expect(code).toMatch(/^\d{6}$/);

    // Five wrong attempts → first four return wrong_code, fifth burns the code.
    for (let i = 0; i < 4; i++) {
      const bad = await portal.post("/api/portal/auth/verify-code").send({ email: nurse.email, code: "000000" });
      expect(bad.status).toBe(400);
      expect(bad.body.reason).toBe("wrong_code");
    }
    const fifth = await portal.post("/api/portal/auth/verify-code").send({ email: nurse.email, code: "000000" });
    expect([400, 429]).toContain(fifth.status);
    expect(fifth.body.reason).toBe("locked");

    // The original (correct) code is now consumed → can't be used.
    const burnt = await portal.post("/api/portal/auth/verify-code").send({ email: nurse.email, code });
    expect(burnt.status).toBe(400);

    // Request a fresh code & succeed.
    const r2 = await portal.post("/api/portal/auth/request-code").send({ email: nurse.email });
    const code2 = r2.body.devCode as string;
    const ok = await portal.post("/api/portal/auth/verify-code").send({ email: nurse.email, code: code2 });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    expect(getCookie(ok, "portal.sid")).toBeTruthy();
  });

  it("admin force-sign-out revokes active sessions and the cookie stops working", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "preboard");
    const portal = supertest.agent(app);
    await portal.get(`/api/portal/${link.token}`);

    let me = await portal.get("/api/portal/auth/me");
    expect(me.status).toBe(200);

    const revoke = await admin.post(`/api/nurses/${nurse.id}/portal-auth/revoke-all`).send({ reason: "test" });
    expect(revoke.status).toBe(200);
    expect(revoke.body.revoked).toBeGreaterThanOrEqual(1);

    me = await portal.get("/api/portal/auth/me");
    expect(me.status).toBe(401);
  });

  it("admin can send a sign-in code on the nurse's behalf and it is audited", async () => {
    const nurse = await createTestNurse(admin);
    const r = await admin.post(`/api/nurses/${nurse.id}/portal-auth/send-code`).send({});
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.devCode).toMatch(/^\d{6}$/);

    // The send-code action shows up in the audit log under module portal_auth.
    const audit = await admin.get(`/api/nurses/${nurse.id}/audit-log`);
    expect(audit.status).toBe(200);
    const actions = (audit.body as any[]).map((l) => l.action);
    expect(actions).toContain("portal_code_sent_by_admin");
  });

  it("portal sign-out clears the session and subsequent calls 401", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "preboard");
    const portal = supertest.agent(app);
    await portal.get(`/api/portal/${link.token}`);
    expect((await portal.get("/api/portal/auth/me")).status).toBe(200);
    const so = await portal.post("/api/portal/auth/sign-out");
    expect(so.status).toBe(200);
    expect((await portal.get("/api/portal/auth/me")).status).toBe(401);
  });

  it("claimed bootstrap link cannot authenticate /api/portal/:token/* from a fresh browser", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "preboard");

    // First browser: claim the link.
    const browserA = supertest.agent(app);
    const r1 = await browserA.get(`/api/portal/${link.token}`);
    expect(r1.status).toBe(200);

    // Second browser (no cookie): the same token must no longer work for
    // tokenized portal endpoints, since the link is now consumed.
    const browserB = supertest.agent(app);
    const r2 = await browserB.get(`/api/portal/${link.token}`);
    expect(r2.status).toBe(410);
    expect(r2.body.error).toBe("link_consumed");

    const r3 = await browserB.get(`/api/portal/${link.token}/onboarding-state`);
    expect([401, 404]).toContain(r3.status);
  });

  it("non-admin authenticated user is rejected from new portal-access admin endpoints", async () => {
    const nurse = await createTestNurse(admin);
    const team = supertest.agent(app);
    const login = await team.post("/api/auth/login").send({ username: "team", password: "teampass" });
    // Team login may not exist in this env; skip the test gracefully if so.
    if (login.status !== 200) return;

    const r1 = await team.get(`/api/nurses/${nurse.id}/portal-sessions`);
    expect(r1.status).toBe(403);
    const r2 = await team.post(`/api/nurses/${nurse.id}/portal-auth/send-code`).send({});
    expect(r2.status).toBe(403);
    const r3 = await team.post(`/api/nurses/${nurse.id}/portal-auth/revoke-all`).send({ reason: "x" });
    expect(r3.status).toBe(403);
  });

  it("/api/portal/verify/me returns 401 redirect when no portal session cookie is present", async () => {
    const anon = supertest.agent(app);
    const r = await anon.get(`/api/portal/verify/me`);
    expect(r.status).toBe(401);
    expect(r.body.message).toMatch(/sign-in/i);
  });

  it("/api/portal/verify/me returns the candidate when a portal session cookie is present", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "preboard");
    const portal = supertest.agent(app);
    const claim = await portal.get(`/api/portal/${link.token}`);
    expect(claim.status).toBe(200);

    const r = await portal.get(`/api/portal/verify/me`);
    expect(r.status).toBe(200);
    expect(r.body.candidate?.id).toBe(nurse.id);
    expect(r.body.token).toBe("me");
  });

  it("/api/portal/verify/:token falls back to cookie session once the bootstrap link is claimed", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "preboard");
    const portal = supertest.agent(app);
    await portal.get(`/api/portal/${link.token}`);

    // Same browser, original (now-claimed) token: cookie should rescue it.
    const r = await portal.get(`/api/portal/verify/${link.token}`);
    expect(r.status).toBe(200);
    expect(r.body.candidate?.id).toBe(nurse.id);
    expect(r.body.token).toBe("me");
  });

  it("preboard assessment submitted with portalToken='me' is linked to the nurse via the cookie session", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "preboard");
    const portal = supertest.agent(app);
    const claim = await portal.get(`/api/portal/${link.token}`);
    expect(claim.status).toBe(200);

    const submit = await portal
      .post(`/api/assessments`)
      .send({
        nurseName: "Test Nurse",
        nurseEmail: `test-${Date.now()}@example.com`,
        nursePhone: null,
        responses: [
          {
            questionId: 1,
            tag: "q1",
            domain: "clinical",
            prompt: "Sample question prompt",
            response: "Sample answer text long enough to count.",
            timeSpent: 30,
            timeLimit: 120,
          },
        ],
        portalToken: "me",
      });
    expect([200, 201]).toContain(submit.status);

    // Linkage verified via the by-nurse lookup + the auto preboard→onboard
    // advance that only fires when the assessment is bound to the nurse.
    const lookup = await admin.get(`/api/preboard/assessments/by-nurse/${nurse.id}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body?.nurseId).toBe(nurse.id);

    const after = await admin.get(`/api/nurses/${nurse.id}`);
    expect(after.status).toBe(200);
    expect(["onboard", "skills_arcade", "completed"]).toContain(after.body.currentStage);
  });

  it("portal-sessions admin endpoint lists recent sessions with last sign-in", async () => {
    const nurse = await createTestNurse(admin);
    const link = await createPortalLink(admin, nurse.id, "preboard");
    const portal = supertest.agent(app);
    await portal.get(`/api/portal/${link.token}`);

    const r = await admin.get(`/api/nurses/${nurse.id}/portal-sessions`);
    expect(r.status).toBe(200);
    expect(r.body.sessions.length).toBeGreaterThanOrEqual(1);
    expect(r.body.lastSignIn).toBeTruthy();
    expect(r.body.lastSignIn.issuedVia).toBe("bootstrap_link");
  });
});
