// Tiny markdown→HTML renderer used by every automated email body.
//
// Why this exists:
//   - The chase-to-nurse email was rendering admin-typed `**bold**` as
//     literal asterisks because the previous pipeline only escaped HTML
//     and wrapped everything in <pre>-style paragraphs.
//   - The AI assessment summary email was running a partial regex chain
//     that handled `## h2`, `**bold**` and `\n- bullet` and leaked any
//     other markdown the model emitted (`### h3`, `*italic*`, `*` bullets,
//     numbered lists, inline code) as raw characters.
//
// We intentionally do NOT pull in a full markdown library here:
//   1. Email clients (especially Outlook desktop) need inline styles —
//      classes/<style> blocks are stripped. A bespoke renderer lets us
//      attach the right inline styles to every tag.
//   2. We only need to support the subset admins actually type and the
//      LLM actually emits. Documented support:
//        - `**bold**`, `*italic*`
//        - `#`, `##`, `###`, `####`+ headings
//        - `-` / `*` bullet lists → <ul>
//        - `1.` numbered lists    → <ol>
//        - inline ``code``
//        - blank-line paragraph breaks; single newlines → <br>
//        - bare http(s):// URLs → anchor tags
//   3. Pure + dependency-free so both server (sending) and client
//      (admin preview pane) can import it via `@shared/email-markdown`
//      and produce identical HTML.

export interface EmailMarkdownStyles {
  paragraph: string;
  strong: string;
  em: string;
  h1: string;
  h2: string;
  h3: string;
  ul: string;
  ol: string;
  li: string;
  a: string;
  code: string;
}

export const DEFAULT_EMAIL_MARKDOWN_STYLES: EmailMarkdownStyles = {
  paragraph:
    "font-size:14px;color:#E0DCD4;line-height:1.85;margin:0 0 14px;",
  strong: "color:#F0ECE4;font-weight:600;",
  em: "font-style:italic;color:#F0ECE4;",
  h1: "color:#F0ECE4;font-size:20px;font-weight:600;margin:24px 0 12px;line-height:1.3;",
  h2: "color:#F0ECE4;font-size:17px;font-weight:600;margin:22px 0 10px;line-height:1.3;",
  h3: "color:#C8A96E;font-size:15px;font-weight:600;margin:20px 0 10px;line-height:1.3;",
  ul: "margin:0 0 14px;padding-left:22px;color:#E0DCD4;font-size:14px;line-height:1.75;",
  ol: "margin:0 0 14px;padding-left:22px;color:#E0DCD4;font-size:14px;line-height:1.75;",
  li: "margin:4px 0;",
  a: "color:#C8A96E;text-decoration:underline;",
  code:
    "font-family:'Courier New',Consolas,monospace;background:#0a0a2e;padding:1px 5px;border-radius:3px;font-size:13px;color:#F0ECE4;",
};

export interface RenderEmailMarkdownOptions {
  /** Override one or more inline-style strings. */
  styles?: Partial<EmailMarkdownStyles>;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface InlineStyleRefs {
  strong: string;
  em: string;
  a: string;
  code: string;
}

const CODE_PLACEHOLDER_PREFIX = "\u0000CODE";
const CODE_PLACEHOLDER_SUFFIX = "\u0000";

function renderInline(text: string, s: InlineStyleRefs): string {
  // 1. Pull code spans out FIRST so their contents are immune to bold/
  //    italic/linkify substitution. We replace them back in at the end.
  const codeContents: string[] = [];
  let working = text.replace(/`([^`\n]+)`/g, (_m, inner: string) => {
    codeContents.push(inner);
    return `${CODE_PLACEHOLDER_PREFIX}${codeContents.length - 1}${CODE_PLACEHOLDER_SUFFIX}`;
  });

  // 2. Escape any raw HTML the admin or LLM may have typed.
  working = escapeHtml(working);

  // 3. Bold (process before italic so `**…**` isn't mistaken for two
  //    italics). Non-greedy, no asterisks inside.
  working = working.replace(
    /\*\*([^*\n]+?)\*\*/g,
    `<strong style="${s.strong}">$1</strong>`,
  );

  // 4. Italic — single `*text*`. Avoid matching the leftover `*` of an
  //    already-handled bold by requiring the opening `*` to NOT be
  //    preceded by another `*`, and not followed by whitespace.
  working = working.replace(
    /(^|[^*])\*(?!\s)([^*\n]+?)(?<!\s)\*(?!\*)/g,
    `$1<em style="${s.em}">$2</em>`,
  );

  // 5. Bare URLs → anchor tags. Trim trailing punctuation that almost
  //    certainly isn't part of the URL (sentences end with `.`, `,`, `)`,
  //    etc.) so "see https://x." doesn't link the trailing dot.
  working = working.replace(/(https?:\/\/[^\s<]+)/g, (raw) => {
    const m = /^(.*?)([.,;:!?)\]]*)$/.exec(raw);
    const url = m ? m[1] : raw;
    const trail = m ? m[2] : "";
    return `<a href="${url}" style="${s.a}">${url}</a>${trail}`;
  });

  // 6. Restore code spans (their content was captured pre-escape so
  //    re-escape it now to keep it safe).
  working = working.replace(
    new RegExp(`${CODE_PLACEHOLDER_PREFIX}(\\d+)${CODE_PLACEHOLDER_SUFFIX}`, "g"),
    (_m, idx: string) =>
      `<code style="${s.code}">${escapeHtml(codeContents[Number(idx)])}</code>`,
  );

  return working;
}

const BULLET_RE = /^(\s*)([-*])\s+(.*)$/;
const ORDERED_RE = /^(\s*)\d+\.\s+(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.+)$/;

/**
 * Convert an email body written in our documented markdown subset into
 * inline-styled HTML safe to drop straight into a <td> in an Outlook /
 * Gmail message.
 */
export function renderEmailMarkdown(
  source: string,
  options: RenderEmailMarkdownOptions = {},
): string {
  const styles: EmailMarkdownStyles = {
    ...DEFAULT_EMAIL_MARKDOWN_STYLES,
    ...(options.styles || {}),
  };
  const inlineRefs: InlineStyleRefs = {
    strong: styles.strong,
    em: styles.em,
    a: styles.a,
    code: styles.code,
  };

  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const inner = paragraph
      .map((l) => renderInline(l, inlineRefs))
      .join("<br />");
    out.push(`<p style="${styles.paragraph}">${inner}</p>`);
    paragraph = [];
  };

  // Helpers for detecting the start of (or continuation of) a list. A
  // single blank line between two list-style lines does NOT break the
  // list — that lets the default chase template keep blank lines between
  // its "1." and "2." items without producing two single-item <ol>s.
  const isUnordered = (l: string | undefined) => !!l && BULLET_RE.test(l);
  const isOrdered = (l: string | undefined) => !!l && ORDERED_RE.test(l);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      flushParagraph();
      i++;
      continue;
    }

    const headingMatch = HEADING_RE.exec(trimmed);
    if (headingMatch) {
      flushParagraph();
      const rawLevel = headingMatch[1].length;
      const level = rawLevel <= 1 ? 1 : rawLevel === 2 ? 2 : 3;
      const tag = `h${level}` as "h1" | "h2" | "h3";
      out.push(
        `<${tag} style="${styles[tag]}">${renderInline(headingMatch[2].trim(), inlineRefs)}</${tag}>`,
      );
      i++;
      continue;
    }

    if (isUnordered(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length) {
        if (isUnordered(lines[i])) {
          const m = BULLET_RE.exec(lines[i])!;
          items.push(m[3]);
          i++;
        } else if (lines[i].trim() === "" && isUnordered(lines[i + 1])) {
          // Skip blank line between two bullets.
          i++;
        } else {
          break;
        }
      }
      out.push(
        `<ul style="${styles.ul}">${items
          .map(
            (it) =>
              `<li style="${styles.li}">${renderInline(it, inlineRefs)}</li>`,
          )
          .join("")}</ul>`,
      );
      continue;
    }

    if (isOrdered(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length) {
        if (isOrdered(lines[i])) {
          const m = ORDERED_RE.exec(lines[i])!;
          items.push(m[2]);
          i++;
        } else if (lines[i].trim() === "" && isOrdered(lines[i + 1])) {
          // Skip blank line between two numbered items.
          i++;
        } else {
          break;
        }
      }
      out.push(
        `<ol style="${styles.ol}">${items
          .map(
            (it) =>
              `<li style="${styles.li}">${renderInline(it, inlineRefs)}</li>`,
          )
          .join("")}</ol>`,
      );
      continue;
    }

    paragraph.push(line);
    i++;
  }
  flushParagraph();

  return out.join("\n");
}
