import { describe, it, expect } from "vitest";
import { generateSignedAgreementPDF } from "../server/agreements/pdf";
import { extractPolicyFromFile } from "../server/policy-extractor";

// Task 201 — the sealed signed-agreement PDF embeds the agreement wording via
// the reusable Markdown renderer (server/pdf/markdown-pdf.ts). That wording
// comes from documents an admin uploaded, so the renderer has to survive
// whatever the extractor hands it: malformed Markdown, absurd tables, huge
// code blocks, unbroken text. It must never throw (that would block signing)
// and must never drop the Execution block.

const NURSE = { fullName: "Robust Tester", email: "robust@example.org" };
const SOURCE = { filename: "stored.docx", originalFilename: "Original.docx" };

function agreementWith(contentMarkdown: string | null) {
  return {
    id: "renderer-test",
    title: "Renderer robustness",
    contextType: "other",
    contextLabel: null,
    contentMarkdown,
    signatureName: "Robust Tester",
    signedAt: new Date("2026-08-01T09:15:00Z"),
    ipAddress: "203.0.113.9",
    userAgent: "vitest",
    createdBy: "admin (admin)",
    createdAt: new Date("2026-07-30T10:00:00Z"),
  } as any;
}

async function render(markdown: string | null): Promise<{ buffer: Buffer; text: string }> {
  const buffer = await generateSignedAgreementPDF({
    agreement: agreementWith(markdown),
    nurse: NURSE,
    sourceDocument: SOURCE,
    fingerprint: null,
  });
  const { body } = await extractPolicyFromFile(buffer, "sealed.pdf", "application/pdf");
  return { buffer, text: body };
}

describe("Task 201 — sealed agreement Markdown renderer", () => {
  it("survives malformed Markdown and still records the execution block", async () => {
    const malformed = [
      "### Unclosed **bold and *italic",
      "",
      "| broken | table",
      "|---|",
      "| only one cell |",
      "",
      "```",
      "an unterminated fence",
      "",
      "> quote with `unclosed code",
      "- list item with [a broken](link",
      "#".repeat(40),
      "",
      "|||||",
      "",
      "The clause survives regardless.",
    ].join("\n");

    const { text } = await render(malformed);
    expect(text).toContain("The clause survives regardless.");
    expect(text).toContain("Execution");
    expect(text).toContain("Robust Tester");
  }, 30000);

  it("renders a table with far too many columns without dropping cells", async () => {
    const columns = 120;
    const header = Array.from({ length: columns }, (_, i) => `Col${i}`);
    const row = Array.from({ length: columns }, (_, i) => `v${i}`);
    const markdown = [
      "## Wide table",
      `| ${header.join(" | ")} |`,
      `| ${header.map(() => "---").join(" | ")} |`,
      `| ${row.join(" | ")} |`,
      "",
      "Tail paragraph after the table.",
    ].join("\n");

    const { text } = await render(markdown);
    // Falls back to a stacked "Header: value" form rather than sub-point
    // columns, so both ends of the row are still readable.
    expect(text).toContain("v0");
    expect(text).toContain("v119");
    expect(text).toContain("Tail paragraph after the table.");
    expect(text).toContain("Execution");
  }, 30000);

  it("keeps very long unbroken text and page-spanning code blocks on the page", async () => {
    const unbroken = "A".repeat(4000);
    const codeLines = Array.from({ length: 200 }, (_, i) => `line ${i} of the escalation script`);
    const markdown = [
      "## Long content",
      unbroken,
      "",
      "```",
      ...codeLines,
      "```",
      "",
      "Closing clause after the code.",
    ].join("\n");

    const { text } = await render(markdown);
    expect(text.replace(/\s+/g, "")).toContain("A".repeat(500));
    expect(text).toContain("line 0 of the escalation script");
    expect(text).toContain("line 199 of the escalation script");
    expect(text).toContain("Closing clause after the code.");
    expect(text).toContain("Execution");
  }, 60000);

  it("keeps a single table row taller than a page readable", async () => {
    const bulk = (label: string) => `${label} ${"detail ".repeat(700)}`;
    const markdown = [
      "| Section | Terms |",
      "| --- | --- |",
      `| Duties | ${bulk("Duties")} |`,
      "",
      "After the giant row.",
    ].join("\n");

    const { text } = await render(markdown);
    expect(text).toContain("After the giant row.");
    expect(text).toContain("Execution");
  }, 60000);

  it("flags truncation instead of silently dropping an oversized document", async () => {
    const huge = ("Clause text that repeats. ".repeat(40) + "\n\n").repeat(500);
    expect(huge.length).toBeGreaterThan(400_000);
    const { text } = await render(huge);
    expect(text).toContain("truncated");
    expect(text).toContain("Execution");
  }, 120000);
});
