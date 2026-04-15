import Anthropic from "@anthropic-ai/sdk";

export interface HealthTriageResult {
  status: "flagged" | "clear";
  note: string;
}

export function isTriageAvailable(): boolean {
  const hasKey = !!(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
  return hasKey;
}

export async function triageHealthDeclaration(declaration: {
  hepatitisBVaccinated?: boolean | null;
  mmrVaccinated?: boolean | null;
  varicellaVaccinated?: boolean | null;
  tbScreened?: boolean | null;
  conditionsAffectingPractice?: string | null;
  ohReferralRequired?: boolean | null;
}): Promise<HealthTriageResult> {
  if (!isTriageAvailable()) {
    throw new Error("AI triage not configured — missing API credentials");
  }

  const anthropic = new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });

  const summaryLines: string[] = [];
  summaryLines.push(`Hepatitis B vaccinated: ${declaration.hepatitisBVaccinated ? "Yes" : "No"}`);
  summaryLines.push(`MMR vaccinated: ${declaration.mmrVaccinated ? "Yes" : "No"}`);
  summaryLines.push(`Varicella vaccinated: ${declaration.varicellaVaccinated ? "Yes" : "No"}`);
  summaryLines.push(`TB screened: ${declaration.tbScreened ? "Yes" : "No"}`);
  summaryLines.push(`Conditions affecting practice declared: ${declaration.conditionsAffectingPractice ? "Yes" : "No"}`);
  summaryLines.push(`OH referral marked: ${declaration.ohReferralRequired ? "Yes" : "No"}`);

  const systemPrompt = `You are a health declaration triage assistant for a UK healthcare staffing agency. Your role is to review health declarations from nursing candidates and flag any that may need additional review by an occupational health professional.

You do NOT make clinical decisions or fitness-to-work judgements. You only identify declarations that may benefit from closer human review.

Flag a declaration if any of the following apply:
- The candidate has not been vaccinated for Hepatitis B, MMR, or Varicella (relevant for clinical duties)
- TB screening has not been completed
- The candidate has declared conditions affecting their clinical practice
- An OH referral has already been indicated

If none of the above apply, mark the declaration as clear.

Respond ONLY with valid JSON in this exact format:
{
  "status": "flagged" or "clear",
  "note": "A brief, neutral, one-sentence explanation"
}

Examples of good notes:
- "Mentions a condition that may require occupational health assessment"
- "Incomplete immunisation record — may need occupational health review"
- "No concerns identified"

Do NOT mention specific medical conditions in the note. Keep notes general and neutral.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Review this health declaration and determine if it needs flagging for additional review:\n\n${summaryLines.join("\n")}`,
      },
    ],
  });

  const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON found in AI triage response");
  }
  const parsed = JSON.parse(jsonMatch[0]);

  return {
    status: parsed.status === "flagged" ? "flagged" : "clear",
    note: parsed.note || (parsed.status === "flagged" ? "Flagged for review" : "No concerns identified"),
  };
}
