import { MANDATORY_TRAINING_MODULES } from "../shared/schema";

export interface TrainingCertMatch {
  moduleName: string;
  renewalFrequency: string;
  confidence: "high" | "medium";
}

export interface TrainingCertParseResult {
  matches: TrainingCertMatch[];
  extractedText: string;
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

const MODULE_KEYWORDS: Record<string, string[]> = {
  "Basic Life Support (BLS)": ["basic life support", "bls", "resuscitation", "cpr"],
  "Manual Handling": ["manual handling", "moving and handling", "patient handling"],
  "Safeguarding Adults Level 2": ["safeguarding adults", "safeguarding adult", "adult safeguarding"],
  "Safeguarding Children Level 2": ["safeguarding children", "safeguarding child", "child protection", "children safeguarding"],
  "Fire Safety": ["fire safety", "fire awareness", "fire marshal", "fire warden"],
  "Infection Prevention and Control": ["infection prevention", "infection control", "ipc"],
  "Information Governance & Data Security": ["information governance", "data security", "data protection", "gdpr", "ig training"],
  "Equality, Diversity and Inclusion": ["equality diversity", "equality, diversity", "edi training", "equality and diversity", "inclusion"],
  "Conflict Resolution / De-escalation": ["conflict resolution", "de-escalation", "de escalation", "conflict management"],
  "Mental Capacity Act & DoLS Awareness": ["mental capacity", "dols", "deprivation of liberty", "mca"],
  "Prevent Duty (Counter-Terrorism Awareness)": ["prevent duty", "prevent training", "counter-terrorism", "counter terrorism", "prevent awareness"],
  "Modern Slavery Awareness": ["modern slavery", "human trafficking"],
  "Duty of Candour": ["duty of candour", "duty of candor", "candour"],
  "Lone Working Safety": ["lone working", "lone worker"],
  "Food Hygiene Awareness": ["food hygiene", "food safety", "food handling"],
};

export async function parseTrainingCertificate(buffer: Buffer): Promise<TrainingCertParseResult> {
  let text: string;
  try {
    text = await extractTextFromPdf(buffer);
  } catch {
    return { matches: [], extractedText: "" };
  }

  if (!text || text.trim().length < 10) {
    return { matches: [], extractedText: "" };
  }

  const lowerText = text.toLowerCase();
  const matches: TrainingCertMatch[] = [];

  for (const mod of MANDATORY_TRAINING_MODULES) {
    const keywords = MODULE_KEYWORDS[mod.name] || [];
    const nameWords = mod.name.toLowerCase();

    let matched = false;
    let confidence: "high" | "medium" = "medium";

    if (lowerText.includes(nameWords)) {
      matched = true;
      confidence = "high";
    }

    if (!matched) {
      for (const kw of keywords) {
        if (lowerText.includes(kw)) {
          matched = true;
          confidence = kw.length > 10 ? "high" : "medium";
          break;
        }
      }
    }

    if (matched) {
      matches.push({
        moduleName: mod.name,
        renewalFrequency: mod.renewalFrequency,
        confidence,
      });
    }
  }

  console.log("[Training Cert] Matched modules:", matches.map(m => m.moduleName).join(", ") || "none");

  return {
    matches,
    extractedText: text.substring(0, 2000),
  };
}
