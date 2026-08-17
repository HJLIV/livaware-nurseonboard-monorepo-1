import { db } from "../db";
import { auditLogs } from "@shared/schema";

type AuditModule = "preboard" | "onboard" | "skills_arcade" | "admin" | "portal" | "portal_auth" | "system" | "availability" | "invoices" | "announcements" | "documents" | "supervision" | "assigned_actions" | "hbc" | "lms" | "internal_training" | "service_agreement";

export async function logAction(
  nurseId: string | null,
  module: AuditModule,
  action: string,
  agentName?: string,
  detail?: Record<string, any>
) {
  await db.insert(auditLogs).values({
    nurseId,
    module,
    action,
    agentName: agentName || "system",
    detail: detail || {},
  });
}
