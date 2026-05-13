// Idempotent seeder for the 21 induction items (task 114).
//
// Default behaviour: INSERT-ONLY. Existing rows are NEVER overwritten,
// so admin edits (title/body tweaks, version bumps, sortOrder changes)
// are preserved across boots. Pass `{ force: true }` to reconcile
// drifted rows back to the bundled handbook content — used only by
// explicit admin tooling, never on automatic boot.
//
// On every run we still:
//   1. Insert any missing items (slug-keyed)
//   2. Back-fill acknowledgements for nurses who completed the legacy
//      `induction_policies` checklist so they aren't retro-gated.

import { db } from "./db";
import { policies, policyAcknowledgements, inductionPolicies, nurses } from "@shared/schema";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getInductionItems, HANDBOOK_VERSION } from "./induction-content";

const SEED_AGENT = "induction_seed";

export interface SeedResult {
  inserted: number;
  updated: number;
  backfilled: number;
}

export async function seedInductionItems(
  options: { force?: boolean } = {},
): Promise<SeedResult> {
  const items = getInductionItems();
  let inserted = 0;
  let updated = 0;

  for (const item of items) {
    const [existing] = await db
      .select()
      .from(policies)
      .where(eq(policies.slug, item.slug));

    if (!existing) {
      await db.insert(policies).values({
        title: item.title,
        body: item.body,
        version: HANDBOOK_VERSION,
        isActive: true,
        requireAcknowledgement: true,
        sortOrder: item.sortOrder,
        slug: item.slug,
        category: "induction",
        createdBy: SEED_AGENT,
      });
      inserted += 1;
      continue;
    }

    // Default: never overwrite existing rows. Admin edits are
    // authoritative once the row exists in the database.
    if (!options.force) {
      // Only patch the *non-content* category tag if (and only if) it
      // was missing — this is required to keep the gate working for
      // rows seeded before the `category` column existed. We never
      // touch title/body/version/sortOrder/isActive/requireAck.
      if (existing.category !== "induction") {
        await db
          .update(policies)
          .set({ category: "induction", updatedAt: new Date() })
          .where(eq(policies.id, existing.id));
      }
      continue;
    }

    // Force mode (admin opt-in): reconcile drifted rows back to the
    // bundled content + bump version when HANDBOOK_VERSION advanced.
    const needsUpdate =
      existing.title !== item.title
      || existing.body !== item.body
      || existing.sortOrder !== item.sortOrder
      || existing.category !== "induction"
      || !existing.isActive
      || !existing.requireAcknowledgement
      || existing.version !== HANDBOOK_VERSION;
    if (needsUpdate) {
      await db
        .update(policies)
        .set({
          title: item.title,
          body: item.body,
          sortOrder: item.sortOrder,
          category: "induction",
          isActive: true,
          requireAcknowledgement: true,
          version: HANDBOOK_VERSION,
          updatedAt: new Date(),
        })
        .where(eq(policies.id, existing.id));
      updated += 1;
    }
  }

  const backfilled = await backfillLegacyInductionAcks();
  return { inserted, updated, backfilled };
}

// Nurses who completed at least one row of the legacy
// `induction_policies` checklist (the old single "I have read and
// understood" toggle) should not be retro-gated out of the arcade.
// Credit each of them with an acknowledgement against every current
// induction item, dated at the legacy completion timestamp.
//
// We mark the back-filled rows with a synthetic IP/userAgent so admins
// can tell them apart from a fresh portal acknowledgement.
async function backfillLegacyInductionAcks(): Promise<number> {
  const inductionPolicyRows = await db
    .select()
    .from(policies)
    .where(eq(policies.category, "induction"));
  if (inductionPolicyRows.length === 0) return 0;

  // Only credit nurses who acknowledged EVERY item in the legacy
  // checklist (INDUCTION_POLICIES from shared/schema.ts). Partial
  // completers must read the new handbook from scratch — otherwise
  // we would silently unlock the Skills Arcade for users who never
  // finished the original induction.
  const { INDUCTION_POLICIES } = await import("@shared/schema");
  const requiredLegacyCount = INDUCTION_POLICIES.length;

  const legacy = await db
    .select({
      nurseId: inductionPolicies.nurseId,
      maxAck: sql<Date>`max(${inductionPolicies.acknowledgedAt})`,
      ackedCount: sql<number>`count(distinct ${inductionPolicies.policyName})`,
    })
    .from(inductionPolicies)
    .where(and(eq(inductionPolicies.acknowledged, true), isNotNull(inductionPolicies.acknowledgedAt)))
    .groupBy(inductionPolicies.nurseId);
  if (legacy.length === 0) return 0;

  const nurseRows = await db.select({ id: nurses.id }).from(nurses);
  const validNurseIds = new Set(nurseRows.map((n) => n.id));

  let inserted = 0;
  for (const row of legacy) {
    // Distinct-acked-policies must equal the full legacy checklist
    // before we credit the nurse — strictly "legacy induction
    // complete", never partial.
    if (Number(row.ackedCount ?? 0) < requiredLegacyCount) continue;
    if (!validNurseIds.has(row.nurseId)) continue;
    for (const policy of inductionPolicyRows) {
      const [already] = await db
        .select({ id: policyAcknowledgements.id })
        .from(policyAcknowledgements)
        .where(and(
          eq(policyAcknowledgements.nurseId, row.nurseId),
          eq(policyAcknowledgements.policyId, policy.id),
          eq(policyAcknowledgements.policyVersion, policy.version),
        ));
      if (already) continue;
      await db.insert(policyAcknowledgements).values({
        nurseId: row.nurseId,
        policyId: policy.id,
        policyVersion: policy.version,
        ipAddress: "legacy_backfill",
        userAgent: "induction_seed:legacy_induction_policies",
        totalActiveSeconds: 0,
        sessionCount: 0,
        scrolledToEnd: false,
        openedPdf: false,
        acknowledgedAt: row.maxAck ?? new Date(),
      });
      inserted += 1;
    }
  }
  return inserted;
}
