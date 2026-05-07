import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

export interface CvPreCheckResult {
  ok: boolean;
  reason?: string;
  details?: {
    pageCount?: number;
    filenameHint?: string;
    textHint?: string;
  };
}

const NON_CV_FILENAME_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bpassport\b/i, label: "passport" },
  { pattern: /\b(dbs|disclosure)\b/i, label: "DBS / disclosure document" },
  { pattern: /\bpay[\s_-]?slip\b/i, label: "payslip" },
  { pattern: /\bp(60|45|11d)\b/i, label: "P60/P45 tax document" },
  { pattern: /\bbank[\s_-]?statement\b/i, label: "bank statement" },
  { pattern: /\butility[\s_-]?bill\b/i, label: "utility bill" },
  { pattern: /\b(brp|biometric)\b/i, label: "BRP / biometric residence permit" },
  { pattern: /\bvisa\b/i, label: "visa document" },
  { pattern: /\b(driver'?s?[\s_-]?licen[cs]e|driving[\s_-]?licen[cs]e)\b/i, label: "driving licence" },
  { pattern: /\b(selfie|photo|headshot|portrait)\b/i, label: "photo" },
  { pattern: /\b(signature)\b/i, label: "signature image" },
  { pattern: /\b(council[\s_-]?tax)\b/i, label: "council tax bill" },
  { pattern: /\b(tenancy|rental[\s_-]?agreement)\b/i, label: "tenancy agreement" },
  { pattern: /\b(invoice|receipt)\b/i, label: "invoice / receipt" },
];

const CV_FILENAME_PATTERNS: RegExp[] = [
  /\bcv\b/i,
  /\bc\.v\.?\b/i,
  /\bresum[eé]\b/i,
  /\bcurriculum[\s_-]?vitae\b/i,
];

const CV_TEXT_KEYWORDS = [
  "curriculum vitae",
  "résumé",
  "resume",
  "personal statement",
  "professional summary",
  "work experience",
  "employment history",
  "career history",
  "professional experience",
  "key skills",
  "education",
  "qualifications",
  "references",
  "referees",
  "nmc pin",
  "registered nurse",
  "staff nurse",
];

const NON_CV_TEXT_KEYWORDS: Array<{ kw: string; label: string }> = [
  { kw: "passport no", label: "passport" },
  { kw: "passport number", label: "passport" },
  { kw: "machine readable zone", label: "passport" },
  { kw: "type/type p<", label: "passport" },
  { kw: "gross pay", label: "payslip" },
  { kw: "net pay", label: "payslip" },
  { kw: "tax period", label: "payslip" },
  { kw: "ni number", label: "payslip / tax document" },
  { kw: "national insurance number", label: "tax document" },
  { kw: "p60", label: "P60 tax document" },
  { kw: "p45", label: "P45 tax document" },
  { kw: "disclosure and barring", label: "DBS certificate" },
  { kw: "dbs certificate", label: "DBS certificate" },
  { kw: "criminal record check", label: "DBS certificate" },
  { kw: "biometric residence permit", label: "BRP" },
  { kw: "certificate of completion", label: "training certificate" },
  { kw: "this is to certify that", label: "certificate" },
  { kw: "has successfully completed", label: "training certificate" },
  { kw: "account number", label: "bank statement" },
  { kw: "sort code", label: "bank statement" },
  { kw: "statement of account", label: "bank / utility statement" },
  { kw: "council tax", label: "council tax bill" },
  { kw: "vat invoice", label: "invoice" },
  { kw: "tenancy agreement", label: "tenancy agreement" },
];

async function extractPdfFirstPage(buffer: Buffer): Promise<{ pageCount: number; firstPageText: string }> {
  const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
  const pageCount = doc.numPages;
  let firstPageText = "";
  if (pageCount > 0) {
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string; hasEOL?: boolean }>;
    for (const item of items) {
      firstPageText += item.str;
      if (item.hasEOL) firstPageText += "\n";
      else firstPageText += " ";
    }
  }
  return { pageCount, firstPageText };
}

/**
 * Cheap pre-classifier that rejects files which obviously aren't CVs before
 * we spend an Anthropic call on them. Uses (in order):
 *   1. Filename heuristics (passport, payslip, DBS, certificate, etc.)
 *   2. PDF page count (CVs are virtually never > 20 pages)
 *   3. First-page text scan for positive CV signals vs negative non-CV signals
 *
 * Returns `{ ok: true }` on either a positive CV signal or insufficient signal
 * to reject — never blocks a possibly-valid CV. Only rejects on confident
 * negative matches so the AI step can still handle ambiguous cases.
 */
export async function preCheckCv(
  filePath: string,
  mimeType: string,
  originalFilename: string,
): Promise<CvPreCheckResult> {
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  if (!isImage && !isPdf) {
    return { ok: false, reason: "Only PDF or image files can be parsed as a CV." };
  }

  const baseName = path.basename(originalFilename || filePath);
  const cvHintInName = CV_FILENAME_PATTERNS.some((re) => re.test(baseName));
  const negativeName = NON_CV_FILENAME_PATTERNS.find((p) => p.pattern.test(baseName));

  if (negativeName && !cvHintInName) {
    return {
      ok: false,
      reason: `This file looks like a ${negativeName.label}, not a CV. Please upload a PDF or Word export of your résumé.`,
      details: { filenameHint: negativeName.label },
    };
  }

  if (!isPdf) {
    return { ok: true };
  }

  let pageCount = 0;
  let firstPageText = "";
  try {
    const absolute = path.resolve(filePath);
    const buf = fs.readFileSync(absolute);
    const result = await extractPdfFirstPage(buf);
    pageCount = result.pageCount;
    firstPageText = result.firstPageText.toLowerCase();
  } catch (err: any) {
    console.warn("[preCheckCv] PDF inspection failed; skipping pre-check:", err?.message || err);
    return { ok: true };
  }

  if (pageCount > 25) {
    return {
      ok: false,
      reason: `This PDF is ${pageCount} pages long — that's far longer than a CV. Please upload your résumé (typically 1–4 pages).`,
      details: { pageCount },
    };
  }

  if (firstPageText.trim().length === 0) {
    return { ok: true };
  }

  const positiveHits = CV_TEXT_KEYWORDS.filter((kw) => firstPageText.includes(kw));
  const negativeHit = NON_CV_TEXT_KEYWORDS.find((n) => firstPageText.includes(n.kw));

  if (negativeHit && positiveHits.length === 0) {
    return {
      ok: false,
      reason: `This document looks like a ${negativeHit.label}, not a CV. Please upload a PDF or Word export of your résumé.`,
      details: { pageCount, textHint: negativeHit.label },
    };
  }

  return { ok: true, details: { pageCount } };
}

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("AI features are unavailable: Anthropic API key is not configured. Please set the ANTHROPIC_API_KEY environment variable.");
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });
}

function getMediaType(mimeType: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const map: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/png": "image/png",
    "image/gif": "image/gif",
    "image/webp": "image/webp",
  };
  return map[mimeType] || "image/jpeg";
}

export interface ParsedCvWorkEntry {
  employer: string;
  jobTitle: string;
  department: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  reasonForLeaving: string | null;
  duties: string | null;
}

export interface ParsedCvEducationEntry {
  institution: string;
  qualification: string;
  subject: string | null;
  startDate: string | null;
  endDate: string | null;
  grade: string | null;
}

export interface ParsedCvResult {
  isCv: boolean;
  entries: ParsedCvWorkEntry[];
  education: ParsedCvEducationEntry[];
  candidateName: string | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
}

/**
 * Parse a CV / résumé (PDF or image) and extract a structured employment
 * history list suitable for inserting into the `employment_history` table.
 *
 * Returns `{ isCv: false }` if the document does not look like a CV at all,
 * so the caller can skip work-history population.
 */
export async function parseCvWorkHistory(
  filePath: string,
  mimeType: string,
): Promise<ParsedCvResult> {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (!isImage && !isPdf) {
    return { isCv: false, entries: [], education: [], candidateName: null, confidence: "low", notes: "Unsupported file type" };
  }

  const fileBuffer = fs.readFileSync(absolutePath);
  const base64Data = fileBuffer.toString("base64");

  const todayIso = new Date().toISOString().split("T")[0];

  const systemPrompt = `You are extracting structured employment history from a UK nurse's CV / résumé.

Today's date: ${todayIso}.

Read the document and extract TWO structured lists:
  1. EMPLOYMENT HISTORY / WORK EXPERIENCE — paid or voluntary nursing/healthcare/clinical roles take priority; also include other professional roles if they fill employment gaps.
  2. EDUCATION / QUALIFICATIONS — formal academic and professional qualifications (degrees, diplomas, NVQs, A-Levels, GCSEs, BSc / MSc Nursing, Postgraduate, etc.). Do NOT include short CPD courses or mandatory training certificates here — those are handled separately.

Respond ONLY with valid JSON, no prose, in exactly this shape:
{
  "isCv": true | false,
  "candidateName": "string or null",
  "confidence": "high" | "medium" | "low",
  "notes": "short note about anything ambiguous, or null",
  "entries": [
    {
      "employer": "string (organisation / trust / agency name, required)",
      "jobTitle": "string (required, e.g. 'Staff Nurse', 'Healthcare Assistant')",
      "department": "string or null (ward, unit, speciality)",
      "startDate": "YYYY-MM-DD or null",
      "endDate": "YYYY-MM-DD or null",
      "isCurrent": true | false,
      "reasonForLeaving": "string or null",
      "duties": "string or null (1-3 short sentences summarising key responsibilities)"
    }
  ],
  "education": [
    {
      "institution": "string (school / college / university name, required)",
      "qualification": "string (required, e.g. 'BSc (Hons) Adult Nursing', 'A-Level', 'NVQ Level 3', 'GCSE')",
      "subject": "string or null (subject / specialism / field of study, e.g. 'Adult Nursing', 'Biology')",
      "startDate": "YYYY-MM-DD or null",
      "endDate": "YYYY-MM-DD or null (date awarded / expected)",
      "grade": "string or null (e.g. '2:1', 'Distinction', 'Merit', 'Pass', 'A*', null if not stated)"
    }
  ]
}

Rules:
- Set "isCv" to false if the document is clearly NOT a CV / résumé (e.g. it's a certificate, ID, or unrelated form). In that case return empty entries and education arrays.
- Order entries and education from MOST RECENT first.
- If a date is given as "Jan 2020" use "2020-01-01". If only a year is given use "<year>-01-01". If unknown use null.
- "isCurrent" applies to employment only and must be true ONLY when the CV explicitly says "Present", "Current", "to date", "ongoing" etc. for the end date. When isCurrent is true, set endDate to null.
- When isCurrent is false and endDate is unknown, leave endDate as null.
- Never invent employer names, institutions, qualifications, dates, grades, or duties. If you can't read it, leave the field null and lower confidence.
- Group multiple GCSEs sat at the same school in the same year into ONE education entry whose qualification is "GCSEs" and whose subject lists the subjects (e.g. "English, Maths, Science"). Same applies to A-Levels.
- Keep duties concise (max ~280 chars).`;

  const userContent: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  if (isImage) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: getMediaType(mimeType),
        data: base64Data,
      },
    });
  } else {
    userContent.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64Data,
      },
    });
  }

  userContent.push({
    type: "text",
    text: "Extract the structured work history from this CV using the schema in the system prompt.",
  });

  const anthropic = getAnthropicClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in AI response");
    const parsed = JSON.parse(jsonMatch[0]);

    const rawEntries: any[] = Array.isArray(parsed.entries) ? parsed.entries : [];
    const rawEducation: any[] = Array.isArray(parsed.education) ? parsed.education : [];

    const entries: ParsedCvWorkEntry[] = rawEntries
      .map((e: any) => normaliseEntry(e))
      .filter((e): e is ParsedCvWorkEntry => e !== null);

    const education: ParsedCvEducationEntry[] = rawEducation
      .map((e: any) => normaliseEducation(e))
      .filter((e): e is ParsedCvEducationEntry => e !== null);

    return {
      isCv: parsed.isCv !== false && (entries.length > 0 || education.length > 0),
      entries,
      education,
      candidateName: typeof parsed.candidateName === "string" ? parsed.candidateName : null,
      confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium",
      notes: typeof parsed.notes === "string" ? parsed.notes : null,
    };
  } catch (parseErr: any) {
    console.error("[CV AI] Failed to parse AI response:", parseErr?.message);
    return {
      isCv: false,
      entries: [],
      education: [],
      candidateName: null,
      confidence: "low",
      notes: "AI response could not be parsed",
    };
  }
}

function normaliseDate(value: any): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(trimmed + "T00:00:00Z");
    if (!isNaN(d.getTime())) return trimmed;
  }
  const ymMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (ymMatch) return `${ymMatch[1]}-${ymMatch[2]}-01`;
  const yearMatch = trimmed.match(/^(\d{4})$/);
  if (yearMatch) return `${yearMatch[1]}-01-01`;
  // Force UTC interpretation so ambiguous date-only strings don't shift by
  // a day in negative-offset timezones.
  const parsed = new Date(/[zZ]|[+\-]\d{2}:?\d{2}$/.test(trimmed) ? trimmed : trimmed + " UTC");
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];
  return null;
}

function normaliseEducation(raw: any): ParsedCvEducationEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const institution = typeof raw.institution === "string" ? raw.institution.trim() : "";
  const qualification = typeof raw.qualification === "string" ? raw.qualification.trim() : "";
  if (!institution || !qualification) return null;

  const trimOrNull = (v: any): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t.slice(0, 500) : null;
  };

  return {
    institution: institution.slice(0, 500),
    qualification: qualification.slice(0, 500),
    subject: trimOrNull(raw.subject),
    startDate: normaliseDate(raw.startDate),
    endDate: normaliseDate(raw.endDate),
    grade: trimOrNull(raw.grade),
  };
}

function normaliseEntry(raw: any): ParsedCvWorkEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const employer = typeof raw.employer === "string" ? raw.employer.trim() : "";
  const jobTitle = typeof raw.jobTitle === "string" ? raw.jobTitle.trim() : "";
  if (!employer || !jobTitle) return null;

  const isCurrent = raw.isCurrent === true;
  const startDate = normaliseDate(raw.startDate);
  const endDate = isCurrent ? null : normaliseDate(raw.endDate);

  const trimOrNull = (v: any): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t.slice(0, 1000) : null;
  };

  return {
    employer: employer.slice(0, 500),
    jobTitle: jobTitle.slice(0, 500),
    department: trimOrNull(raw.department),
    startDate,
    endDate,
    isCurrent,
    reasonForLeaving: isCurrent ? null : trimOrNull(raw.reasonForLeaving),
    duties: trimOrNull(raw.duties),
  };
}
