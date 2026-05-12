import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { REFERENCE_QUESTIONS } from "@shared/schema";

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("AI features are unavailable: Anthropic API key is not configured.");
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });
}

function getImageMediaType(mimeType: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const map: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/gif": "image/gif",
    "image/webp": "image/webp",
  };
  return map[mimeType] || "image/jpeg";
}

const RATING_KEYS = REFERENCE_QUESTIONS.filter(q => (q as any).type === "rating").map(q => q.key);
const FREE_TEXT_KEYS = REFERENCE_QUESTIONS.filter(q => !(q as any).type || (q as any).type === undefined).map(q => q.key);
const SICKNESS_OPTIONS = ["Excellent", "Good", "Fair", "Concerns", "Unable to comment"];

export interface ExtractedReference {
  refereeName: string | null;
  refereeEmail: string | null;
  refereeOrg: string | null;
  refereeRole: string | null;
  relationshipToCandidate: string | null;
  ratings: Record<string, number>;
  freeTextResponses: Record<string, string>;
  conductFlags: { conduct_concerns?: boolean; reemploy?: boolean };
  sicknessAbsenceBand: string | null;
  confidence: "high" | "medium" | "low";
  rawNotes: string;
}

export async function extractReferenceFromDocument(
  filePath: string,
  mimeType: string,
  candidateName: string,
): Promise<ExtractedReference> {
  const absolutePath = path.resolve(filePath);
  const fileBuffer = fs.readFileSync(absolutePath);
  const base64Data = fileBuffer.toString("base64");

  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  const ratingDescriptions = REFERENCE_QUESTIONS
    .filter(q => (q as any).type === "rating")
    .map(q => `- "${q.key}": ${q.question}`)
    .join("\n");

  const freeTextDescriptions = REFERENCE_QUESTIONS
    .filter(q => !(q as any).type)
    .map(q => `- "${q.key}": ${q.question}`)
    .join("\n");

  const systemPrompt = `You are extracting structured data from a written employment reference letter for a UK nurse named "${candidateName}".

Map what the reference says into the following structured fields. If the reference does not explicitly cover a field, leave it as null / omit it (do NOT invent values).

REFEREE DETAILS — read these from the letterhead, signature block, or contact line:
- "refereeName": The person who signed / wrote the reference.
- "refereeEmail": Their email address (only if printed in the letter).
- "refereeOrg": Their organisation / employer / hospital / trust name.
- "refereeRole": Their job title (e.g. "Ward Manager", "Director of Nursing").
- "relationshipToCandidate": Their professional relationship to the candidate (e.g. "Line Manager", "Clinical Lead", "Colleague").

RATINGS (1-5 scale, where 1=poor, 3=satisfactory, 5=excellent). Infer a rating only when the text clearly supports it:
${ratingDescriptions}

FREE-TEXT FIELDS (copy or summarise the relevant sentences from the letter, keep UK English):
${freeTextDescriptions}

CONDUCT FLAGS (booleans):
- "conduct_concerns": true ONLY if the letter mentions disciplinary, capability, or fitness-to-practise concerns. Otherwise false (or omit if not addressed).
- "reemploy": true if the referee says they would re-employ / recommend the candidate. false if they say they would not. Omit if not addressed.

SICKNESS ABSENCE BAND — pick exactly one of: ${SICKNESS_OPTIONS.map(o => `"${o}"`).join(", ")}. Omit if not addressed.

Respond ONLY with valid JSON in this exact format:
{
  "refereeName": "<full name>" | null,
  "refereeEmail": "<email>" | null,
  "refereeOrg": "<organisation>" | null,
  "refereeRole": "<job title>" | null,
  "relationshipToCandidate": "<relationship>" | null,
  "ratings": { "<key>": <1-5>, ... },
  "freeTextResponses": { "<key>": "<text>", ... },
  "conductFlags": { "conduct_concerns": <bool>, "reemploy": <bool> },
  "sicknessAbsenceBand": "<one of the options>" | null,
  "confidence": "high" | "medium" | "low",
  "rawNotes": "<one short sentence describing what the reference covered>"
}`;

  const userContent: Anthropic.MessageCreateParams["messages"][0]["content"] = [];
  if (isImage) {
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: getImageMediaType(mimeType), data: base64Data },
    });
    userContent.push({ type: "text", text: `Extract the structured reference data from this scanned reference letter for ${candidateName}.` });
  } else if (isPdf) {
    userContent.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64Data },
    });
    userContent.push({ type: "text", text: `Extract the structured reference data from this reference letter PDF for ${candidateName}.` });
  } else {
    // Treat as plain text
    const text = fileBuffer.toString("utf8").slice(0, 50_000);
    userContent.push({ type: "text", text: `Extract the structured reference data from the following reference letter for ${candidateName}:\n\n${text}` });
  }

  const anthropic = getAnthropicClient();
  const AI_TIMEOUT_MS = 30_000;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), AI_TIMEOUT_MS);

  let message;
  try {
    message = await anthropic.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      },
      { signal: abortController.signal },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in AI response");
  const parsed = JSON.parse(jsonMatch[0]);

  // Sanitise
  const ratings: Record<string, number> = {};
  for (const [k, v] of Object.entries(parsed.ratings || {})) {
    if (RATING_KEYS.includes(k as any) && typeof v === "number" && v >= 1 && v <= 5) {
      ratings[k] = Math.round(v);
    }
  }
  const freeTextResponses: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed.freeTextResponses || {})) {
    if (FREE_TEXT_KEYS.includes(k as any) && typeof v === "string" && v.trim()) {
      freeTextResponses[k] = v.trim();
    }
  }
  const conductFlags: { conduct_concerns?: boolean; reemploy?: boolean } = {};
  if (typeof parsed.conductFlags?.conduct_concerns === "boolean") conductFlags.conduct_concerns = parsed.conductFlags.conduct_concerns;
  if (typeof parsed.conductFlags?.reemploy === "boolean") conductFlags.reemploy = parsed.conductFlags.reemploy;

  const sickness = typeof parsed.sicknessAbsenceBand === "string" && SICKNESS_OPTIONS.includes(parsed.sicknessAbsenceBand)
    ? parsed.sicknessAbsenceBand
    : null;

  const cleanStr = (v: any): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t && t.toLowerCase() !== "null" ? t : null;
  };

  return {
    refereeName: cleanStr(parsed.refereeName),
    refereeEmail: cleanStr(parsed.refereeEmail),
    refereeOrg: cleanStr(parsed.refereeOrg),
    refereeRole: cleanStr(parsed.refereeRole),
    relationshipToCandidate: cleanStr(parsed.relationshipToCandidate),
    ratings,
    freeTextResponses,
    conductFlags,
    sicknessAbsenceBand: sickness,
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
    rawNotes: typeof parsed.rawNotes === "string" ? parsed.rawNotes : "",
  };
}
