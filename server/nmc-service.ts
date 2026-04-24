export interface NmcCheckResult {
  pin: string;
  registeredName: string;
  registrationStatus: string;
  fieldOfPractice: string;
  conditions: string[];
  effectiveDate: string;
  renewalDate: string;
  rawResponse: Record<string, any>;
}

export interface NmcPdfParseResult {
  pin: string;
  registeredName: string;
  registrationStatus: string;
  fieldOfPractice: string;
  renewalDate: string;
  effectiveDate: string;
  conditions: string[];
  location: string;
  qualifications: string[];
  rawText: string;
  extractionMethod: "parsed" | "ai-extracted";
}

export class NmcVerificationError extends Error {
  constructor(
    message: string,
    public code:
      | "NOT_FOUND"
      | "INVALID_PIN"
      | "PARSE_ERROR"
  ) {
    super(message);
    this.name = "NmcVerificationError";
  }
}

const NMC_SEARCH_URL =
  "https://www.nmc.org.uk/registration/search-the-register/";

export function getNmcSearchUrl(): string {
  return NMC_SEARCH_URL;
}

export function validatePin(pin: string): boolean {
  return /^\d{2}[A-Z]\d{4}[A-Z]$/i.test(pin.trim());
}

export function isNmcAgentAvailable(): boolean {
  return true;
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;

  let fullText = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; hasEOL?: boolean }>;
    for (const item of items) {
      fullText += item.str;
      if (item.hasEOL) fullText += "\n";
    }
    fullText += "\n";
  }

  return fullText;
}

export async function parseNmcPdf(buffer: Buffer): Promise<NmcPdfParseResult> {
  let text: string;
  try {
    text = await extractTextFromPdf(buffer);
  } catch (err) {
    console.error("[NMC PDF] Parse error:", err);
    throw new NmcVerificationError("Could not read the uploaded PDF. Please ensure it is a valid NMC register PDF.", "PARSE_ERROR");
  }

  if (!text || text.trim().length < 20) {
    throw new NmcVerificationError("The uploaded PDF appears to be empty or unreadable.", "PARSE_ERROR");
  }

  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  console.log("[NMC PDF] Extracted text length:", text.length, "lines:", lines.length);

  let pin = "";
  let registeredName = "";
  let location = "";
  let renewalDate = "";
  let registrationStatus = "";
  let fieldOfPractice = "";
  let effectiveDate = "";
  const conditions: string[] = [];
  const qualifications: string[] = [];

  const dateRegex = /\d{2}\/\d{2}\/\d{4}/;
  const pinRegex = /\b(\d{2}[A-Z]\d{4}[A-Z])\b/i;

  const pinMatch = text.match(pinRegex);
  if (pinMatch) {
    pin = pinMatch[1].toUpperCase();
  }

  const statusIdx = lines.findIndex(l => l.toLowerCase().includes("registration status"));
  const registerEntryIdx = lines.findIndex(l => l.toLowerCase().startsWith("register entry") || l.toLowerCase().includes("register entry"));
  const qualIdx = lines.findIndex(l => l.toLowerCase().startsWith("recorded qualifications") || l.toLowerCase().includes("recorded qualifications"));
  const footerIdx = lines.findIndex(l => l.toLowerCase().includes("you can view a full list"));

  if (lines.length >= 1) {
    registeredName = lines[0];
  }

  for (let i = 1; i < (statusIdx >= 0 ? statusIdx : Math.min(5, lines.length)); i++) {
    const line = lines[i];
    if (dateRegex.test(line) && !renewalDate) {
      renewalDate = line.match(dateRegex)![0];
    } else if (!location && !dateRegex.test(line) && line.length > 2) {
      location = line;
    }
  }

  if (statusIdx >= 0) {
    for (let i = statusIdx + 1; i < (registerEntryIdx >= 0 ? registerEntryIdx : statusIdx + 4); i++) {
      if (i >= lines.length) break;
      const line = lines[i];
      if (line.toLowerCase().includes("glossary") || line.toLowerCase().includes("explanation")) continue;
      if (!registrationStatus && line.length > 2) {
        registrationStatus = line;
        break;
      }
    }
  }

  const entryEnd = qualIdx >= 0 ? qualIdx : (footerIdx >= 0 ? footerIdx : lines.length);
  if (registerEntryIdx >= 0) {
    for (let i = registerEntryIdx + 1; i < entryEnd; i++) {
      if (i >= lines.length) break;
      const line = lines[i];
      if (line.toLowerCase().includes("start date")) continue;
      if (line.toLowerCase().includes("glossary") || line.toLowerCase().includes("explanation")) continue;

      const dateMatch = line.match(dateRegex);
      const textPart = line.replace(dateRegex, "").trim();

      if (textPart && !fieldOfPractice) {
        fieldOfPractice = textPart;
        if (dateMatch && !effectiveDate) effectiveDate = dateMatch[0];
      } else if (dateMatch && !effectiveDate) {
        effectiveDate = dateMatch[0];
      }
    }
  }

  if (qualIdx >= 0) {
    const qualEnd = footerIdx >= 0 ? footerIdx : lines.length;
    for (let i = qualIdx + 1; i < qualEnd; i++) {
      if (i >= lines.length) break;
      const line = lines[i];
      if (line.toLowerCase().includes("start date")) continue;
      if (line.toLowerCase().includes("no recorded qualifications")) continue;
      if (line.toLowerCase().includes("glossary") || line.toLowerCase().includes("explanation")) continue;
      if (line.toLowerCase().includes("you can view")) break;
      const textPart = line.replace(dateRegex, "").trim();
      if (textPart.length > 2) qualifications.push(textPart);
    }
  }

  // Conditions detection — only flag when the register entry explicitly indicates
  // an active sanction/condition. Generic glossary or explanatory text on the
  // NMC public register page (e.g. describing what conditions of practice are)
  // must NOT trigger a flag. We require a positive indicator AND no negation
  // such as "no conditions", "no cautions", "no restrictions" anywhere nearby.
  const lowerText = text.toLowerCase();
  const negations = [
    "no conditions",
    "no condition of practice",
    "no conditions of practice",
    "no cautions",
    "no caution",
    "no restrictions",
    "no restriction",
    "no sanctions",
    "no current sanctions",
    "no current orders",
    "no orders",
    "not currently subject to",
  ];
  const hasNegation = negations.some((n) => lowerText.includes(n));

  // Status line is the strongest signal. Only treat the candidate as suspended /
  // struck off / cautioned when the *registration status* itself reflects it,
  // not when the words merely appear in glossary text.
  const statusLower = (registrationStatus || "").toLowerCase();
  if (statusLower.includes("suspended") || statusLower.includes("suspension")) {
    conditions.push("Suspension noted on register");
  }
  if (statusLower.includes("struck off") || statusLower.includes("striking off")) {
    conditions.push("Struck off noted on register");
  }
  if (statusLower.includes("caution") && !hasNegation) {
    conditions.push("Caution noted on register");
  }

  // For active conditions/restrictions on practice, look for an explicit
  // affirmative entry such as "conditions of practice order" or
  // "interim conditions of practice" appearing alongside the register entry —
  // and only when there is no negation phrase in the document.
  const affirmativeConditionPhrases = [
    "conditions of practice order",
    "interim conditions of practice",
    "interim suspension order",
    "subject to conditions",
    "subject to a condition",
    "practice restriction in force",
    "restriction order",
  ];
  const hasAffirmativeCondition = affirmativeConditionPhrases.some((p) => lowerText.includes(p));
  if (hasAffirmativeCondition && !hasNegation) {
    conditions.push("Conditions of practice noted");
  }

  if (!registeredName) {
    for (const line of lines) {
      if (line.length > 3 && !line.toLowerCase().includes("nmc") && !line.toLowerCase().includes("nursing") && !line.toLowerCase().includes("search") && !dateRegex.test(line) && !pinRegex.test(line)) {
        registeredName = line;
        break;
      }
    }
  }

  if (!registrationStatus) {
    const statusKeywords = ["registered", "lapsed", "suspended", "struck off", "effective"];
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (statusKeywords.some(kw => lower.includes(kw))) {
        registrationStatus = line;
        break;
      }
    }
  }

  if (!fieldOfPractice) {
    const practiceKeywords = ["nursing", "midwi", "nurse", "adult", "child", "mental health", "learning disabilit"];
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (practiceKeywords.some(kw => lower.includes(kw)) && !lower.includes("nmc") && !lower.includes("council")) {
        fieldOfPractice = line;
        break;
      }
    }
  }

  if (!renewalDate) {
    const allDates = text.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    if (allDates.length >= 1) {
      const parsed = allDates.map(d => {
        const [dd, mm, yyyy] = d.split("/");
        return { str: d, date: new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd)) };
      });
      parsed.sort((a, b) => b.date.getTime() - a.date.getTime());
      renewalDate = parsed[0].str;
      if (!effectiveDate && parsed.length >= 2) {
        effectiveDate = parsed[parsed.length - 1].str;
      }
    }
  }

  if (!registeredName && !registrationStatus) {
    throw new NmcVerificationError(
      "Could not extract registration details from this PDF. Please ensure it is a PDF downloaded from the NMC register search results.",
      "PARSE_ERROR"
    );
  }

  return {
    pin,
    registeredName,
    registrationStatus,
    fieldOfPractice,
    renewalDate,
    effectiveDate,
    conditions,
    location,
    qualifications,
    rawText: text.substring(0, 3000),
    extractionMethod: "parsed",
  };
}

function isParseResultIncomplete(result: NmcPdfParseResult): boolean {
  return !result.registrationStatus || !result.registeredName || !result.pin || (!result.renewalDate && !result.effectiveDate);
}

export async function extractNmcDataWithAI(pdfBuffer: Buffer): Promise<NmcPdfParseResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });

  const base64Data = pdfBuffer.toString("base64");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: `You are an NMC (Nursing and Midwifery Council) register PDF extraction system. Your job is to extract structured registration details from UK NMC register PDFs.

Extract the following fields:
- pin: The NMC PIN number (format: two digits, one letter, four digits, one letter, e.g. "18A1234C")
- registeredName: The nurse/midwife's full name as shown on the register
- registrationStatus: Their current registration status (e.g. "Registered", "Lapsed", "Suspended")
- fieldOfPractice: Their registered field (e.g. "Registered Nurse - Sub Part 1: Adult Nursing")
- renewalDate: The renewal/expiry date of registration (format: DD/MM/YYYY)
- effectiveDate: The effective/start date of the current registration entry (format: DD/MM/YYYY)
- location: Their registered location/region
- qualifications: Array of recorded qualifications
- conditions: Array of any ACTIVE conditions, cautions, suspensions, restrictions or sanctions actually noted on THIS nurse's individual register entry. CRITICAL: Use an empty array [] if none are present. Do NOT include glossary text, page headers, footers, explanations of what conditions mean, generic NMC website navigation text, or descriptions of what could appear on a register entry. Only include items that explicitly state this individual nurse currently has a condition/restriction/caution/suspension recorded against their registration. If the document says things like "no conditions of practice", "no cautions", "no restrictions", "no current sanctions", or simply does not list any sanctions for this nurse, return an empty array [].

Respond ONLY with valid JSON in this exact format:
{
  "pin": "string or empty",
  "registeredName": "string",
  "registrationStatus": "string",
  "fieldOfPractice": "string",
  "renewalDate": "string or empty",
  "effectiveDate": "string or empty",
  "location": "string or empty",
  "qualifications": ["string"],
  "conditions": ["string"]
}`,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64Data,
            },
          },
          {
            type: "text",
            text: "Extract all NMC registration details from this PDF.",
          },
        ],
      },
    ],
  });

  let responseText = "";
  for (const block of message.content) {
    if (block.type === "text") {
      responseText += block.text + "\n";
    }
  }

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[NMC AI] No JSON found in AI response, response length:", responseText.length);
    throw new NmcVerificationError("AI could not extract registration details from this PDF.", "PARSE_ERROR");
  }

  const raw = JSON.parse(jsonMatch[0]);

  const registeredName = typeof raw.registeredName === "string" ? raw.registeredName : "";
  const registrationStatus = typeof raw.registrationStatus === "string" ? raw.registrationStatus : "";
  const fieldOfPractice = typeof raw.fieldOfPractice === "string" ? raw.fieldOfPractice : "";
  const renewalDate = typeof raw.renewalDate === "string" ? raw.renewalDate : "";
  const effectiveDate = typeof raw.effectiveDate === "string" ? raw.effectiveDate : "";
  const location = typeof raw.location === "string" ? raw.location : "";
  const conditions = Array.isArray(raw.conditions) ? raw.conditions.filter((c: unknown): c is string => typeof c === "string") : [];
  const qualifications = Array.isArray(raw.qualifications) ? raw.qualifications.filter((q: unknown): q is string => typeof q === "string") : [];
  const rawPin = typeof raw.pin === "string" ? raw.pin.trim().toUpperCase() : "";

  if (!registeredName && !registrationStatus) {
    throw new NmcVerificationError("AI could not identify registration details in this PDF.", "PARSE_ERROR");
  }

  return {
    pin: validatePin(rawPin) ? rawPin : "",
    registeredName,
    registrationStatus,
    fieldOfPractice,
    renewalDate,
    effectiveDate,
    conditions,
    location,
    qualifications,
    rawText: responseText.substring(0, 3000),
    extractionMethod: "ai-extracted",
  };
}

export async function parseNmcPdfWithFallback(buffer: Buffer): Promise<NmcPdfParseResult> {
  let regexResult: NmcPdfParseResult | null = null;

  try {
    regexResult = await parseNmcPdf(buffer);
  } catch (err) {
    console.log("[NMC PDF] Regex parsing failed, attempting AI extraction...");
  }

  if (regexResult && !isParseResultIncomplete(regexResult)) {
    return regexResult;
  }

  if (regexResult) {
    console.log("[NMC PDF] Regex parsing returned incomplete data, attempting AI extraction...");
  }

  if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.warn("[NMC PDF] AI extraction skipped — no Anthropic API key configured");
    if (regexResult) {
      console.log("[NMC PDF] Returning partial regex result for admin review");
      return regexResult;
    }
    throw new NmcVerificationError(
      "Could not extract registration details from this PDF. AI fallback is not configured.",
      "PARSE_ERROR"
    );
  }

  try {
    const aiResult = await extractNmcDataWithAI(buffer);
    if (isParseResultIncomplete(aiResult)) {
      console.warn("[NMC PDF] AI extraction returned incomplete data");
      throw new NmcVerificationError(
        "AI extraction returned incomplete registration details. Please ensure the PDF is a valid NMC register download.",
        "PARSE_ERROR"
      );
    }
    console.log("[NMC PDF] AI extraction succeeded");
    return aiResult;
  } catch (aiErr) {
    if (aiErr instanceof NmcVerificationError) throw aiErr;
    console.error("[NMC PDF] AI extraction also failed:", aiErr);
    throw new NmcVerificationError(
      "Could not extract registration details from this PDF using either method. Please ensure it is a valid NMC register PDF.",
      "PARSE_ERROR"
    );
  }
}
