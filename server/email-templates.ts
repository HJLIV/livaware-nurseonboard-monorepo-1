// ─────────────────────────────────────────────────────────────────────────
// Editable email template registry.
//
// Every transactional email the platform sends has its editable prose
// stored here as a list of plain-text fields. Admins edit those fields
// in /settings — they never see HTML. The renderer assembles the fields
// into the branded HTML envelope at send time.
//
// Per-template structure:
//   { key, label, description, tokens, defaultSubject, fields[], renderBody }
// `renderBody` returns the inner-card HTML; the shared envelope wraps it.
//
// Storage: the `email_templates` table holds `subject` and a `fields`
// jsonb blob (one value per field name). If the row or column is missing
// the registry defaults are used so seeded environments keep working.
// ─────────────────────────────────────────────────────────────────────────

import { storage } from "./storage";

// ─── Field/token types ───────────────────────────────────────────────

export type FieldKind = "text" | "textarea" | "list";

export interface TemplateField {
  name: string;
  label: string;
  kind: FieldKind;
  default: string;        // For "list", newline-separated
  help?: string;
  rows?: number;          // Suggested textarea rows
}

export interface TokenDef {
  name: string;           // e.g. "{{NAME}}"
  description: string;
}

export interface TemplateDef {
  key: string;
  label: string;
  description: string;
  category: "nurse" | "internal" | "broadcast";
  tokens: TokenDef[];
  defaultSubject: string;
  fields: TemplateField[];
  /** Renders the inner card HTML (gets injected into the envelope). */
  renderBody: (
    values: Record<string, string>,
    tokens: Record<string, string>,
  ) => string;
  /** Renders the plain-text fallback body. */
  renderText: (
    values: Record<string, string>,
    tokens: Record<string, string>,
  ) => string;
  /** Envelope flavour. */
  envelope: {
    headerEyebrow?: string;     // tiny caps line above title (if gradient header)
    headerTitle: string;        // big serif title
    headerSubtitle: string;     // small caps line beneath title
    gradientHeader?: boolean;   // launch/welcome style vs flat
    footerText: string;
    footerSecondLine?: string;  // e.g. "Replies reach our onboarding team"
  };
}

// ─── HTML helpers ────────────────────────────────────────────────────

export function escapeHtml(text: string): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Split a textarea value on blank lines into <p> paragraphs. */
export function paragraphs(text: string, opts: { color?: string; size?: string } = {}): string {
  const color = opts.color || "#E0DCD4";
  const size = opts.size || "14px";
  const parts = String(text ?? "").split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
  return parts
    .map(
      (p) =>
        `<p style="font-size:${size}; color:${color}; line-height:1.85; margin:0 0 16px;">${
          escapeHtml(p).replace(/\n/g, "<br />")
        }</p>`,
    )
    .join("\n");
}

/** Single short paragraph (no <br> conversion, no escaping of inline tags). */
export function smallNote(text: string, color = "#8A8A94"): string {
  if (!text?.trim()) return "";
  return `<p style="font-size:13px; color:${color}; line-height:1.7; margin:0 0 12px;">${escapeHtml(text)}</p>`;
}

/** Newline-separated list → <ul>. Bullet items support "Title — body" syntax
 *  (we bold the title before the em-dash). Numbered variant uses <ol>. */
export function bulletList(
  raw: string,
  opts: { ordered?: boolean } = {},
): string {
  const items = String(raw ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/^[-*•]\s*/, ""))
    .filter(Boolean);
  if (items.length === 0) return "";
  const tag = opts.ordered ? "ol" : "ul";
  const lis = items
    .map((item) => {
      const idx = item.indexOf("—");
      if (idx > 0 && idx < 80) {
        const head = item.slice(0, idx).trim();
        const tail = item.slice(idx + 1).trim();
        return `<li style="margin:0 0 6px;"><strong style="color:#F0ECE4;">${escapeHtml(head)}</strong> — ${escapeHtml(tail)}</li>`;
      }
      return `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`;
    })
    .join("\n");
  return `<${tag} style="font-size:13px; color:#E0DCD4; line-height:1.85; margin:0; padding-left:22px;">${lis}</${tag}>`;
}

/** Inset callout (left gold bar) with optional title and arbitrary body html. */
export function calloutBox(
  title: string,
  innerHtml: string,
  opts: { gold?: boolean } = {},
): string {
  const border = opts.gold ? "#C8A96E" : "#b8944e";
  return `
    <div style="background:#0d0d38; border-left:3px solid ${border}; padding:18px 22px; border-radius:0 6px 6px 0; margin:18px 0;">
      ${title ? `<p style="font-size:11px; color:#C8A96E; margin:0 0 10px; font-weight:500; letter-spacing:0.16em; text-transform:uppercase;">${escapeHtml(title)}</p>` : ""}
      ${innerHtml}
    </div>
  `;
}

/** Translucent gold accent box (sign-in nudge style). */
export function accentBox(title: string, bodyText: string): string {
  return `
    <div style="background:rgba(200,169,110,0.06); border:1px solid rgba(200,169,110,0.15); padding:16px 20px; border-radius:6px; margin:18px 0;">
      ${title ? `<p style="font-size:12px; color:#C8A96E; margin:0 0 6px; font-weight:500; letter-spacing:0.14em; text-transform:uppercase;">${escapeHtml(title)}</p>` : ""}
      <p style="font-size:13px; color:#E0DCD4; line-height:1.75; margin:0;">${escapeHtml(bodyText).replace(/\n/g, "<br />")}</p>
    </div>
  `;
}

/** Big gold CTA button. */
export function ctaButton(label: string, url: string): string {
  return `
    <div style="text-align:center; margin:28px 0;">
      <a href="${url}" style="display:inline-block; background-color:#C8A96E; background-image:linear-gradient(135deg,#C8A96E,#b8944e); color:#020121; text-decoration:none; padding:14px 52px; border-radius:4px; font-size:12px; font-weight:600; letter-spacing:0.18em; text-transform:uppercase;">${escapeHtml(label)}</a>
    </div>
  `;
}

/** "If button doesn't work, paste this link" line. */
export function fallbackLinkLine(url: string): string {
  return `
    <p style="font-size:12px; color:#8A8A94; line-height:1.6; word-break:break-all; text-align:center; margin:0 0 24px;">
      If the button above does not work, copy and paste this link into your browser:<br />
      <a href="${url}" style="color:#C8A96E; text-decoration:underline;">${escapeHtml(url)}</a>
    </p>
  `;
}

/** Greeting line that prefers first-name if name has spaces. */
export function firstName(fullName: string): string {
  return (fullName || "").trim().split(/\s+/)[0] || "there";
}

// ─── Envelope ────────────────────────────────────────────────────────

export interface EnvelopeOpts {
  headerEyebrow?: string;
  headerTitle: string;
  headerSubtitle: string;
  gradientHeader?: boolean;
  bodyHtml: string;
  footerText: string;
  footerSecondLine?: string;
}

export function renderEnvelope(opts: EnvelopeOpts): string {
  const header = opts.gradientHeader
    ? `
      <div style="background:linear-gradient(135deg,#0a0a2e 0%,#0d0d38 100%); padding:32px 32px 28px; text-align:center; border-bottom:1px solid #1e1e5a;">
        ${opts.headerEyebrow ? `<p style="color:#C8A96E; font-size:10px; letter-spacing:0.22em; text-transform:uppercase; margin:0 0 8px; font-weight:500;">${escapeHtml(opts.headerEyebrow)}</p>` : ""}
        <h1 style="color:#F0ECE4; font-family:'Georgia',serif; font-size:26px; font-weight:400; margin:0 0 6px; letter-spacing:-0.01em;">${escapeHtml(opts.headerTitle)}</h1>
        <p style="color:#8A8A94; font-size:10px; letter-spacing:0.18em; text-transform:uppercase; margin:0;">${escapeHtml(opts.headerSubtitle)}</p>
      </div>
    `
    : `
      <div style="background:#0a0a2e; padding:28px 32px; text-align:center; border-bottom:1px solid #1e1e5a;">
        <h1 style="color:#F0ECE4; font-family:'Georgia',serif; font-size:24px; font-weight:400; margin:0 0 4px; letter-spacing:-0.01em;">${escapeHtml(opts.headerTitle)}</h1>
        <p style="color:#8A8A94; font-size:10px; letter-spacing:0.18em; text-transform:uppercase; margin:0;">${escapeHtml(opts.headerSubtitle)}</p>
      </div>
    `;
  const footer = `
    <div style="background:#0a0a2e; padding:16px 32px; text-align:center; border-top:1px solid #1e1e5a;">
      <p style="font-size:11px; color:#8A8A94; margin:0;">${escapeHtml(opts.footerText)}</p>
      ${opts.footerSecondLine ? `<p style="font-size:11px; color:#8A8A94; margin:4px 0 0;">${escapeHtml(opts.footerSecondLine)}</p>` : ""}
    </div>
  `;
  return `
    <div style="font-family:'Be Vietnam Pro','Segoe UI',Arial,sans-serif; max-width:600px; margin:0 auto; background:#020121;">
      ${header}
      <div style="padding:32px;">
        ${opts.bodyHtml}
      </div>
      ${footer}
    </div>
  `;
}

// ─── Token substitution ──────────────────────────────────────────────

/** Substitute tokens AND conditional {{#TOKEN}}…{{/TOKEN}} blocks. */
export function applyTokens(text: string, tokens: Record<string, string>): string {
  let out = String(text ?? "");
  // Conditional blocks: kept when token is truthy.
  out = out.replace(/\{\{#([A-Z_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, tok, body) =>
    tokens[tok] ? body : "",
  );
  for (const [tok, val] of Object.entries(tokens)) {
    out = out.split(`{{${tok}}}`).join(val ?? "");
  }
  return out;
}

// ─── Standard footer/text helpers ────────────────────────────────────

const STD_FOOTER = "Livaware Ltd — Secure Nurse Onboarding";
const CQC_FOOTER = "Livaware Ltd — Secure Nurse Onboarding · CQC Regulation 19 / Schedule 3 Compliant";
const AUTOMATED_LINE = "This is an automated message. Please do not reply directly to this email.";
const REPLY_LINE = "Replies to this email reach our onboarding team directly.";

// ─────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────

const REGISTRY: TemplateDef[] = [];

function register(def: TemplateDef) {
  REGISTRY.push(def);
}

// ─── 1. Portal invite ────────────────────────────────────────────────
register({
  key: "portal_invite",
  label: "Portal invite",
  description:
    "Sent when an admin issues a fresh secure portal link (e.g. after a candidate loses their original email).",
  category: "nurse",
  envelope: {
    headerTitle: "NurseOnboard",
    headerSubtitle: "Livaware Ltd — Secure Nurse Portal",
    footerText: CQC_FOOTER,
    footerSecondLine: AUTOMATED_LINE,
  },
  tokens: [
    { name: "{{NAME}}", description: "Full name" },
    { name: "{{PORTAL_URL}}", description: "The personal portal link" },
    { name: "{{EXPIRY}}", description: "Formatted link expiry date" },
  ],
  defaultSubject: "Livaware Ltd — Your Secure Portal Link",
  fields: [
    {
      name: "greeting",
      label: "Greeting line",
      kind: "text",
      default: "Dear {{NAME}},",
    },
    {
      name: "intro",
      label: "Opening paragraph(s)",
      kind: "textarea",
      rows: 3,
      default:
        "Here is your secure personal link to the Livaware nurse portal. You can use it to pick up wherever you left off, update your details, or share anything we still need from you.",
    },
    { name: "ctaLabel", label: "Button text", kind: "text", default: "Open Your Portal" },
    {
      name: "infoTitle",
      label: "Callout box title",
      kind: "text",
      default: "What to have handy",
    },
    {
      name: "infoItems",
      label: "Callout box items (one per line)",
      kind: "list",
      default:
        "Your NMC PIN, if you have one\nA right-to-work document (passport, visa or share code)\nAny training or qualification certificates you'd like on file",
    },
    {
      name: "infoFooter",
      label: "Note under the callout list",
      kind: "textarea",
      rows: 2,
      default:
        "Only share these if you need to — the portal will let you know what (if anything) is still outstanding.",
    },
    {
      name: "expiryNote",
      label: "Expiry / sign-in explanation",
      kind: "textarea",
      rows: 3,
      default:
        "This link is personal to you — please do not share it with anyone else. It's a one-time invite that signs you in on this device. After that, you'll sign in any time using your email and a 6-digit code we send you, so you can come back from any device. (For reference, the invite link itself expires on {{EXPIRY}}.)",
    },
    {
      name: "closingNote",
      label: "Closing note",
      kind: "textarea",
      rows: 2,
      default:
        "If you have any questions or difficulty accessing the portal, please contact our onboarding team.",
    },
    { name: "signoff", label: "Sign-off", kind: "textarea", rows: 2, default: "Kind regards,\nLivaware Onboarding Team" },
  ],
  renderBody: (v, t) => {
    const url = t.PORTAL_URL || "#";
    const list = bulletList(v.infoItems);
    return `
      <p style="font-size:16px; color:#F0ECE4; margin-bottom:8px;">${escapeHtml(applyTokens(v.greeting, t))}</p>
      ${paragraphs(applyTokens(v.intro, t))}
      ${ctaButton(applyTokens(v.ctaLabel, t), url)}
      ${fallbackLinkLine(url)}
      ${calloutBox(applyTokens(v.infoTitle, t), `${list}<p style="font-size:12px; color:#8A8A94; line-height:1.6; margin:12px 0 0;">${escapeHtml(applyTokens(v.infoFooter, t))}</p>`)}
      ${smallNote(applyTokens(v.expiryNote, t))}
      ${smallNote(applyTokens(v.closingNote, t))}
      <p style="font-size:14px; color:#E0DCD4; margin-top:24px; white-space:pre-line;">${escapeHtml(applyTokens(v.signoff, t))}</p>
    `;
  },
  renderText: (v, t) =>
    [
      applyTokens(v.greeting, t),
      "",
      applyTokens(v.intro, t),
      "",
      `${applyTokens(v.ctaLabel, t)}: ${t.PORTAL_URL || ""}`,
      "",
      applyTokens(v.infoTitle, t).toUpperCase(),
      ...v.infoItems.split(/\r?\n/).filter(Boolean).map((s) => ` - ${s.replace(/^[-*•]\s*/, "")}`),
      "",
      applyTokens(v.infoFooter, t),
      "",
      applyTokens(v.expiryNote, t),
      "",
      applyTokens(v.closingNote, t),
      "",
      applyTokens(v.signoff, t),
    ].join("\n"),
});

// ─── 2. Applicant welcome ────────────────────────────────────────────
register({
  key: "applicant_welcome",
  label: "Applicant welcome",
  description:
    "First-touch email sent when an admin registers a new applicant. Warmer than the generic portal invite — sets the tone for the journey.",
  category: "nurse",
  envelope: {
    headerEyebrow: "Your journey starts here",
    headerTitle: "Livaware",
    headerSubtitle: "Nurse Onboarding Portal",
    gradientHeader: true,
    footerText: CQC_FOOTER,
    footerSecondLine: REPLY_LINE,
  },
  tokens: [
    { name: "{{NAME}}", description: "Full name (greeting uses first name only)" },
    { name: "{{FIRST_NAME}}", description: "Just the first name" },
    { name: "{{PORTAL_URL}}", description: "Personal portal link" },
    { name: "{{EXPIRY}}", description: "Formatted link expiry date" },
  ],
  defaultSubject: "Welcome to Livaware — your journey starts here",
  fields: [
    { name: "greeting", label: "Greeting", kind: "text", default: "Hello {{FIRST_NAME}}," },
    {
      name: "intro1",
      label: "Opening paragraph",
      kind: "textarea",
      rows: 4,
      default:
        "A warm welcome to Livaware, and thank you for taking the first step with us. We're delighted you're considering joining our team of nurses, and we've set everything up so that getting to know us is as straightforward as possible.",
    },
    {
      name: "intro2",
      label: "Second paragraph",
      kind: "textarea",
      rows: 3,
      default:
        "Your secure personal portal is ready — it's where you'll complete each step of your application in your own time, at your own pace. Tap the button below to open it for the first time and you'll be signed in straight away on this device.",
    },
    { name: "ctaLabel", label: "Button text", kind: "text", default: "Open My Portal" },
    { name: "stepsTitle", label: "Steps box title", kind: "text", default: "Your three steps with us" },
    {
      name: "steps",
      label: "Steps (one per line, format: Title — description)",
      kind: "list",
      default:
        "A short clinical assessment — around 10–15 minutes online. A friendly first look at how you approach real-world scenarios; you can pause and come back to it any time.\nShare your documents — passport, right-to-work, NMC PIN and any training certificates. Upload from your phone or laptop, whichever's easier.\nSkills Arcade — short interactive scenarios so you can show us how you think on the floor, and we get a sense of where you'll shine.",
    },
    { name: "signInTitle", label: "Sign-in box title", kind: "text", default: "Signing in again, any time" },
    {
      name: "signInBody",
      label: "Sign-in box body",
      kind: "textarea",
      rows: 4,
      default:
        "You don't need to keep this email to come back. Whenever you'd like to continue, just visit onboard.livaware.co.uk and enter your email address — we'll send you a 6-digit code to sign in straight away, from any phone, tablet or laptop.\n\nThis first invite link is personal to you, so please keep it private. For reference, it expires on {{EXPIRY}} — but the email-and-code sign-in above always works.",
    },
    {
      name: "closingNote",
      label: "Closing note",
      kind: "textarea",
      rows: 2,
      default:
        "If anything's unclear or you hit a snag along the way, just reply to this email and a real person on our onboarding team will get back to you.",
    },
    {
      name: "signoff",
      label: "Sign-off",
      kind: "textarea",
      rows: 2,
      default: "Looking forward to getting to know you,\nThe Livaware Onboarding Team",
    },
  ],
  renderBody: (v, t) => {
    const url = t.PORTAL_URL || "#";
    return `
      <p style="font-size:17px; color:#F0ECE4; margin:0 0 16px; font-family:'Georgia',serif; font-weight:400;">${escapeHtml(applyTokens(v.greeting, t))}</p>
      ${paragraphs(applyTokens(v.intro1, t))}
      ${paragraphs(applyTokens(v.intro2, t))}
      ${ctaButton(applyTokens(v.ctaLabel, t), url)}
      ${fallbackLinkLine(url)}
      ${calloutBox(applyTokens(v.stepsTitle, t), bulletList(v.steps, { ordered: true }), { gold: true })}
      ${accentBox(applyTokens(v.signInTitle, t), applyTokens(v.signInBody, t))}
      ${smallNote(applyTokens(v.closingNote, t), "#B0AAA0")}
      <p style="font-size:14px; color:#E0DCD4; margin-top:28px; white-space:pre-line; line-height:1.7;">${escapeHtml(applyTokens(v.signoff, t))}</p>
    `;
  },
  renderText: (v, t) =>
    [
      applyTokens(v.greeting, t),
      "",
      applyTokens(v.intro1, t),
      "",
      applyTokens(v.intro2, t),
      "",
      `${applyTokens(v.ctaLabel, t)}: ${t.PORTAL_URL || ""}`,
      "",
      applyTokens(v.stepsTitle, t).toUpperCase(),
      ...v.steps.split(/\r?\n/).filter(Boolean).map((s, i) => `${i + 1}. ${s}`),
      "",
      applyTokens(v.signInTitle, t).toUpperCase(),
      applyTokens(v.signInBody, t),
      "",
      applyTokens(v.closingNote, t),
      "",
      applyTokens(v.signoff, t),
    ].join("\n"),
});

// ─── 3. Onboarding unlocked ──────────────────────────────────────────
register({
  key: "onboarding_unlocked",
  label: "Onboarding unlocked",
  description:
    "Sent when a nurse passes the three onboarding prerequisites and the Induction & Training section opens for them.",
  category: "nurse",
  envelope: {
    headerEyebrow: "You're through compliance",
    headerTitle: "Livaware",
    headerSubtitle: "Nurse Onboarding Portal",
    gradientHeader: true,
    footerText: STD_FOOTER,
  },
  tokens: [
    { name: "{{NAME}}", description: "Full name" },
    { name: "{{FIRST_NAME}}", description: "Just the first name" },
    { name: "{{PORTAL_URL}}", description: "Personal portal link" },
  ],
  defaultSubject: "Livaware — Your onboarding is unlocked",
  fields: [
    { name: "greeting", label: "Greeting", kind: "text", default: "Hello {{FIRST_NAME}}," },
    {
      name: "intro1",
      label: "Opening paragraph",
      kind: "textarea",
      rows: 3,
      default:
        "Great news — your compliance checks are complete and we've now unlocked the next part of your portal. The Induction & Training section is open and waiting for you.",
    },
    {
      name: "intro2",
      label: "Second paragraph",
      kind: "textarea",
      rows: 2,
      default:
        "When you have a quiet 30 minutes, please sign in and work through it. Each section saves automatically, so you can pause and come back any time.",
    },
    { name: "ctaLabel", label: "Button text", kind: "text", default: "Open My Portal" },
    { name: "waitingTitle", label: "Callout title", kind: "text", default: "What's now waiting for you" },
    {
      name: "waitingItems",
      label: "Callout items (one per line, format: Title — description)",
      kind: "list",
      default:
        "Employee handbook & induction — please read and acknowledge.\nPolicies — sign off on the current versions of our SOPs and policies.\nMandatory training — any outstanding modules to upload or complete.\nSkills Arcade — short scenarios to round out your profile.",
    },
    { name: "signInTitle", label: "Sign-in box title", kind: "text", default: "Signing in any time" },
    {
      name: "signInBody",
      label: "Sign-in box body",
      kind: "textarea",
      rows: 3,
      default:
        "You don't need to keep this email. Visit onboard.livaware.co.uk any time and enter your email — we'll send you a 6-digit code to sign in straight away.",
    },
    {
      name: "closingNote",
      label: "Closing note",
      kind: "textarea",
      rows: 2,
      default:
        "If anything's unclear or you'd like a hand, just reply to this email and someone from our onboarding team will get back to you.",
    },
    {
      name: "signoff",
      label: "Sign-off",
      kind: "textarea",
      rows: 2,
      default: "Thanks for getting through compliance,\nThe Livaware Onboarding Team",
    },
  ],
  renderBody: (v, t) => {
    const url = t.PORTAL_URL || "#";
    return `
      <p style="font-size:17px; color:#F0ECE4; margin:0 0 16px; font-family:'Georgia',serif; font-weight:400;">${escapeHtml(applyTokens(v.greeting, t))}</p>
      ${paragraphs(applyTokens(v.intro1, t))}
      ${paragraphs(applyTokens(v.intro2, t))}
      ${ctaButton(applyTokens(v.ctaLabel, t), url)}
      ${fallbackLinkLine(url)}
      ${calloutBox(applyTokens(v.waitingTitle, t), bulletList(v.waitingItems), { gold: true })}
      ${accentBox(applyTokens(v.signInTitle, t), applyTokens(v.signInBody, t))}
      ${smallNote(applyTokens(v.closingNote, t), "#B0AAA0")}
      <p style="font-size:14px; color:#E0DCD4; margin-top:28px; white-space:pre-line; line-height:1.7;">${escapeHtml(applyTokens(v.signoff, t))}</p>
    `;
  },
  renderText: (v, t) =>
    [
      applyTokens(v.greeting, t),
      "",
      applyTokens(v.intro1, t),
      "",
      applyTokens(v.intro2, t),
      "",
      `${applyTokens(v.ctaLabel, t)}: ${t.PORTAL_URL || ""}`,
      "",
      applyTokens(v.waitingTitle, t).toUpperCase(),
      ...v.waitingItems.split(/\r?\n/).filter(Boolean).map((s) => ` - ${s}`),
      "",
      applyTokens(v.signInBody, t),
      "",
      applyTokens(v.closingNote, t),
      "",
      applyTokens(v.signoff, t),
    ].join("\n"),
});

// ─── 4. Outstanding nudge ────────────────────────────────────────────
register({
  key: "outstanding_nudge",
  label: "Outstanding-items nudge",
  description:
    "Personalised reminder sent from the candidate Actions menu to flag what's still outstanding in the portal.",
  category: "nurse",
  envelope: {
    headerEyebrow: "A gentle nudge",
    headerTitle: "Livaware",
    headerSubtitle: "Nurse Onboarding Portal",
    gradientHeader: true,
    footerText: STD_FOOTER,
    footerSecondLine: REPLY_LINE,
  },
  tokens: [
    { name: "{{NAME}}", description: "Full name" },
    { name: "{{FIRST_NAME}}", description: "Just the first name" },
    { name: "{{ITEMS_LIST}}", description: "Bullet list of outstanding items (generated at send time)" },
  ],
  defaultSubject: "A gentle nudge from Livaware — a few things still to finish",
  fields: [
    { name: "greeting", label: "Greeting", kind: "text", default: "Hello {{FIRST_NAME}}," },
    {
      name: "intro",
      label: "Opening paragraph",
      kind: "textarea",
      rows: 3,
      default:
        "Just a friendly note from the Livaware onboarding team. We've had a look at your portal and there are a small number of things still to finish — nothing urgent, but if you can find a spare ten minutes it would help us move you along to the next stage.",
    },
    { name: "listTitle", label: "Callout title", kind: "text", default: "Still to finish" },
    {
      name: "fallbackItem",
      label: "Fallback line (shown if no items)",
      kind: "text",
      default: "A few finishing touches to wrap things up.",
    },
    { name: "signInTitle", label: "Sign-in box title", kind: "text", default: "Signing in" },
    {
      name: "signInBody",
      label: "Sign-in box body",
      kind: "textarea",
      rows: 3,
      default:
        "Whenever you're ready, go to onboard.livaware.co.uk, type in your email, and we'll send you a 6-digit code to sign straight in. No password to remember, no link to dig out of an old email.",
    },
    {
      name: "closingNote",
      label: "Closing note",
      kind: "textarea",
      rows: 2,
      default:
        "If anything's unclear or you've already sorted one of these on your end, just reply to this email and a real person on our onboarding team will pick it up.",
    },
    {
      name: "signoff",
      label: "Sign-off",
      kind: "textarea",
      rows: 2,
      default: "With our thanks,\nThe Livaware Onboarding Team",
    },
  ],
  renderBody: (v, t) => {
    const items = t.ITEMS_LIST || "";
    const listHtml = items
      ? `<ul style="font-size:13px; color:#E0DCD4; line-height:1.7; margin:0; padding-left:22px;">${items
          .split(/\r?\n/)
          .filter(Boolean)
          .map((i) => `<li style="margin:0 0 8px;"><span style="color:#F0ECE4; font-weight:500;">${escapeHtml(i)}</span></li>`)
          .join("")}</ul>`
      : `<ul style="font-size:13px; color:#E0DCD4; line-height:1.7; margin:0; padding-left:22px;"><li>${escapeHtml(applyTokens(v.fallbackItem, t))}</li></ul>`;
    return `
      <p style="font-size:17px; color:#F0ECE4; margin:0 0 16px; font-family:'Georgia',serif; font-weight:400;">${escapeHtml(applyTokens(v.greeting, t))}</p>
      ${paragraphs(applyTokens(v.intro, t))}
      ${calloutBox(applyTokens(v.listTitle, t), listHtml, { gold: true })}
      ${accentBox(applyTokens(v.signInTitle, t), applyTokens(v.signInBody, t))}
      ${smallNote(applyTokens(v.closingNote, t), "#B0AAA0")}
      <p style="font-size:14px; color:#E0DCD4; margin-top:26px; white-space:pre-line; line-height:1.7;">${escapeHtml(applyTokens(v.signoff, t))}</p>
    `;
  },
  renderText: (v, t) =>
    [
      applyTokens(v.greeting, t),
      "",
      applyTokens(v.intro, t),
      "",
      applyTokens(v.listTitle, t).toUpperCase(),
      ...(t.ITEMS_LIST || applyTokens(v.fallbackItem, t))
        .split(/\r?\n/)
        .filter(Boolean)
        .map((s) => ` - ${s}`),
      "",
      applyTokens(v.signInBody, t),
      "",
      applyTokens(v.closingNote, t),
      "",
      applyTokens(v.signoff, t),
    ].join("\n"),
});

// ─── 5. Sign-in reminder ─────────────────────────────────────────────
register({
  key: "sign_in_reminder",
  label: "Sign-in reminder",
  description:
    "Tiny 'the door is open' reminder. No portal link — just instructions on how to sign in with email + code.",
  category: "nurse",
  envelope: {
    headerEyebrow: "Always one sign-in away",
    headerTitle: "Livaware",
    headerSubtitle: "Nurse Onboarding Portal",
    gradientHeader: true,
    footerText: STD_FOOTER,
    footerSecondLine: REPLY_LINE,
  },
  tokens: [
    { name: "{{NAME}}", description: "Full name" },
    { name: "{{FIRST_NAME}}", description: "Just the first name" },
    { name: "{{EMAIL}}", description: "Recipient email address" },
  ],
  defaultSubject: "Your Livaware portal is always one sign-in away",
  fields: [
    { name: "greeting", label: "Greeting", kind: "text", default: "Hello {{FIRST_NAME}}," },
    {
      name: "intro",
      label: "Opening paragraph",
      kind: "textarea",
      rows: 3,
      default:
        "A quick note to remind you that your Livaware portal is always open whenever you'd like to pick things up again — there's nothing to install, no password to reset, and no old email to dig out.",
    },
    { name: "howTitle", label: "Steps box title", kind: "text", default: "How to sign back in" },
    {
      name: "steps",
      label: "Steps (one per line)",
      kind: "list",
      default:
        "Go to onboard.livaware.co.uk\nType in this email address ({{EMAIL}})\nWe'll send you a 6-digit code — pop it in and you're back in your portal",
    },
    {
      name: "closingNote",
      label: "Closing note",
      kind: "textarea",
      rows: 2,
      default:
        "You can do this from any phone, tablet or laptop, and as many times as you like. If you ever change your email address, just reply to this email and we'll update our records.",
    },
    {
      name: "signoff",
      label: "Sign-off",
      kind: "textarea",
      rows: 2,
      default: "See you soon,\nThe Livaware Onboarding Team",
    },
  ],
  renderBody: (v, t) => `
    <p style="font-size:17px; color:#F0ECE4; margin:0 0 16px; font-family:'Georgia',serif; font-weight:400;">${escapeHtml(applyTokens(v.greeting, t))}</p>
    ${paragraphs(applyTokens(v.intro, t))}
    ${calloutBox(applyTokens(v.howTitle, t), bulletList(applyTokens(v.steps, t), { ordered: true }), { gold: true })}
    ${smallNote(applyTokens(v.closingNote, t), "#B0AAA0")}
    <p style="font-size:14px; color:#E0DCD4; margin-top:26px; white-space:pre-line; line-height:1.7;">${escapeHtml(applyTokens(v.signoff, t))}</p>
  `,
  renderText: (v, t) =>
    [
      applyTokens(v.greeting, t),
      "",
      applyTokens(v.intro, t),
      "",
      applyTokens(v.howTitle, t).toUpperCase(),
      ...applyTokens(v.steps, t).split(/\r?\n/).filter(Boolean).map((s, i) => `${i + 1}. ${s}`),
      "",
      applyTokens(v.closingNote, t),
      "",
      applyTokens(v.signoff, t),
    ].join("\n"),
});

// ─── 6. Portal sign-in code ──────────────────────────────────────────
register({
  key: "portal_sign_in_code",
  label: "Portal sign-in code",
  description:
    "One-time 6-digit code for passwordless portal sign-in. The big code block itself is rendered automatically.",
  category: "nurse",
  envelope: {
    headerTitle: "NurseOnboard",
    headerSubtitle: "Livaware Ltd — Sign-in code",
    footerText: STD_FOOTER,
    footerSecondLine: AUTOMATED_LINE,
  },
  tokens: [
    { name: "{{NAME}}", description: "Full name" },
    { name: "{{CODE}}", description: "The 6-digit code (rendered inside the code box automatically)" },
    { name: "{{MINUTES}}", description: "Minutes until the code expires" },
  ],
  defaultSubject: "Livaware Ltd — Your portal sign-in code",
  fields: [
    { name: "greeting", label: "Greeting", kind: "text", default: "Dear {{NAME}}," },
    {
      name: "intro",
      label: "Opening paragraph (mention {{MINUTES}})",
      kind: "textarea",
      rows: 3,
      default:
        "Use the code below to sign back in to your Livaware nurse portal. It is valid for the next {{MINUTES}} minutes and can only be used once.",
    },
    {
      name: "footerNote",
      label: "Note after the code",
      kind: "textarea",
      rows: 2,
      default:
        "If you did not request this code, you can safely ignore this email — your account stays locked until someone enters the code.",
    },
    {
      name: "signoff",
      label: "Sign-off",
      kind: "textarea",
      rows: 2,
      default: "Kind regards,\nLivaware Onboarding Team",
    },
  ],
  renderBody: (v, t) => `
    <p style="font-size:16px; color:#F0ECE4; margin-bottom:8px;">${escapeHtml(applyTokens(v.greeting, t))}</p>
    ${paragraphs(applyTokens(v.intro, t))}
    <div style="text-align:center; margin:28px 0;">
      <div style="display:inline-block; background:#0d0d38; border:1px solid #1e1e5a; padding:18px 32px; border-radius:8px; font-family:'Courier New',monospace; font-size:32px; letter-spacing:0.32em; color:#C8A96E; font-weight:600;">${escapeHtml(t.CODE || "")}</div>
    </div>
    ${smallNote(applyTokens(v.footerNote, t))}
    <p style="font-size:14px; color:#E0DCD4; margin-top:24px; white-space:pre-line;">${escapeHtml(applyTokens(v.signoff, t))}</p>
  `,
  renderText: (v, t) =>
    [
      applyTokens(v.greeting, t),
      "",
      applyTokens(v.intro, t),
      "",
      `Code: ${t.CODE || ""}`,
      "",
      applyTokens(v.footerNote, t),
      "",
      applyTokens(v.signoff, t),
    ].join("\n"),
});

// ─── 7. Reference request ────────────────────────────────────────────
register({
  key: "reference_request",
  label: "Reference request",
  description:
    "Sent to a candidate's nominated referee asking them to complete the online reference form (CQC Reg 19).",
  category: "nurse",
  envelope: {
    headerTitle: "NurseOnboard",
    headerSubtitle: "Livaware Ltd — Reference Request",
    footerText: CQC_FOOTER,
    footerSecondLine: AUTOMATED_LINE,
  },
  tokens: [
    { name: "{{REFEREE_NAME}}", description: "Referee's name" },
    { name: "{{CANDIDATE_NAME}}", description: "Candidate's full name" },
    { name: "{{FORM_URL}}", description: "Unique referee form link" },
    { name: "{{EXPIRY}}", description: "Formatted link expiry date" },
  ],
  defaultSubject: "Livaware Ltd — Reference Request for {{CANDIDATE_NAME}}",
  fields: [
    {
      name: "body",
      label: "Email body (free-form, paragraphs separated by blank lines)",
      kind: "textarea",
      rows: 16,
      help:
        "This whole block is shown above the 'Complete Reference Form' button.",
      default:
        "Dear {{REFEREE_NAME}},\n\nWe are writing to request a professional reference for {{CANDIDATE_NAME}}, who has applied for a nursing position with Livaware Ltd. They have provided your details as a professional referee.\n\nUnder CQC Regulation 19 (Schedule 3), we are required to obtain satisfactory references covering character, conduct, clinical competence, and suitability for the role. We would be grateful if you could complete our secure online reference form.\n\nThe form covers professional relationship and capacity, clinical ability and competency ratings, reliability, communication, and teamwork, conduct and fitness to practise, sickness absence record, and clinical competency assessment matching our framework. It typically takes 10–15 minutes to complete.\n\nYour responses will be treated as confidential and used solely for the purpose of pre-employment screening in accordance with CQC requirements. If you have any questions, please contact our onboarding team.\n\nKind regards,\nLivaware Onboarding Team",
    },
    { name: "ctaLabel", label: "Button text", kind: "text", default: "Complete Reference Form" },
    {
      name: "expiryNote",
      label: "Note under the button",
      kind: "textarea",
      rows: 2,
      default:
        "This link is unique to this reference request — please do not share it. It will expire on {{EXPIRY}}. The form typically takes 10–15 minutes to complete.",
    },
  ],
  renderBody: (v, t) => {
    const url = t.FORM_URL || "#";
    return `
      ${paragraphs(applyTokens(v.body, t))}
      ${ctaButton(applyTokens(v.ctaLabel, t), url)}
      ${fallbackLinkLine(url)}
      ${smallNote(applyTokens(v.expiryNote, t))}
    `;
  },
  renderText: (v, t) =>
    [
      applyTokens(v.body, t),
      "",
      `${applyTokens(v.ctaLabel, t)}: ${t.FORM_URL || ""}`,
      "",
      applyTokens(v.expiryNote, t),
    ].join("\n"),
});

// ─── 8. Nurse invite (Skills Arcade credentials) ─────────────────────
register({
  key: "nurse_invite",
  label: "Skills Arcade invite",
  description:
    "Sent when a nurse is invited to the Skills Arcade with temporary login credentials.",
  category: "nurse",
  envelope: {
    headerTitle: "NurseOnboard",
    headerSubtitle: "Livaware Ltd — Skills Arcade Invitation",
    footerText: "Livaware Ltd — Secure Nurse Onboarding · Skills Arcade",
    footerSecondLine: AUTOMATED_LINE,
  },
  tokens: [
    { name: "{{NAME}}", description: "Full name" },
    { name: "{{EMAIL}}", description: "Login email" },
    { name: "{{PASSWORD}}", description: "Temporary password" },
    { name: "{{INVITED_BY}}", description: "Who sent the invite" },
  ],
  defaultSubject: "Livaware Skills Arcade — Your Login Credentials",
  fields: [
    { name: "greeting", label: "Greeting", kind: "text", default: "Dear {{NAME}}," },
    {
      name: "intro1",
      label: "Opening paragraph",
      kind: "textarea",
      rows: 3,
      default:
        "You have been invited by {{INVITED_BY}} to join the Livaware Skills Arcade — our online training and competency platform for nursing professionals.",
    },
    {
      name: "intro2",
      label: "Second paragraph",
      kind: "textarea",
      rows: 2,
      default: "Please use the credentials below to log in and begin your assigned training modules.",
    },
    { name: "credBoxTitle", label: "Credentials box title", kind: "text", default: "Your Login Credentials" },
    { name: "emailLabel", label: "Email label", kind: "text", default: "Email" },
    { name: "passwordLabel", label: "Password label", kind: "text", default: "Temporary Password" },
    {
      name: "securityNote",
      label: "Security note",
      kind: "textarea",
      rows: 2,
      default:
        "For security, please change your password after your first login. If you have any questions, contact the onboarding team.",
    },
    {
      name: "signoff",
      label: "Sign-off",
      kind: "textarea",
      rows: 2,
      default: "Kind regards,\nLivaware Onboarding Team",
    },
  ],
  renderBody: (v, t) => `
    <p style="font-size:16px; color:#F0ECE4; margin-bottom:8px;">${escapeHtml(applyTokens(v.greeting, t))}</p>
    ${paragraphs(applyTokens(v.intro1, t))}
    ${paragraphs(applyTokens(v.intro2, t))}
    ${calloutBox(
      applyTokens(v.credBoxTitle, t),
      `<p style="font-size:14px; color:#E0DCD4; margin:4px 0;"><strong style="color:#F0ECE4;">${escapeHtml(applyTokens(v.emailLabel, t))}:</strong> ${escapeHtml(t.EMAIL || "")}</p>
       <p style="font-size:14px; color:#E0DCD4; margin:4px 0;"><strong style="color:#F0ECE4;">${escapeHtml(applyTokens(v.passwordLabel, t))}:</strong> ${escapeHtml(t.PASSWORD || "")}</p>`,
    )}
    ${smallNote(applyTokens(v.securityNote, t))}
    <p style="font-size:14px; color:#E0DCD4; margin-top:24px; white-space:pre-line;">${escapeHtml(applyTokens(v.signoff, t))}</p>
  `,
  renderText: (v, t) =>
    [
      applyTokens(v.greeting, t),
      "",
      applyTokens(v.intro1, t),
      "",
      applyTokens(v.intro2, t),
      "",
      `${applyTokens(v.emailLabel, t)}: ${t.EMAIL || ""}`,
      `${applyTokens(v.passwordLabel, t)}: ${t.PASSWORD || ""}`,
      "",
      applyTokens(v.securityNote, t),
      "",
      applyTokens(v.signoff, t),
    ].join("\n"),
});

// ─── 9. Arcade module assignment ─────────────────────────────────────
register({
  key: "arcade_assignment",
  label: "Skills Arcade — module assigned",
  description:
    "Sent when a trainer assigns new scenario modules to a nurse.",
  category: "nurse",
  envelope: {
    headerTitle: "NurseOnboard",
    headerSubtitle: "Livaware Ltd — Skills Arcade Assignment",
    footerText: "Livaware Ltd — Secure Nurse Onboarding · Skills Arcade",
    footerSecondLine: AUTOMATED_LINE,
  },
  tokens: [
    { name: "{{NAME}}", description: "Full name" },
    { name: "{{ASSIGNED_BY}}", description: "Who assigned the modules" },
    { name: "{{MODULE_COUNT}}", description: "Number of modules assigned" },
    { name: "{{MODULES_LIST}}", description: "Bullet list of module names (auto-rendered)" },
    { name: "{{PORTAL_URL}}", description: "Portal link" },
    { name: "{{EXPIRY}}", description: "Formatted link expiry date" },
  ],
  defaultSubject: "Skills Arcade — new modules assigned to you",
  fields: [
    { name: "greeting", label: "Greeting", kind: "text", default: "Dear {{NAME}}," },
    {
      name: "intro",
      label: "Opening paragraph",
      kind: "textarea",
      rows: 3,
      default:
        "{{ASSIGNED_BY}} has assigned you {{MODULE_COUNT}} new clinical scenario(s) to complete in your Skills Arcade.",
    },
    { name: "boxTitle", label: "Modules box title", kind: "text", default: "New modules" },
    { name: "ctaLabel", label: "Button text", kind: "text", default: "Open Skills Arcade" },
    {
      name: "expiryNote",
      label: "Expiry / link note",
      kind: "textarea",
      rows: 2,
      default:
        "This link is personal to you — please do not share it. It will expire on {{EXPIRY}}. You can save your progress at any time and come back to it later.",
    },
    {
      name: "signoff",
      label: "Sign-off",
      kind: "textarea",
      rows: 2,
      default: "Kind regards,\nLivaware Onboarding Team",
    },
  ],
  renderBody: (v, t) => {
    const url = t.PORTAL_URL || "#";
    const moduleItems = (t.MODULES_LIST || "")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((m) => `<li style="font-size:14px; color:#E0DCD4; line-height:1.85; margin-bottom:4px;">${escapeHtml(m)}</li>`)
      .join("");
    return `
      <p style="font-size:16px; color:#F0ECE4; margin-bottom:8px;">${escapeHtml(applyTokens(v.greeting, t))}</p>
      ${paragraphs(applyTokens(v.intro, t))}
      ${calloutBox(applyTokens(v.boxTitle, t), `<ul style="margin:0; padding-left:20px;">${moduleItems}</ul>`)}
      ${ctaButton(applyTokens(v.ctaLabel, t), url)}
      ${fallbackLinkLine(url)}
      ${smallNote(applyTokens(v.expiryNote, t))}
      <p style="font-size:14px; color:#E0DCD4; margin-top:24px; white-space:pre-line;">${escapeHtml(applyTokens(v.signoff, t))}</p>
    `;
  },
  renderText: (v, t) =>
    [
      applyTokens(v.greeting, t),
      "",
      applyTokens(v.intro, t),
      "",
      applyTokens(v.boxTitle, t).toUpperCase(),
      ...(t.MODULES_LIST || "").split(/\r?\n/).filter(Boolean).map((s) => ` - ${s}`),
      "",
      `${applyTokens(v.ctaLabel, t)}: ${t.PORTAL_URL || ""}`,
      "",
      applyTokens(v.expiryNote, t),
      "",
      applyTokens(v.signoff, t),
    ].join("\n"),
});

// ─── 10. Training chase ──────────────────────────────────────────────
register({
  key: "training_chase",
  label: "Training chase (outstanding modules)",
  description:
    "Reminder sent to a nurse whose mandatory training is missing/expired/expiring. The bullet list of modules is auto-inserted at {{MODULES_LIST}}.",
  category: "nurse",
  envelope: {
    headerTitle: "NurseOnboard",
    headerSubtitle: "Livaware Ltd — Mandatory Training Reminder",
    footerText: CQC_FOOTER,
  },
  tokens: [
    { name: "{{NAME}}", description: "Full name" },
    { name: "{{MODULES_LIST}}", description: "Bullet list of outstanding modules" },
    { name: "{{COUNT}}", description: "Number of outstanding modules" },
    { name: "{{PORTAL_URL}}", description: "Secure upload link" },
    { name: "{{PORTAL_EXPIRY}}", description: "Formatted link expiry date" },
  ],
  defaultSubject: "Outstanding mandatory training — action required",
  fields: [
    {
      name: "body",
      label: "Email body (markdown supported — **bold**, bullet lists, etc.)",
      kind: "textarea",
      rows: 18,
      help:
        "The body is rendered as markdown so you can use **bold**, bullet lists, and numbered lists. {{MODULES_LIST}} becomes a proper bullet list automatically.",
      default:
        "Dear **{{NAME}}**,\n\nAccording to our records, the following mandatory training modules are either missing, have expired, or are about to expire:\n\n{{MODULES_LIST}}\n\nTo remain compliant with our CQC obligations, please send us your latest certificates as soon as possible. **You have two options:**\n\n1. **Reply directly to this email** with the certificate(s) attached. They will be filed against your record automatically.\n2. **Or upload them via your secure portal link below** — no login required.\n\n**Secure upload link:** {{PORTAL_URL}}\nThis link is personal to you and expires on **{{PORTAL_EXPIRY}}**.\n\nIf you have any questions, just reply to this email.\n\nKind regards,\nLivaware Onboarding Team",
    },
  ],
  // The actual chase HTML is built by training-notifications.ts (it
  // needs the markdown body for the upload-CTA branch). These render
  // functions only run for preview purposes.
  renderBody: (v, t) => paragraphs(applyTokens(v.body, t)),
  renderText: (v, t) => applyTokens(v.body, t),
});

// ─── 11. Document upload notification (internal) ─────────────────────
register({
  key: "document_upload_notification",
  label: "Document upload notification (internal)",
  description:
    "Internal email sent to the onboarding inbox each time a document is uploaded (nurse or admin).",
  category: "internal",
  envelope: {
    headerTitle: "NurseOnboard",
    headerSubtitle: "Document Upload Notification",
    footerText: "Livaware Ltd — Internal Notification",
  },
  tokens: [
    { name: "{{CANDIDATE_NAME}}", description: "Candidate full name" },
    { name: "{{CATEGORY}}", description: "Document category" },
    { name: "{{FILENAME}}", description: "Original filename" },
    { name: "{{UPLOADER}}", description: "Who uploaded (Nurse / Admin)" },
    { name: "{{TIMESTAMP}}", description: "Upload timestamp" },
  ],
  defaultSubject: "Document Upload — {{CANDIDATE_NAME}} — {{CATEGORY}}",
  fields: [
    { name: "heading", label: "Heading", kind: "text", default: "Document Upload Notification" },
    {
      name: "intro",
      label: "Intro line (above the metadata table)",
      kind: "textarea",
      rows: 2,
      default: "",
      help: "Leave blank to show only the metadata table.",
    },
    {
      name: "footerNote",
      label: "Footer note",
      kind: "textarea",
      rows: 2,
      default:
        "This is an automated notification from NurseOnboard. The uploaded file is attached to this email.",
    },
  ],
  renderBody: (v, t) => `
    <h2 style="color:#F0ECE4; font-family:'Georgia',serif; font-size:20px; font-weight:400; margin:0 0 12px;">${escapeHtml(applyTokens(v.heading, t))}</h2>
    ${v.intro?.trim() ? paragraphs(applyTokens(v.intro, t)) : ""}
    <table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:13px; color:#E0DCD4;">
      <tr><td style="padding:8px; font-weight:600; color:#8A8A94;">Candidate</td><td style="padding:8px;">${escapeHtml(t.CANDIDATE_NAME || "")}</td></tr>
      <tr><td style="padding:8px; font-weight:600; color:#8A8A94;">Document Category</td><td style="padding:8px;">${escapeHtml(t.CATEGORY || "")}</td></tr>
      <tr><td style="padding:8px; font-weight:600; color:#8A8A94;">Filename</td><td style="padding:8px;">${escapeHtml(t.FILENAME || "")}</td></tr>
      <tr><td style="padding:8px; font-weight:600; color:#8A8A94;">Uploaded By</td><td style="padding:8px;">${escapeHtml(t.UPLOADER || "")}</td></tr>
      <tr><td style="padding:8px; font-weight:600; color:#8A8A94;">Timestamp</td><td style="padding:8px;">${escapeHtml(t.TIMESTAMP || "")}</td></tr>
    </table>
    <p style="font-size:12px; color:#8A8A94; line-height:1.6;">${escapeHtml(applyTokens(v.footerNote, t))}</p>
  `,
  renderText: (v, t) =>
    [
      applyTokens(v.heading, t),
      "",
      v.intro?.trim() ? applyTokens(v.intro, t) : "",
      `Candidate: ${t.CANDIDATE_NAME || ""}`,
      `Category:  ${t.CATEGORY || ""}`,
      `Filename:  ${t.FILENAME || ""}`,
      `Uploader:  ${t.UPLOADER || ""}`,
      `Timestamp: ${t.TIMESTAMP || ""}`,
      "",
      applyTokens(v.footerNote, t),
    ].filter(Boolean).join("\n"),
});

// ─── 12. Invoice submitted (to invoices inbox) ───────────────────────
register({
  key: "invoice_submitted",
  label: "Invoice submitted (to invoices mailbox)",
  description:
    "Sent to the invoices mailbox each time a nurse submits a timesheet invoice. PDF attached automatically.",
  category: "internal",
  envelope: {
    headerTitle: "Invoice {{INVOICE_NUMBER}}",
    headerSubtitle: "Livaware NurseOnboard — New submission",
    footerText: "Livaware Ltd — Invoice Notification",
  },
  tokens: [
    { name: "{{INVOICE_NUMBER}}", description: "Invoice number" },
    { name: "{{NURSE_NAME}}", description: "Nurse full name" },
    { name: "{{NURSE_EMAIL}}", description: "Nurse email" },
    { name: "{{TOTAL_HOURS}}", description: "Total hours" },
    { name: "{{TOTAL_AMOUNT}}", description: "Total amount (formatted GBP)" },
  ],
  defaultSubject: "Invoice {{INVOICE_NUMBER}} — {{NURSE_NAME}}",
  fields: [
    {
      name: "intro",
      label: "Intro line",
      kind: "text",
      default: "A new nurse timesheet invoice has been submitted.",
    },
    {
      name: "footerNote",
      label: "Footer note",
      kind: "textarea",
      rows: 2,
      default:
        "The full invoice is attached as a PDF and is also available in the admin platform under Reports → Invoices.",
    },
  ],
  renderBody: (v, t) => `
    ${paragraphs(applyTokens(v.intro, t))}
    <table style="width:100%; border-collapse:collapse; font-size:13px; color:#E0DCD4;">
      <tr><td style="padding:6px 0; color:#8A8A94;">Invoice</td><td style="padding:6px 0; font-weight:600; color:#F0ECE4;">${escapeHtml(t.INVOICE_NUMBER || "")}</td></tr>
      <tr><td style="padding:6px 0; color:#8A8A94;">Nurse</td><td style="padding:6px 0;">${escapeHtml(t.NURSE_NAME || "")} &lt;${escapeHtml(t.NURSE_EMAIL || "")}&gt;</td></tr>
      <tr><td style="padding:6px 0; color:#8A8A94;">Total hours</td><td style="padding:6px 0;">${escapeHtml(t.TOTAL_HOURS || "")} h</td></tr>
      <tr><td style="padding:6px 0; color:#8A8A94;">Total amount</td><td style="padding:6px 0; font-weight:600; color:#C8A96E;">${escapeHtml(t.TOTAL_AMOUNT || "")}</td></tr>
    </table>
    <p style="font-size:12px; color:#8A8A94; margin:18px 0 0;">${escapeHtml(applyTokens(v.footerNote, t))}</p>
  `,
  renderText: (v, t) =>
    [
      applyTokens(v.intro, t),
      "",
      `Invoice: ${t.INVOICE_NUMBER || ""}`,
      `Nurse:   ${t.NURSE_NAME || ""} <${t.NURSE_EMAIL || ""}>`,
      `Hours:   ${t.TOTAL_HOURS || ""}`,
      `Amount:  ${t.TOTAL_AMOUNT || ""}`,
      "",
      applyTokens(v.footerNote, t),
    ].join("\n"),
});

// ─── 13. Platform update announcement (broadcast) ────────────────────
register({
  key: "platform_update_announcement",
  label: "Broadcast — Platform update",
  description:
    "One-off broadcast email summarising recent platform changes (Skills Arcade, Policies, Availability, Invoicing).",
  category: "broadcast",
  envelope: {
    headerTitle: "NurseOnboard",
    headerSubtitle: "Livaware Ltd — Platform Update",
    footerText: CQC_FOOTER,
  },
  tokens: [
    { name: "{{NAME}}", description: "Full name" },
    { name: "{{PORTAL_URL}}", description: "Portal sign-in URL" },
  ],
  defaultSubject: "Livaware Ltd — Important update to your nurse portal",
  fields: [
    { name: "greeting", label: "Greeting", kind: "text", default: "Dear {{NAME}}," },
    {
      name: "intro",
      label: "Opening paragraph",
      kind: "textarea",
      rows: 3,
      default:
        "We've made some important changes to your Livaware nurse portal that we want you to know about. Nothing you've already submitted has been lost — your existing progress and documents are all still safely on file.",
    },
    { name: "changesHeading", label: "Changes section heading", kind: "text", default: "What's changed" },
    {
      name: "sections",
      label: "Sections (one per line, format: Title — body)",
      kind: "list",
      rows: 8,
      default:
        "1. Clinical Skills Arcade — Your assigned scenario modules are available in your portal under Skills Arcade. Please complete any outstanding modules — your trainer can see your progress and will follow up on anything you miss.\n2. Policies & SOP comprehension — We now publish all policies and Standard Operating Procedures (SOPs) you must read directly in your portal. After reading each one you'll be asked a short comprehension question to confirm you've understood it. These are required before you can be released to work.\n3. Availability — You can now set your Day & Night availability for the months ahead directly in the portal under Availability. Keeping it up to date helps us match you to the right shifts.\n4. Invoicing — Submit your timesheets and invoices directly in the portal under Finance → Invoices, and download a PDF copy of every submission. From 1 June 2026, this is the only accepted route — the legacy invoicing system is being deprecated end of May 2026.",
    },
    { name: "todoHeading", label: "Todo section heading", kind: "text", default: "What you need to do" },
    {
      name: "todoItems",
      label: "Todo items (one per line)",
      kind: "list",
      default:
        "Sign in to your portal and finish any outstanding Assessment items (clinical examination, competency declaration, CV upload).\nWork through your assigned Skills Arcade modules.\nOnce your onboarding is approved, complete the Policies and SOP comprehension sections.\nSet your Day & Night availability for the months ahead.\nFrom 1 June 2026, submit all timesheets and invoices via Finance → Invoices in the portal.",
    },
    {
      name: "closingNote",
      label: "Closing note",
      kind: "textarea",
      rows: 2,
      default:
        "If you've lost your portal link, just reply to this email and we'll send you a fresh one. If you have any questions about the changes or what's expected of you, our onboarding team is happy to help.",
    },
    {
      name: "signoff",
      label: "Sign-off",
      kind: "textarea",
      rows: 2,
      default: "Kind regards,\nLivaware Onboarding Team",
    },
  ],
  renderBody: (v, t) => {
    const sections = v.sections
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf("—");
        const title = idx > 0 ? line.slice(0, idx).trim() : line;
        const body = idx > 0 ? line.slice(idx + 1).trim() : "";
        return `
          <div style="background:#0d0d38; border-left:3px solid #b8944e; padding:16px 20px; border-radius:0 6px 6px 0; margin:14px 0;">
            <p style="font-size:13px; color:#C8A96E; margin:0 0 6px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase;">${escapeHtml(applyTokens(title, t))}</p>
            <p style="font-size:13px; color:#E0DCD4; line-height:1.7; margin:0;">${escapeHtml(applyTokens(body, t))}</p>
          </div>
        `;
      })
      .join("");
    return `
      <p style="font-size:16px; color:#F0ECE4; margin-bottom:8px;">${escapeHtml(applyTokens(v.greeting, t))}</p>
      ${paragraphs(applyTokens(v.intro, t))}
      <h2 style="color:#C8A96E; font-family:'Georgia',serif; font-size:18px; font-weight:400; margin:28px 0 8px;">${escapeHtml(applyTokens(v.changesHeading, t))}</h2>
      ${sections}
      <h2 style="color:#C8A96E; font-family:'Georgia',serif; font-size:18px; font-weight:400; margin:28px 0 8px;">${escapeHtml(applyTokens(v.todoHeading, t))}</h2>
      ${bulletList(applyTokens(v.todoItems, t))}
      ${smallNote(applyTokens(v.closingNote, t))}
      <p style="font-size:14px; color:#E0DCD4; margin-top:24px; white-space:pre-line;">${escapeHtml(applyTokens(v.signoff, t))}</p>
    `;
  },
  renderText: (v, t) =>
    [
      applyTokens(v.greeting, t),
      "",
      applyTokens(v.intro, t),
      "",
      applyTokens(v.changesHeading, t).toUpperCase(),
      "",
      ...v.sections.split(/\r?\n/).filter(Boolean).map((s) => applyTokens(s, t)),
      "",
      applyTokens(v.todoHeading, t).toUpperCase(),
      ...v.todoItems.split(/\r?\n/).filter(Boolean).map((s) => ` - ${applyTokens(s, t)}`),
      "",
      applyTokens(v.closingNote, t),
      "",
      applyTokens(v.signoff, t),
    ].join("\n"),
});

// ─── 14. Launch announcement (broadcast, with video conditional) ─────
register({
  key: "launch_announcement",
  label: "Broadcast — Platform launch & invoicing",
  description:
    "One-off launch email introducing the new portal and informing nurses about the 1 June 2026 invoicing change.",
  category: "broadcast",
  envelope: {
    headerTitle: "NurseOnboard",
    headerSubtitle: "Livaware Ltd — Platform Launch",
    footerText: CQC_FOOTER,
  },
  tokens: [
    { name: "{{NAME}}", description: "Full name" },
    { name: "{{PORTAL_URL}}", description: "Portal sign-in URL" },
    { name: "{{VIDEO_URL}}", description: "Explainer video link (sections in {{#VIDEO_URL}}…{{/VIDEO_URL}} hide when empty)" },
  ],
  defaultSubject: "Livaware NurseOnboard — Your new portal is live (and important invoicing change)",
  fields: [
    { name: "greeting", label: "Greeting", kind: "text", default: "Dear {{NAME}}," },
    {
      name: "intro",
      label: "Opening paragraph",
      kind: "textarea",
      rows: 3,
      default:
        "Your new Livaware NurseOnboard portal is live. It is the single home for your compliance, training, availability, and from now on — your timesheets and invoices.",
    },
    { name: "videoHeading", label: "Video section heading (only shows when video URL is set)", kind: "text", default: "Watch the 2-minute walkthrough" },
    {
      name: "videoLead",
      label: "Video section paragraph",
      kind: "textarea",
      rows: 2,
      default:
        "The quickest way to get oriented is to watch our short explainer video — it covers everything new in under two minutes.",
    },
    { name: "videoButton", label: "Video button label", kind: "text", default: "▶ Watch the explainer video" },
    { name: "howHeading", label: "How-to section heading", kind: "text", default: "How to use the platform" },
    {
      name: "howItems",
      label: "How-to bullets (one per line, format: Title — description)",
      kind: "list",
      default:
        "Compliance & documents — keep your NMC, DBS, right-to-work and certificates on file in one place.\nDeclarations — confirm your competencies and health declarations whenever they're due.\nSkills Arcade — work through assigned scenario modules at your own pace.\nAvailability — set your day & night availability for the months ahead.\nInvoicing — submit timesheets and download a paid PDF for every shift you work.",
    },
    { name: "signInHeading", label: "Sign-in section heading", kind: "text", default: "Sign in to see your profile" },
    {
      name: "signInBody",
      label: "Sign-in paragraph",
      kind: "textarea",
      rows: 2,
      default:
        "Open the portal and sign in with the email address we have on file — you'll be sent a 6-digit verification code by email to complete sign-in.",
    },
    { name: "signInButton", label: "Sign-in button label", kind: "text", default: "Sign in to your portal" },
    { name: "noticeTitle", label: "Notice box title", kind: "text", default: "Important — invoicing change" },
    {
      name: "noticeBody",
      label: "Notice box body (paragraphs separated by blank lines)",
      kind: "textarea",
      rows: 4,
      default:
        "From 1 June 2026, all timesheets and invoices must be submitted through the new portal under Finance → Invoices.\n\nOur previous invoicing system is being deprecated at the end of May 2026 and will not accept further submissions after that date. Please make sure any outstanding May timesheets are sent through the old system before then, and submit everything from June onwards via the portal.",
    },
    { name: "helpHeading", label: "Help section heading", kind: "text", default: "Where to get help" },
    {
      name: "helpBody",
      label: "Help paragraph",
      kind: "textarea",
      rows: 2,
      default: "If you have any questions, just reply to this email — the onboarding team is happy to help.",
    },
    {
      name: "signoff",
      label: "Sign-off",
      kind: "textarea",
      rows: 2,
      default: "Kind regards,\nLivaware Onboarding Team",
    },
  ],
  renderBody: (v, t) => {
    const portalUrl = t.PORTAL_URL || "#";
    const videoUrl = t.VIDEO_URL || "";
    const videoBlock = videoUrl
      ? `
        <h2 style="color:#C8A96E; font-family:'Georgia',serif; font-size:18px; font-weight:400; margin:28px 0 8px;">${escapeHtml(applyTokens(v.videoHeading, t))}</h2>
        <p style="font-size:13px; color:#E0DCD4; line-height:1.85; margin:0 0 14px;">${escapeHtml(applyTokens(v.videoLead, t))}</p>
        <div style="text-align:center; margin:18px 0 28px;">
          <a href="${videoUrl}" style="display:inline-block; background-color:#0d0d38; border:1px solid #C8A96E; color:#C8A96E; text-decoration:none; padding:14px 36px; border-radius:4px; font-size:12px; font-weight:600; letter-spacing:0.18em; text-transform:uppercase;">${escapeHtml(applyTokens(v.videoButton, t))}</a>
        </div>
      `
      : "";
    return `
      <p style="font-size:16px; color:#F0ECE4; margin-bottom:8px;">${escapeHtml(applyTokens(v.greeting, t))}</p>
      ${paragraphs(applyTokens(v.intro, t))}
      ${videoBlock}
      <h2 style="color:#C8A96E; font-family:'Georgia',serif; font-size:18px; font-weight:400; margin:28px 0 8px;">${escapeHtml(applyTokens(v.howHeading, t))}</h2>
      ${bulletList(applyTokens(v.howItems, t))}
      <h2 style="color:#C8A96E; font-family:'Georgia',serif; font-size:18px; font-weight:400; margin:28px 0 8px;">${escapeHtml(applyTokens(v.signInHeading, t))}</h2>
      ${paragraphs(applyTokens(v.signInBody, t))}
      ${ctaButton(applyTokens(v.signInButton, t), portalUrl)}
      <p style="font-size:12px; color:#8A8A94; line-height:1.6; word-break:break-all; text-align:center; margin:-12px 0 24px;">
        <a href="${portalUrl}" style="color:#C8A96E; text-decoration:underline;">${escapeHtml(portalUrl)}</a>
      </p>
      <div style="background:#2a1a0a; border-left:3px solid #C8A96E; padding:18px 20px; border-radius:0 6px 6px 0; margin:24px 0;">
        <p style="font-size:11px; color:#C8A96E; margin:0 0 8px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase;">${escapeHtml(applyTokens(v.noticeTitle, t))}</p>
        ${paragraphs(applyTokens(v.noticeBody, t), { color: "#F0ECE4" })}
      </div>
      <h2 style="color:#C8A96E; font-family:'Georgia',serif; font-size:18px; font-weight:400; margin:28px 0 8px;">${escapeHtml(applyTokens(v.helpHeading, t))}</h2>
      ${paragraphs(applyTokens(v.helpBody, t))}
      <p style="font-size:14px; color:#E0DCD4; margin-top:24px; white-space:pre-line;">${escapeHtml(applyTokens(v.signoff, t))}</p>
    `;
  },
  renderText: (v, t) =>
    [
      applyTokens(v.greeting, t),
      "",
      applyTokens(v.intro, t),
      "",
      ...(t.VIDEO_URL
        ? [applyTokens(v.videoHeading, t).toUpperCase(), applyTokens(v.videoLead, t), t.VIDEO_URL, ""]
        : []),
      applyTokens(v.howHeading, t).toUpperCase(),
      ...v.howItems.split(/\r?\n/).filter(Boolean).map((s) => ` - ${applyTokens(s, t)}`),
      "",
      applyTokens(v.signInHeading, t).toUpperCase(),
      applyTokens(v.signInBody, t),
      t.PORTAL_URL || "",
      "",
      applyTokens(v.noticeTitle, t).toUpperCase(),
      applyTokens(v.noticeBody, t),
      "",
      applyTokens(v.helpHeading, t).toUpperCase(),
      applyTokens(v.helpBody, t),
      "",
      applyTokens(v.signoff, t),
    ].join("\n"),
});

// ─── 15. Roster shift change ─────────────────────────────────────────
register({
  key: "roster_shift_change",
  label: "Roster — shift added / cancelled",
  description:
    "Sent to a nurse when an admin allocates them to a shift or removes them from one. The shift details box is auto-filled from the roster.",
  category: "nurse",
  envelope: {
    headerTitle: "NurseOnboard",
    headerSubtitle: "Livaware Ltd — Rota Update",
    footerText: STD_FOOTER,
    footerSecondLine: AUTOMATED_LINE,
  },
  tokens: [
    { name: "{{NAME}}", description: "Full name" },
    { name: "{{FIRST_NAME}}", description: "First name" },
    { name: "{{ADDED}}", description: "Non-empty when the shift was added (use in {{#ADDED}}…{{/ADDED}} blocks)" },
    { name: "{{REMOVED}}", description: "Non-empty when the shift was cancelled (use in {{#REMOVED}}…{{/REMOVED}} blocks)" },
    { name: "{{DATE}}", description: "Shift date (e.g. Monday 3 August 2026)" },
    { name: "{{SLOT_LABEL}}", description: "Shift label (e.g. Day, Night)" },
    { name: "{{TIME_RANGE}}", description: "Shift times (e.g. 08:00 – 20:00)" },
    { name: "{{PATIENT_FIRST_NAME}}", description: "Patient first name only" },
    { name: "{{PORTAL_URL}}", description: "Portal link (My Shifts)" },
  ],
  defaultSubject:
    "Rota update — {{#ADDED}}new shift on {{DATE}}{{/ADDED}}{{#REMOVED}}shift on {{DATE}} cancelled{{/REMOVED}}",
  fields: [
    { name: "greeting", label: "Greeting", kind: "text", default: "Dear {{FIRST_NAME}}," },
    {
      name: "introAdded",
      label: "Opening paragraph (shift added)",
      kind: "textarea",
      rows: 3,
      default:
        "You have been allocated a new shift. Please review the details below and check your My Shifts page for your full, up-to-date rota.",
    },
    {
      name: "introRemoved",
      label: "Opening paragraph (shift cancelled)",
      kind: "textarea",
      rows: 3,
      default:
        "One of your rostered shifts has been cancelled and no longer appears on your rota. Please review the details below — you do not need to attend this shift.",
    },
    { name: "boxTitle", label: "Shift details box title", kind: "text", default: "Shift details" },
    { name: "ctaLabel", label: "Button text", kind: "text", default: "View My Shifts" },
    {
      name: "note",
      label: "Closing note",
      kind: "textarea",
      rows: 2,
      default:
        "Your My Shifts page always shows the latest version of your rota. If anything looks wrong, or you can no longer make a shift, please contact the office as soon as possible.",
    },
    {
      name: "signoff",
      label: "Sign-off",
      kind: "textarea",
      rows: 2,
      default: "Kind regards,\nLivaware Rostering Team",
    },
  ],
  renderBody: (v, t) => {
    const url = t.PORTAL_URL || "#";
    const intro = t.ADDED ? v.introAdded : v.introRemoved;
    const detailRow = (label: string, value: string) =>
      value
        ? `<tr><td style="font-size:12px; color:#8A8A94; padding:3px 16px 3px 0; text-transform:uppercase; letter-spacing:0.1em; white-space:nowrap;">${escapeHtml(label)}</td><td style="font-size:14px; color:#F0ECE4; padding:3px 0;">${escapeHtml(value)}</td></tr>`
        : "";
    const details = `
      <table style="border-collapse:collapse;">
        ${detailRow("Date", t.DATE || "")}
        ${detailRow("Shift", t.SLOT_LABEL || "")}
        ${detailRow("Times", t.TIME_RANGE || "")}
        ${detailRow("Patient", t.PATIENT_FIRST_NAME || "")}
      </table>
    `;
    return `
      <p style="font-size:16px; color:#F0ECE4; margin-bottom:8px;">${escapeHtml(applyTokens(v.greeting, t))}</p>
      ${paragraphs(applyTokens(intro, t))}
      ${calloutBox(applyTokens(v.boxTitle, t), details, { gold: !!t.ADDED })}
      ${ctaButton(applyTokens(v.ctaLabel, t), url)}
      ${fallbackLinkLine(url)}
      ${smallNote(applyTokens(v.note, t))}
      <p style="font-size:14px; color:#E0DCD4; margin-top:24px; white-space:pre-line;">${escapeHtml(applyTokens(v.signoff, t))}</p>
    `;
  },
  renderText: (v, t) =>
    [
      applyTokens(v.greeting, t),
      "",
      applyTokens(t.ADDED ? v.introAdded : v.introRemoved, t),
      "",
      applyTokens(v.boxTitle, t).toUpperCase(),
      ` Date: ${t.DATE || ""}`,
      ` Shift: ${t.SLOT_LABEL || ""}`,
      ` Times: ${t.TIME_RANGE || ""}`,
      ...(t.PATIENT_FIRST_NAME ? [` Patient: ${t.PATIENT_FIRST_NAME}`] : []),
      "",
      `${applyTokens(v.ctaLabel, t)}: ${t.PORTAL_URL || ""}`,
      "",
      applyTokens(v.note, t),
      "",
      applyTokens(v.signoff, t),
    ].join("\n"),
});

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

export function getRegistry(): TemplateDef[] {
  return REGISTRY;
}

export function getTemplate(key: string): TemplateDef | undefined {
  return REGISTRY.find((t) => t.key === key);
}

export function isKnownEmailTemplateKey(key: string): boolean {
  return REGISTRY.some((t) => t.key === key);
}

export function getDefaultFieldValues(def: TemplateDef): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of def.fields) out[f.name] = f.default;
  return out;
}

export interface ResolvedTemplate {
  key: string;
  subject: string;
  fields: Record<string, string>;
  updatedAt: Date | null;
  updatedBy: string | null;
}

/** Returns the persisted subject + fields for `key`, falling back to
 *  built-in defaults for any field not yet customised. Tolerant to a
 *  missing DB row or missing `fields` column. */
export async function resolveTemplate(key: string): Promise<ResolvedTemplate> {
  const def = getTemplate(key);
  if (!def) throw new Error(`Unknown email template key: ${key}`);
  const defaults = getDefaultFieldValues(def);
  let row: any;
  try {
    row = await storage.getEmailTemplate(key);
  } catch (err: any) {
    console.warn(`[email-templates] DB unavailable for ${key}, using defaults:`, err?.message || err);
  }
  if (!row) {
    return {
      key,
      subject: def.defaultSubject,
      fields: defaults,
      updatedAt: null,
      updatedBy: null,
    };
  }
  const stored = (row.fields && typeof row.fields === "object" ? row.fields : {}) as Record<string, string>;
  const merged: Record<string, string> = { ...defaults };
  for (const f of def.fields) {
    if (typeof stored[f.name] === "string") merged[f.name] = stored[f.name];
  }
  return {
    key,
    subject: row.subject || def.defaultSubject,
    fields: merged,
    updatedAt: row.updatedAt ?? null,
    updatedBy: row.updatedBy ?? null,
  };
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Resolve, substitute tokens, and render. */
export async function renderEmail(
  key: string,
  tokens: Record<string, string>,
): Promise<RenderedEmail> {
  const def = getTemplate(key);
  if (!def) throw new Error(`Unknown email template key: ${key}`);
  const resolved = await resolveTemplate(key);
  const subject = applyTokens(resolved.subject, tokens);
  const bodyHtml = def.renderBody(resolved.fields, tokens);
  const text = def.renderText(resolved.fields, tokens);
  const html = renderEnvelope({
    ...def.envelope,
    headerTitle: applyTokens(def.envelope.headerTitle, tokens),
    bodyHtml,
  });
  return { subject, html, text };
}
