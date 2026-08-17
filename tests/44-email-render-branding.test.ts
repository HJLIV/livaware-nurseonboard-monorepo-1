/**
 * End-to-end email-render branding regression.
 *
 * Loads every template key from the registry, renders each one through the
 * full `renderEmail()` pipeline (subject → HTML envelope → plain-text
 * fallback), and asserts that the retired product names "NurseOnboard" and
 * "Livaware Platform" are absent from all three outputs.
 *
 * The storage layer is stubbed so that `getEmailTemplate` always returns
 * `undefined`, which forces `renderEmail` to use the code-level defaults.
 * No running database is required.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

// ── Mock storage before any module under test is imported ─────────────────
// `resolveTemplate` calls `storage.getEmailTemplate`; returning undefined
// here causes it to fall through to the registry defaults.
vi.mock("../server/storage", () => ({
  storage: {
    getEmailTemplate: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Imports must come AFTER vi.mock() ─────────────────────────────────────
import { getRegistry } from "../server/email-templates";
import { renderEmail } from "../server/email-templates";

// ── Banned strings ─────────────────────────────────────────────────────────
const BANNED = ["NurseOnboard", "Livaware Platform"] as const;

function assertNoBannedNames(text: string, context: string) {
  for (const name of BANNED) {
    expect(text, `"${name}" found in ${context}`).not.toContain(name);
  }
}

// ── Dummy token map — covers every {{TOKEN}} used across all templates ─────
const DUMMY_TOKENS: Record<string, string> = {
  NAME: "Test Nurse",
  FIRST_NAME: "Test",
  EMAIL: "test@example.com",
  PORTAL_URL: "https://example.com/portal/abc123",
  EXPIRY: "31 Dec 2026",
  CODE: "123456",
  PASSWORD: "temppass",
  INVITED_BY: "Admin User",
  MINUTES: "12",
  VIDEO_URL: "https://example.com/video",
  CANDIDATE_NAME: "Test Nurse",
  CATEGORY: "NMC PIN",
  FILENAME: "nmc-pin.pdf",
  UPLOADER: "Admin User",
  TIMESTAMP: "2026-01-17 09:00",
  INVOICE_NUMBER: "INV-0001",
  NURSE_NAME: "Test Nurse",
  ASSESSMENT_TITLE: "Clinical Assessment",
  RECOVERY_FEE: "£500",
  ITEMS_LIST: "• NMC PIN — still outstanding",
  ACTION_TITLE: "Complete your reflection",
  DUE_DATE: "31 Jan 2027",
  ACTION_BODY: "Please complete the assigned reflection.",
  ADMIN_NAME: "Admin User",
  ROLE: "Registered Nurse",
  START_DATE: "1 Feb 2027",
  SUMMARY: "Assessment summary here.",
  SCORE: "85",
  GRADE: "Pass",
  REPORT_URL: "https://example.com/report",
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe("renderEmail() end-to-end — no retired product names in output", () => {
  const registry = getRegistry();

  it("registry is non-empty", () => {
    expect(registry.length).toBeGreaterThan(0);
  });

  for (const tpl of registry) {
    it(`template "${tpl.key}" — subject, HTML, and text are free of banned names`, async () => {
      const { subject, html, text } = await renderEmail(tpl.key, DUMMY_TOKENS);

      assertNoBannedNames(subject, `${tpl.key} subject`);
      assertNoBannedNames(html, `${tpl.key} HTML`);
      assertNoBannedNames(text, `${tpl.key} plain text`);
    });
  }
});
