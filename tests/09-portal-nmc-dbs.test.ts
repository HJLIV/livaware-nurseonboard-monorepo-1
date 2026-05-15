import type { Express } from "express";
import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { getTestApp, createTestNurse, createPortalLink, createTestCandidate } from "./helpers";

async function buildNmcRegisterPdfBuffer(): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(12).text("Test Nurse");
    doc.text("London");
    doc.text("31/03/2027");
    doc.text("Registration status");
    doc.text("Registered");
    doc.text("Register entry");
    doc.text("Registered Nurse - Sub Part 1: Adult Nursing");
    doc.text("01/01/2020");
    doc.text("PIN: 18A1234C");
    doc.end();
  });
}

describe("Portal NMC & DBS Verification Routes", () => {
  let app: Express;
  let agent: supertest.Agent;
  let portalToken: string;

  beforeAll(async () => {
    const result = await getTestApp();
    app = result.app;
    agent = supertest.agent(app);
    await agent.post("/api/auth/login").send({ username: "admin", password: "admin" });
    const nurse = await createTestNurse(agent);
    const link = await createPortalLink(agent, nurse.id, "onboard");
    portalToken = link.token;
  });

  // T42
  it("T42: POST /api/portal/:token/dbs-verification — submits DBS number for verification", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/dbs-verification`).send({
      certificateNumber: "001234567890",
      certificateType: "Enhanced",
    });
    expect(res.status).toBe(201);
    expect(res.body.certificateNumber).toBe("001234567890");
    expect(res.body.certificateType).toBe("Enhanced");
    expect(res.body.id).toBeDefined();
  });

  // T43
  it("T43: POST /api/portal/:token/dbs-verification — fails with missing certificate number", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/dbs-verification`).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/certificateNumber/i);
  });

  // T44
  it("T44: POST /api/candidates/:id/nmc-verify — fails with invalid PIN format", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/nmc-verify`).send({
      pin: "INVALID",
      registrationStatus: "Registered",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid.*pin/i);
  });

  // T45
  it("T45: POST /api/candidates/:id/nmc-verify — fails with missing pin", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/nmc-verify`).send({
      registrationStatus: "Registered",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/pin.*required/i);
  });

  // T46
  it("T46: GET /api/candidates/:id/nmc-verification — retrieves NMC verification status", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.get(`/api/candidates/${candidate.id}/nmc-verification`);
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe("object");
  });

  // T47
  it("T47: POST /api/portal/:token/nmc-parse-pdf — rejects request without file upload", async () => {
    const res = await supertest(app).post(`/api/portal/${portalToken}/nmc-parse-pdf`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no file/i);
  });

  // T48: Pending portal-uploaded NMC verification surfaces to admin GET with linked document.
  it("T48: GET /api/candidates/:id/nmc-verification returns pending portal upload + document link", async () => {
    const { storage } = await import("../server/storage");
    const nurse = await createTestNurse(agent);
    const link = await createPortalLink(agent, nurse.id, "onboard");
    const doc = await storage.createDocument({
      nurseId: nurse.id,
      type: "NMC Register PDF",
      filename: `nmc-${Date.now()}.pdf`,
      originalFilename: "nmc-register.pdf",
      filePath: `/api/uploads/nmc-${Date.now()}.pdf`,
      fileSize: 1024,
      mimeType: "application/pdf",
      category: "nmc",
      uploadedBy: "nurse",
    } as any);
    await storage.createNmcVerification({
      nurseId: nurse.id,
      pin: "PENDING",
      registeredName: "Test Nurse",
      registrationStatus: "Registered",
      fieldOfPractice: "Adult Nursing",
      conditions: [],
      effectiveDate: null,
      renewalDate: null,
      status: "pending",
      verifiedAt: null,
      rawResponse: {
        pdfVerification: true,
        evidenceFilename: doc.filename,
        originalFilename: doc.originalFilename,
        documentId: doc.id,
        extractionMethod: "parsed",
        source: "portal_upload",
      },
    } as any);

    const res = await agent.get(`/api/candidates/${nurse.id}/nmc-verification`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending");
    expect(res.body.document).toBeTruthy();
    expect(res.body.document.id).toBe(doc.id);
    expect(res.body.rawResponse.source).toBe("portal_upload");

    // Portal GET also reflects the persisted submission (survives refresh).
    const portalRes = await supertest(app).get(`/api/portal/${link.token}/nmc-verification`);
    expect(portalRes.status).toBe(200);
    expect(portalRes.body.status).toBe("pending");
    expect(portalRes.body.document?.id).toBe(doc.id);
  });

  // T49: Admin confirm against a pending portal upload reuses the same row + document.
  it("T49: admin confirm reuses pending verification row, preserves documentId, no duplicate", async () => {
    const { storage } = await import("../server/storage");
    const nurse = await createTestNurse(agent);
    const doc = await storage.createDocument({
      nurseId: nurse.id,
      type: "NMC Register PDF",
      filename: `nmc-${Date.now()}-2.pdf`,
      originalFilename: "nmc-register.pdf",
      filePath: `/api/uploads/nmc-${Date.now()}-2.pdf`,
      fileSize: 1024,
      mimeType: "application/pdf",
      category: "nmc",
      uploadedBy: "nurse",
    } as any);
    const pending = await storage.createNmcVerification({
      nurseId: nurse.id,
      pin: "PENDING",
      registeredName: "Test Nurse",
      registrationStatus: "Registered",
      fieldOfPractice: "Adult Nursing",
      conditions: [],
      effectiveDate: null,
      renewalDate: null,
      status: "pending",
      verifiedAt: null,
      rawResponse: { pdfVerification: true, documentId: doc.id, source: "portal_upload", extractionMethod: "parsed" },
    } as any);

    const confirm = await agent.post(`/api/candidates/${nurse.id}/nmc-verify`).send({
      pin: "18A1234C",
      registeredName: "Test Nurse",
      registrationStatus: "Registered",
      fieldOfPractice: "Adult Nursing",
    });
    expect(confirm.status).toBe(201);
    expect(confirm.body.id).toBe(pending.id); // same row reused
    expect(confirm.body.status).toBe("verified");
    expect(confirm.body.rawResponse.documentId).toBe(doc.id);
  });

  // T51: Real PDF buffer flows through the full multipart upload path:
  // multer disk write -> parser fallback -> document creation -> pending
  // verification upsert -> portal GET + admin GET both return the same row
  // with linked document and source: portal_upload.
  it("T51: POST /api/portal/:token/nmc-parse-pdf — full upload pipeline (multipart PDF)", async () => {
    const nurse = await createTestNurse(agent);
    const link = await createPortalLink(agent, nurse.id, "onboard");
    const pdfBuffer = await buildNmcRegisterPdfBuffer();

    const res = await supertest(app)
      .post(`/api/portal/${link.token}/nmc-parse-pdf`)
      .attach("file", pdfBuffer, "nmc-register.pdf");

    expect(res.status).toBe(200);
    expect(res.body.verificationId).toBeDefined();
    expect(res.body.status).toBe("pending");
    expect(res.body.documentId).toBeDefined();
    expect(res.body.uploadedFilename).toMatch(/\.pdf$/);

    const uploadedPath = path.join(process.cwd(), "uploads", res.body.uploadedFilename);

    try {
      expect(fs.existsSync(uploadedPath)).toBe(true);

      const portalGet = await supertest(app).get(`/api/portal/${link.token}/nmc-verification`);
      expect(portalGet.status).toBe(200);
      expect(portalGet.body.id).toBe(res.body.verificationId);
      expect(portalGet.body.status).toBe("pending");
      expect(portalGet.body.document).toBeTruthy();
      expect(portalGet.body.document.id).toBe(res.body.documentId);

      const adminGet = await agent.get(`/api/candidates/${nurse.id}/nmc-verification`);
      expect(adminGet.status).toBe(200);
      expect(adminGet.body.id).toBe(res.body.verificationId);
      expect(adminGet.body.status).toBe("pending");
      expect(adminGet.body.document?.id).toBe(res.body.documentId);
      expect(adminGet.body.rawResponse?.source).toBe("portal_upload");
      expect(adminGet.body.rawResponse?.documentId).toBe(res.body.documentId);
    } finally {
      try { fs.unlinkSync(uploadedPath); } catch { /* ignore */ }
    }
  });

  // T50: Confirm endpoint surfaces a clear PIN-format error message.
  it("T50: admin confirm returns clear error message for invalid PIN", async () => {
    const candidate = await createTestCandidate(agent);
    const res = await agent.post(`/api/candidates/${candidate.id}/nmc-verify`).send({
      pin: "BADPIN",
      registrationStatus: "Registered",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid nmc pin format/i);
    expect(res.body.message).toMatch(/18A1234C/);
  });
});
