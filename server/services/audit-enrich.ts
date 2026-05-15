// Read-side enrichment for audit_logs rows.
//
// The audit_logs table only stores the raw agentName string (e.g.
// "nurse_portal", "alex (admin)", "system"). For UI display we resolve
// it to a real person's name plus a small role tag, joining the
// nurses table when the actor is a portal/candidate.
//
// Resolution rules (also documented on task 144):
//   - "system" / null      → System / system
//   - "<u> (<role>)"       → <u> / <role>            (admin agentFor)
//   - "<label>:<name>"     → <name> / <label>        (new portal style)
//   - "<label>"            → nurseName ?? label / label   (legacy portal)
//   - anything else        → agentName / null

import { db } from "../db";
import { nurses, type AuditLog } from "@shared/schema";
import { inArray } from "drizzle-orm";

export interface EnrichedAuditLog extends AuditLog {
  nurseName: string | null;
  nurseEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
}

// Portal/human-actor labels — these resolve to a real person's name when
// available (typically the nurse on whose record the row sits).
const PORTAL_LABELS: ReadonlySet<string> = new Set([
  "nurse_portal",
  "candidate",
  "applicant",
  "referee",
]);

// Automated/system labels — these always render as System (or a fixed
// machine name), never the nurse's name, even when the row is tied
// to a nurseId.
const SYSTEM_LABELS: Record<string, string> = {
  system: "System",
  certificate_ai: "Certificate AI",
};

const ADMIN_ROLE_RE = /^(.+?)\s*\((admin|team|super_admin)\)\s*$/;

// Build a stable identity for the actor used by Super-Admin leaderboard
// grouping. Portal labels collapse to the bare label so a single
// "nurse_portal" bucket survives the new `nurse_portal:<name>` writes;
// everything else groups by raw agentName.
export function actorGroupKey(agentName: string | null | undefined): string {
  const raw = (agentName ?? "").trim();
  if (!raw) return "system";
  const colonIdx = raw.indexOf(":");
  if (colonIdx > 0) {
    const prefix = raw.slice(0, colonIdx).trim();
    if (PORTAL_LABELS.has(prefix) || prefix in SYSTEM_LABELS) return prefix;
  }
  return raw;
}

export function resolveActor(
  agentName: string | null | undefined,
  nurseName: string | null | undefined,
): { actorName: string | null; actorRole: string | null } {
  const raw = (agentName ?? "").trim();
  if (!raw) {
    return { actorName: "System", actorRole: "system" };
  }

  if (raw in SYSTEM_LABELS) {
    return { actorName: SYSTEM_LABELS[raw], actorRole: "system" };
  }

  const adminMatch = raw.match(ADMIN_ROLE_RE);
  if (adminMatch) {
    return { actorName: adminMatch[1].trim(), actorRole: adminMatch[2] };
  }

  const colonIdx = raw.indexOf(":");
  if (colonIdx > 0) {
    const prefix = raw.slice(0, colonIdx).trim();
    const suffix = raw.slice(colonIdx + 1).trim();
    if (prefix in SYSTEM_LABELS) {
      return { actorName: SYSTEM_LABELS[prefix], actorRole: "system" };
    }
    if (PORTAL_LABELS.has(prefix)) {
      return { actorName: suffix || nurseName || prefix, actorRole: prefix };
    }
  }

  if (PORTAL_LABELS.has(raw)) {
    return { actorName: nurseName || raw, actorRole: raw };
  }

  return { actorName: raw, actorRole: null };
}

export async function enrichAuditLogs(rows: AuditLog[]): Promise<EnrichedAuditLog[]> {
  const nurseIds = Array.from(
    new Set(rows.map((r) => r.nurseId).filter((id): id is string => !!id)),
  );

  let map = new Map<string, { fullName: string; email: string }>();
  if (nurseIds.length > 0) {
    const found = await db
      .select({ id: nurses.id, fullName: nurses.fullName, email: nurses.email })
      .from(nurses)
      .where(inArray(nurses.id, nurseIds));
    map = new Map(found.map((n) => [n.id, { fullName: n.fullName, email: n.email }]));
  }

  return rows.map((r) => {
    const n = r.nurseId ? map.get(r.nurseId) ?? null : null;
    const nurseName = n?.fullName ?? null;
    const nurseEmail = n?.email ?? null;
    const { actorName, actorRole } = resolveActor(r.agentName, nurseName);
    return { ...r, nurseName, nurseEmail, actorName, actorRole };
  });
}
