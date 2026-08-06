// Signature-certificate PDF for an individual nurse agreement (task 191).
// The agreement content itself is the admin-uploaded document; this PDF is
// the signature record that references it — same NAVY/GOLD palette and
// signature-block shape as the Service Agreement PDF.

import PDFDocument from "pdfkit";
import type { NurseAgreement, Nurse } from "@shared/schema";

const NAVY = "#020121";
const GOLD = "#C8A96E";
const DARK_GREY = "#333333";
const MED_GREY = "#666666";

const CONTEXT_LABELS: Record<string, string> = {
  project: "Project",
  patient: "Patient",
  deployment: "Deployment",
  other: "Agreement",
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export async function generateAgreementSignaturePDF(
  agreement: NurseAgreement,
  nurse: Pick<Nurse, "fullName" | "email">,
  sourceDocument: { originalFilename: string | null; filename: string },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: `${agreement.title} — Signature Record — ${nurse.fullName}`,
        Author: "Livaware Ltd – NurseOnboard",
        Subject: "Signed Individual Agreement",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftMargin = doc.page.margins.left;

    // Header
    doc.fillColor(NAVY).fontSize(20).font("Helvetica-Bold")
      .text("Individual Agreement — Signature Record", leftMargin, doc.y);
    doc.moveTo(leftMargin, doc.y + 4).lineTo(leftMargin + pageWidth, doc.y + 4)
      .strokeColor(GOLD).lineWidth(2).stroke();
    doc.moveDown(1);

    doc.fillColor(NAVY).fontSize(14).font("Helvetica-Bold")
      .text(agreement.title, { width: pageWidth });
    doc.moveDown(0.4);

    const contextKind = CONTEXT_LABELS[agreement.contextType] ?? "Agreement";
    doc.fillColor(MED_GREY).fontSize(9).font("Helvetica");
    doc.text(`Type: ${contextKind}${agreement.contextLabel ? ` — ${agreement.contextLabel}` : ""}`);
    doc.text(`Nurse: ${nurse.fullName}`);
    if (nurse.email) doc.text(`Email: ${nurse.email}`);
    doc.text(`Signed: ${formatDate(agreement.signedAt)}`);
    if (agreement.ipAddress) doc.text(`IP address: ${agreement.ipAddress}`);
    doc.moveDown(0.8);

    doc.fillColor(DARK_GREY).fontSize(9.5).font("Helvetica").text(
      "This document certifies that the nurse named above has read and electronically " +
      "signed the individual agreement identified below. The agreement content is the " +
      "attached/referenced document; this certificate records the execution details.",
      { width: pageWidth, align: "justify" },
    );
    doc.moveDown(0.8);

    // Referenced document
    doc.fillColor(NAVY).fontSize(11).font("Helvetica-Bold").text("Agreement document");
    doc.moveDown(0.2);
    doc.fillColor(DARK_GREY).fontSize(9.5).font("Helvetica");
    doc.text(`Document: ${sourceDocument.originalFilename || sourceDocument.filename}`);
    doc.text(`Stored file: ${sourceDocument.filename}`);
    doc.text(`Agreement reference: ${agreement.id}`);
    doc.moveDown(0.8);

    // Signature block
    doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y)
      .strokeColor(GOLD).lineWidth(0.8).stroke();
    doc.moveDown(0.6);
    doc.fillColor(NAVY).fontSize(12).font("Helvetica-Bold").text("Signature");
    doc.moveDown(0.2);
    doc.fillColor(DARK_GREY).fontSize(9.5).font("Helvetica");
    doc.text(
      "By typing their full legal name, the signatory confirmed they had read, " +
      "understood, and agreed to be bound by the agreement document referenced above.",
      { width: pageWidth },
    );
    doc.moveDown(0.6);
    doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text("The Nurse");
    doc.fillColor(DARK_GREY).fontSize(9.5).font("Helvetica");
    doc.text(`Signed (typed):  ${agreement.signatureName || "—"}`);
    doc.text(`Name:  ${agreement.signatureName || nurse.fullName}`);
    doc.text(`Date:  ${formatDate(agreement.signedAt)}`);

    // Page footers
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const footerY = doc.page.height - doc.page.margins.bottom + 10;
      doc.fillColor(MED_GREY).fontSize(8).font("Helvetica")
        .text(
          `Livaware NurseOnboard · Individual Agreement Signature Record · Page ${i + 1} of ${range.count}`,
          leftMargin, footerY, { width: pageWidth, align: "center" },
        );
    }

    doc.end();
  });
}
