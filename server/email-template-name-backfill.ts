// One-time backfill: rewrite stored email_templates rows that still contain
// the old product name from before the rename to Basecamp. Idempotent — rows
// that no longer contain any old string are left untouched.
//
// Only genuine legacy product identifiers are replaced. Generic descriptive
// phrases like "Secure Nurse Onboarding" and "Livaware Ltd" (company name)
// are intentionally NOT in this list and must not be touched.

import { eq } from "drizzle-orm";
import { db } from "./db";
import { emailTemplates } from "@shared/schema";

// Ordered from most-specific to least-specific to avoid partial substitutions.
// All patterns are global so a single rewrite pass cleans every occurrence
// in a value. Function replacements preserve the matched capitalization.
type Replacement = string | ((match: string) => string);

export const BRANDING_REPLACEMENTS: Array<[RegExp, Replacement]> = [
  // Multi-word compound brand names first
  [/Livaware NurseOnboard/g, "Basecamp"],
  [/Livaware Skills Arcade/g, "Basecamp Skills Arcade"],
  // Case-insensitive portal references (body copy uses lowercase "your")
  [/[Yy]our Livaware portal/g, (m) => (m.startsWith("Y") ? "Your Basecamp portal" : "your Basecamp portal")],
  [/Livaware nurse portal/g, "Basecamp portal"],
  [/Livaware Platform/g, "Basecamp"],
  // Old default subjects stored verbatim
  [/Welcome to Livaware — your journey starts here/g, "Welcome to Basecamp — your journey starts here"],
  [/Livaware — Your onboarding is unlocked/g, "Basecamp — Your onboarding is unlocked"],
  [/A gentle nudge from Livaware —/g, "A gentle nudge from Basecamp —"],
  // Standalone product name last (after all compound matches)
  [/NurseOnboard/g, "Basecamp"],
];

// Detection patterns — a row is dirty if it contains any of these substrings.
export const OLD_NAME_PATTERNS: string[] = [
  "NurseOnboard",
  "Livaware NurseOnboard",
  "Livaware nurse portal",
  "Livaware Skills Arcade",
  "Livaware Platform",
  "Your Livaware portal",
  "your Livaware portal",
  "Welcome to Livaware — your journey starts here",
  "Livaware — Your onboarding is unlocked",
  "A gentle nudge from Livaware —",
];

export function rewriteString(s: string): string {
  let out = s;
  for (const [pattern, replacement] of BRANDING_REPLACEMENTS) {
    out =
      typeof replacement === "function"
        ? out.replace(pattern, replacement)
        : out.replace(pattern, replacement);
  }
  return out;
}

export function rewriteValue(val: unknown): unknown {
  if (typeof val === "string") return rewriteString(val);
  if (Array.isArray(val)) return val.map(rewriteValue);
  if (val && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      out[k] = rewriteValue(v);
    }
    return out;
  }
  return val;
}

export function containsOldName(s: string): boolean {
  return OLD_NAME_PATTERNS.some((pattern) => s.includes(pattern));
}

export function valueContainsOldName(val: unknown): boolean {
  if (typeof val === "string") return containsOldName(val);
  if (Array.isArray(val)) return val.some(valueContainsOldName);
  if (val && typeof val === "object") {
    return Object.values(val as Record<string, unknown>).some(valueContainsOldName);
  }
  return false;
}

export async function backfillEmailTemplateNames(): Promise<void> {
  const rows = await db.select().from(emailTemplates);
  let patched = 0;

  for (const row of rows) {
    const subjectDirty = containsOldName(row.subject);
    const fieldsDirty = row.fields ? valueContainsOldName(row.fields) : false;

    if (!subjectDirty && !fieldsDirty) continue;

    const newSubject = subjectDirty ? rewriteString(row.subject) : row.subject;
    const newFields = fieldsDirty ? (rewriteValue(row.fields) as typeof row.fields) : row.fields;

    await db
      .update(emailTemplates)
      .set({ subject: newSubject, fields: newFields, updatedAt: new Date() })
      .where(eq(emailTemplates.key, row.key));

    patched++;
  }

  if (patched > 0) {
    console.log(`[email-templates] name backfill: patched ${patched} stored template(s)`);
  }
}
