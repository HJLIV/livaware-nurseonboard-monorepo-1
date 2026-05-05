import { describe, it, expect } from "vitest";
import { renderEmailMarkdown } from "../shared/email-markdown";
import {
  TRAINING_CHASE_DEFAULT_BODY,
  renderChaseEmail,
} from "../server/training-notifications";

describe("renderEmailMarkdown", () => {
  it("renders **bold** as <strong>", () => {
    const html = renderEmailMarkdown("Hello **world**");
    expect(html).toContain("<strong");
    expect(html).toContain(">world</strong>");
    expect(html).not.toContain("**");
  });

  it("renders *italic* as <em>", () => {
    const html = renderEmailMarkdown("Hello *world*");
    expect(html).toContain("<em");
    expect(html).toContain(">world</em>");
  });

  it("does not treat ** as italic", () => {
    const html = renderEmailMarkdown("**bold not italic**");
    expect(html).toContain("<strong");
    expect(html).not.toContain("<em");
  });

  it("renders #/##/### headings as h1/h2/h3", () => {
    const html = renderEmailMarkdown("# A\n\n## B\n\n### C\n\n#### D");
    expect(html).toMatch(/<h1[^>]*>A<\/h1>/);
    expect(html).toMatch(/<h2[^>]*>B<\/h2>/);
    expect(html).toMatch(/<h3[^>]*>C<\/h3>/);
    // h4+ collapses to h3 (we cap at 3 since email clients render h4+
    // inconsistently and our style table only defines up to h3).
    expect(html).toMatch(/<h3[^>]*>D<\/h3>/);
  });

  it("groups consecutive `-` bullets into a single <ul>", () => {
    const html = renderEmailMarkdown("- one\n- two\n- three");
    expect((html.match(/<ul/g) || []).length).toBe(1);
    expect((html.match(/<li/g) || []).length).toBe(3);
  });

  it("groups consecutive `*` bullets into a single <ul>", () => {
    const html = renderEmailMarkdown("* one\n* two");
    expect((html.match(/<ul/g) || []).length).toBe(1);
    expect((html.match(/<li/g) || []).length).toBe(2);
  });

  it("groups numbered lines into a single <ol> even when separated by a blank line", () => {
    const html = renderEmailMarkdown("1. First option\n\n2. Second option");
    expect((html.match(/<ol/g) || []).length).toBe(1);
    expect((html.match(/<li/g) || []).length).toBe(2);
  });

  it("turns blank-line-separated text into paragraphs and single newlines into <br>", () => {
    const html = renderEmailMarkdown("para one line a\npara one line b\n\npara two");
    expect((html.match(/<p/g) || []).length).toBe(2);
    expect(html).toContain("<br />");
  });

  it("linkifies bare http(s) URLs", () => {
    const html = renderEmailMarkdown("see https://example.com/path here");
    expect(html).toContain('href="https://example.com/path"');
    expect(html).toContain(">https://example.com/path</a>");
  });

  it("does not include trailing punctuation in the linkified URL", () => {
    const html = renderEmailMarkdown("visit https://example.com.");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain(">https://example.com</a>.");
  });

  it("renders inline `code` spans", () => {
    const html = renderEmailMarkdown("use `npm run build` to compile");
    expect(html).toContain("<code");
    expect(html).toContain(">npm run build</code>");
  });

  it("escapes raw HTML so admins/LLMs can't inject markup", () => {
    const html = renderEmailMarkdown("Hello <script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("preserves '*' characters inside inline code without italicising them", () => {
    const html = renderEmailMarkdown("config: `value*here`");
    expect(html).toContain(">value*here</code>");
    expect(html).not.toContain("<em");
  });

  it("does not leak literal markdown characters from the documented subset", () => {
    const sample = `# Heading

Some **bold** and *italic* and \`code\`.

- bullet one
- bullet two

1. step one
2. step two

Visit https://example.com for more.`;
    const html = renderEmailMarkdown(sample);
    // No raw markdown leaders should remain outside code spans / urls.
    expect(html).not.toMatch(/(^|>|\s)\*\*/);
    expect(html).not.toMatch(/(^|>|\s)## /);
    expect(html).not.toMatch(/(^|>|\s)# /);
    expect(html).not.toMatch(/(^|>|\s)- /);
    expect(html).not.toMatch(/(^|>|\s)\d+\. /);
  });
});

describe("chase email integration with shared markdown renderer", () => {
  it("default chase template renders greeting name in bold", () => {
    const expiry = new Date("2026-06-01T00:00:00Z");
    const { body } = renderChaseEmail(
      { subject: "x", body: TRAINING_CHASE_DEFAULT_BODY },
      {
        nurseName: "Sarah Smith",
        modules: [
          { moduleName: "Manual Handling", status: "red", label: "expired 12 Apr 2026" },
          { moduleName: "Fire Safety", status: "amber", label: "expires in 14 days" },
        ],
        portalUrl: "https://portal.example.com/portal/abc",
        portalExpiresAt: expiry,
      },
    );
    const html = renderEmailMarkdown(body);
    // Greeting name bold
    expect(html).toMatch(/<strong[^>]*>Sarah Smith<\/strong>/);
    // Each module name bold inside a real <ul>
    expect((html.match(/<ul/g) || []).length).toBe(1);
    expect(html).toMatch(/<strong[^>]*>Manual Handling<\/strong>/);
    expect(html).toMatch(/<strong[^>]*>Fire Safety<\/strong>/);
    // Numbered "two options" rendered as a real <ol>
    expect((html.match(/<ol/g) || []).length).toBe(1);
    expect((html.match(/<li/g) || []).length).toBeGreaterThanOrEqual(4);
    // Expiry date bold
    expect(html).toMatch(/<strong[^>]*>1 June 2026<\/strong>/);
    // Portal URL is linkified
    expect(html).toContain('href="https://portal.example.com/portal/abc"');
    // No raw asterisks leaked
    expect(html).not.toContain("**");
  });
});
