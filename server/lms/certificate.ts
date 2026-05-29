// LMS completion certificate generator.
// Renders a branded A4 (landscape) PDF certificate when a nurse completes a
// training course, writes it to the uploads dir, mirrors it to object storage,
// and persists a `documents` row (type "lms_certificate") so the nurse can
// re-download it from their portal and admins can see it in the matrix.
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { storage } from "../storage";
import { uploadsDir } from "../middleware";
import { triggerBucketMirror } from "../object-storage";
import type { Document } from "@shared/schema";

const NAVY = "#020121";
const GOLD = "#C8A96E";
const DARK_GREY = "#333333";
const MED_GREY = "#666666";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export interface LmsCertificateInput {
  nurseId: string;
  nurseName: string;
  courseTitle: string;
  completedAt: Date;
  score?: number | null;
  issuedBy?: string;
}

async function buildCertificatePdf(input: LmsCertificateInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Certificate of Completion — ${input.courseTitle}`,
        Author: "Livaware Ltd – NurseOnboard",
        Subject: `Training certificate for ${input.nurseName}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width;
    const pageH = doc.page.height;

    // Background + double border frame
    doc.rect(0, 0, pageW, pageH).fill("#FCFAF5");
    doc.lineWidth(3).strokeColor(NAVY).rect(24, 24, pageW - 48, pageH - 48).stroke();
    doc.lineWidth(1).strokeColor(GOLD).rect(34, 34, pageW - 68, pageH - 68).stroke();

    const centerX = pageW / 2;

    doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(13);
    doc.text("NURSEONBOARD · LIVAWARE LTD", 0, 80, { align: "center", characterSpacing: 3 });

    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(40);
    doc.text("Certificate of Completion", 0, 120, { align: "center" });

    doc.moveTo(centerX - 70, 178).lineTo(centerX + 70, 178).lineWidth(2).strokeColor(GOLD).stroke();

    doc.fillColor(MED_GREY).font("Helvetica").fontSize(14);
    doc.text("This is to certify that", 0, 205, { align: "center" });

    doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(30);
    doc.text(input.nurseName, 0, 232, { align: "center" });

    doc.fillColor(MED_GREY).font("Helvetica").fontSize(14);
    doc.text("has successfully completed the training course", 0, 280, { align: "center" });

    doc.fillColor(GOLD).font("Helvetica-Bold").fontSize(22);
    doc.text(input.courseTitle, 60, 308, { align: "center", width: pageW - 120 });

    if (typeof input.score === "number") {
      doc.fillColor(DARK_GREY).font("Helvetica").fontSize(13);
      doc.text(`Assessment score: ${input.score}%`, 0, 352, { align: "center" });
    }

    // Footer: date + signature line
    const footerY = pageH - 130;
    doc.fillColor(DARK_GREY).font("Helvetica").fontSize(12);
    doc.text(`Date of completion: ${fmtDate(input.completedAt)}`, 80, footerY, { align: "left" });

    doc.moveTo(pageW - 280, footerY + 14).lineTo(pageW - 80, footerY + 14).lineWidth(1).strokeColor(MED_GREY).stroke();
    doc.fillColor(MED_GREY).font("Helvetica").fontSize(10);
    doc.text("Livaware Onboarding Team", pageW - 280, footerY + 20, { width: 200, align: "center" });

    doc.end();
  });
}

/**
 * Generate the certificate PDF, persist it to disk + object storage, and create
 * a `documents` row for the nurse. Returns the created document.
 */
export async function issueLmsCertificate(input: LmsCertificateInput): Promise<Document> {
  const pdf = await buildCertificatePdf(input);

  const safeTitle = input.courseTitle.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "course";
  const filename = `lms-cert-${safeTitle}-${crypto.randomBytes(6).toString("hex")}.pdf`;

  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, filename), pdf);
  triggerBucketMirror(filename);

  const document = await storage.createDocument({
    nurseId: input.nurseId,
    type: "lms_certificate",
    category: "training",
    filename,
    originalFilename: `Certificate - ${input.courseTitle}.pdf`,
    filePath: `/api/uploads/${filename}`,
    fileSize: pdf.length,
    mimeType: "application/pdf",
    uploadedBy: input.issuedBy || "system",
    notes: `Auto-issued on completion of "${input.courseTitle}".`,
  });

  return document;
}
