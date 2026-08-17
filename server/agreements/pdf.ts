// Sealed signed-agreement PDF for an individual nurse agreement
// (task 191, rewritten in task 201).
//
// The record is now self-contained: the agreement wording extracted from the
// admin-uploaded document is rendered into the PDF, followed by the execution
// page (typed signature, timestamp, IP, device, agreement reference and a
// SHA-256 fingerprint of the original upload). When the wording could not be
// extracted (e.g. a legacy .doc) the PDF degrades to a certificate that says
// explicitly it certifies the separately-held original document.
//
// Same NAVY/GOLD palette as the Service Agreement PDF. The file is encrypted
// with a throwaway owner password so viewers cannot silently edit it.

import PDFDocument from "pdfkit";
import crypto from "crypto";
import type { NurseAgreement, Nurse } from "@shared/schema";
import { renderMarkdownToPdf } from "../pdf/markdown-pdf";

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

export interface SignedAgreementPdfInput {
  agreement: NurseAgreement;
  nurse: Pick<Nurse, "fullName" | "email">;
  sourceDocument: { originalFilename: string | null; filename: string };
  /** SHA-256 of the original uploaded file, when it could be read. */
  fingerprint?: string | null;
}

export async function generateSignedAgreementPDF(
  input: SignedAgreementPdfInput,
): Promise<Buffer> {
  const { agreement, nurse, sourceDocument } = input;
  const fingerprint = input.fingerprint ?? null;
  const contentMarkdown = (agreement.contentMarkdown ?? "").trim();
  const hasContent = contentMarkdown.length > 0;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
      pdfVersion: "1.7",
      // Nobody needs the owner password — it exists purely so the produced
      // record is flagged as non-modifiable in conforming readers.
      ownerPassword: crypto.randomBytes(24).toString("hex"),
      permissions: {
        printing: "highResolution",
        modifying: false,
        copying: true,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true,
        documentAssembly: false,
      },
      info: {
        Title: `${agreement.title} — Signed — ${nurse.fullName}`,
        Author: "Livaware Ltd – Basecamp",
        Subject: "Signed Individual Agreement",
        Keywords: `individual agreement; ${agreement.id}${fingerprint ? `; sha256:${fingerprint}` : ""}`,
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

    // ─── Header ──────────────────────────────────────────────────────
    doc.fillColor(NAVY).fontSize(20).font("Helvetica-Bold")
      .text(agreement.title, leftMargin, doc.y, { width: pageWidth });
    doc.moveTo(leftMargin, doc.y + 4).lineTo(leftMargin + pageWidth, doc.y + 4)
      .strokeColor(GOLD).lineWidth(2).stroke();
    doc.moveDown(1);

    const contextKind = CONTEXT_LABELS[agreement.contextType] ?? "Agreement";
    doc.fillColor(MED_GREY).fontSize(9).font("Helvetica");
    doc.text(`Type: ${contextKind}${agreement.contextLabel ? ` — ${agreement.contextLabel}` : ""}`);
    doc.text(`Nurse: ${nurse.fullName}`);
    if (nurse.email) doc.text(`Email: ${nurse.email}`);
    doc.text(`Signed: ${formatDate(agreement.signedAt)}`);
    doc.text(`Agreement reference: ${agreement.id}`);
    doc.moveDown(0.8);

    // ─── Agreement wording (or the fallback notice) ──────────────────
    if (hasContent) {
      // The extracted wording usually opens with its own title — only add a
      // section label when it does not, so the page has one heading, not two.
      if (!/^#\s/.test(contentMarkdown)) {
        doc.fillColor(NAVY).fontSize(12).font("Helvetica-Bold").text("Agreement");
        doc.moveDown(0.3);
      }
      renderMarkdownToPdf(doc, contentMarkdown, {
        left: leftMargin,
        width: pageWidth,
        theme: {
          headingColor: NAVY,
          bodyColor: DARK_GREY,
          ruleColor: GOLD,
          mutedColor: MED_GREY,
          bodySize: 9.5,
        },
      });
      doc.moveDown(0.4);
      doc.fillColor(MED_GREY).fontSize(8).font("Helvetica-Oblique").text(
        "The wording above was reproduced from the agreement document issued to the nurse " +
        "and displayed to them in full before signing. The original file is retained on the " +
        "nurse's record.",
        { width: pageWidth },
      );
    } else {
      doc.fillColor(NAVY).fontSize(12).font("Helvetica-Bold").text("Agreement document");
      doc.moveDown(0.3);
      doc.fillColor(DARK_GREY).fontSize(9.5).font("Helvetica").text(
        "The wording of this agreement could not be reproduced inside this record because the " +
        "text of the issued document could not be read automatically. This document therefore " +
        "certifies the execution of the separately-held original identified below, which must " +
        "be retained alongside this record.",
        { width: pageWidth, align: "left" },
      );
    }
    doc.moveDown(0.8);

    // ─── Original document + fingerprint ─────────────────────────────
    ensureSpace(90);
    doc.fillColor(NAVY).fontSize(11).font("Helvetica-Bold").text("Original document");
    doc.moveDown(0.2);
    doc.fillColor(DARK_GREY).fontSize(9).font("Helvetica");
    doc.text(`Document: ${sourceDocument.originalFilename || sourceDocument.filename}`);
    doc.text(`Stored file: ${sourceDocument.filename}`);
    doc.text(
      fingerprint
        ? `SHA-256 fingerprint: ${fingerprint}`
        : "SHA-256 fingerprint: unavailable (the original file could not be read when this record was produced)",
      { width: pageWidth },
    );
    doc.moveDown(0.8);

    // ─── Execution / signature ───────────────────────────────────────
    ensureSpace(170);
    doc.moveTo(leftMargin, doc.y).lineTo(leftMargin + pageWidth, doc.y)
      .strokeColor(GOLD).lineWidth(0.8).stroke();
    doc.moveDown(0.6);
    doc.fillColor(NAVY).fontSize(12).font("Helvetica-Bold").text("Execution");
    doc.moveDown(0.2);
    doc.fillColor(DARK_GREY).fontSize(9.5).font("Helvetica");
    doc.text(
      "By typing their full legal name, the signatory confirmed they had read, understood, " +
      "and agreed to be bound by the agreement set out in this document.",
      { width: pageWidth },
    );
    doc.moveDown(0.6);
    doc.fillColor(NAVY).fontSize(10).font("Helvetica-Bold").text("The Nurse");
    doc.fillColor(DARK_GREY).fontSize(9.5).font("Helvetica");
    doc.text(`Signed (typed):  ${agreement.signatureName || "—"}`);
    doc.text(`Name:  ${agreement.signatureName || nurse.fullName}`);
    doc.text(`Date:  ${formatDate(agreement.signedAt)}`);
    doc.moveDown(0.4);
    doc.fillColor(MED_GREY).fontSize(8.5).font("Helvetica");
    doc.text(`IP address:  ${agreement.ipAddress || "not recorded"}`);
    doc.text(`Device:  ${agreement.userAgent || "not recorded"}`, { width: pageWidth });
    doc.text(`Issued by:  ${agreement.createdBy || "—"}`);
    doc.text(`Issued on:  ${formatDate(agreement.createdAt)}`);

    // ─── Page footers ────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const footerY = doc.page.height - doc.page.margins.bottom + 10;
      doc.fillColor(MED_GREY).fontSize(7.5).font("Helvetica")
        .text(
          `Basecamp by Livaware Ltd · Signed Individual Agreement · Ref ${agreement.id} · Page ${i + 1} of ${range.count}`,
          leftMargin, footerY, { width: pageWidth, align: "center" },
        );
    }

    doc.end();
  });
}
