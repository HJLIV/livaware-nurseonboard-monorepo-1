import Anthropic from "@anthropic-ai/sdk";
import type { AuditLog } from "@shared/schema";

const MAX_LOG_ENTRIES = 200;

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export function isAuditSummaryAvailable(): boolean {
  return !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
}

function formatTimestamp(ts: Date | string | null | undefined): string {
  if (!ts) return "unknown date";
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "unknown date";
    return d.toISOString();
  } catch {
    return "unknown date";
  }
}

export async function generateAuditSummary(
  candidateName: string,
  auditLogs: AuditLog[]
): Promise<string> {
  if (!isAuditSummaryAvailable()) {
    throw new Error("AI summarisation is not configured");
  }

  if (auditLogs.length === 0) {
    return "No audit log entries found for this candidate.";
  }

  const chronologicalLogs = [...auditLogs].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    if (isNaN(ta)) return -1;
    if (isNaN(tb)) return 1;
    return ta - tb;
  });

  const truncated = chronologicalLogs.slice(0, MAX_LOG_ENTRIES);
  const wasTruncated = chronologicalLogs.length > MAX_LOG_ENTRIES;

  const logEntries = truncated.map((log) => {
    const date = formatTimestamp(log.timestamp);
    const detail = log.detail ? JSON.stringify(log.detail) : "";
    return `[${date}] Action: ${log.action} | By: ${log.agentName || "system"}${detail ? ` | Detail: ${detail}` : ""}`;
  }).join("\n");

  const systemPrompt = `You are an audit compliance report writer for a UK healthcare staffing company (CQC-regulated). Your job is to produce clear, factual, chronological summaries of candidate onboarding audit trails.

Rules:
- Write in plain English suitable for a CQC compliance inspector
- Organise the summary chronologically, grouped by onboarding stage where possible (e.g. Registration, Identity Verification, DBS Checks, References, Training, Health Declaration, Induction)
- Highlight key compliance milestones (identity verified, DBS cleared, references received, training completed, etc.)
- Include dates, times, and the name of the person/system that performed each action
- Be strictly factual — do not make compliance judgments or recommendations
- Use British English spelling
- Keep the summary concise but comprehensive
- Format with clear headings and bullet points for readability`;

  const truncationNote = wasTruncated
    ? `\n\nNote: This candidate has ${chronologicalLogs.length} total audit entries. Only the first ${MAX_LOG_ENTRIES} are shown below.`
    : "";

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Generate a structured compliance audit summary for candidate "${candidateName}" based on the following ${truncated.length} audit log entries:${truncationNote}\n\n${logEntries}`,
      },
    ],
  });

  const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";
  if (!responseText) {
    throw new Error("AI returned an empty response");
  }

  return responseText;
}
