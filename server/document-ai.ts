import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("AI features are unavailable: Anthropic API key is not configured. Please set the AI_INTEGRATIONS_ANTHROPIC_API_KEY environment variable.");
  }
  return new Anthropic({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });
}

export interface DocumentAnalysisResult {
  status: "pass" | "warning" | "fail";
  issues: string[];
  extractedFields: Record<string, string | null>;
  confidence: "high" | "medium" | "low";
}

const CATEGORY_PROMPTS: Record<string, string> = {
  dbs: `This should be a UK Disclosure and Barring Service (DBS) certificate. Check for:
- Is this actually a DBS certificate (not some other document)?
- Is it legible and complete (all sections visible)?
- Does it show a certificate number?
- Does it show an issue date? If so, is it within the last 3 years?
- Is the certificate type visible (Enhanced, Standard, etc.)?
- Are there any signs of tampering or editing?
Extract: certificateNumber, issueDate, certificateType, fullName`,

  indemnity: `This should be a professional indemnity insurance certificate or policy document. Check for:
- Is this actually an indemnity insurance document?
- Is it legible and complete?
- Does it show the policyholder name?
- Does it show a policy number?
- Does it show cover start and end dates? If end date is visible, has the cover expired?
- Does it show the scope of cover?
- Is the insurer/provider name visible?
Extract: provider, policyNumber, coverStartDate, coverEndDate, policyholderName`,

  right_to_work: `This should be a right-to-work document (UK/EU passport, BRP, visa, settlement scheme, or birth certificate). Check for:
- Is this an appropriate right-to-work document?
- Is it legible and complete (all relevant pages/sides visible)?
- For passports: is the photo page fully visible? Is there an expiry date, and has it expired?
- For BRP cards: are both sides visible?
- Are there any signs of tampering?
Extract: documentType, expiryDate, fullName, nationality`,

  identity: `This should be an identity document (passport, driving licence, proof of address, etc.). Check for:
- Is this a valid identity document?
- Is it legible and complete?
- Is the name clearly visible?
- If it has an expiry date, has it expired?
- For proof of address: is it dated within the last 3 months?
Extract: documentType, expiryDate, fullName, address`,

  nmc: `This should be an NMC (Nursing and Midwifery Council) registration document or letter. Check for:
- Is this actually an NMC document?
- Is the NMC PIN visible?
- Is the registration status shown?
- Is it legible and complete?
Extract: nmcPin, registrationStatus, registeredName`,

  training_certificate: `This should be a training or competency certificate. Check for:
- Is this actually a training certificate?
- Is the training/course title visible?
- Is the completion date shown?
- Is there an expiry date, and has the certificate expired?
- Is the candidate/attendee name visible?
- Is the issuing body/organisation visible?
Extract: courseTitle, completionDate, expiryDate, attendeeName, issuingBody`,

  health: `This should be a health-related document (immunisation record, occupational health clearance, etc.). Check for:
- Is this a health/medical document?
- Is it legible and complete?
- Does it show the patient name?
- Are dates visible?
Extract: documentType, patientName, date`,

  competency_evidence: `This should be evidence of clinical competency (assessment form, sign-off sheet, etc.). Check for:
- Is this a competency assessment document?
- Is it legible and complete?
- Is the assessed person's name visible?
- Is the assessor's name/signature visible?
- Is the date visible?
Extract: competencyArea, assessedName, assessorName, date`,
};

export interface SmartClassificationResult {
  detectedCategory: string;
  detectedType: string;
  matchedTrainingModules: string[];
  confidence: "high" | "medium" | "low";
  summary: string;
}

export async function classifyDocumentSmart(
  filePath: string,
  mimeType: string,
  trainingModules: string[]
): Promise<SmartClassificationResult> {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const fileBuffer = fs.readFileSync(absolutePath);
  const base64Data = fileBuffer.toString("base64");

  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (!isImage && !isPdf) {
    return {
      detectedCategory: "other",
      detectedType: "Unknown Document",
      matchedTrainingModules: [],
      confidence: "low",
      summary: "File type not supported for AI analysis",
    };
  }

  const systemPrompt = `You are a document classifier for a UK healthcare staffing company. Your job is to examine an uploaded document and determine:
1. What category it belongs to (identity, right_to_work, training_certificate, competency_evidence, health, indemnity, dbs, nmc, profile, other)
2. What specific type of document it is (e.g. "Basic Life Support Certificate", "DBS Certificate", "Passport", etc.)
3. Whether it matches any of these mandatory training modules: ${trainingModules.join(", ")}

Respond ONLY with valid JSON:
{
  "detectedCategory": "one of: identity, right_to_work, training_certificate, competency_evidence, health, indemnity, dbs, nmc, profile, other",
  "detectedType": "specific document type name",
  "matchedTrainingModules": ["list of matched training module names from the provided list, empty if none match"],
  "confidence": "high | medium | low",
  "summary": "brief one-sentence description of what this document is"
}

Be precise about training module matching — only match if the document clearly evidences completion of that specific module.`;

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
  } else if (isPdf) {
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
    text: "Classify this document. Identify what type of document it is, which category it belongs to, and whether it matches any mandatory training modules.",
  });

  const anthropic = getAnthropicClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });

  const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in AI response");
    const parsed = JSON.parse(jsonMatch[0]);

    return {
      detectedCategory: parsed.detectedCategory || "other",
      detectedType: parsed.detectedType || "Unknown Document",
      matchedTrainingModules: Array.isArray(parsed.matchedTrainingModules)
        ? parsed.matchedTrainingModules.filter((m: string) => trainingModules.includes(m))
        : [],
      confidence: parsed.confidence || "medium",
      summary: parsed.summary || "Document classified",
    };
  } catch {
    return {
      detectedCategory: "other",
      detectedType: "Unknown Document",
      matchedTrainingModules: [],
      confidence: "low",
      summary: "AI classification could not be completed",
    };
  }
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

export async function analyzeDocumentCompleteness(
  filePath: string,
  mimeType: string,
  category: string,
  documentType: string
): Promise<DocumentAnalysisResult> {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  const fileBuffer = fs.readFileSync(absolutePath);
  const base64Data = fileBuffer.toString("base64");

  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  if (!isImage && !isPdf) {
    return {
      status: "pass",
      issues: [],
      extractedFields: {},
      confidence: "low",
    };
  }

  const categoryGuide = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS["identity"];

  const systemPrompt = `You are a document quality and completeness checker for a UK healthcare staffing company's onboarding system. Your job is to examine uploaded documents and assess whether they are complete, legible, correct, and appropriate for the stated category.

The document was uploaded as: "${documentType}" in category "${category}".

${categoryGuide}

General checks for ALL documents:
- Is the document legible (not blurry, cut off, or too dark/light)?
- Does it appear to be the correct type of document for the category?
- Are key fields visible and readable?
- If dates are present, flag any that appear expired (relative to today's date, ${new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" })})

Respond ONLY with valid JSON in this exact format:
{
  "status": "pass" | "warning" | "fail",
  "issues": ["list of specific, actionable issues found — e.g. 'Document appears to be expired — expiry date reads March 2024'"],
  "extractedFields": {"fieldName": "value or null"},
  "confidence": "high" | "medium" | "low"
}

Rules for status:
- "pass": Document looks complete, legible, and correct. No significant issues.
- "warning": Document has minor issues that an admin should review (e.g. approaching expiry, partially obscured field, low image quality but still readable).
- "fail": Document has clear problems (wrong document type, illegible, expired, missing critical information, appears tampered with).

Keep issues concise and actionable. If no issues, return an empty array.`;

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
  } else if (isPdf) {
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
    text: `Analyze this document for completeness and quality. It was uploaded as "${documentType}" (category: ${category}). Check legibility, completeness, correct document type, and flag any issues.`,
  });

  const anthropic = getAnthropicClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
  });

  const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in AI response");
    }
    const parsed = JSON.parse(jsonMatch[0]);

    const validStatuses = ["pass", "warning", "fail"];
    const status = validStatuses.includes(parsed.status) ? parsed.status : "warning";

    return {
      status,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map((i: any) => String(i)) : [],
      extractedFields: parsed.extractedFields || {},
      confidence: parsed.confidence || "medium",
    };
  } catch (parseError) {
    console.error("[Document AI] Failed to parse AI response — length:", responseText.length);
    return {
      status: "warning",
      issues: ["AI analysis could not be completed — manual review recommended"],
      extractedFields: {},
      confidence: "low",
    };
  }
}
