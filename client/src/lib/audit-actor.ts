// Shared frontend resolver for audit-log "who did this" rendering.
//
// Server (server/services/audit-enrich.ts) already returns actorName /
// actorRole / nurseName on every row. This helper just falls back to
// the same parsing rules client-side for any caller that didn't get
// the enriched fields (legacy fixtures, manual rows, etc).

export interface AuditActorFields {
  agentName?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  nurseName?: string | null;
}

const PORTAL_LABELS = new Set([
  "nurse_portal",
  "candidate",
  "applicant",
  "referee",
]);

const SYSTEM_LABELS: Record<string, string> = {
  system: "System",
  certificate_ai: "Certificate AI",
};

const ADMIN_ROLE_RE = /^(.+?)\s*\((admin|team|super_admin)\)\s*$/;

const ROLE_LABELS: Record<string, string> = {
  nurse_portal: "nurse portal",
  candidate: "candidate",
  applicant: "applicant",
  referee: "referee",
  admin: "admin",
  team: "team",
  super_admin: "super admin",
  system: "system",
};

export function resolveAuditActor(row: AuditActorFields): {
  actorName: string;
  actorRole: string | null;
} {
  if (row.actorName || row.actorRole) {
    return {
      actorName: row.actorName || row.agentName || "Unknown",
      actorRole: row.actorRole ?? null,
    };
  }

  const raw = (row.agentName ?? "").trim();
  if (!raw) return { actorName: "System", actorRole: "system" };

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
      return { actorName: suffix || row.nurseName || prefix, actorRole: prefix };
    }
  }

  if (PORTAL_LABELS.has(raw)) {
    return { actorName: row.nurseName || raw, actorRole: raw };
  }

  return { actorName: raw, actorRole: null };
}

export function actorRoleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}
