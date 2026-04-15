import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { MANDATORY_TRAINING_MODULES } from "@shared/schema";

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

export interface CertificateAnalysisResult {
  modules: DetectedModule[];
  rawAnalysis: string;
  confidence: "high" | "medium" | "low";
}

export interface DetectedModule {
  detectedTitle: string;
  matchedModule: string | null;
  completedDate: string | null;
  expiryDate: string | null;
  issuingBody: string | null;
  confidence: "high" | "medium" | "low";
}

const MODULE_NAMES = MANDATORY_TRAINING_MODULES.map(m => m.name);

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

export async function analyzeCertificateWithAI(
  filePath: string,
  mimeType: string
): Promise<CertificateAnalysisResult> {
  const absolutePath = path.resolve(filePath);
  const fileBuffer = fs.readFileSync(absolutePath);
  const base64Data = fileBuffer.toString("base64");

  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";

  const moduleList = MODULE_NAMES.map((n, i) => `${i + 1}. ${n}`).join("\n");

  const systemPrompt = `You are a training certificate analysis system for a UK healthcare staffing company. Your job is to examine uploaded training certificates and extract structured information.

You must match detected training to this specific list of mandatory training modules:
${moduleList}

Rules:
- Extract the EXACT completion date from the certificate (format: YYYY-MM-DD)
- Extract the expiry date if shown (format: YYYY-MM-DD)
- Extract the issuing body / training provider name
- Match each detected certificate to the closest module from the list above
- If a certificate covers multiple modules, list each separately
- If you cannot confidently match a certificate to a module, set matchedModule to null and provide the detected title
- Be generous with matching — e.g. "BLS" or "Basic Life Support" or "CPR/BLS" all match "Basic Life Support (BLS)"
- "Moving and Handling" or "Patient Handling" matches "Manual Handling"
- "Safeguarding Vulnerable Adults" matches "Safeguarding Adults Level 2"
- "GDPR" or "Data Protection" matches "Information Governance & Data Security"
- "IPC" matches "Infection Prevention and Control"
- "EDI" or "Equality and Diversity" matches "Equality, Diversity and Inclusion"
- "MCA" or "Mental Capacity" or "Deprivation of Liberty" matches "Mental Capacity Act & DoLS Awareness"

Respond ONLY with valid JSON in this exact format:
{
  "modules": [
    {
      "detectedTitle": "the exact title as written on the certificate",
      "matchedModule": "exact module name from the list above, or null if no match",
      "completedDate": "YYYY-MM-DD or null",
      "expiryDate": "YYYY-MM-DD or null",
      "issuingBody": "name of issuing organisation or null",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "confidence": "high" | "medium" | "low"
}`;

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
    userContent.push({
      type: "text",
      text: "Analyze this training certificate image. Extract all training modules, completion dates, expiry dates, and issuing bodies. Match each to our mandatory training list.",
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
    userContent.push({
      type: "text",
      text: "Analyze this training certificate PDF. It may contain one or multiple certificates. Extract ALL training modules, completion dates, expiry dates, and issuing bodies. Match each to our mandatory training list.",
    });
  } else {
    throw new Error(`Unsupported file type for AI analysis: ${mimeType}`);
  }

  const anthropic = getAnthropicClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
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

    const modules: DetectedModule[] = (parsed.modules || []).map((m: any) => ({
      detectedTitle: m.detectedTitle || "Unknown",
      matchedModule: m.matchedModule && MODULE_NAMES.includes(m.matchedModule) ? m.matchedModule : null,
      completedDate: m.completedDate || null,
      expiryDate: m.expiryDate || null,
      issuingBody: m.issuingBody || null,
      confidence: m.confidence || "low",
    }));

    return {
      modules,
      rawAnalysis: responseText,
      confidence: parsed.confidence || "medium",
    };
  } catch (parseError) {
    console.error("[Certificate AI] Failed to parse AI response — response length:", responseText.length, "chars");
    return {
      modules: [],
      rawAnalysis: responseText,
      confidence: "low",
    };
  }
}

export interface CompetencyGuidance {
  competency: string;
  guidance: string;
}

export async function generateCompetencyGuidance(
  competencyName: string,
  domain: string,
  specialty?: string
): Promise<CompetencyGuidance> {
  const specialtyContext = specialty ? ` The nurse's specialty area is: ${specialty}.` : "";

  const anthropic = getAnthropicClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: `You are a supportive clinical competency assessment guide for UK nurses. Your role is to help nurses give more complete and accurate self-assessments by providing relevant examples and reflective prompts. You do NOT suggest or influence what level a nurse should rate themselves — you only help them think through their experience more thoroughly.

Keep your response concise (3-5 bullet points). Use plain language. Focus on concrete clinical scenarios and questions the nurse can ask themselves.`,
    messages: [
      {
        role: "user",
        content: `A nurse is self-assessing their competency in "${competencyName}" (domain: ${domain}).${specialtyContext}

Provide brief, relevant guidance to help them reflect on their experience with this skill. Include:
- 2-3 specific clinical examples or scenarios they should consider
- 1-2 reflective questions to help them accurately judge their level

Format as a short bulleted list. Do not suggest what level to choose.`,
      },
    ],
  });

  const responseText = message.content[0]?.type === "text" ? message.content[0].text : "";

  const fallback = "Consider your recent clinical experience in this area. Think about situations where you have performed this skill, how confident you felt, and whether you needed supervision or support.";

  if (!responseText || responseText.trim().length < 30) {
    return { competency: competencyName, guidance: fallback };
  }

  return {
    competency: competencyName,
    guidance: responseText,
  };
}
