import type { Express } from "express";
import { describe, it, expect, beforeAll, vi } from "vitest";
import supertest from "supertest";
import path from "path";
import fs from "fs";
import os from "os";
import { getTestApp, createTestNurse, createPortalLink } from "./helpers";

// Task 195 — issue email: mock the mailer so we can (a) force the
// "Outlook configured" branch and (b) assert the fire-and-forget send
// without touching Graph. All other outlook exports stay real.
vi.mock("../server/outlook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/outlook")>();
  return {
    ...actual,
    isOutlookConfigured: () => true,
    sendIndividualAgreementIssuedEmail: vi.fn().mockResolvedValue(undefined),
  };
});
import { sendIndividualAgreementIssuedEmail } from "../server/outlook";

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

  // ─── Task 195 — in-app content extraction + issue email ───────────

  async function makeRealPdf(text: string): Promise<string> {
    const { default: PDFDocument } = await import("pdfkit");
    const p = path.join(os.tmpdir(), `agreement-real-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument();
      const stream = fs.createWriteStream(p);
      doc.pipe(stream);
      doc.fontSize(14).text(text);
      doc.end();
      stream.on("finish", () => resolve());
      stream.on("error", reject);
    });
    return p;
  }

  it("extracts document text on create so the portal can render the agreement in-app", async () => {
    const nurse = await createTestNurse(agent, {});
    const link = await createPortalLink(agent, nurse.id);
    const pdf = await makeRealPdf("The nurse agrees to provide care with dignity and respect at all times.");
    const res = await agent
      .post(`/api/nurses/${nurse.id}/agreements`)
      .field("title", "Readable agreement")
      .attach("file", pdf);
    expect(res.status).toBe(201);
    expect(res.body.agreement.contentMarkdown).toContain("dignity and respect");
    expect(res.body.agreement.extractionError).toBeNull();

    // Portal list carries the same content for in-app rendering.
    const portalRes = await supertest(app).get(`/api/portal/${link.token}/agreements`);
    const row = portalRes.body.agreements.find((a: any) => a.id === res.body.agreement.id);
    expect(row.contentMarkdown).toContain("dignity and respect");
  });

  it("records an extraction failure and leaves content null so the client falls back to the file view", async () => {
    const nurse = await createTestNurse(agent, {});
    // makeTempPdf writes a not-really-parseable PDF — extraction must fail
    // gracefully without blocking creation.
    const created = await createAgreement(agent, nurse.id, { title: "Unparseable" });
    expect(created.contentMarkdown).toBeNull();
    expect(created.extractionError).toBeTruthy();
  });

  it("replace-document re-extracts content for the new file", async () => {
    const nurse = await createTestNurse(agent, {});
    const created = await createAgreement(agent, nurse.id, { title: "Swap me" });
    expect(created.contentMarkdown).toBeNull();

    const pdf = await makeRealPdf("Replacement clause: the deployment starts on Monday.");
    const replaceRes = await agent
      .post(`/api/agreements/${created.id}/replace-document`)
      .attach("file", pdf);
    expect(replaceRes.status).toBe(200);
    expect(replaceRes.body.agreement.contentMarkdown).toContain("Replacement clause");
    expect(replaceRes.body.agreement.extractionError).toBeNull();
  });

  it("emails the nurse (fire-and-forget) when an agreement is issued", async () => {
    const mockSend = vi.mocked(sendIndividualAgreementIssuedEmail);
    mockSend.mockClear();
    const nurse = await createTestNurse(agent, {});
    const created = await createAgreement(agent, nurse.id, {
      title: "Emailed agreement",
      contextType: "patient",
      contextLabel: "Patient X",
    });
    expect(created.status).toBe("pending");

    await vi.waitFor(() => {
      expect(mockSend).toHaveBeenCalled();
    }, { timeout: 5000 });
    const [email, name, portalUrl, title, contextLine] = mockSend.mock.calls[0];
    expect(email).toBe(nurse.email);
    expect(name).toBe(nurse.fullName);
    expect(portalUrl).toContain("/portal/");
    expect(title).toBe("Emailed agreement");
    expect(contextLine).toContain("Patient X");
  });

  // ─── Task 201 — sealed signed PDF (wording + execution details) ────

  // Pull a stored document down as a Buffer and read its text back out with
  // the same extractor the app uses for uploads.
  async function downloadPdfText(documentId: string): Promise<string> {
    const res = await agent
      .get(`/api/documents/${documentId}/download`)
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
        response.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const buffer = res.body as Buffer;
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    const { extractPolicyFromFile } = await import("../server/policy-extractor");
    const { body } = await extractPolicyFromFile(buffer, "signed.pdf", "application/pdf");
    return body;
  }

  it("the signed PDF contains the agreement wording and the execution details", async () => {
    const nurse = await createTestNurse(agent, {});
    const link = await createPortalLink(agent, nurse.id);
    const pdf = await makeRealPdf(
      "Clause one: the nurse shall attend the twilight shift at Rosewood House.",
    );
    const createRes = await agent
      .post(`/api/nurses/${nurse.id}/agreements`)
      .field("title", "Sealed agreement")
      .attach("file", pdf);
    expect(createRes.status).toBe(201);

    const signRes = await supertest(app)
      .post(`/api/portal/${link.token}/agreements/${createRes.body.agreement.id}/sign`)
      .set("User-Agent", "vitest-sealer")
      .send({ confirmRead: true, signatureName: nurse.fullName });
    expect(signRes.status).toBe(200);

    const text = await downloadPdfText(signRes.body.signedPdfDocumentId);
    // The wording itself, not just a pointer to the uploaded file.
    expect(text).toContain("twilight shift at Rosewood House");
    // …followed by the execution block.
    expect(text).toContain("Execution");
    expect(text).toContain(nurse.fullName);
    expect(text).toContain("vitest-sealer");
    expect(text).toContain("SHA-256 fingerprint");
  });

  it("degrades to certifying the original when the wording could not be extracted", async () => {
    const nurse = await createTestNurse(agent, {});
    const link = await createPortalLink(agent, nurse.id);
    const created = await createAgreement(agent, nurse.id, { title: "Unreadable original" });
    expect(created.contentMarkdown).toBeNull();

    const signRes = await supertest(app)
      .post(`/api/portal/${link.token}/agreements/${created.id}/sign`)
      .send({ confirmRead: true, signatureName: nurse.fullName });
    expect(signRes.status).toBe(200);

    const text = await downloadPdfText(signRes.body.signedPdfDocumentId);
    expect(text).toContain("could not be reproduced");
    expect(text).toContain("Execution");
    expect(text).toContain(nurse.fullName);
  });

  it("regenerating rebuilds a legacy record with the wording and supersedes the old PDF", async () => {
    const { db } = await import("../server/db");
    const { nurseAgreements } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");

    const nurse = await createTestNurse(agent, {});
    const link = await createPortalLink(agent, nurse.id);
    const pdf = await makeRealPdf("Legacy clause: mileage is reimbursed at the standard rate.");
    const createRes = await agent
      .post(`/api/nurses/${nurse.id}/agreements`)
      .field("title", "Legacy agreement")
      .attach("file", pdf);
    const agreementId = createRes.body.agreement.id as string;

    // Simulate a record signed before the wording was captured/embedded.
    await db
      .update(nurseAgreements)
      .set({ contentMarkdown: null, extractionError: "legacy" })
      .where(eq(nurseAgreements.id, agreementId));

    const signRes = await supertest(app)
      .post(`/api/portal/${link.token}/agreements/${agreementId}/sign`)
      .send({ confirmRead: true, signatureName: nurse.fullName });
    expect(signRes.status).toBe(200);
    const oldDocId = signRes.body.signedPdfDocumentId as string;
    expect(await downloadPdfText(oldDocId)).not.toContain("mileage is reimbursed");

    const regen = await agent
      .post(`/api/agreements/regenerate-signed-pdfs`)
      .send({ agreementIds: [agreementId] });
    expect(regen.status).toBe(200);
    expect(regen.body.regenerated).toBe(1);
    expect(regen.body.failed).toHaveLength(0);

    const listRes = await agent.get(`/api/nurses/${nurse.id}/agreements`);
    const row = listRes.body.agreements.find((a: any) => a.id === agreementId);
    expect(row.status).toBe("signed");
    expect(row.signatureName).toBe(nurse.fullName);
    expect(row.signedPdfDocumentId).not.toBe(oldDocId);

    const rebuilt = await downloadPdfText(row.signedPdfDocumentId);
    expect(rebuilt).toContain("mileage is reimbursed");
    expect(rebuilt).toContain(nurse.fullName);

    // The superseded record is cleaned up rather than left in the file list.
    await vi.waitFor(async () => {
      const gone = await agent.get(`/api/documents/${oldDocId}/download`);
      expect(gone.status).toBe(404);
    }, { timeout: 5000 });
  });

  it("regeneration is admin-only", async () => {
    const res = await supertest(app).post(`/api/agreements/regenerate-signed-pdfs`).send({});
    expect(res.status).toBe(401);
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
