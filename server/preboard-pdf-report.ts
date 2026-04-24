import PDFDocument from "pdfkit";
import type { Assessment, AssessmentResponse } from "@shared/schema";

const COLORS = {
  bg: "#020121",
  surface: "#0a0a2e",
  card: "#111140",
  border: "#2a2a5e",
  accent: "#C8A96E",
  accentDim: "#b8944e",
  text: "#F0ECE4",
  muted: "#A8A29E",
  subtle: "#8A8A94",
  danger: "#E06B5A",
  success: "#5DB88A",
};

function drawLine(doc: PDFKit.PDFDocument, x: number, y: number, width: number, color: string = COLORS.border) {
  doc.strokeColor(color).lineWidth(0.5).moveTo(x, y).lineTo(x + width, y).stroke();
}

function drawGoldDivider(doc: PDFKit.PDFDocument, y: number, margin: number, width: number) {
  const gradient = doc.linearGradient(margin, y, margin + width, y);
  gradient.stop(0, COLORS.bg).stop(0.3, COLORS.accent).stop(0.5, COLORS.accent).stop(0.7, COLORS.accent).stop(1, COLORS.bg);
  doc.rect(margin, y, width, 0.75).fill(gradient);
}

export async function generatePdfReport(assessment: Assessment): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 60, bottom: 60, left: 50, right: 50 },
      bufferPages: true,
      info: {
        Title: `Nurse Assessment Report – ${assessment.nurseName}`,
        Author: "Livaware Ltd",
        Subject: "Nurse Pre-Onboarding Assessment",
        Creator: "Livaware Assessment Platform",
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageWidth = doc.page.width;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;
    const responses = assessment.responses as AssessmentResponse[];

    doc.on("pageAdded", () => {
      doc.save();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.bg);
      doc.restore();
    });

    doc.rect(0, 0, pageWidth, doc.page.height).fill(COLORS.bg);

    doc.font("Helvetica").fontSize(14).fillColor(COLORS.text).text("LIVAWARE", margin, 60, { characterSpacing: 3 });

    doc.fontSize(8).fillColor(COLORS.subtle).text("Nurse-Led · Complex & Palliative Care · London", margin, 80, { characterSpacing: 1 });

    drawGoldDivider(doc, 100, margin, contentWidth);

    doc.font("Helvetica-Bold").fontSize(22).fillColor(COLORS.text).text("Nurse Assessment Report", margin, 120);

    doc.font("Helvetica").fontSize(9).fillColor(COLORS.subtle).text(
      `Generated ${assessment.completedAt ? new Date(assessment.completedAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }) : "N/A"}`,
      margin,
      148
    );

    let y = 175;

    doc.roundedRect(margin, y, contentWidth, 80, 4).fill(COLORS.card);
    doc.roundedRect(margin, y, contentWidth, 80, 4).stroke(COLORS.border);
    y += 14;
    doc.font("Helvetica").fontSize(8).fillColor(COLORS.subtle).text("CANDIDATE DETAILS", margin + 16, y, { characterSpacing: 1.5 });
    y += 16;
    doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.text).text(assessment.nurseName, margin + 16, y);
    y += 18;
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.muted).text(assessment.nurseEmail, margin + 16, y);
    if (assessment.nursePhone) {
      doc.text(` · ${assessment.nursePhone}`, { continued: false });
    }

    y = 175 + 80 + 24;

    if (assessment.aiAnalysis) {
      doc.rect(margin, y, 3, 0).fill(COLORS.accent);

      const analysisLines = assessment.aiAnalysis.split("\n");
      let analysisStartY = y;

      doc.font("Helvetica").fontSize(8).fillColor(COLORS.accent).text("AI CLINICAL ASSESSMENT", margin + 4, y, { characterSpacing: 1.5 });
      y += 20;

      for (const line of analysisLines) {
        if (doc.y < y - 30) y = doc.y;

        if (y > doc.page.height - 80 && y > doc.page.margins.top + 10) {
          doc.addPage();
          y = doc.page.margins.top;
        }

        const trimmed = line.trim();
        if (!trimmed) {
          y += 6;
          continue;
        }

        if (trimmed.startsWith("## ")) {
          y += 8;
          doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.accent).text(trimmed.replace("## ", ""), margin + 4, y, { width: contentWidth - 8 });
          y = doc.y + 6;
        } else if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
          doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.text).text(trimmed.replace(/\*\*/g, ""), margin + 4, y, { width: contentWidth - 8 });
          y = doc.y + 4;
        } else if (trimmed.startsWith("- ")) {
          const bulletText = trimmed.substring(2);
          doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.muted).text("·", margin + 8, y);

          const formattedText = bulletText;
          const boldParts = formattedText.match(/\*\*(.*?)\*\*/g);
          const renderText = boldParts ? formattedText.replace(/\*\*/g, "") : bulletText;
          doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.text).text(renderText, margin + 18, y, { width: contentWidth - 26 });
          y = doc.y + 3;
        } else {
          const plainText = trimmed.replace(/\*\*/g, "");
          doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.text).text(plainText, margin + 4, y, { width: contentWidth - 8, lineGap: 3 });
          y = doc.y + 4;
        }
      }

      const accentBarHeight = y - analysisStartY;
      doc.rect(margin, analysisStartY, 3, accentBarHeight).fill(COLORS.accent);

      y += 20;
    }

    drawGoldDivider(doc, y, margin, contentWidth);
    y += 16;

    doc.font("Helvetica").fontSize(8).fillColor(COLORS.subtle).text("FULL RESPONSES", margin, y, { characterSpacing: 1.5 });
    y += 20;

    for (let i = 0; i < responses.length; i++) {
      const r = responses[i];
      const timeUsed = r.timeLimit - r.timeSpent;

      doc.font("Helvetica").fontSize(9.5);
      const responseHeight = doc.heightOfString(r.response, {
        width: contentWidth - 32,
      });
      const blockHeight = 60 + responseHeight + 30;

      if (doc.y < y - 30) y = doc.y;

      if (y + blockHeight > doc.page.height - 80 && y > doc.page.margins.top + 10) {
        doc.addPage();
        y = doc.page.margins.top;
      }

      doc.roundedRect(margin, y, contentWidth, blockHeight, 4).fill(COLORS.card);
      doc.roundedRect(margin, y, contentWidth, blockHeight, 4).stroke(COLORS.border);

      let qy = y + 14;
      doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.subtle).text(
        `${r.domain.toUpperCase()} · ${r.tag.toUpperCase()}`,
        margin + 16,
        qy,
        { characterSpacing: 1 }
      );

      qy += 14;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.accent).text(
        `Q${r.questionId}: ${r.prompt.substring(0, 100)}${r.prompt.length > 100 ? "..." : ""}`,
        margin + 16,
        qy,
        { width: contentWidth - 32 }
      );
      qy += doc.heightOfString(
        `Q${r.questionId}: ${r.prompt.substring(0, 100)}${r.prompt.length > 100 ? "..." : ""}`,
        { width: contentWidth - 32 }
      ) + 10;

      doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.text).text(r.response, margin + 16, qy, {
        width: contentWidth - 32,
        lineGap: 3,
      });
      qy += responseHeight + 10;

      doc.font("Helvetica").fontSize(8).fillColor(COLORS.subtle).text(
        `${r.response.length} chars · ${timeUsed}s of ${r.timeLimit}s used`,
        margin + 16,
        qy
      );

      y += blockHeight + 12;
    }

    if (doc.y < y - 30) y = doc.y;

    if (y + 60 > doc.page.height - 60 && y > doc.page.margins.top + 10) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    y += 16;
    drawGoldDivider(doc, y, margin, contentWidth);
    y += 20;

    doc.font("Helvetica").fontSize(8).fillColor(COLORS.subtle).text(
      "Livaware Ltd · London · Nurse-Led · Complex & Palliative Care",
      margin,
      y,
      { characterSpacing: 0.8, align: "left" }
    );
    doc.fontSize(7).fillColor(COLORS.subtle).text(
      "This report is confidential and intended solely for Livaware clinical leadership.",
      margin,
      y + 14,
      { width: contentWidth }
    );

    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(7).fillColor(COLORS.subtle).text(
        `${i + 1} / ${totalPages}`,
        pageWidth - margin - 40,
        doc.page.maxY() - 10,
        { width: 40, align: "right", lineBreak: false }
      );
    }

    doc.end();
  });
}
