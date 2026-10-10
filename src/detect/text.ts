import type { Segment } from "../types.js";

export function sentences(text: string): string[] {
  return text.split(/(?<=[.?!])\s+(?=[A-Z0-9"$])/).map((s) => s.trim()).filter(Boolean);
}

/** Lowercase, straighten quotes and dashes, collapse spaces. Used for verbatim quote checks. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export interface Hit {
  segment: Segment;
  sentence: string;
}

/** First operator sentence matching every regex (all must hit the same sentence, or the same segment if bySegment). */
export function findOperator(segments: Segment[], patterns: RegExp[], bySegment = false): Hit | null {
  for (const seg of segments) {
    if (seg.speaker !== "operator") continue;
    if (bySegment) {
      if (patterns.every((p) => p.test(seg.text))) {
        const sent = sentences(seg.text).find((s) => patterns.some((p) => p.test(s))) ?? seg.text;
        return { segment: seg, sentence: patterns.every((p) => p.test(sent)) ? sent : seg.text };
      }
      continue;
    }
    for (const sent of sentences(seg.text)) {
      if (patterns.every((p) => p.test(sent))) return { segment: seg, sentence: sent };
    }
  }
  return null;
}

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

export interface Amount {
  cents: number;
  approximate: boolean;
  raw: string;
}

const APPROX = /\b(about|around|roughly|approximately|like|just under|just over|something like)\s*$/i;

/** Dollar amounts in a sentence, from "$34.00", "$34" or number words like "twenty" / "thirty-four". */
export function parseAmounts(sentence: string): Amount[] {
  const out: Amount[] = [];
  const re = /\$\s?(\d{1,5})(?:\.(\d{2}))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence))) {
    const cents = Number(m[1]) * 100 + (m[2] ? Number(m[2]) : 0);
    out.push({ cents, approximate: APPROX.test(sentence.slice(0, m.index)), raw: m[0] });
  }
  // Number words: runs like "four hundred and eighty", "thirty-four", "twenty".
  const tokens = [...sentence.matchAll(/[A-Za-z]+(?:-[A-Za-z]+)?/g)];
  let i = 0;
  while (i < tokens.length) {
    let total = 0, current = 0, used = 0, j = i;
    const startIdx = tokens[i].index ?? 0;
    let endIdx = startIdx;
    while (j < tokens.length) {
      const w = tokens[j][0].toLowerCase();
      const parts = w.split("-");
      let ok = true, val = 0;
      for (const p of parts) {
        if (p in ONES) val += ONES[p];
        else if (p in TENS) val += TENS[p];
        else ok = false;
      }
      if (ok) { current += val; used++; endIdx = (tokens[j].index ?? 0) + w.length; j++; continue; }
      if (w === "hundred" && used) { current *= 100; endIdx = (tokens[j].index ?? 0) + w.length; j++; continue; }
      if (w === "and" && used && j + 1 < tokens.length && /^[a-z-]+$/i.test(tokens[j + 1][0]) &&
          tokens[j + 1][0].toLowerCase().split("-").every((p) => p in ONES || p in TENS)) { j++; continue; }
      break;
    }
    total += current;
    if (used > 0) {
      // Skip lone small words that are not prices ("one", "two").
      const raw = sentence.slice(startIdx, endIdx);
      if (total >= 5) out.push({ cents: total * 100, approximate: APPROX.test(sentence.slice(0, startIdx)), raw });
      i = j;
    } else i++;
  }
  return out;
}

export function frequencyOf(sentence: string): "month" | "year" | null {
  if (/\b(per|a|each|every)\s+month\b|\bmonthly\b/i.test(sentence)) return "month";
  if (/\b(per|a|each|every)\s+year\b|\b(annual(ly)?|yearly)\b|\bonce a year\b/i.test(sentence)) return "year";
  return null;
}

const FILLER = new Set(["uh-huh", "uh", "huh", "mm-hmm", "mhm", "mm", "hmm", "yeah", "ok", "okay", "sure", "right", "alright", "all", "um"]);
const STRONG =
  /\b(yes|yep|i agree|i understand|understood|i authori[sz]e|authori[sz]ed|i do|that's fine|that is fine|is fine|correct|that's right|sounds (good|right)|go ahead|got it|i have (it|both)|works|that's clear|good)\b/i;
const NEGATIVE = /^(no\b|wait\b|what\b|hold on|never mind|not sure|i don't (understand|agree|know|want)|i do not)/i;

/** Classify a caller reply as an explicit yes, an ambiguous filler ("uh-huh"), or none. */
export function classifyAck(reply: string | null): "explicit" | "ambiguous" | "none" {
  if (!reply || !reply.trim()) return "none";
  const t = reply.trim();
  if (t.endsWith("?") || NEGATIVE.test(t)) return "none";
  const words = t.toLowerCase().replace(/[.,!]/g, " ").split(/\s+/).filter(Boolean);
  if (words.every((w) => FILLER.has(w))) return "ambiguous";
  if (STRONG.test(t)) return "explicit";
  return "ambiguous";
}

/** Caller turns after a given segment, up to the next operator turn. */
export function replyAfter(segments: Segment[], segId: number): Segment[] {
  const idx = segments.findIndex((s) => s.id === segId);
  const out: Segment[] = [];
  for (let k = idx + 1; k < segments.length; k++) {
    if (segments[k].speaker === "operator") break;
    out.push(segments[k]);
  }
  return out;
}
