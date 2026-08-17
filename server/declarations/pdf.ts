// PDF generator for completed onboarding declarations (task 121).
// Reuses the NAVY/GOLD palette from server/pdf-generator.ts.

import PDFDocument from "pdfkit";
import type { DeclarationDefinition, DeclarationQuestion } from "./registry";
import { isFileAnswer } from "./registry";
import type { NurseDeclaration, Nurse } from "@shared/schema";

const NAVY = "#020121";
const GOLD = "#C8A96E";
const DARK_GREY = "#333333";
const MED_GREY = "#666666";

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function answerLabel(q: DeclarationQuestion, value: unknown): string {
  if (value === undefined || value === null || value === "") return "— Not answered —";
  switch (q.type) {
    case "boolean":
      return value === true ? "Yes" : value === false ? "No" : String(value);
    case "enum": {
      const opt = q.options?.find((o) => o.value === value);
      return opt ? opt.label : String(value);
    }
    case "date":
      return String(value);
    case "number":
      return String(value);
    case "file":
      return isFileAnswer(value)
        ? `Uploaded: ${value.originalFilename} (${Math.round(value.fileSize / 1024)} KB)`
        : "— Not uploaded —";
    default:
      return String(value);
  }
}

export async function generateDeclarationPDF(
  declaration: DeclarationDefinition,
  record: NurseDeclaration,
  nurse: Pick<Nurse, "fullName" | "email">,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: `${declaration.title} — ${nurse.fullName}`,
        Author: "Livaware Ltd – Basecamp",
        Subject: `Onboarding declaration: ${declaration.key}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftMargin = doc.page.margins.left;

    function ensureSpace(needed: number) {
      if (doc.y + needed > doc.page.height - doc.page.margins.bottom - 30) {
        doc.addPage();
        doc.x = leftMargin;
        doc.y = doc.page.margins.top;
      }
    }

    // Header
    doc.fillColor(NAVY).fontSize(20).font("Helvetica-Bold").text(declaration.title, leftMargin, doc.y);
    doc.moveTo(leftMargin, doc.y + 4).lineTo(leftMargin + pageWidth, doc.y + 4)
      .strokeColor(GOLD).lineWidth(2).stroke();
    doc.moveDown(1);

    doc.fillColor(MED_GREY).fontSize(9).font("Helvetica")
      .text(`Candidate: ${nurse.fullName}`, { continued: false });
    doc.text(`Email: ${nurse.email}`);
    doc.text(`Submitted: ${formatDate(record.submittedAt || record.updatedAt)}`);
    doc.text(`Version: ${record.version}`);
    if (record.ipAddress) doc.text(`IP address: ${record.ipAddress}`);
    doc.moveDown(0.5);

    // Intro
    if (declaration.intro) {
      doc.fillColor(DARK_GREY).fontSize(10).font("Helvetica").text(declaration.intro, {
        width: pageWidth, align: "justify",
      });
      doc.moveDown(0.5);
    }

    if (declaration.legalReferences && declaration.legalReferences.length > 0) {
      doc.fillColor(MED_GREY).fontSize(8).font("Helvetica-Oblique")
        .text("References: " + declaration.legalReferences.join("; "), { width: pageWidth });
      doc.moveDown(0.8);
    }

    // Questions + answers
    const answers = (record.answers as Record<string, unknown>) || {};
    for (const q of declaration.questions) {
      ensureSpace(50);
      doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold")
        .text(q.prompt, leftMargin, doc.y, { width: pageWidth });
      if (q.helpText) {
        doc.fillColor(MED_GREY).fontSize(8).font("Helvetica-Oblique")
          .text(q.helpText, { width: pageWidth });
      }
      doc.moveDown(0.15);
      doc.fillColor(DARK_GREY).fontSize(10).font("Helvetica")
        .text(answerLabel(q, answers[q.id]), { width: pageWidth });
      doc.moveDown(0.5);
    }

    // Signature
    ensureSpace(80);
    doc.moveDown(0.5);
    doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y)
      .strokeColor(GOLD).lineWidth(0.8).stroke();
    doc.moveDown(0.6);
    doc.fillColor(NAVY).fontSize(11).font("Helvetica-Bold").text("Signature", leftMargin, doc.y);
    doc.fillColor(DARK_GREY).fontSize(10).font("Helvetica")
      .text(`Signed by: ${record.signatureName || "—"}`);
    doc.text(`Date: ${formatDate(record.submittedAt)}`);

    // Page footers
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const footerY = doc.page.height - doc.page.margins.bottom + 10;
      doc.fillColor(MED_GREY).fontSize(8).font("Helvetica")
        .text(
          `Basecamp by Livaware Ltd · ${declaration.title} · Page ${i + 1} of ${range.count}`,
          leftMargin, footerY, { width: pageWidth, align: "center" },
        );
    }

    doc.end();
  });
}
