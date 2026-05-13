import Anthropic from "@anthropic-ai/sdk";
import type { AssessmentResponse } from "@shared/schema";

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic API key not configured");
  return new Anthropic({ apiKey, baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL });
}

export async function analyzeAssessment(
  nurseName: string,
  responses: AssessmentResponse[]
): Promise<string> {
  const responseSummary = responses.map((r) => {
    const timeUsed = r.timeLimit - r.timeSpent;
    return `**Question ${r.questionId} — ${r.domain} (${r.tag})**
Prompt: ${r.prompt}
Response (${r.response.length} chars, ${timeUsed}s of ${r.timeLimit}s used):
${r.response}`;
  }).join("\n\n---\n\n");

  const systemPrompt = `You are a senior clinical assessor for Livaware, a nurse-led complex and palliative care provider based in London. You are reviewing pre-onboarding assessment responses from a nurse candidate.

Your analysis should be:
- Thoughtful, specific, and clinically grounded
- Focused on clinical reasoning, self-awareness, professional boundaries, and relational intelligence
- Written for the clinical lead (Hemmen) to read — professional but candid
- Not a scoring rubric — a narrative assessment

Structure your report as:

## Overall Impression
A 2-3 sentence summary of the candidate.

## Domain Analysis

For each question/domain, provide:
- What the response reveals about the candidate
- Strengths demonstrated
- Gaps or concerns (if any)
- Notable phrases or reasoning patterns

## Clinical Readiness Assessment
- Suitability for lone working in complex home settings
- Comfort with ambiguity and autonomous decision-making
- Awareness of scope and escalation

## Relational & Contextual Intelligence
- How they navigate family dynamics, power imbalances, and professional boundaries
- Emotional presence and communication style

## Red Flags (if any)
- Any concerns about safety, honesty, or professional conduct

## Summary Recommendation
- A clear recommendation: Strong Candidate / Promising with Development Areas / Not Recommended
- Suggested next steps or areas to explore in interview

Keep the tone measured, professional, and honest. This is not a pass/fail — it's a portrait of a nurse.`;

  const anthropic = getAnthropicClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Please analyse the following pre-onboarding assessment from ${nurseName}:\n\n${responseSummary}`,
      },
    ],
  });

  const text = message.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return text || "Analysis could not be generated.";
}
