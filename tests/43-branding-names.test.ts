/**
 * Branding regression tests — assert that the old product name "NurseOnboard"
 * and related legacy variants never surface in:
 *   - rendered email template defaults (code-level, no DB needed)
 *   - PDF source metadata strings
 *   - video caption/scene source text and narration script
 *   - the email template name backfill logic (pure unit test, no DB)
 */
import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { getRegistry, getDefaultFieldValues, renderEnvelope } from "../server/email-templates";
import { buildAssignedActionEmailHtml } from "../server/assigned-action-notifications";
import { WAYPOINTS, FEATURE_STARS, BasecampTrail } from "../client/src/components/auth/basecamp-trail";
import { Wordmark } from "../client/src/pages/preboard/assessment";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  rewriteString,
  rewriteValue,
  containsOldName,
  valueContainsOldName,
  OLD_NAME_PATTERNS,
} from "../server/email-template-name-backfill";

/** Strings that must not appear in any user-visible product surface. */
const OLD_NAMES = [
  "NurseOnboard",
  "Livaware NurseOnboard",
  "Livaware nurse portal",
  "Livaware Platform",
  "Livaware Skills Arcade",
  "your Livaware portal",
];

function assertNoOldNames(text: string, context: string) {
  for (const name of OLD_NAMES) {
    expect(text, `"${name}" found in ${context}`).not.toContain(name);
  }
}

// ---------------------------------------------------------------------------
// Email template defaults (code-level, no DB)
// ---------------------------------------------------------------------------

describe("Email template defaults — no old product name", () => {
  const registry = getRegistry();

  it("registry is non-empty", () => {
    expect(registry.length).toBeGreaterThan(0);
  });

  for (const tpl of registry) {
    it(`template "${tpl.key}" envelope metadata`, () => {
      assertNoOldNames(tpl.envelope.headerTitle, `${tpl.key} headerTitle`);
      assertNoOldNames(tpl.envelope.headerSubtitle, `${tpl.key} headerSubtitle`);
      assertNoOldNames(tpl.envelope.footerText, `${tpl.key} footerText`);
      if (tpl.envelope.footerSecondLine) {
        assertNoOldNames(tpl.envelope.footerSecondLine, `${tpl.key} footerSecondLine`);
      }
    });

    it(`template "${tpl.key}" subject and field defaults`, () => {
      assertNoOldNames(tpl.defaultSubject, `${tpl.key} defaultSubject`);
      const defaults = getDefaultFieldValues(tpl);
      for (const [name, value] of Object.entries(defaults)) {
        assertNoOldNames(value, `${tpl.key} field "${name}"`);
      }
    });

    it(`template "${tpl.key}" rendered body and full envelope`, () => {
      const defaults = getDefaultFieldValues(tpl);
      const dummyTokens: Record<string, string> = {
        NAME: "Test Nurse",
        EMAIL: "test@example.com",
        PORTAL_URL: "https://example.com/portal/token",
        VIDEO_URL: "",
        PASSWORD: "temppass",
        INVITED_BY: "Admin",
        MINUTES: "10",
        CODE: "123456",
        EXPIRY: "17 Jan 2026",
        CANDIDATE_NAME: "Test Nurse",
        CATEGORY: "NMC PIN",
        FILENAME: "nmc.pdf",
        UPLOADER: "Admin",
        TIMESTAMP: "2026-01-01",
        INVOICE_NUMBER: "INV-001",
        NURSE_NAME: "Test Nurse",
        ASSESSMENT_TITLE: "Clinical Assessment",
        RECOVERY_FEE: "£500",
        FIRST_NAME: "Test",
        ITEMS_LIST: "• NMC PIN — still outstanding",
      };
      const bodyHtml = tpl.renderBody(defaults, dummyTokens);
      const envelope = renderEnvelope({ ...tpl.envelope, bodyHtml });
      assertNoOldNames(bodyHtml, `${tpl.key} rendered body`);
      assertNoOldNames(envelope, `${tpl.key} full envelope`);
    });
  }
});

// ---------------------------------------------------------------------------
// Assigned-action notification email (hardcoded envelope outside the registry)
// ---------------------------------------------------------------------------

describe("Assigned-action email envelope — no old product name", () => {
  it("rendered HTML uses Basecamp branding", () => {
    const html = buildAssignedActionEmailHtml(
      "Please complete your **reflection**.",
      "https://example.com/portal/token",
      "17 Sep 2026",
      "Open Basecamp",
    );
    assertNoOldNames(html, "assigned-action email envelope");
    expect(html).toContain(">Basecamp<");
    expect(html).toContain("Basecamp by Livaware Ltd");
  });
});

// ---------------------------------------------------------------------------
// Email template backfill migration logic (pure unit test — no DB)
// ---------------------------------------------------------------------------

describe("Email template backfill — rewrite logic", () => {
  it("OLD_NAME_PATTERNS covers every OLD_NAME variant", () => {
    for (const name of OLD_NAMES) {
      const detected = OLD_NAME_PATTERNS.some((p) => name.includes(p));
      expect(detected, `"${name}" is not covered by OLD_NAME_PATTERNS`).toBe(true);
    }
  });

  it("containsOldName detects genuine legacy product names", () => {
    expect(containsOldName("Welcome to Livaware NurseOnboard")).toBe(true);
    expect(containsOldName("Livaware NurseOnboard portal")).toBe(true);
    expect(containsOldName("Sign in to your Livaware nurse portal")).toBe(true);
    expect(containsOldName("NurseOnboard platform")).toBe(true);
    expect(containsOldName("Livaware Skills Arcade — Your Login")).toBe(true);
    expect(containsOldName("your Livaware portal is always open")).toBe(true);
    expect(containsOldName("Your Livaware portal is ready")).toBe(true);
    // Generic descriptive phrase — must NOT be detected (would corrupt footers)
    expect(containsOldName("Livaware Ltd — Secure Nurse Onboarding")).toBe(false);
    // New clean names — must not trigger
    expect(containsOldName("Welcome to Basecamp")).toBe(false);
    expect(containsOldName("Basecamp by Livaware Ltd")).toBe(false);
    expect(containsOldName("Basecamp Skills Arcade")).toBe(false);
  });

  it("rewriteString replaces legacy product names without touching compliant footer text", () => {
    // Specific product-name replacements
    expect(rewriteString("Welcome to Livaware NurseOnboard.")).toBe("Welcome to Basecamp.");
    expect(rewriteString("Sign in to your Livaware nurse portal.")).toBe("Sign in to your Basecamp portal.");
    expect(rewriteString("NurseOnboard portal")).toBe("Basecamp portal");
    // Case-insensitive portal reference (body copy uses lowercase "your")
    expect(rewriteString("your Livaware portal is always open")).toBe("your Basecamp portal is always open");
    expect(rewriteString("Your Livaware portal is ready")).toBe("Your Basecamp portal is ready");
    // Skills Arcade branding
    expect(rewriteString("Livaware Skills Arcade — Your Login Credentials")).toBe(
      "Basecamp Skills Arcade — Your Login Credentials",
    );
    expect(rewriteString("join the Livaware Skills Arcade — our platform")).toBe(
      "join the Basecamp Skills Arcade — our platform",
    );
    // Subject-line replacements
    expect(rewriteString("Welcome to Livaware — your journey starts here")).toBe(
      "Welcome to Basecamp — your journey starts here",
    );
    expect(rewriteString("Livaware — Your onboarding is unlocked")).toBe(
      "Basecamp — Your onboarding is unlocked",
    );
    // Compliance footer text must NOT be touched
    const footer = "Livaware Ltd — Secure Nurse Onboarding · CQC Regulation 19 / Schedule 3 Compliant";
    expect(rewriteString(footer)).toBe(footer);
  });

  it("rewriteValue rewrites strings nested inside a jsonb-style object", () => {
    const staleFields = {
      intro: "Your new Livaware NurseOnboard portal is live.",
      body: "your Livaware portal is always open.",
      arcade: "join the Livaware Skills Arcade — our platform.",
      items: ["NurseOnboard step 1", "No change needed here"],
      footer: "Livaware Ltd — Secure Nurse Onboarding · CQC Regulation 19 / Schedule 3 Compliant",
    };
    const result = rewriteValue(staleFields) as typeof staleFields;
    expect(result.intro).not.toContain("NurseOnboard");
    expect(result.body).not.toContain("Livaware portal");
    expect(result.arcade).not.toContain("Livaware Skills Arcade");
    expect(result.items[0]).not.toContain("NurseOnboard");
    expect(result.items[1]).toBe("No change needed here");
    // Compliance footer must be unchanged
    expect(result.footer).toBe(staleFields.footer);
  });

  it("valueContainsOldName detects old names in nested structures", () => {
    expect(valueContainsOldName({ a: { b: "NurseOnboard" } })).toBe(true);
    expect(valueContainsOldName(["clean", "also clean"])).toBe(false);
    expect(valueContainsOldName({ a: "Livaware nurse portal" })).toBe(true);
    expect(valueContainsOldName({ a: "your Livaware portal is open" })).toBe(true);
    expect(valueContainsOldName({ a: "Livaware Skills Arcade" })).toBe(true);
    // Compliance footer text must not be flagged
    expect(valueContainsOldName({ footer: "Livaware Ltd — Secure Nurse Onboarding" })).toBe(false);
  });

  it("a single rewrite pass cleans repeated legacy occurrences in one value", () => {
    // Same phrase twice in one subject
    const repeatedSubject = rewriteString("NurseOnboard update — your Livaware portal, from NurseOnboard");
    assertNoOldNames(repeatedSubject, "repeated-occurrence subject");
    expect(repeatedSubject.match(/Basecamp/g)?.length).toBe(3);

    // Multiple different legacy phrases repeated inside a nested field structure
    const nested = rewriteValue({
      body: "Your Livaware portal awaits. NurseOnboard is home — visit your Livaware portal today.",
      list: ["Livaware NurseOnboard / Livaware NurseOnboard", "NurseOnboard, NurseOnboard, NurseOnboard"],
    }) as { body: string; list: string[] };
    assertNoOldNames(nested.body, "repeated nested body");
    for (const item of nested.list) assertNoOldNames(item, "repeated nested list item");
    // Every occurrence replaced — no survivors after one pass
    expect(nested.body).not.toContain("Livaware portal");
    expect(nested.list[0]).toBe("Basecamp / Basecamp");
    expect(nested.list[1]).toBe("Basecamp, Basecamp, Basecamp");
    // Capitalization preserved sentence-initially
    expect(nested.body.startsWith("Your Basecamp portal")).toBe(true);
  });

  it("full row simulation: stale saved template is cleaned by backfill logic", () => {
    const staleSubject = "Livaware Skills Arcade — Your Login Credentials";
    const staleFields = {
      greeting: "Dear {{NAME}},",
      intro: "Your new Livaware NurseOnboard portal is live.",
      body: "your Livaware portal is always open whenever you'd like to pick things up.",
      arcade: "join the Livaware Skills Arcade — our online training platform.",
      footer: "Livaware Ltd — Secure Nurse Onboarding · CQC Regulation 19 / Schedule 3 Compliant",
    };

    const newSubject = rewriteString(staleSubject);
    const newFields = rewriteValue(staleFields) as typeof staleFields;

    assertNoOldNames(newSubject, "migrated subject");
    expect(newSubject).toContain("Basecamp");
    assertNoOldNames(newFields.intro, "migrated intro field");
    assertNoOldNames(newFields.body, "migrated body field");
    assertNoOldNames(newFields.arcade, "migrated arcade field");
    // Unchanged field
    expect(newFields.greeting).toBe("Dear {{NAME}},");
    // Compliance footer must be preserved exactly
    expect(newFields.footer).toBe(staleFields.footer);
  });
});

// ---------------------------------------------------------------------------
// PDF metadata strings (source text — no PDF generation needed)
// ---------------------------------------------------------------------------

describe("PDF source files — no old product name", () => {
  const pdfSources = [
    "server/pdf-generator.ts",
    "server/declarations/pdf.ts",
    "server/service-agreement/pdf.ts",
    "server/agreements/pdf.ts",
    "server/invoice-pdf.ts",
  ];

  for (const src of pdfSources) {
    it(`${src} contains no old product name`, async () => {
      const text = await readFile(src, "utf8");
      assertNoOldNames(text, src);
    });
  }
});

// ---------------------------------------------------------------------------
// Login journey scene — the ascent wraps the mountain and ends AT Basecamp;
// the route then continues BEYOND the summit through the feature waypoints
// ---------------------------------------------------------------------------

describe("BasecampTrail render (props as used by login.tsx)", () => {
  it("panel variant honours the caller's positioning className", () => {
    const html = renderToStaticMarkup(
      createElement(BasecampTrail, { variant: "panel", className: "pointer-events-none absolute inset-0" }),
    );
    expect(html).toContain("pointer-events-none absolute inset-0");
    expect(html).toContain(">Basecamp<");
    expect(html).toContain("Skills Arcade");
    expect(html).toContain("Reflections");
  });

  it("mobile variant renders the compact summit strip", () => {
    const html = renderToStaticMarkup(createElement(BasecampTrail, { variant: "mobile" }));
    expect(html).toContain("BASECAMP");
    expect(html).toContain("Application");
  });
});

describe("Login journey structure", () => {
  it("the ascent climbs onboarding stages to the Basecamp summit", () => {
    const labels = WAYPOINTS.map((w) => w.label);
    expect(labels).toEqual(["Application", "Documents", "Compliance", "Agreements", "Basecamp"]);
    // Basecamp is the destination (accented summit), not a feature
    const summit = WAYPOINTS.find((w) => w.label === "Basecamp");
    expect(summit?.accent).toBe(true);
    expect(labels).not.toContain("Invoicing");
  });

  it("standout features continue the journey beyond the summit, in order", () => {
    expect(FEATURE_STARS.map((s) => s.label)).toEqual([
      "Training",
      "Comprehension",
      "Skills Arcade",
      "Invoicing",
      "Reflections",
    ]);
    // Every beyond-Basecamp waypoint sits in the sky above the summit camp
    const summit = WAYPOINTS.find((w) => w.label === "Basecamp")!;
    for (const s of FEATURE_STARS) expect(s.y).toBeLessThan(summit.y);
  });
});

// ---------------------------------------------------------------------------
// User-facing UI surfaces — wordmarks, logo alt text, and product-brand copy.
// "Livaware Ltd" and "Basecamp by Livaware" remain valid company attribution;
// these assertions target the retired standalone product wordmark only.
// ---------------------------------------------------------------------------

describe("UI surfaces — no standalone Livaware product wordmark", () => {
  const uiSources = [
    "client/src/pages/login.tsx",
    "client/src/components/layout/portal-shell.tsx",
    "client/src/components/layout/sidebar-nav.tsx",
    "client/src/pages/referee-form.tsx",
    "client/src/pages/portal/chase-upload.tsx",
    "client/src/pages/preboard/assessment.tsx",
    "client/src/pages/portal/portal-hub.tsx",
    "client/src/pages/portal/sign-in.tsx",
    "client/src/pages/super-admin/mass-email.tsx",
    "client/src/pages/candidates.tsx",
    "client/src/pages/nurses.tsx",
    "client/src/components/auth/basecamp-trail.tsx",
  ];

  // Patterns that present Livaware as the PRODUCT brand (retired).
  const RETIRED_UI_PATTERNS = [
    { pattern: /alt="Livaware"/, label: 'logo alt="Livaware"' },
    { pattern: />Livaware</, label: "standalone >Livaware< wordmark" },
    { pattern: /Livaware welcome/i, label: '"Livaware welcome" product copy' },
    { pattern: /Livaware branded/i, label: '"Livaware branded" product copy' },
    { pattern: /Livaware [Pp]latform/, label: '"Livaware Platform" product copy' },
  ];

  for (const src of uiSources) {
    it(`${src} presents Basecamp, not a Livaware wordmark`, async () => {
      const text = await readFile(src, "utf8");
      assertNoOldNames(text, src);
      for (const { pattern, label } of RETIRED_UI_PATTERNS) {
        expect(pattern.test(text), `${label} found in ${src}`).toBe(false);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Company logo ↔ product wordmark lockup. The Livaware logo images stay (the
// company is still Livaware Ltd), but every surface that renders the company
// logo must ALSO render a visible "Basecamp" product wordmark next to it —
// as element text a user can see, not merely image alt text.
// ---------------------------------------------------------------------------

describe("Company logo is always paired with a visible Basecamp wordmark", () => {
  const LOGO_SURFACES = [
    "client/src/pages/login.tsx",
    "client/src/pages/referee-form.tsx",
    "client/src/pages/preboard/assessment.tsx",
    "client/src/pages/portal/chase-upload.tsx",
    "client/src/components/layout/portal-shell.tsx",
    "client/src/components/layout/sidebar-nav.tsx",
  ];

  // A visible JSX text node (">Basecamp<", possibly across lines) — an
  // alt="Basecamp by Livaware" attribute alone does NOT satisfy this.
  const VISIBLE_BASECAMP = />\s*Basecamp\s*</;

  for (const src of LOGO_SURFACES) {
    it(`${src}: every rendered company logo has an adjacent visible Basecamp wordmark`, async () => {
      const lines = (await readFile(src, "utf8")).split("\n");
      const hits = lines.flatMap((l, i) => (l.includes("livaware-logo") ? [i] : []));
      expect(hits.length, `expected ${src} to render the company logo`).toBeGreaterThan(0);
      for (const i of hits) {
        const context = lines.slice(Math.max(0, i - 8), i + 28).join("\n");
        expect(
          VISIBLE_BASECAMP.test(context),
          `logo at ${src}:${i + 1} lacks a visible Basecamp wordmark beside it`,
        ).toBe(true);
      }
    });
  }

  it("company logo image assets referenced by the lockups exist and are real PNGs", async () => {
    for (const asset of [
      "client/public/images/livaware-logo.png",
      "client/public/images/livaware-logo-white.png",
    ]) {
      const buf = await readFile(asset);
      expect(buf.byteLength, `${asset} should be a non-trivial image`).toBeGreaterThan(1000);
      expect(buf.subarray(0, 8).toString("hex"), `${asset} should be a PNG`).toBe("89504e470d0a1a0a");
    }
  });

  it("assessment Wordmark renders logo + Basecamp in the DOM (not alt text alone)", () => {
    const html = renderToStaticMarkup(createElement(Wordmark, {}));
    const withoutAltText = html.replace(/alt="[^"]*"/g, "");
    expect(withoutAltText).toContain("livaware-logo");
    expect(withoutAltText).toMatch(VISIBLE_BASECAMP);
  });
});

// ---------------------------------------------------------------------------
// Preboard assessment delivery — the emailed report + PDF attachment are
// recipient-visible product surfaces: wordmarks and the attachment filename
// must carry Basecamp; "Livaware Ltd" remains only as company attribution.
// ---------------------------------------------------------------------------

describe("Preboard assessment delivery — Basecamp product branding", () => {
  it("PDF report header/metadata carry Basecamp, no standalone LIVAWARE wordmark", async () => {
    const text = await readFile("server/preboard-pdf-report.ts", "utf8");
    assertNoOldNames(text, "server/preboard-pdf-report.ts");
    expect(text).toMatch(/"BASECAMP"/);
    expect(text).not.toMatch(/"LIVAWARE"/);
    expect(text).toContain('Creator: "Basecamp by Livaware Ltd"');
    expect(text).not.toContain("Livaware Assessment Platform");
  });

  it("emailed report attaches Basecamp_Assessment_*.pdf, not Livaware_Assessment_*.pdf", async () => {
    const text = await readFile("server/preboard-delivery.ts", "utf8");
    assertNoOldNames(text, "server/preboard-delivery.ts");
    expect(text).toContain("Basecamp_Assessment_");
    expect(text).not.toContain("Livaware_Assessment_");
  });

  it("report email header wordmark is Basecamp; standalone livaware wordmark retired", async () => {
    const text = await readFile("server/preboard-email-template.ts", "utf8");
    assertNoOldNames(text, "server/preboard-email-template.ts");
    expect(text).toMatch(/>\s*Basecamp\s*</);
    expect(text).not.toMatch(/>\s*livaware\s*</i);
    // Company attribution stays in the chrome/footer
    expect(text).toContain("Livaware Ltd");
  });

  it("assessment AI prompt identifies the product as Basecamp by Livaware", async () => {
    const text = await readFile("server/preboard-ai.ts", "utf8");
    assertNoOldNames(text, "server/preboard-ai.ts");
    expect(text).toContain("Basecamp");
    expect(text).toContain("Livaware Ltd");
    expect(text).not.toMatch(/assessor for Livaware,/);
  });
});

// ---------------------------------------------------------------------------
// Static welcome-email HTML previews
// ---------------------------------------------------------------------------

describe("Static welcome-email HTML assets — no old product name", () => {
  const staticHtmlAssets = [
    "client/public/applicant-welcome-email.html",
    "previews/applicant-welcome-email.html",
  ];

  for (const src of staticHtmlAssets) {
    it(`${src} title and primary header use Basecamp`, async () => {
      const text = await readFile(src, "utf8");
      // Title
      expect(text).toContain("Welcome to Basecamp");
      expect(text).not.toContain("Welcome to Livaware");
      // Primary <h1> must be Basecamp, not bare "Livaware"
      expect(text).toMatch(/<h1[^>]*>Basecamp<\/h1>/);
      expect(text).not.toMatch(/<h1[^>]*>Livaware<\/h1>/);
    });

    it(`${src} contains no old product name`, async () => {
      const text = await readFile(src, "utf8");
      assertNoOldNames(text, src);
    });
  }
});

// ---------------------------------------------------------------------------
// Video captions and narration script
// ---------------------------------------------------------------------------

describe("Video scene text and narration — no old product name", () => {
  const videoSources = [
    "client/src/components/video/VideoTemplate.tsx",
    "client/src/components/video/video_scenes/Scene1.tsx",
    "client/src/components/video/video_scenes/Scene7.tsx",
    "scripts/explainer-script.json",
  ];

  for (const src of videoSources) {
    it(`${src} contains no old product name`, async () => {
      const text = await readFile(src, "utf8");
      assertNoOldNames(text, src);
    });
  }
});
