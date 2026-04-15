import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

export interface ReferenceEmailDraft {
  subject: string;
  body: string;
}

export async function draftReferenceRequestEmail(params: {
  candidateName: string;
  candidateRole?: string;
  candidateSpecialisms?: string[];
  refereeName: string;
  refereeRole?: string;
  refereeOrg?: string;
  relationshipToCandidate?: string;
  refereeFormUrl: string;
  expiresAt: Date;
}): Promise<ReferenceEmailDraft> {
  const expiryFormatted = params.expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const specialismsText = params.candidateSpecialisms?.length
    ? params.candidateSpecialisms.join(", ")
    : null;

  const systemPrompt = `You are writing a professional reference request email on behalf of Livaware Ltd, a UK healthcare staffing company. The email asks a referee to complete an online reference form for a nursing candidate.

Requirements:
- Tone: Professional, warm, and respectful. UK English spelling.
- Mention that the reference is required under CQC Regulation 19 (Schedule 3).
- Mention the candidate by name and role/specialty if provided.
- Address the referee by name and acknowledge their role/relationship if provided.
- Explain that the form covers: professional relationship, clinical ability ratings, reliability/communication/teamwork, conduct and fitness to practise, sickness absence, and clinical competency assessment.
- Mention the form typically takes 10-15 minutes.
- Include a note that responses are confidential and used solely for pre-employment screening.
- Do NOT include the form URL or expiry date in the body text — those will be added separately in the email template.
- Sign off as "Livaware Onboarding Team".
- Keep the email concise — no more than 6 short paragraphs.

Respond ONLY with valid JSON in this exact format:
{
  "subject": "the email subject line",
  "body": "the plain text email body (use \\n for line breaks)"
}`;

  const contextParts: string[] = [
    `Candidate: ${params.candidateName}`,
  ];
  if (params.candidateRole) contextParts.push(`Role/Band: ${params.candidateRole}`);
  if (specialismsText) contextParts.push(`Specialisms: ${specialismsText}`);
  contextParts.push(`Referee: ${params.refereeName}`);
  if (params.refereeRole) contextParts.push(`Referee's Role: ${params.refereeRole}`);
  if (params.refereeOrg) contextParts.push(`Referee's Organisation: ${params.refereeOrg}`);
  if (params.relationshipToCandidate) contextParts.push(`Relationship to Candidate: ${params.relationshipToCandidate}`);
  contextParts.push(`Form Expiry: ${expiryFormatted}`);

  const AI_TIMEOUT_MS = 15000;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

  let message;
  try {
    message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Draft a reference request email with the following details:\n\n${contextParts.join("\n")}`,
        },
      ],
    }, { signal: abortController.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No valid JSON in AI response");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!parsed.subject || !parsed.body) {
    throw new Error("AI response missing subject or body");
  }

  return {
    subject: parsed.subject,
    body: parsed.body,
  };
}
