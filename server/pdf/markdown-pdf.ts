// Reusable Markdown → PDF renderer for pdfkit documents (task 201).
//
// Document text stored as Markdown (agreements, policies, …) needs to end up
// inside generated PDFs looking like the rest of the pack rather than as a
// wall of plain text. This renders a practical subset of Markdown:
//
//   headings (#..######), paragraphs, bullet/numbered lists (nested),
//   blockquotes, horizontal rules, fenced code blocks, GFM tables, and the
//   inline run styles **bold**, *italic*, `code` and [links](url).
//
// It draws into an existing PDFDocument at the current cursor, so callers
// keep control of headers, footers and page setup.

export interface MarkdownPdfTheme {
  /** Heading + accent colour. */
  headingColor: string;
  /** Body text colour. */
  bodyColor: string;
  /** Rules, table borders, quote bars. */
  ruleColor: string;
  /** Muted colour for code blocks and link URLs. */
  mutedColor: string;
  /** Base body font size in points. */
  bodySize: number;
}

const DEFAULT_THEME: MarkdownPdfTheme = {
  headingColor: "#020121",
  bodyColor: "#333333",
  ruleColor: "#C8A96E",
  mutedColor: "#666666",
  bodySize: 9.5,
};

export interface MarkdownPdfOptions {
  theme?: Partial<MarkdownPdfTheme>;
  /** Content width; defaults to the page width between margins. */
  width?: number;
  /** Left edge; defaults to the left page margin. */
  left?: number;
}

// ─── Block model ─────────────────────────────────────────────────────

interface ListItem {
  text: string;
  depth: number;
  marker: string;
}

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: ListItem[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "code"; lines: string[] }
  | { kind: "hr" }
  | { kind: "table"; header: string[]; rows: string[][] };

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const BULLET_RE = /^(\s*)([-*+])\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const FENCE_RE = /^\s*(?:```|~~~)/;
const TABLE_DIVIDER_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function parseMarkdownBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", text: paragraph.join(" ").replace(/\s+/g, " ").trim() });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    // Fenced code block — consume until the closing fence (or EOF).
    if (FENCE_RE.test(line)) {
      flushParagraph();
      const code: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      blocks.push({ kind: "code", lines: code });
      continue;
    }

    // GFM table: a pipe row immediately followed by a divider row.
    if (trimmed.includes("|") && i + 1 < lines.length && TABLE_DIVIDER_RE.test(lines[i + 1])) {
      flushParagraph();
      const header = splitTableRow(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().includes("|") && lines[i].trim()) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      i--;
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    if (HR_RE.test(line)) {
      flushParagraph();
      blocks.push({ kind: "hr" });
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }

    const quote = line.match(QUOTE_RE);
    if (quote) {
      flushParagraph();
      const quoteLines = [quote[1]];
      while (i + 1 < lines.length) {
        const next = lines[i + 1].match(QUOTE_RE);
        if (!next) break;
        quoteLines.push(next[1]);
        i++;
      }
      blocks.push({ kind: "quote", lines: quoteLines });
      continue;
    }

    const bullet = line.match(BULLET_RE);
    const ordered = line.match(ORDERED_RE);
    if (bullet || ordered) {
      flushParagraph();
      const items: ListItem[] = [];
      let cursor = i;
      while (cursor < lines.length) {
        const current = lines[cursor];
        const b = current.match(BULLET_RE);
        const o = current.match(ORDERED_RE);
        if (b) {
          items.push({ depth: Math.floor(b[1].length / 2), marker: "•", text: b[3] });
        } else if (o) {
          items.push({ depth: Math.floor(o[1].length / 2), marker: `${o[2]}.`, text: o[3] });
        } else if (current.trim() && items.length > 0 && /^\s{2,}/.test(current)) {
          // Continuation line of the previous item.
          items[items.length - 1].text += ` ${current.trim()}`;
        } else {
          break;
        }
        cursor++;
      }
      i = cursor - 1;
      blocks.push({ kind: "list", items });
      continue;
    }

    paragraph.push(trimmed);
  }
  flushParagraph();
  return blocks;
}

// ─── Inline runs ─────────────────────────────────────────────────────

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

// pdfkit only breaks lines on whitespace, so an unbroken run of characters
// wider than the column (a long URL, a hash, a table of dashes) is drawn off
// the edge of the page and lost. Insert soft breaks so the content stays
// visible — the original file is retained and fingerprinted regardless.
const MAX_TOKEN = 72;
export function softenLongTokens(input: string): string {
  return input.replace(/\S{73,}/g, (token) =>
    token.replace(new RegExp(`(.{${MAX_TOKEN}})`, "g"), "$1 ").trimEnd(),
  );
}

// Very small inline tokenizer. Deliberately forgiving: unmatched markers are
// rendered literally rather than swallowing the rest of the line.
export function parseInlineRuns(input: string): InlineRun[] {
  // Images degrade to their alt text; links keep their label.
  const text = softenLongTokens(
    input
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/&nbsp;/g, " "),
  );

  const runs: InlineRun[] = [];
  let buffer = "";
  let bold = false;
  let italic = false;
  let code = false;

  const push = () => {
    if (!buffer) return;
    runs.push({ text: buffer, bold, italic, code });
    buffer = "";
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === "\\" && next) {
      buffer += next;
      i++;
      continue;
    }
    if (ch === "`") {
      push();
      code = !code;
      continue;
    }
    if (code) {
      buffer += ch;
      continue;
    }
    if ((ch === "*" || ch === "_") && next === ch) {
      push();
      bold = !bold;
      i++;
      continue;
    }
    if (ch === "*") {
      push();
      italic = !italic;
      continue;
    }
    if (ch === "_") {
      // `_em_` only toggles at a word boundary so snake_case_words survive.
      const prev = text[i - 1] ?? " ";
      const following = next ?? " ";
      const boundary = italic
        ? /[\s.,;:!?)"'\]]/.test(following)
        : /[\s("'[]/.test(prev);
      if (boundary) {
        push();
        italic = !italic;
        continue;
      }
    }
    buffer += ch;
  }
  push();
  return runs.filter((r) => r.text.length > 0);
}

// ─── Rendering ───────────────────────────────────────────────────────

const HEADING_SIZES: Record<number, number> = { 1: 15, 2: 13, 3: 11.5, 4: 10.5, 5: 10, 6: 10 };

// Minimum readable column width; below this a grid is worse than useless
// (and zero/negative widths break pdfkit outright).
const MIN_COLUMN_WIDTH = 40;

export function renderMarkdownToPdf(
  doc: PDFKit.PDFDocument,
  markdown: string,
  options: MarkdownPdfOptions = {},
): void {
  const theme = { ...DEFAULT_THEME, ...(options.theme ?? {}) };
  const left = options.left ?? doc.page.margins.left;
  const width =
    options.width ?? doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 24;

  function ensureSpace(needed: number) {
    if (doc.y + needed > bottomLimit()) {
      doc.addPage();
      doc.x = left;
      doc.y = doc.page.margins.top;
    }
  }

  function fontFor(run: InlineRun): string {
    if (run.code) return "Courier";
    if (run.bold && run.italic) return "Helvetica-BoldOblique";
    if (run.bold) return "Helvetica-Bold";
    if (run.italic) return "Helvetica-Oblique";
    return "Helvetica";
  }

  // Draw a line of inline runs as one flowing paragraph.
  function writeRuns(
    runs: InlineRun[],
    opts: { x: number; width: number; size: number; color: string; align?: "left" | "justify" },
  ) {
    if (runs.length === 0) {
      doc.moveDown(0.4);
      return;
    }
    const startY = doc.y;
    runs.forEach((run, index) => {
      const last = index === runs.length - 1;
      doc
        .font(fontFor(run))
        .fontSize(run.code ? opts.size - 0.5 : opts.size)
        .fillColor(run.code ? theme.mutedColor : opts.color);
      const textOpts: PDFKit.Mixins.TextOptions = {
        width: opts.width,
        align: opts.align ?? "left",
        continued: !last,
      };
      if (index === 0) {
        doc.text(run.text, opts.x, startY, textOpts);
      } else {
        doc.text(run.text, textOpts);
      }
    });
  }

  // Hard ceiling so a pathological document cannot stall the render (and
  // therefore signing). Far above any real agreement; never silent.
  const MAX_INPUT_CHARS = 400_000;
  const truncated = markdown.length > MAX_INPUT_CHARS;
  const blocks = parseMarkdownBlocks(
    truncated ? markdown.slice(0, MAX_INPUT_CHARS) : markdown,
  );

  for (const block of blocks) {
    switch (block.kind) {
      case "heading": {
        const size = HEADING_SIZES[block.level] ?? 10;
        ensureSpace(size * 2.6);
        doc.moveDown(block.level <= 2 ? 0.5 : 0.35);
        writeRuns(parseInlineRuns(block.text).map((r) => ({ ...r, bold: true })), {
          x: left,
          width,
          size,
          color: theme.headingColor,
        });
        if (block.level === 1) {
          doc
            .moveTo(left, doc.y + 2)
            .lineTo(left + width, doc.y + 2)
            .strokeColor(theme.ruleColor)
            .lineWidth(0.7)
            .stroke();
          doc.moveDown(0.3);
        }
        doc.moveDown(0.25);
        break;
      }

      case "paragraph": {
        ensureSpace(theme.bodySize * 2.4);
        writeRuns(parseInlineRuns(block.text), {
          x: left,
          width,
          size: theme.bodySize,
          color: theme.bodyColor,
          align: "left",
        });
        doc.moveDown(0.45);
        break;
      }

      case "list": {
        for (const item of block.items) {
          const indent = Math.min(item.depth, 4) * 14;
          const markerWidth = 16;
          ensureSpace(theme.bodySize * 2.2);
          const y = doc.y;
          doc
            .font("Helvetica")
            .fontSize(theme.bodySize)
            .fillColor(theme.bodyColor)
            .text(item.marker, left + indent, y, { width: markerWidth });
          doc.y = y;
          writeRuns(parseInlineRuns(item.text), {
            x: left + indent + markerWidth,
            width: width - indent - markerWidth,
            size: theme.bodySize,
            color: theme.bodyColor,
          });
          doc.moveDown(0.2);
        }
        doc.moveDown(0.3);
        break;
      }

      case "quote": {
        const text = block.lines.join(" ").replace(/\s+/g, " ").trim();
        ensureSpace(theme.bodySize * 3);
        const startY = doc.y;
        writeRuns(parseInlineRuns(text).map((r) => ({ ...r, italic: true })), {
          x: left + 14,
          width: width - 14,
          size: theme.bodySize,
          color: theme.mutedColor,
        });
        doc
          .moveTo(left + 3, startY)
          .lineTo(left + 3, doc.y)
          .strokeColor(theme.ruleColor)
          .lineWidth(2)
          .stroke();
        doc.moveDown(0.45);
        break;
      }

      case "code": {
        // Drawn line by line: a single block whose height exceeds the page
        // would otherwise be painted past the bottom margin and lost.
        const size = theme.bodySize - 0.5;
        const lines = block.lines.length > 0 ? block.lines : [""];
        for (const raw of lines) {
          const line = softenLongTokens(raw.length > 0 ? raw : " ");
          doc.font("Courier").fontSize(size);
          const height = doc.heightOfString(line, { width: width - 16 });
          ensureSpace(Math.min(height, theme.bodySize * 4) + 6);
          const y = doc.y;
          const visible = Math.min(height + 4, Math.max(bottomLimit() - y + 4, 8));
          doc.rect(left, y - 2, width, visible).fillColor("#F5F5F3").fill();
          doc
            .fillColor(theme.bodyColor)
            .font("Courier")
            .fontSize(size)
            .text(line, left + 8, y, { width: width - 16 });
        }
        doc.moveDown(0.5);
        break;
      }

      case "hr": {
        ensureSpace(14);
        doc
          .moveTo(left, doc.y + 4)
          .lineTo(left + width, doc.y + 4)
          .strokeColor(theme.ruleColor)
          .lineWidth(0.6)
          .stroke();
        doc.y += 12;
        break;
      }

      case "table": {
        renderTable(block.header, block.rows);
        break;
      }
    }
  }

  if (truncated) {
    ensureSpace(theme.bodySize * 3);
    doc.moveDown(0.4);
    doc
      .font("Helvetica-Bold")
      .fontSize(theme.bodySize)
      .fillColor(theme.headingColor)
      .text(
        "[This reproduction was truncated because the source document exceeded the " +
          "maximum length that can be rendered. Refer to the original document.]",
        left,
        doc.y,
        { width },
      );
    doc.moveDown(0.4);
  }

  function renderTable(header: string[], rows: string[][]) {
    const columnCount = Math.max(header.length, ...rows.map((r) => r.length), 1);
    const normalise = (cells: string[]) =>
      Array.from({ length: columnCount }, (_, i) =>
        softenLongTokens((cells[i] ?? "").replace(/\*\*/g, "")),
      );

    // Render one row as "Header: value" lines. Used when a grid cannot fit —
    // too many columns, or a row taller than a whole page — so no content is
    // ever dropped or drawn off the page.
    const drawStackedRow = (cells: string[]) => {
      normalise(cells).forEach((cell, col) => {
        if (!cell.trim()) return;
        const label = (header[col] ?? "").trim().replace(/\*\*/g, "");
        const runs = parseInlineRuns(cell);
        ensureSpace(theme.bodySize * 2.2);
        writeRuns(label ? [{ text: `${label}: `, bold: true }, ...runs] : runs, {
          x: left + 10,
          width: width - 10,
          size: theme.bodySize,
          color: theme.bodyColor,
        });
      });
      doc.moveDown(0.35);
    };

    if (columnCount * MIN_COLUMN_WIDTH > width) {
      doc.moveDown(0.2);
      for (const row of rows.length > 0 ? rows : [header]) drawStackedRow(row);
      doc.moveDown(0.3);
      return;
    }

    // Weight columns by their longest cell so wide prose columns get room.
    const weights = Array.from({ length: columnCount }, (_, col) => {
      const longest = [header, ...rows].reduce(
        (max, row) => Math.max(max, (row[col] ?? "").length),
        1,
      );
      return Math.min(Math.max(longest, 6), 60);
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    // Give every column at least MIN_COLUMN_WIDTH, then rescale so the row
    // still spans exactly the content width.
    const raw = weights.map((w) => Math.max((w / totalWeight) * width, MIN_COLUMN_WIDTH));
    const rawTotal = raw.reduce((a, b) => a + b, 0);
    const widths = raw.map((w) => (w / rawTotal) * width);
    const size = theme.bodySize - 0.75;
    const padding = 4;

    const rowHeight = (cells: string[], bold: boolean) => {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);
      return (
        normalise(cells).reduce((max, cell, col) => {
          const h = doc.heightOfString(cell || " ", { width: widths[col] - padding * 2 });
          return Math.max(max, h);
        }, 0) + padding * 2
      );
    };

    const usablePageHeight =
      doc.page.height - doc.page.margins.top - doc.page.margins.bottom - 24;

    const drawRow = (cells: string[], bold: boolean) => {
      const height = rowHeight(cells, bold);
      // A row that cannot fit even on an empty page would spill past the
      // bottom margin — fall back to the stacked form, which paginates.
      if (height > usablePageHeight) {
        drawStackedRow(cells);
        return;
      }
      ensureSpace(height + 4);
      const y = doc.y;
      if (bold) {
        doc.rect(left, y, width, height).fillColor("#F2EFE8").fill();
      }
      let x = left;
      normalise(cells).forEach((cell, col) => {
        doc
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(size)
          .fillColor(bold ? theme.headingColor : theme.bodyColor)
          .text(cell, x + padding, y + padding, {
            width: widths[col] - padding * 2,
          });
        x += widths[col];
      });
      doc
        .moveTo(left, y + height)
        .lineTo(left + width, y + height)
        .strokeColor("#DDDAD2")
        .lineWidth(0.5)
        .stroke();
      doc.y = y + height;
      doc.x = left;
    };

    ensureSpace(60);
    doc.moveDown(0.2);
    drawRow(header, true);
    for (const row of rows) drawRow(row, false);
    doc.moveDown(0.5);
  }
}
