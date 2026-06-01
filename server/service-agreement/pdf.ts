// PDF generator for the signed Service Agreement (task 170). Renders the full
// agreement body + the nurse's completed identity fields + their typed
// signature + Livaware's countersignature. Reuses the NAVY/GOLD palette.

import PDFDocument from "pdfkit";
import type { NurseDeclaration, Nurse } from "@shared/schema";
import {
  SERVICE_AGREEMENT_FIELDS,
  renderClauses,
  type ServiceAgreementConfig,
} from "./contract";

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

export async function generateServiceAgreementPDF(
  record: NurseDeclaration,
  nurse: Pick<Nurse, "fullName" | "email">,
  config: ServiceAgreementConfig,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: `${config.title} — ${nurse.fullName}`,
        Author: "Livaware Ltd – NurseOnboard",
        Subject: "Signed Service Agreement (Registered Nurse)",
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
    doc.fillColor(NAVY).fontSize(20).font("Helvetica-Bold").text(config.title, leftMargin, doc.y);
    doc.moveTo(leftMargin, doc.y + 4).lineTo(leftMargin + pageWidth, doc.y + 4)
      .strokeColor(GOLD).lineWidth(2).stroke();
    doc.moveDown(1);

    doc.fillColor(MED_GREY).fontSize(9).font("Helvetica")
      .text(`Subcontractor: ${nurse.fullName}`);
    if (nurse.email) doc.text(`Email: ${nurse.email}`);
    doc.text(`Signed: ${formatDate(record.submittedAt || record.updatedAt)}`);
    doc.text(`Version: ${record.version}`);
    if (record.ipAddress) doc.text(`IP address: ${record.ipAddress}`);
    doc.moveDown(0.6);

    // Preamble
    for (const para of config.preamble) {
      doc.fillColor(DARK_GREY).fontSize(9.5).font("Helvetica")
        .text(para, { width: pageWidth, align: "left" });
      doc.moveDown(0.35);
    }
    doc.moveDown(0.3);

    // Clauses
    const clauses = renderClauses(config);
    for (const clause of clauses) {
      ensureSpace(40);
      doc.fillColor(NAVY).fontSize(11).font("Helvetica-Bold")
        .text(`${clause.number}.  ${clause.title}`, leftMargin, doc.y, { width: pageWidth });
      doc.moveDown(0.25);
      for (const item of clause.items) {
        ensureSpace(28);
        doc.fillColor(DARK_GREY).fontSize(9.5).font("Helvetica")
          .text(`${item.n}   ${item.text}`, leftMargin, doc.y, { width: pageWidth, align: "justify" });
        doc.moveDown(0.35);
      }
      doc.moveDown(0.25);
    }

    // Execution / signatures
    ensureSpace(180);
    doc.moveDown(0.4);
    doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y)
      .strokeColor(GOLD).lineWidth(0.8).stroke();
    doc.moveDown(0.6);
    doc.fillColor(NAVY).fontSize(12).font("Helvetica-Bold").text("Signatures", leftMargin, doc.y);
    doc.moveDown(0.2);
    doc.fillColor(DARK_GREY).fontSize(9.5).font("Helvetica")
      .text(config.executionNote, { width: pageWidth });
    doc.moveDown(0.6);

    // Livaware
    doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text("For and on behalf of Livaware Ltd");
    doc.fillColor(DARK_GREY).fontSize(9.5).font("Helvetica")
      .text(`Signed:  ${config.countersignatoryName}`);
    doc.text(`Name:  ${config.countersignatoryName}     Position:  ${config.countersignatoryPosition}`);
    doc.text(`Date:  ${formatDate(record.submittedAt)}`);
    doc.moveDown(0.6);

    // Subcontractor
    const answers = (record.answers as Record<string, unknown>) || {};
    doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text("The Subcontractor");
    doc.fillColor(DARK_GREY).fontSize(9.5).font("Helvetica")
      .text(`Signed (typed):  ${record.signatureName || "—"}`);
    doc.text(`Name:  ${record.signatureName || nurse.fullName}`);
    doc.text(`Date:  ${formatDate(record.submittedAt)}`);
    for (const field of SERVICE_AGREEMENT_FIELDS) {
      const raw = answers[field.id];
      const value = typeof raw === "string" && raw.trim() ? raw : (field.required ? "—" : "Not provided");
      doc.text(`${field.label}:  ${value}`);
    }

    // Page footers
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const footerY = doc.page.height - doc.page.margins.bottom + 10;
      doc.fillColor(MED_GREY).fontSize(8).font("Helvetica")
        .text(
          `Livaware NurseOnboard · ${config.title} · Page ${i + 1} of ${range.count}`,
          leftMargin, footerY, { width: pageWidth, align: "center" },
        );
    }

    doc.end();
  });
}
