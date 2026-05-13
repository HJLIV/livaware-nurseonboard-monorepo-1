// Parses the Livaware Staff Handbook Markdown into the 21 induction
// items used by the read-and-acknowledge gate (task 114): 6 Handbook
// Parts + 14 SOPs + 1 Appendices bundle.
//
// The handbook lives in attached_assets/ as a stable artifact. We slice
// it on heading offsets discovered at boot — rather than hard-coding
// line numbers — so a future editorial pass that adjusts line counts
// won't silently desync the items.

import fs from "fs";
import path from "path";

export interface InductionItem {
  slug: string;
  title: string;
  group: "part" | "sop" | "appendix";
  sortOrder: number;
  /** Markdown body, with the H1/H2 marker stripped so the portal renders the content cleanly. */
  body: string;
  /** Optional list of arcade module slugs/keys this item maps to. Used by the arcade walkthrough cross-link. */
  arcadeModuleHints?: string[];
}

const HANDBOOK_FILE = path.join(
  process.cwd(),
  "attached_assets",
  "Livaware_Staff_Handbook_v1.0_1778668703644.md",
);

// Bumping HANDBOOK_VERSION will mark every nurse as "needs to re-
// acknowledge" against the new copy. Keep this stable until the
// handbook itself is rewritten.
export const HANDBOOK_VERSION = "1.0";

interface HandbookSlice {
  startLine: number; // inclusive, 1-indexed
  endLine: number;   // exclusive
  marker: string;    // e.g. "# PART 1" or "## SOP 1 - …"
}

function loadHandbookLines(): string[] | null {
  try {
    if (!fs.existsSync(HANDBOOK_FILE)) return null;
    return fs.readFileSync(HANDBOOK_FILE, "utf8").split(/\r?\n/);
  } catch (err: any) {
    console.error("[induction-content] failed to read handbook:", err?.message || err);
    return null;
  }
}

// Find the first line index (1-indexed) matching a predicate, optionally
// starting after a given line.
function findLine(lines: string[], pred: (l: string) => boolean, after = 0): number {
  for (let i = after; i < lines.length; i++) {
    if (pred(lines[i])) return i + 1;
  }
  return -1;
}

// Slice a Markdown range out of `lines` (1-indexed start, exclusive end)
// and stitch it back into a single string, trimming trailing blanks.
function sliceText(lines: string[], start: number, end: number): string {
  if (start <= 0) return "";
  const safeEnd = end <= 0 ? lines.length + 1 : Math.min(end, lines.length + 1);
  return lines
    .slice(start - 1, safeEnd - 1)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Strip the leading H1/H2 line ("# PART 1" / "## SOP 1 - ANTT …" /
// "## Appendix A - …") plus any immediately-following all-caps banner
// line so the body starts with the meaningful content.
function trimLeadingHeading(body: string): string {
  const out = body.replace(/^\s*#{1,2}\s.*\n+/, "");
  // Drop the "## CATEGORY BANNER\n\nShort tagline\n" pattern that
  // follows each Part marker (e.g. "## FOUNDATIONAL PRINCIPLES").
  return out.replace(/^\s*##\s[A-Z][A-Z ,&\-/()]+\n+(?:[^\n#]+\n+)?/, "").trim();
}

// ── Item definitions ──────────────────────────────────────────────────
//
// `findStart` locates the heading line for each item; `findEnd` returns
// the start of the next item (or end of relevant range). Items are
// declared in the order they appear in the handbook so sortOrder lines
// up with reading order.

interface ItemDef {
  slug: string;
  title: string;
  group: InductionItem["group"];
  matcher: (line: string) => boolean;
  arcadeModuleHints?: string[];
}

const ITEM_DEFS: ItemDef[] = [
  // 6 Handbook Parts
  { slug: "induction:part-1-livaware-way", title: "Part 1 — Foundational Principles: The Livaware Way", group: "part", matcher: (l) => l.trim() === "# PART 1" },
  { slug: "induction:part-2-professional-standards", title: "Part 2 — Professional Standards and Conduct", group: "part", matcher: (l) => l.trim() === "# PART 2" },
  { slug: "induction:part-3-patient-engagement", title: "Part 3 — Patient Engagement and Communication", group: "part", matcher: (l) => l.trim() === "# PART 3" },
  { slug: "induction:part-4-clinical-operations", title: "Part 4 — Clinical Operations and Care Delivery", group: "part", matcher: (l) => l.trim() === "# PART 4" },
  { slug: "induction:part-5-safety-risk", title: "Part 5 — Safety, Risk, and Incident Management", group: "part", matcher: (l) => l.trim() === "# PART 5" },
  { slug: "induction:part-6-governance", title: "Part 6 — Governance and Continuous Improvement", group: "part", matcher: (l) => l.trim() === "# PART 6" },

  // 14 SOPs
  { slug: "induction:sop-01-antt", title: "SOP 1 — Aseptic Non-Touch Technique (ANTT)", group: "sop", matcher: (l) => /^## SOP 1\b/.test(l), arcadeModuleHints: ["antt", "aseptic"] },
  { slug: "induction:sop-02-venepuncture", title: "SOP 2 — Venepuncture for Blood Sampling", group: "sop", matcher: (l) => /^## SOP 2\b/.test(l), arcadeModuleHints: ["venepuncture"] },
  { slug: "induction:sop-03-peripheral-iv", title: "SOP 3 — Peripheral IV Infusion (Butterfly) in the Home", group: "sop", matcher: (l) => /^## SOP 3\b/.test(l), arcadeModuleHints: ["peripheral_iv", "iv_infusion"] },
  { slug: "induction:sop-04-picc", title: "SOP 4 — IV Infusion via PICC", group: "sop", matcher: (l) => /^## SOP 4\b/.test(l), arcadeModuleHints: ["picc"] },
  { slug: "induction:sop-05-port", title: "SOP 5 — IV Infusion via Implanted Port (TIVAD)", group: "sop", matcher: (l) => /^## SOP 5\b/.test(l), arcadeModuleHints: ["port", "tivad"] },
  { slug: "induction:sop-06-sharps", title: "SOP 6 — Sharps Injury and Body-Fluid Exposure", group: "sop", matcher: (l) => /^## SOP 6\b/.test(l), arcadeModuleHints: ["sharps"] },
  { slug: "induction:sop-07-documentation", title: "SOP 7 — Defensible Documentation for Invasive Procedures", group: "sop", matcher: (l) => /^## SOP 7\b/.test(l), arcadeModuleHints: ["documentation"] },
  { slug: "induction:sop-08-deterioration", title: "SOP 8 — Acute Deterioration & Medical Emergencies (NEWS2)", group: "sop", matcher: (l) => /^## SOP 8\b/.test(l), arcadeModuleHints: ["news2", "deterioration", "emergency"] },
  { slug: "induction:sop-09-cold-chain", title: "SOP 9 — Cold Chain & Temperature Management for Medicines", group: "sop", matcher: (l) => /^## SOP 9\b/.test(l), arcadeModuleHints: ["cold_chain"] },
  { slug: "induction:sop-10-safeguarding", title: "SOP 10 — Safeguarding Adults and Children", group: "sop", matcher: (l) => /^## SOP 10\b/.test(l), arcadeModuleHints: ["safeguarding"] },
  { slug: "induction:sop-11-consent", title: "SOP 11 — Consent, Capacity, and Best-Interests Decisions", group: "sop", matcher: (l) => /^## SOP 11\b/.test(l), arcadeModuleHints: ["consent", "capacity"] },
  { slug: "induction:sop-12-medicines", title: "SOP 12 — Medicines Administration & Infusion Safety Checks", group: "sop", matcher: (l) => /^## SOP 12\b/.test(l), arcadeModuleHints: ["medicines"] },
  { slug: "induction:sop-13-handover-sbar", title: "SOP 13 — Clinical Handover & SBAR", group: "sop", matcher: (l) => /^## SOP 13\b/.test(l), arcadeModuleHints: ["sbar", "handover"] },
  { slug: "induction:sop-14-complaints", title: "SOP 14 — Concerns, Complaints and Feedback", group: "sop", matcher: (l) => /^## SOP 14\b/.test(l), arcadeModuleHints: ["complaints"] },

  // 1 Appendices bundle
  { slug: "induction:appendices", title: "Part 8 — Appendices: Templates, Checklists & Quality Framework", group: "appendix", matcher: (l) => l.trim() === "# PART 8" },
];

// Built-in fallback used when the handbook file is missing (e.g. during
// a stripped-down deployment). We at least seed the 21 items with their
// titles + a stub body so the UI behaves consistently.
function fallbackBody(def: ItemDef): string {
  return `_The full text of "${def.title}" will be available once the Livaware Staff Handbook is published to this environment._`;
}

let cache: InductionItem[] | null = null;

export function getInductionItems(): InductionItem[] {
  if (cache) return cache;
  const lines = loadHandbookLines();
  const items: InductionItem[] = [];

  // Pre-resolve start lines for each definition (or -1 if missing).
  const starts: number[] = ITEM_DEFS.map((def) =>
    lines ? findLine(lines, def.matcher) : -1,
  );
  // The Appendices bundle ends just before the "## References and
  // Further Reading" section so we don't include the bibliography.
  const referencesStart = lines
    ? findLine(lines, (l) => /^##\s+References and Further Reading/i.test(l))
    : -1;

  ITEM_DEFS.forEach((def, idx) => {
    const start = starts[idx];
    let body = "";
    if (lines && start > 0) {
      // End is the next item's start, with the special case that the
      // Appendices bundle (last item) ends at the References section.
      let end = idx + 1 < starts.length ? starts[idx + 1] : -1;
      if (def.group === "appendix" && referencesStart > 0) end = referencesStart;
      body = trimLeadingHeading(sliceText(lines, start, end > 0 ? end : 0));
    }
    if (!body) body = fallbackBody(def);
    items.push({
      slug: def.slug,
      title: def.title,
      group: def.group,
      sortOrder: idx + 1,
      body,
      arcadeModuleHints: def.arcadeModuleHints,
    });
  });

  cache = items;
  return items;
}

// Used by tests to force a re-parse after mutating the file on disk.
export function clearInductionCache(): void {
  cache = null;
}

// Exposed for the gate / matrix endpoints — the set of slugs that
// constitute a "complete" induction at this point in time.
export function getInductionSlugs(): string[] {
  return getInductionItems().map((i) => i.slug);
}
