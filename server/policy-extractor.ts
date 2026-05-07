// One-shot text extraction for the "Import policy from document" feature.
// Supports .docx (via mammoth) and .pdf (via pdfjs-dist). Returns a
// best-guess title plus cleaned plain-text body with paragraph breaks.

import path from "path";

export class PolicyExtractionError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

export interface PolicyExtractionResult {
  title: string;
  body: string;
}

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function filenameFallbackTitle(originalName: string): string {
  const base = originalName.replace(/\.[^.]+$/, "");
  return base.replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled policy";
}

// Pick a title heuristically: first non-empty line if it's short and looks
// like a heading; otherwise fall back to the filename.
function pickTitle(text: string, originalName: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.length === 0) continue;
    if (line.length > 120) break;
    // Skip lines that look like page numbers, dates, or boilerplate.
    if (/^\d+$/.test(line)) continue;
    if (/^page\s+\d+/i.test(line)) continue;
    // Accept the first reasonable line.
    return line;
  }
  return filenameFallbackTitle(originalName);
}

// Normalise whitespace, collapse runs of blank lines, strip bare page
// numbers, and de-duplicate page headers/footers that repeat on every page.
function cleanText(raw: string): string {
  // Normalise line endings + non-breaking spaces.
  let text = raw.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");

  const rawLines = text.split("\n").map((l) => l.replace(/[\t ]+/g, " ").trimEnd());

  // Detect repeating header/footer lines (appearing on >= 3 pages worth)
  // and strip them. Only consider short non-empty lines as candidates.
  const counts = new Map<string, number>();
  for (const line of rawLines) {
    const t = line.trim();
    if (!t || t.length > 80) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  const totalLines = rawLines.length;
  const repeating = new Set<string>();
  counts.forEach((count, line) => {
    if (count >= 3 && count >= totalLines * 0.02) {
      repeating.add(line);
    }
  });

  const cleanedLines: string[] = [];
  for (const line of rawLines) {
    const t = line.trim();
    if (!t) {
      cleanedLines.push("");
      continue;
    }
    // Bare page number like "12" or "Page 12" or "12 of 30".
    if (/^\d{1,4}$/.test(t)) continue;
    if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(t)) continue;
    if (/^\d+\s+of\s+\d+$/i.test(t)) continue;
    if (repeating.has(t)) continue;
    cleanedLines.push(line);
  }

  // Collapse runs of >2 blank lines down to a single blank line.
  const collapsed: string[] = [];
  let blankRun = 0;
  for (const line of cleanedLines) {
    if (line.trim() === "") {
      blankRun++;
      if (blankRun <= 1) collapsed.push("");
    } else {
      blankRun = 0;
      collapsed.push(line);
    }
  }

  return collapsed.join("\n").trim();
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer);
  let doc;
  try {
    doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (/password/i.test(msg) || /encrypted/i.test(msg)) {
      throw new PolicyExtractionError("This PDF is password-protected. Please remove the password and try again.", 422);
    }
    throw new PolicyExtractionError("Could not read this PDF — the file may be corrupted.", 422);
  }

  let fullText = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; hasEOL?: boolean }>;
    for (const item of items) {
      fullText += item.str;
      if (item.hasEOL) fullText += "\n";
    }
    fullText += "\n\n";
  }
  return fullText;
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  } catch (err: any) {
    throw new PolicyExtractionError("Could not read this Word document — the file may be corrupted.", 422);
  }
}

export async function extractPolicyFromFile(
  buffer: Buffer,
  originalName: string,
  mimetype: string,
): Promise<PolicyExtractionResult> {
  const ext = path.extname(originalName).toLowerCase();
  let raw: string;

  const isPdf = mimetype === PDF_MIME || ext === ".pdf";
  const isDocx = mimetype === DOCX_MIME || ext === ".docx";

  if (isPdf) {
    raw = await extractPdfText(buffer);
  } else if (isDocx) {
    raw = await extractDocxText(buffer);
  } else {
    throw new PolicyExtractionError("Unsupported file type. Please upload a .pdf or .docx file.", 415);
  }

  const body = cleanText(raw);
  if (!body || body.replace(/\s+/g, "").length < 10) {
    throw new PolicyExtractionError(
      "No readable text could be extracted. If this is a scanned PDF, you'll need to OCR it first.",
      422,
    );
  }

  const title = pickTitle(body, originalName);
  return { title, body };
}
