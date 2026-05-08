// Optional AI cleanup pass for policies imported from .docx / .pdf.
//
// Takes the structure-aware Markdown produced by `policy-extractor.ts`
// and asks the configured AI provider to tidy it: merge broken lines
// into paragraphs, drop boilerplate page furniture, collapse trivial
// label-tables to bullet lists, leave real tables alone, and never
// invent content that wasn't in the source.
//
// If no AI key is configured (or the call fails) the original Markdown
// is returned unchanged and `aiCleaned` is false so callers can surface
// that to the user.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are a careful editor whose only job is to tidy the Markdown of a workplace policy document that was extracted from a Word or PDF file. You must:

- Preserve ALL meaningful content from the source. Never invent, paraphrase aggressively, or add information that is not present in the input.
- Merge lines that were obviously broken by the extractor back into flowing paragraphs.
- Drop obvious page furniture: repeated running headers/footers, "Page X of Y" markers, isolated page numbers, document codes ("DOC-001 v2"), printed-on dates, and copyright footer addresses.
- If a Markdown table only contains 1- or 2-column "label: value" rows that are not really tabular data, convert it to a bullet list of "**Label:** value" items.
- If a table contains real tabular data (more than 2 columns OR multiple data rows), leave it as a Markdown table.
- Keep heading levels and list structure. Promote obvious section titles ("1. Purpose", "Scope", etc.) to "##" headings if they are clearly section titles but were emitted as plain bold text.
- Do not wrap the output in code fences. Do not add a preamble or trailing commentary. Output ONLY the cleaned Markdown body.`;

const USER_INSTRUCTION = `Clean the following extracted policy Markdown according to the rules. Output only the cleaned Markdown body — no preamble, no explanation, no fences.

---BEGIN POLICY MARKDOWN---
`;

const MAX_INPUT_CHARS = 60_000;

export interface PolicyCleanupResult {
  body: string;
  aiCleaned: boolean;
  reason?: string;
}

function hasAnthropicKey(): boolean {
  return !!(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
}

function hasOpenAIKey(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
}

function stripCodeFences(text: string): string {
  let out = text.trim();
  // Strip leading ```markdown / ``` and trailing ```
  out = out.replace(/^```(?:markdown|md)?\s*\n/i, "");
  out = out.replace(/\n```\s*$/i, "");
  return out.trim();
}

async function cleanWithAnthropic(input: string): Promise<string> {
  const client = new Anthropic({
    apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  });
  const resp = await client.messages.create({
    model: "claude-3-5-sonnet-latest",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: USER_INSTRUCTION + input + "\n---END POLICY MARKDOWN---" }],
  });
  const textBlock = resp.content.find((b) => b.type === "text") as { type: "text"; text: string } | undefined;
  return stripCodeFences(textBlock?.text ?? "");
}

async function cleanWithOpenAI(input: string): Promise<string> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: USER_INSTRUCTION + input + "\n---END POLICY MARKDOWN---" },
    ],
  });
  return stripCodeFences(resp.choices[0]?.message?.content ?? "");
}

export async function cleanupPolicyMarkdown(markdown: string): Promise<PolicyCleanupResult> {
  const trimmed = markdown.trim();
  if (!trimmed) return { body: markdown, aiCleaned: false, reason: "empty" };
  if (!hasAnthropicKey() && !hasOpenAIKey()) {
    return { body: markdown, aiCleaned: false, reason: "no_api_key" };
  }
  // Truncate huge inputs so we don't blow the context window. Append a
  // marker so the model knows the document was clipped.
  const input = trimmed.length > MAX_INPUT_CHARS
    ? trimmed.slice(0, MAX_INPUT_CHARS) + "\n\n[... document truncated for AI cleanup ...]"
    : trimmed;

  try {
    const cleaned = hasAnthropicKey()
      ? await cleanWithAnthropic(input)
      : await cleanWithOpenAI(input);
    if (!cleaned || cleaned.replace(/\s+/g, "").length < 20) {
      // Suspiciously short result — fall back to the structured import.
      return { body: markdown, aiCleaned: false, reason: "empty_response" };
    }
    return { body: cleaned, aiCleaned: true };
  } catch (err: any) {
    console.error("[policy-cleanup] AI call failed:", err?.message || err);
    return { body: markdown, aiCleaned: false, reason: "api_error" };
  }
}
