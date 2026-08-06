import type { Express } from "express";
import { describe, it, expect, beforeAll, vi } from "vitest";
import supertest from "supertest";
import path from "path";
import fs from "fs";
import os from "os";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

// Task 191 — Individual agreements for projects / patients / deployments.
// Admin uploads an agreement document for a specific nurse; the nurse reads
// and signs it in the portal (typed signature + explicit read confirmation);
// signing produces a signature-certificate PDF stored as a documents row.
// Unsigned agreements can be voided or have their document replaced; signed
// ones cannot.

function makeTempPdf(): string {
  const p = path.join(os.tmpdir(), `agreement-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  // Minimal valid-enough PDF payload for upload (mimetype is what matters).
  fs.writeFileSync(p, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  return p;
}

async function createAgreement(
  agent: supertest.Agent,
  nurseId: string,
  overrides: { title?: string; contextType?: string; contextLabel?: string } = {},
) {
  const req = agent
    .post(`/api/nurses/${nurseId}/agreements`)
    .field("title", overrides.title ?? "Deployment agreement — Test Ward")
    .field("contextType", overrides.contextType ?? "deployment")
    .attach("file", makeTempPdf());
  if (overrides.contextLabel) req.field("contextLabel", overrides.contextLabel);
  const res = await req;
  expect(res.status).toBe(201);
  return res.body.agreement as any;
}

describe("Task 191 — Individual agreements", () => {
  let app: Express;
  let agent: supertest.Agent;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    agent = supertest.agent(result.app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
  });

  it("requires admin auth for the admin endpoints", async () => {
    const res = await supertest(app).get(`/api/nurses/some-id/agreements`);
    expect(res.status).toBe(401);
  });

  it("admin can create an agreement with an uploaded document and it appears in the list", async () => {
    const nurse = await createTestNurse(agent, {});
    const created = await createAgreement(agent, nurse.id, {
      title: "Project agreement — Alpha",
      contextType: "project",
      contextLabel: "Project Alpha",
    });

    expect(created.status).toBe("pending");
    expect(created.contextType).toBe("project");
    expect(created.contextLabel).toBe("Project Alpha");
    expect(created.sourceDocument?.filePath).toMatch(/^\/api\/uploads\//);

    const listRes = await agent.get(`/api/nurses/${nurse.id}/agreements`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.agreements.some((a: any) => a.id === created.id)).toBe(true);
  });

  it("rejects creation without a file or title", async () => {
    const nurse = await createTestNurse(agent, {});
    const noFile = await agent
      .post(`/api/nurses/${nurse.id}/agreements`)
      .field("title", "Missing file");
    expect(noFile.status).toBe(400);

    const noTitle = await agent
      .post(`/api/nurses/${nurse.id}/agreements`)
      .attach("file", makeTempPdf());
    expect(noTitle.status).toBe(400);
  });

  it("portal list shows pending agreements but hides voided ones; requires a valid token", async () => {
    const nurse = await createTestNurse(agent, {});
    const link = await createPortalLink(agent, nurse.id);
    const keep = await createAgreement(agent, nurse.id, { title: "Keep me" });
    const toVoid = await createAgreement(agent, nurse.id, { title: "Void me" });

    const voidRes = await agent.post(`/api/agreements/${toVoid.id}/void`).send({ reason: "issued in error" });
    expect(voidRes.status).toBe(200);
    expect(voidRes.body.agreement.status).toBe("voided");

    const portalRes = await supertest(app).get(`/api/portal/${link.token}/agreements`);
    expect(portalRes.status).toBe(200);
    const ids = portalRes.body.agreements.map((a: any) => a.id);
    expect(ids).toContain(keep.id);
    expect(ids).not.toContain(toVoid.id);

    const badToken = await supertest(app).get(`/api/portal/not-a-real-token/agreements`);
    expect([401, 403, 404]).toContain(badToken.status);
  });

  it("signing requires read confirmation and a typed signature", async () => {
    const nurse = await createTestNurse(agent, {});
    const link = await createPortalLink(agent, nurse.id);
    const created = await createAgreement(agent, nurse.id);

    const noConfirm = await supertest(app)
      .post(`/api/portal/${link.token}/agreements/${created.id}/sign`)
      .send({ signatureName: nurse.fullName });
    expect(noConfirm.status).toBe(400);

    const noName = await supertest(app)
      .post(`/api/portal/${link.token}/agreements/${created.id}/sign`)
      .send({ confirmRead: true, signatureName: "" });
    expect(noName.status).toBe(400);
  });

  it("signs the agreement, stores a signed PDF documents row, and blocks double-signing", async () => {
    const nurse = await createTestNurse(agent, {});
    const link = await createPortalLink(agent, nurse.id);
    const created = await createAgreement(agent, nurse.id, { title: "Sign me" });

    const signRes = await supertest(app)
      .post(`/api/portal/${link.token}/agreements/${created.id}/sign`)
      .set("User-Agent", "vitest-agent")
      .send({ confirmRead: true, signatureName: nurse.fullName });
    expect(signRes.status).toBe(200);
    expect(signRes.body.agreement.status).toBe("signed");
    expect(signRes.body.agreement.signatureName).toBe(nurse.fullName);
    expect(signRes.body.signedPdfDocumentId).toBeTruthy();

    // Admin view exposes signature metadata + signed PDF linkage.
    const adminList = await agent.get(`/api/nurses/${nurse.id}/agreements`);
    const row = adminList.body.agreements.find((a: any) => a.id === created.id);
    expect(row.status).toBe("signed");
    expect(row.signedPdfDocumentId).toBe(signRes.body.signedPdfDocumentId);
    expect(row.userAgent).toBe("vitest-agent");
    expect(row.signedAt).toBeTruthy();

    // Double sign → 409.
    const again = await supertest(app)
      .post(`/api/portal/${link.token}/agreements/${created.id}/sign`)
      .send({ confirmRead: true, signatureName: nurse.fullName });
    expect(again.status).toBe(409);
  });

  it("a nurse cannot sign another nurse's agreement", async () => {
    const nurseA = await createTestNurse(agent, {});
    const nurseB = await createTestNurse(agent, {});
    const linkB = await createPortalLink(agent, nurseB.id);
    const created = await createAgreement(agent, nurseA.id);

    const res = await supertest(app)
      .post(`/api/portal/${linkB.token}/agreements/${created.id}/sign`)
      .send({ confirmRead: true, signatureName: "Wrong Nurse" });
    expect(res.status).toBe(404);
  });

  it("voiding or replacing is blocked once signed; replace works while pending", async () => {
    const nurse = await createTestNurse(agent, {});
    const link = await createPortalLink(agent, nurse.id);
    const created = await createAgreement(agent, nurse.id);

    // Replace while pending works and swaps the source document.
    const replaceRes = await agent
      .post(`/api/agreements/${created.id}/replace-document`)
      .attach("file", makeTempPdf());
    expect(replaceRes.status).toBe(200);
    expect(replaceRes.body.agreement.sourceDocument.id).not.toBe(created.sourceDocument.id);

    const signRes = await supertest(app)
      .post(`/api/portal/${link.token}/agreements/${created.id}/sign`)
      .send({ confirmRead: true, signatureName: nurse.fullName });
    expect(signRes.status).toBe(200);

    const voidRes = await agent.post(`/api/agreements/${created.id}/void`).send({});
    expect(voidRes.status).toBe(409);

    const replaceAfter = await agent
      .post(`/api/agreements/${created.id}/replace-document`)
      .attach("file", makeTempPdf());
    expect(replaceAfter.status).toBe(409);
  });

  it("rejects non-PDF/Word uploads for agreements", async () => {
    const nurse = await createTestNurse(agent, {});
    const png = path.join(os.tmpdir(), `agreement-${Date.now()}.png`);
    fs.writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const res = await agent
      .post(`/api/nurses/${nurse.id}/agreements`)
      .field("title", "Image should be rejected")
      .attach("file", png);
    expect(res.status).toBe(400);
  });

  it("concurrent sign requests: exactly one wins, the rest get 409", async () => {
    const nurse = await createTestNurse(agent, {});
    const link = await createPortalLink(agent, nurse.id);
    const created = await createAgreement(agent, nurse.id, { title: "Race me" });

    const results = await Promise.all(
      [1, 2, 3].map(() =>
        supertest(app)
          .post(`/api/portal/${link.token}/agreements/${created.id}/sign`)
          .send({ confirmRead: true, signatureName: nurse.fullName }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(2);

    const adminList = await agent.get(`/api/nurses/${nurse.id}/agreements`);
    const row = adminList.body.agreements.find((a: any) => a.id === created.id);
    expect(row.status).toBe("signed");
    expect(row.signedPdfDocumentId).toBeTruthy();
  });

  it("a PDF persistence failure leaves the agreement pending and retryable", async () => {
    const nurse = await createTestNurse(agent, {});
    const link = await createPortalLink(agent, nurse.id);
    const created = await createAgreement(agent, nurse.id, { title: "Storage failure" });

    // Force the certificate write to fail — the signature must NOT be
    // recorded (agreement stays pending, no signed-but-PDF-less row).
    const spy = vi
      .spyOn(fs.promises, "writeFile")
      .mockRejectedValueOnce(new Error("disk full (simulated)"));
    try {
      const failRes = await supertest(app)
        .post(`/api/portal/${link.token}/agreements/${created.id}/sign`)
        .send({ confirmRead: true, signatureName: nurse.fullName });
      expect(failRes.status).toBe(500);
    } finally {
      spy.mockRestore();
    }

    const listRes = await agent.get(`/api/nurses/${nurse.id}/agreements`);
    const row = listRes.body.agreements.find((a: any) => a.id === created.id);
    expect(row.status).toBe("pending");
    expect(row.signedPdfDocumentId).toBeNull();

    // Retry succeeds and yields the linked certificate.
    const retryRes = await supertest(app)
      .post(`/api/portal/${link.token}/agreements/${created.id}/sign`)
      .send({ confirmRead: true, signatureName: nurse.fullName });
    expect(retryRes.status).toBe(200);
    expect(retryRes.body.agreement.status).toBe("signed");
    expect(retryRes.body.agreement.signedPdfDocumentId).toBeTruthy();
  });

  it("portal summary includes an agreements count block", async () => {
    const nurse = await createTestNurse(agent, {});
    const link = await createPortalLink(agent, nurse.id);
    await createAgreement(agent, nurse.id);

    const res = await supertest(app).get(`/api/portal/${link.token}`);
    expect(res.status).toBe(200);
    expect(res.body.agreements).toBeTruthy();
    expect(res.body.agreements.total).toBeGreaterThanOrEqual(1);
    expect(res.body.agreements.outstanding).toBeGreaterThanOrEqual(1);
  });
});
