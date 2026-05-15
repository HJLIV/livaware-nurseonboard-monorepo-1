// Invoice PDF generator (task #134 follow-up).
// Renders a single timesheet invoice as an A4 PDF using pdfkit, mirroring
// the Livaware navy/gold visual identity used by the candidate report.
import PDFDocument from "pdfkit";
import type { InvoiceRecord, InvoiceTimesheetEntryRecord, InvoiceAdditionalCostRecord } from "@shared/schema";

const NAVY = "#020121";
const GOLD = "#C8A96E";
const DARK_GREY = "#333333";
const MED_GREY = "#666666";
const LIGHT_GREY = "#999999";
const BG_LIGHT = "#F5F5F0";

function gbp(pence: number): string { return `£${(pence / 100).toFixed(2)}`; }
function hours(mins: number): string { return `${(mins / 60).toFixed(2)}`; }
function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export interface InvoicePdfInput {
  invoice: InvoiceRecord;
  invoiceNumber: string;
  entries: InvoiceTimesheetEntryRecord[];
  costs: InvoiceAdditionalCostRecord[];
}

export async function generateInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const { invoice: inv, invoiceNumber, entries, costs } = input;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: `Invoice ${invoiceNumber} — ${inv.fullName}`,
        Author: "Livaware Ltd – NurseOnboard",
        Subject: `Nurse Timesheet Invoice ${invoiceNumber}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const left = doc.page.margins.left;

    // Header band
    doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
    doc.fillColor(GOLD).fontSize(22).font("Helvetica-Bold").text("LIVAWARE", left, 28);
    doc.fillColor("#F0ECE4").fontSize(9).font("Helvetica").text("Nurse Timesheet Invoice", left, 56);
    doc.fillColor(GOLD).fontSize(11).font("Helvetica-Bold")
      .text(invoiceNumber, left, 28, { width: pageWidth, align: "right" });
    doc.fillColor("#F0ECE4").fontSize(9).font("Helvetica")
      .text(`Submitted ${fmtDate(inv.submittedAt)}`, left, 56, { width: pageWidth, align: "right" });

    let y = 120;

    // Bill-from / bill-to
    doc.fillColor(MED_GREY).fontSize(8).font("Helvetica-Bold").text("BILL FROM", left, y);
    doc.fillColor(MED_GREY).fontSize(8).font("Helvetica-Bold").text("BILL TO", left + pageWidth / 2, y);
    y += 14;
    doc.fillColor(DARK_GREY).fontSize(11).font("Helvetica-Bold").text(inv.fullName, left, y, { width: pageWidth / 2 - 12 });
    doc.fillColor(DARK_GREY).fontSize(11).font("Helvetica-Bold").text("Livaware Ltd", left + pageWidth / 2, y, { width: pageWidth / 2 });
    y += 14;
    const fromLines = [
      inv.ltdCompany || null,
      inv.address,
      inv.email,
      inv.phoneNumber,
      inv.utr ? `UTR: ${inv.utr}` : null,
    ].filter(Boolean) as string[];
    doc.fillColor(MED_GREY).fontSize(9).font("Helvetica").text(fromLines.join("\n"), left, y, { width: pageWidth / 2 - 12 });
    doc.fillColor(MED_GREY).fontSize(9).font("Helvetica").text("invoices@livaware.co.uk", left + pageWidth / 2, y, { width: pageWidth / 2 });
    y += Math.max(fromLines.length, 1) * 12 + 18;

    // Bank details strip
    doc.rect(left, y, pageWidth, 36).fill(BG_LIGHT);
    doc.fillColor(MED_GREY).fontSize(8).font("Helvetica-Bold").text("PAYMENT DETAILS", left + 10, y + 6);
    doc.fillColor(DARK_GREY).fontSize(9).font("Helvetica")
      .text(
        `${inv.bankName} · ${inv.accountName} · Sort ${inv.sortCode} · Acct ${inv.accountNumber} (${inv.accountType})`,
        left + 10, y + 19, { width: pageWidth - 20 },
      );
    y += 48;

    // Timesheet table
    doc.fillColor(NAVY).fontSize(11).font("Helvetica-Bold").text("Timesheet entries", left, y);
    y += 16;
    const cols = [
      { label: "Date", x: left, w: 70 },
      { label: "Time", x: left + 70, w: 70 },
      { label: "Patient", x: left + 140, w: 60 },
      { label: "Location", x: left + 200, w: 160 },
      { label: "Hours", x: left + 360, w: 50, align: "right" as const },
      { label: "Amount", x: left + 410, w: pageWidth - 410, align: "right" as const },
    ];
    doc.rect(left, y, pageWidth, 18).fill(NAVY);
    doc.fillColor("#F0ECE4").fontSize(8).font("Helvetica-Bold");
    for (const c of cols) doc.text(c.label, c.x + 4, y + 5, { width: c.w - 8, align: c.align ?? "left" });
    y += 18;

    doc.fillColor(DARK_GREY).fontSize(9).font("Helvetica");
    for (const e of entries) {
      if (y > doc.page.height - 200) { doc.addPage(); y = 60; }
      const row = [
        e.date,
        `${e.startTime}–${e.endTime}`,
        e.patientInitials,
        e.location,
        hours(e.hoursMinutes),
        gbp(e.amountPence),
      ];
      const rowHeight = 18;
      doc.rect(left, y, pageWidth, rowHeight).strokeColor("#E5E5E0").lineWidth(0.5).stroke();
      cols.forEach((c, i) => doc.text(String(row[i]), c.x + 4, y + 5, { width: c.w - 8, align: c.align ?? "left" }));
      y += rowHeight;
    }
    y += 8;

    // Additional costs
    if (costs.length) {
      doc.fillColor(NAVY).fontSize(11).font("Helvetica-Bold").text("Additional costs", left, y);
      y += 16;
      doc.fillColor(DARK_GREY).fontSize(9).font("Helvetica");
      for (const c of costs) {
        if (y > doc.page.height - 160) { doc.addPage(); y = 60; }
        doc.rect(left, y, pageWidth, 16).strokeColor("#E5E5E0").lineWidth(0.5).stroke();
        doc.text(c.description, left + 6, y + 4, { width: pageWidth - 90 });
        doc.text(gbp(c.amountPence), left + pageWidth - 80, y + 4, { width: 74, align: "right" });
        y += 16;
      }
      y += 8;
    }

    // Totals box
    if (y > doc.page.height - 140) { doc.addPage(); y = 60; }
    const boxX = left + pageWidth - 240;
    doc.rect(boxX, y, 240, 100).fill(BG_LIGHT);
    const row2 = (label: string, value: string, bold = false) => {
      doc.fillColor(MED_GREY).fontSize(9).font("Helvetica").text(label, boxX + 12, y + 8, { width: 130 });
      doc.fillColor(bold ? NAVY : DARK_GREY).fontSize(bold ? 11 : 9).font(bold ? "Helvetica-Bold" : "Helvetica")
        .text(value, boxX + 130, y + (bold ? 6 : 8), { width: 100, align: "right" });
      y += bold ? 22 : 16;
    };
    row2("Hourly rate", gbp(inv.hourlyRate));
    row2("Total hours", `${hours(inv.totalHours)} h`);
    row2("Timesheet total", gbp(inv.totalAmount));
    row2("Additional costs", gbp(inv.additionalCostsTotal));
    row2("Grand total", gbp(inv.totalAmount + inv.additionalCostsTotal), true);

    if (inv.paymentNotes) {
      doc.fillColor(MED_GREY).fontSize(8).font("Helvetica-Bold").text("PAYMENT NOTES", left, y + 8);
      doc.fillColor(DARK_GREY).fontSize(9).font("Helvetica").text(inv.paymentNotes, left, y + 22, { width: pageWidth - 260 });
    }

    // Footer
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fillColor(LIGHT_GREY).fontSize(8).font("Helvetica")
        .text(
          `Livaware Ltd · ${invoiceNumber} · Page ${i + 1} of ${range.count}`,
          left, doc.page.height - 30, { width: pageWidth, align: "center" },
        );
    }
    doc.end();
  });
}
