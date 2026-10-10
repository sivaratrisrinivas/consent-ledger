// One structured model call per transcript, for items worded in ways the plain rules miss.
// Free tiers only: Groq (GROQ_API_KEY) or Gemini (GEMINI_API_KEY or GEMINI_KEY_FILE).
// The model never decides alone: every quote it returns must be found word for word in the transcript.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../checklist.js";
import type { ModelFinding, Segment } from "../types.js";

export const PROMPT_VERSION = "v1";

/** Own-words descriptions sent to the model. The Terms text itself is not sent to any model. */
export const MODEL_ITEMS: Record<string, string> = {
  P1: "The operator explains what the service does (for example booking rides or deliveries by phone).",
  P3: "The operator says the membership continues and keeps being charged on its own each period unless the caller cancels or asks to stop.",
  P4: "The operator explains the cancellation policy and how to cancel.",
  P6: "The operator mentions both an arbitration agreement and a class action waiver.",
  A1: "The operator asks the caller for permission to be charged.",
  F1: "The operator tells the family member that they are also responsible for all fees and charges.",
  F2: "The operator confirms the family member has authority to approve recurring charges for the rider.",
  F3: "The operator says the arbitration agreement and class action waiver bind both the family member and the rider.",
  F4: "The operator says the rider can receive information about the service directly.",
};

export function transcriptHash(segments: Segment[], ids: string[]): string {
  const h = createHash("sha256");
  h.update(PROMPT_VERSION + "|" + ids.join(",") + "|");
  for (const s of segments) h.update(`${s.id}|${s.speaker}|${s.text}\n`);
  return h.digest("hex").slice(0, 16);
}

export function buildPrompt(segments: Segment[], ids: string[]): string {
  const items = ids.map((id) => `- ${id}: ${MODEL_ITEMS[id]}`).join("\n");
  const lines = segments.map((s) => `[${s.id}] ${s.speaker.toUpperCase()}: ${s.text}`).join("\n");
  return `You review a synthetic phone-registration call transcript for a ride and delivery concierge service.
For each checklist item, decide if the OPERATOR clearly said it. Wording may be paraphrased; judge meaning, not keywords.
Return JSON only: {"items":[{"id":"P1","status":"present|missing|unclear","quote":"exact words copied from ONE operator segment, or null","segment_ids":[n]}]}
Rules: copy the quote character for character from the transcript (one sentence is enough). Never invent or fix up words. If not said, status "missing" and quote null.

Checklist:
${items}

Transcript:
${lines}`;
}

const cacheDir = () => join(ROOT, "fixtures", "model-cache");

export function readCache(hash: string): { provider: string; model: string; findings: ModelFinding[] } | null {
  const p = join(cacheDir(), `${hash}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

export function writeCache(hash: string, data: { provider: string; model: string; findings: ModelFinding[]; call?: string }) {
  mkdirSync(cacheDir(), { recursive: true });
  writeFileSync(join(cacheDir(), `${hash}.json`), JSON.stringify({ ...data, created: new Date().toISOString() }, null, 2) + "\n");
}

function geminiKey(): string | null {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const f = process.env.GEMINI_KEY_FILE;
  if (f && existsSync(f)) return readFileSync(f, "utf8").trim();
  return null;
}

export function liveProviderAvailable(): string | null {
  if (process.env.GROQ_API_KEY) return "groq";
  if (geminiKey()) return "gemini";
  return null;
}

function parseFindings(text: string): ModelFinding[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const obj = JSON.parse(text.slice(start, end + 1));
  return (obj.items ?? []).map((x: any) => ({
    id: String(x.id),
    status: ["present", "missing", "unclear"].includes(x.status) ? x.status : "unclear",
    quote: typeof x.quote === "string" && x.quote.trim() ? x.quote : null,
    segment_ids: Array.isArray(x.segment_ids) ? x.segment_ids.map(Number).filter(Number.isFinite) : [],
  }));
}

export async function callModel(segments: Segment[], ids: string[]): Promise<{ provider: string; model: string; findings: ModelFinding[] }> {
  const prompt = buildPrompt(segments, ids);
  if (process.env.GROQ_API_KEY) {
    const model = process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`groq ${r.status}`);
    const j: any = await r.json();
    return { provider: "groq", model, findings: parseFindings(j.choices[0].message.content) };
  }
  const key = geminiKey();
  if (key) {
    const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}`);
    const j: any = await r.json();
    return { provider: "gemini", model, findings: parseFindings(j.candidates[0].content.parts[0].text) };
  }
  throw new Error("no model key");
}
