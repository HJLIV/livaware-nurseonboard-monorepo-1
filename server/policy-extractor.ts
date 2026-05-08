// Structure-aware text extraction for the "Import policy from document"
// feature. Supports .docx (via mammoth -> HTML -> Markdown) and .pdf
// (via pdfjs-dist with Y-coordinate paragraph reflow). Returns a
// best-guess title plus cleaned Markdown body so headings, lists and
// tables survive the round-trip.

import path from "path";
import TurndownService from "turndown";
// @ts-ignore - turndown-plugin-gfm has no @types but we only use the
// table plugin here.
import { gfm } from "@joplin/turndown-plugin-gfm";

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

// Pick a title heuristically from the (rendered) markdown body: prefer a
// leading "# Heading", otherwise the first non-empty line if it's short
// and looks like a heading; otherwise fall back to the filename.
function pickTitle(markdown: string, originalName: string): string {
  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // Markdown ATX heading.
    const h = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (h) {
      const t = h[1].trim();
      if (t.length > 0 && t.length <= 160) return t;
    }
    break;
  }
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.length > 120) break;
    if (/^\d+$/.test(line)) continue;
    if (/^page\s+\d+/i.test(line)) continue;
    // Strip leading markdown bullet/heading markers for title display.
    const cleaned = line.replace(/^[#>*\-+\s]+/, "").trim();
    if (cleaned) return cleaned;
  }
  return filenameFallbackTitle(originalName);
}

// ─── DOCX ────────────────────────────────────────────────────────────
//
// Use mammoth.convertToHtml so heading styles, lists and tables survive
// (extractRawText flattens everything to a string of paragraphs). Then
// run turndown over the HTML so we end up with a Markdown body.

async function extractDocxMarkdown(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  let html: string;
  try {
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        // Map common Word styles into semantic HTML so turndown can
        // produce the right Markdown.
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Heading 5'] => h5:fresh",
          "p[style-name='Heading 6'] => h6:fresh",
          "p[style-name='Quote'] => blockquote:fresh",
          "p[style-name='Intense Quote'] => blockquote:fresh",
        ],
      },
    );
    html = result.value || "";
  } catch (err: any) {
    throw new PolicyExtractionError("Could not read this Word document — the file may be corrupted.", 422);
  }
  if (!html.trim()) return "";
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
  });
  td.use(gfm);
  // Drop empty paragraphs that mammoth sometimes emits (e.g. for blank
  // table cells or layout spacers) so we don't get long runs of blank
  // lines in the output.
  td.addRule("dropEmptyParagraphs", {
    filter: (node: any) =>
      node.nodeName === "P" && (node.textContent || "").replace(/\s|\u00a0/g, "") === "",
    replacement: () => "",
  });
  return td.turndown(html).replace(/\n{3,}/g, "\n\n").trim();
}

// ─── PDF ─────────────────────────────────────────────────────────────
//
// pdfjs-dist exposes text as positioned items. The previous extractor
// just concatenated `item.str` per item which produced one short
// fragment per text run. Here we group items into visual lines by Y
// coordinate, sort each line left-to-right, then re-flow consecutive
// lines into paragraphs unless we hit a clear paragraph break (large
// vertical gap, much shorter previous line ending in '.', etc.).

interface PdfItemLike {
  str: string;
  transform?: number[]; // [a,b,c,d,e,f] — e=x, f=y (PDF coords)
  width?: number;
  hasEOL?: boolean;
}

interface VisualLine {
  y: number;
  text: string;
  height: number;
}

async function extractPdfStructured(buffer: Buffer): Promise<string> {
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

  const pageLines: VisualLine[][] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as PdfItemLike[];
    pageLines.push(groupItemsIntoLines(items));
  }

  // Detect repeating header/footer lines across pages and strip them.
  // A short line (<= 100 chars) appearing on >= 3 pages OR >= 30% of
  // pages is treated as page furniture.
  const counts = new Map<string, number>();
  for (const lines of pageLines) {
    const seen = new Set<string>();
    for (const l of lines) {
      const t = l.text.trim();
      if (!t || t.length > 100) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  const pageCount = Math.max(1, pageLines.length);
  const repeating = new Set<string>();
  counts.forEach((count, line) => {
    if (count >= Math.max(3, Math.ceil(pageCount * 0.3))) {
      repeating.add(line);
    }
  });

  const allLines: VisualLine[] = [];
  for (const lines of pageLines) {
    const filtered = lines.filter((l) => {
      const t = l.text.trim();
      if (!t) return false;
      if (repeating.has(t)) return false;
      if (/^\d{1,4}$/.test(t)) return false;
      if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(t)) return false;
      if (/^\d+\s*(?:\/|of)\s*\d+$/i.test(t)) return false;
      return true;
    });
    if (filtered.length > 0) {
      allLines.push(...filtered);
      // Insert a synthetic blank line between pages so paragraph
      // detection treats the page break as at least a paragraph break.
      allLines.push({ y: 0, text: "", height: 0 });
    }
  }

  return reflowLinesIntoParagraphs(allLines);
}

function groupItemsIntoLines(items: PdfItemLike[]): VisualLine[] {
  // Bucket items by rounded Y coordinate. PDF Y grows upward; we sort
  // descending so reading order is top-to-bottom.
  const buckets = new Map<number, PdfItemLike[]>();
  for (const it of items) {
    const text = it.str ?? "";
    if (text === "" && !it.hasEOL) continue;
    const y = it.transform?.[5] ?? 0;
    const key = Math.round(y);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(it);
  }
  // Merge near-identical Y buckets (within ~2pt) — pdfjs sometimes
  // splits a visual line across slightly different baselines.
  const sortedYs = Array.from(buckets.keys()).sort((a, b) => b - a);
  const merged: { y: number; items: PdfItemLike[] }[] = [];
  for (const y of sortedYs) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.y - y) <= 2) {
      last.items.push(...buckets.get(y)!);
    } else {
      merged.push({ y, items: [...buckets.get(y)!] });
    }
  }

  const lines: VisualLine[] = [];
  for (const row of merged) {
    // Sort items left-to-right by X.
    row.items.sort((a, b) => (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0));
    let lineText = "";
    let prevEndX: number | null = null;
    let prevHeight = 10;
    for (const it of row.items) {
      const str = it.str ?? "";
      if (!str) continue;
      const x = it.transform?.[4] ?? 0;
      const w = it.width ?? str.length * 5;
      const h = Math.abs(it.transform?.[3] ?? 10) || 10;
      prevHeight = Math.max(prevHeight, h);
      if (prevEndX != null) {
        const gap = x - prevEndX;
        // Multi-column layout: a very large horizontal gap on the same
        // visual line usually means we crossed a column boundary. Treat
        // it as a paragraph break by inserting a marker that
        // reflowLinesIntoParagraphs will respect.
        if (gap > Math.max(40, prevHeight * 4)) {
          lineText += "\n\n";
        } else if (gap > prevHeight * 0.3 && !lineText.endsWith(" ") && !str.startsWith(" ")) {
          lineText += " ";
        }
      }
      lineText += str;
      prevEndX = x + w;
    }
    const cleaned = lineText.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
    if (cleaned) {
      // Split on any synthetic column-break markers we inserted.
      const parts = cleaned.split(/\n{2,}/);
      for (const part of parts) {
        const t = part.trim();
        if (t) lines.push({ y: row.y, text: t, height: prevHeight });
      }
    }
  }
  return lines;
}

function reflowLinesIntoParagraphs(lines: VisualLine[]): string {
  const paragraphs: string[] = [];
  let buf: string[] = [];
  let prevHeight = 10;
  let prevWasBlank = false;

  const flush = () => {
    if (buf.length === 0) return;
    paragraphs.push(buf.join(" ").replace(/\s+/g, " ").trim());
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.text;
    if (!text.trim()) {
      flush();
      prevWasBlank = true;
      continue;
    }
    // Heuristic: treat lines that look like headings or list items as
    // their own paragraph so they don't get merged into the prose.
    const looksLikeHeading = /^[A-Z][A-Z0-9 \-/&,.()]{3,}$/.test(text) && text.length <= 80;
    const looksLikeBullet = /^([\-\u2022\u2023\u25E6\*]|\d+[.)]|[a-zA-Z][.)])\s+/.test(text);
    const startsWithCapAfterBlank = prevWasBlank;

    // Decide whether to start a new paragraph or continue the previous.
    if (buf.length === 0) {
      buf.push(text);
    } else {
      const prev = buf[buf.length - 1];
      const prevEndsSentence = /[.!?:]["'\)\]]?$/.test(prev);
      const prevShort = prev.length < 40;
      const startBreak = looksLikeHeading || looksLikeBullet
        || (prevEndsSentence && prevShort)
        || startsWithCapAfterBlank;
      if (startBreak) {
        flush();
        buf.push(text);
      } else {
        // Heuristic line-wrap join: if the previous line ended on a
        // hyphen, join without a space and drop the hyphen. Otherwise
        // join with a single space.
        const last = buf[buf.length - 1];
        if (last.endsWith("-") && /^[a-z]/.test(text)) {
          buf[buf.length - 1] = last.slice(0, -1) + text;
        } else {
          buf.push(text);
        }
      }
    }
    prevHeight = line.height || prevHeight;
    prevWasBlank = false;
  }
  flush();

  // Convert obvious bullet-prefixed paragraphs into Markdown bullets.
  const out = paragraphs.map((p) => {
    const m = p.match(/^([\-\u2022\u2023\u25E6\*])\s+(.*)$/);
    if (m) return `- ${m[2]}`;
    const num = p.match(/^(\d+)[.)]\s+(.*)$/);
    if (num) return `${num[1]}. ${num[2]}`;
    return p;
  });

  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ─── Plain-text fallback cleaner (used as a safety net) ──────────────

function cleanPlainText(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
  const lines = text.split("\n").map((l) => l.replace(/[\t ]+/g, " ").trimEnd());
  const collapsed: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
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

export async function extractPolicyFromFile(
  buffer: Buffer,
  originalName: string,
  mimetype: string,
): Promise<PolicyExtractionResult> {
  const ext = path.extname(originalName).toLowerCase();
  const isPdf = mimetype === PDF_MIME || ext === ".pdf";
  const isDocx = mimetype === DOCX_MIME || ext === ".docx";

  let body: string;
  if (isPdf) {
    body = await extractPdfStructured(buffer);
  } else if (isDocx) {
    body = await extractDocxMarkdown(buffer);
  } else {
    throw new PolicyExtractionError("Unsupported file type. Please upload a .pdf or .docx file.", 415);
  }

  body = cleanPlainText(body);
  if (!body || body.replace(/\s+/g, "").length < 10) {
    throw new PolicyExtractionError(
      "No readable text could be extracted. If this is a scanned PDF, you'll need to OCR it first.",
      422,
    );
  }

  const title = pickTitle(body, originalName);
  return { title, body };
}
