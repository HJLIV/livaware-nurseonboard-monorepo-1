import Tesseract from "tesseract.js";
import { parse as parseMrz } from "mrz";
import path from "path";

interface PassportParseResult {
  passportNumber: string | null;
  surname: string | null;
  givenNames: string | null;
  nationality: string | null;
  dateOfBirth: string | null;
  expiryDate: string | null;
  sex: string | null;
  mrzDetected: boolean;
  ocrConfidence: number;
  rawText?: string;
}

function fixOcrErrors(line: string): string {
  return line
    .replace(/\s/g, "")
    .toUpperCase()
    .replace(/\$/g, "<")
    .replace(/€/g, "<")
    .replace(/\{/g, "<")
    .replace(/\[/g, "<")
    .replace(/\(/g, "<")
    .replace(/«/g, "<<")
    .replace(/»/g, ">>")
    .replace(/[^A-Z0-9<]/g, "");
}

function normalizeMrzLine(line: string, targetLength: number): string | null {
  const cleaned = fixOcrErrors(line);
  if (cleaned.length === targetLength) return cleaned;
  if (cleaned.length >= targetLength - 2 && cleaned.length <= targetLength + 2) {
    if (cleaned.length < targetLength) {
      return cleaned.padEnd(targetLength, "<");
    }
    return cleaned.slice(0, targetLength);
  }
  return null;
}

function isMrzCandidate(line: string): boolean {
  const cleaned = fixOcrErrors(line);
  return cleaned.length >= 28 && /[A-Z0-9<]{28,}/.test(cleaned) && cleaned.includes("<");
}

function formatMrzDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const clean = dateStr.replace(/[^0-9]/g, "");
  if (clean.length === 6) {
    const yy = parseInt(clean.slice(0, 2));
    const mm = clean.slice(2, 4);
    const dd = clean.slice(4, 6);
    const year = yy > 50 ? `19${yy}` : `20${yy}`;
    return `${dd}/${mm}/${year}`;
  }
  return dateStr;
}

export async function parsePassportImage(filePath: string): Promise<PassportParseResult> {
  const absolutePath = path.resolve(filePath);

  const { data } = await Tesseract.recognize(absolutePath, "eng", {
    logger: () => {},
  });

  const confidence = data.confidence || 0;
  const text = data.text;
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  const mrzCandidates = lines.filter(l => isMrzCandidate(l));

  for (const format of [44, 36, 30] as const) {
    for (let i = 0; i < mrzCandidates.length; i++) {
      const line1 = normalizeMrzLine(mrzCandidates[i], format);
      if (!line1) continue;

      const linesPerFormat = format === 30 ? 3 : 2;

      if (linesPerFormat === 2 && i + 1 < mrzCandidates.length) {
        const line2 = normalizeMrzLine(mrzCandidates[i + 1], format);
        if (!line2) continue;

        try {
          const result = parseMrz([line1, line2]);
          if (result && result.fields) {
            const f = result.fields;
            return {
              passportNumber: f.documentNumber || null,
              surname: f.lastName || null,
              givenNames: f.firstName || null,
              nationality: f.nationality || null,
              dateOfBirth: formatMrzDate(f.birthDate) || null,
              expiryDate: formatMrzDate(f.expirationDate) || null,
              sex: f.sex || null,
              mrzDetected: true,
              ocrConfidence: confidence,
            };
          }
        } catch {
          continue;
        }
      }

      if (linesPerFormat === 3 && i + 2 < mrzCandidates.length) {
        const line2 = normalizeMrzLine(mrzCandidates[i + 1], format);
        const line3 = normalizeMrzLine(mrzCandidates[i + 2], format);
        if (!line2 || !line3) continue;

        try {
          const result = parseMrz([line1, line2, line3]);
          if (result && result.fields) {
            const f = result.fields;
            return {
              passportNumber: f.documentNumber || null,
              surname: f.lastName || null,
              givenNames: f.firstName || null,
              nationality: f.nationality || null,
              dateOfBirth: formatMrzDate(f.birthDate) || null,
              expiryDate: formatMrzDate(f.expirationDate) || null,
              sex: f.sex || null,
              mrzDetected: true,
              ocrConfidence: confidence,
            };
          }
        } catch {
          continue;
        }
      }
    }
  }

  let passportNumber: string | null = null;
  const passportPatterns = [
    /(?:passport\s*(?:no|number|#)?[:\s]*)?([A-Z]{1,2}\d{6,9})/i,
    /\b(\d{9})\b/,
    /\b([A-Z]{2}\d{7})\b/,
    /\b([A-Z]\d{8})\b/,
    /\b(\d{3}[\s-]?\d{3}[\s-]?\d{3})\b/,
  ];

  for (const line of lines) {
    for (const pattern of passportPatterns) {
      const match = line.match(pattern);
      if (match) {
        passportNumber = match[1].replace(/[\s-]/g, "");
        break;
      }
    }
    if (passportNumber) break;
  }

  return {
    passportNumber,
    surname: null,
    givenNames: null,
    nationality: null,
    dateOfBirth: null,
    expiryDate: null,
    sex: null,
    mrzDetected: false,
    ocrConfidence: confidence,
    rawText: lines.join(" ").substring(0, 500),
  };
}
