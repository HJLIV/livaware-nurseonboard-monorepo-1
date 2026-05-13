// Induction-acknowledgement gate (task 114). The Skills Arcade is
// blocked for a nurse until every active `policies` row tagged
// category = "induction" has a current-version acknowledgement on
// `policy_acknowledgements`.
//
// Reads stay open everywhere — only writes (start attempt / submit
// attempt / launch arcade module) are gated. The middleware version
// lives in `server/middleware.ts`.

import { db } from "../db";
import { policies, policyAcknowledgements } from "@shared/schema";
import { and, eq } from "drizzle-orm";

export interface InductionGateState {
  /** True when every active induction item has a matching ack at the current version. */
  unlocked: boolean;
  total: number;
  acknowledged: number;
  outstanding: number;
  /** Slugs that still need to be acknowledged (or whose version drifted). */
  outstandingSlugs: string[];
}

export async function getInductionGateState(nurseId: string): Promise<InductionGateState> {
  const items = await db
    .select({ id: policies.id, slug: policies.slug, version: policies.version })
    .from(policies)
    .where(and(eq(policies.category, "induction"), eq(policies.isActive, true)));
  if (items.length === 0) {
    return { unlocked: true, total: 0, acknowledged: 0, outstanding: 0, outstandingSlugs: [] };
  }
  const acks = await db
    .select({
      policyId: policyAcknowledgements.policyId,
      policyVersion: policyAcknowledgements.policyVersion,
    })
    .from(policyAcknowledgements)
    .where(eq(policyAcknowledgements.nurseId, nurseId));
  const ackedAtVersion = new Set(
    acks.map((a) => `${a.policyId}::${a.policyVersion}`),
  );

  const outstandingSlugs: string[] = [];
  let acknowledged = 0;
  for (const item of items) {
    if (ackedAtVersion.has(`${item.id}::${item.version}`)) {
      acknowledged += 1;
    } else if (item.slug) {
      outstandingSlugs.push(item.slug);
    }
  }
  const outstanding = items.length - acknowledged;
  return {
    unlocked: outstanding === 0,
    total: items.length,
    acknowledged,
    outstanding,
    outstandingSlugs,
  };
}
