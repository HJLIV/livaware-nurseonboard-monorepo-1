import Anthropic from "@anthropic-ai/sdk";
import { storage } from "./storage";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export async function generateDashboardSummary(): Promise<string> {
  const [stats, candidates] = await Promise.all([
    storage.getDashboardStats(),
    storage.getCandidates(),
  ]);

  const candidateSummaries = candidates.map((c) => ({
    status: c.status,
    band: c.band,
    specialisms: c.specialisms,
  }));

  const dataPayload = JSON.stringify({ stats, candidates: candidateSummaries }, null, 2);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: `You are a concise admin dashboard assistant for a UK healthcare staffing company (NurseOnboard). Given the current pipeline statistics and candidate data, write a brief structured markdown summary covering:
- **Pipeline Overview**: How many candidates total and their distribution across stages
- **Action Required**: Escalations, blocked candidates, or bottlenecks that need attention
- **References**: Any pending references that need chasing

Use markdown formatting: **bold** for emphasis, bullet points for lists where helpful, and keep it actionable and direct. Use short paragraphs. Do not greet or sign off.`,
    messages: [
      {
        role: "user",
        content: `Here is the current dashboard data:\n${dataPayload}`,
      },
    ],
  });

  const text = message.content[0]?.type === "text" ? message.content[0].text : "";
  const summary = text.trim();

  if (!summary) {
    throw new Error("AI returned an empty summary");
  }

  return summary;
}
