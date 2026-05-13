import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { storage } from "./storage";

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic API key not configured");
  return new Anthropic({ apiKey, baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL });
}

function imageMediaType(m: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  return ({
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/gif": "image/gif",
    "image/webp": "image/webp",
  } as const)[m] || "image/jpeg";
}

export type PersonalInfoField =
  | "dateOfBirth"
  | "address"
  | "phone"
  | "passportNumber"
  | "nmcPin"
  | "dbsNumber";

export interface PersonalInfoExtraction {
  dateOfBirth: string | null;
  address: string | null;
  phone: string | null;
  passportNumber: string | null;
  nmcPin: string | null;
  dbsNumber: string | null;
  confidence: "high" | "medium" | "low";
}

const EXTRACTABLE_CATEGORIES = new Set([
  "identity",
  "right_to_work",
  "nmc",
  "dbs",
  "proof_of_address",
  "profile",
]);

export function categorySupportsPersonalInfoExtraction(category: string): boolean {
  return EXTRACTABLE_CATEGORIES.has(category);
}

const ANALYZABLE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

/**
 * Pull personal-identity fields out of a single uploaded document. Only the
 * fields the document genuinely contains are returned — the rest stay null.
 * Designed to be category-aware so we don't, e.g., invent an NMC PIN from
 * a driving licence.
 */
export async function extractPersonalInfoFromDocument(opts: {
  absolutePath: string;
  mimeType: string;
  category: string;
  documentType: string;
  candidateName: string;
}): Promise<PersonalInfoExtraction | null> {
  const { absolutePath, mimeType, category, documentType, candidateName } = opts;
  if (!ANALYZABLE_MIMES.has(mimeType)) return null;
  if (!EXTRACTABLE_CATEGORIES.has(category)) return null;

  const fileBuffer = fs.readFileSync(path.resolve(absolutePath));
  const base64Data = fileBuffer.toString("base64");

  const expectations: string[] = [];
  if (category === "identity" || category === "right_to_work") {
    expectations.push(
      "- dateOfBirth (DD/MM/YYYY) — from the passport/driving licence/BRP",
      "- passportNumber — only if this is a passport or passport card",
      "- address — only if this is a UK driving licence (the licence shows it)",
    );
  }
  if (category === "nmc") {
    expectations.push("- nmcPin — the registrant's NMC PIN (e.g. 12A3456E)");
  }
  if (category === "dbs") {
    expectations.push(
      "- dbsNumber — the DBS certificate number (12 digits)",
      "- dateOfBirth — only if printed on the certificate",
    );
  }
  if (category === "proof_of_address") {
    expectations.push("- address — the full postal address shown on the bill/statement");
  }
  if (category === "profile") {
    expectations.push(
      "- address — home address from the CV header",
      "- phone — phone number from the CV header",
      "- dateOfBirth — only if explicitly listed (most UK CVs omit this)",
      "- nmcPin — only if explicitly listed in the CV header",
    );
  }

  const systemPrompt = `You are extracting personal-identity fields from a document so a UK nurse onboarding system can auto-fill the nurse's profile.

Document category: ${category}
Document type: ${documentType}
Candidate name on file: ${candidateName}

ONLY extract values that are clearly visible in the document. If a field is not present, return null — do NOT guess.

Specifically look for:
${expectations.join("\n")}

Formatting rules:
- dateOfBirth must be DD/MM/YYYY (e.g. 14/03/1990)
- passportNumber: alphanumeric, no spaces
- nmcPin: keep the format printed (e.g. "12A3456E")
- dbsNumber: digits only, no spaces
- address: a single string, comma-separated lines, including postcode if visible
- phone: digits and spaces as printed

Respond with ONLY this JSON (no prose):
{
  "dateOfBirth": "DD/MM/YYYY" | null,
  "address": "<full address>" | null,
  "phone": "<phone>" | null,
  "passportNumber": "<number>" | null,
  "nmcPin": "<pin>" | null,
  "dbsNumber": "<number>" | null,
  "confidence": "high" | "medium" | "low"
}`;

  const userContent: Anthropic.MessageCreateParams["messages"][0]["content"] = [];
  if (mimeType === "application/pdf") {
    userContent.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64Data },
    });
  } else {
    userContent.push({
      type: "image",
      source: { type: "base64", media_type: imageMediaType(mimeType), data: base64Data },
    });
  }
  userContent.push({ type: "text", text: `Extract personal info from this ${documentType}.` });

  const anthropic = getAnthropicClient();
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 30_000);

  let message;
  try {
    message = await anthropic.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 800,
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
  if (!jsonMatch) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }

  const cleanStr = (v: any): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (!t || t.toLowerCase() === "null" || t.toLowerCase() === "n/a" || t.toLowerCase() === "unknown") return null;
    return t;
  };

  // Sanity-check formats so junk doesn't end up on the profile.
  const dob = cleanStr(parsed.dateOfBirth);
  const dobValid = dob && /^\d{2}\/\d{2}\/\d{4}$/.test(dob) ? dob : null;

  const passport = cleanStr(parsed.passportNumber);
  const passportValid = passport && /^[A-Z0-9]{5,15}$/i.test(passport.replace(/\s/g, "")) ? passport.replace(/\s/g, "").toUpperCase() : null;

  const nmc = cleanStr(parsed.nmcPin);
  const nmcValid = nmc && /^\d{2}[A-Z]\d{4}[A-Z]$/i.test(nmc.replace(/\s/g, "")) ? nmc.replace(/\s/g, "").toUpperCase() : null;

  const dbs = cleanStr(parsed.dbsNumber);
  const dbsDigits = dbs ? dbs.replace(/\D/g, "") : "";
  const dbsValid = dbsDigits.length === 12 ? dbsDigits : null;

  return {
    dateOfBirth: dobValid,
    address: cleanStr(parsed.address),
    phone: cleanStr(parsed.phone),
    passportNumber: passportValid,
    nmcPin: nmcValid,
    dbsNumber: dbsValid,
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "low",
  };
}

export interface PersonalInfoApplyResult {
  filled: Array<{ field: PersonalInfoField; value: string }>;
  conflicts: Array<{ field: PersonalInfoField; existing: string; detected: string }>;
  skipped: Array<{ field: PersonalInfoField; reason: "already_set_same" | "not_extracted" }>;
  confidence: "high" | "medium" | "low" | "none";
}

const FIELD_LABELS: Record<PersonalInfoField, string> = {
  dateOfBirth: "Date of birth",
  address: "Address",
  phone: "Phone",
  passportNumber: "Passport number",
  nmcPin: "NMC PIN",
  dbsNumber: "DBS number",
};

export function personalInfoFieldLabel(field: PersonalInfoField): string {
  return FIELD_LABELS[field];
}

/**
 * Apply an extraction to the nurse record. Only fills fields that are
 * currently empty — never overwrites existing values (those are surfaced as
 * conflicts so an admin can decide). Returns a structured summary suitable
 * for the API response and audit log.
 */
export async function applyExtractedPersonalInfo(
  nurseId: string,
  extraction: PersonalInfoExtraction,
): Promise<PersonalInfoApplyResult> {
  const nurse = await storage.getCandidate(nurseId);
  if (!nurse) {
    return { filled: [], conflicts: [], skipped: [], confidence: extraction.confidence };
  }

  const candidates: Array<{ field: PersonalInfoField; detected: string | null; existing: string | null }> = [
    { field: "dateOfBirth", detected: extraction.dateOfBirth, existing: nurse.dateOfBirth ?? null },
    { field: "address", detected: extraction.address, existing: nurse.address ?? null },
    { field: "phone", detected: extraction.phone, existing: nurse.phone ?? null },
    { field: "passportNumber", detected: extraction.passportNumber, existing: nurse.passportNumber ?? null },
    { field: "nmcPin", detected: extraction.nmcPin, existing: nurse.nmcPin ?? null },
    { field: "dbsNumber", detected: extraction.dbsNumber, existing: nurse.dbsNumber ?? null },
  ];

  const filled: PersonalInfoApplyResult["filled"] = [];
  const conflicts: PersonalInfoApplyResult["conflicts"] = [];
  const skipped: PersonalInfoApplyResult["skipped"] = [];
  const updatePayload: Record<string, string> = {};

  for (const c of candidates) {
    if (!c.detected) {
      skipped.push({ field: c.field, reason: "not_extracted" });
      continue;
    }
    const existingNorm = (c.existing || "").trim();
    const detectedNorm = c.detected.trim();
    if (!existingNorm) {
      updatePayload[c.field] = detectedNorm;
      filled.push({ field: c.field, value: detectedNorm });
    } else if (existingNorm.toLowerCase() === detectedNorm.toLowerCase()) {
      skipped.push({ field: c.field, reason: "already_set_same" });
    } else {
      conflicts.push({ field: c.field, existing: existingNorm, detected: detectedNorm });
    }
  }

  if (Object.keys(updatePayload).length > 0) {
    await storage.updateCandidate(nurseId, updatePayload as any);
  }

  return { filled, conflicts, skipped, confidence: extraction.confidence };
}
