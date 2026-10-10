// Deterministic checks. These run on every call, with or without a model key.
import type { CallInput, Checklist, Plan, Segment } from "../types.js";
import { findOperator, frequencyOf, parseAmounts, sentences, type Hit } from "./text.js";
import { fmtMoney, fmtTime } from "../checklist.js";

export interface RuleResult {
  status: "present" | "missing" | "mismatch";
  quote: string | null;
  segment_ids: number[];
  start: number | null;
  detail: string | null;
}

const hit = (h: Hit, detail: string | null = null): RuleResult => ({
  status: "present", quote: h.sentence, segment_ids: [h.segment.id], start: h.segment.start, detail,
});
const missing = (detail: string | null = null): RuleResult => ({ status: "missing", quote: null, segment_ids: [], start: null, detail });

/** Plain-phrase patterns for the items that do not need a number or plan lookup. Paraphrases are left to the model step. */
export const PATTERNS: Record<string, RegExp[]> = {
  P1: [/\b(book|arrange|order|schedule)s?\b[^.]{0,80}\b(rides?|groceries|meals|deliver(y|ies))\b/i],
  P3: [/\b(automatically renews?|auto-?renew(s|al)?|renews? automatically)\b/i, /\b(unless|until)\s+(you|either of you)(\s+or\s+[\w ]+?)?\s+cancels?\b/i],
  P4: [/\bcancel\b/i, /\b(call us|email us|cancel online|account settings|online)\b/i],
  A1: [/\bauthori[sz]e\b[^?]{0,140}\bcharge\b/i],
  F1: [/\b(responsible|liable)\b[^.]{0,60}\b(fees|charges)\b|\bjointly\b/i],
  F2: [/\b(authority|authori[sz]ed)\b[^.?]{0,80}\b(recurring|charges)\b/i],
  F3: [/\barbitration\b[^.]{0,120}\bboth\b|\bboth\b[^.]{0,80}\barbitration\b/i],
  F4: [/\bright to (receive|get)\b[^.]{0,80}\b(directly|from us)\b/i],
};

export function detectFamily(input: CallInput): { family: boolean; reason: string | null } {
  if (input.caller_role === "loved_one") {
    const s = input.segments.find((x) => x.speaker === "caller" && FAMILY.test(x.text));
    return { family: true, reason: s ? `Caller at ${fmtTime(s.start)}: "${firstMatchSentence(s.text, FAMILY)}"` : "Registration marked as signed up by a loved one." };
  }
  for (const s of input.segments) {
    if (s.speaker === "caller" && FAMILY.test(s.text)) {
      return { family: true, reason: `Caller at ${fmtTime(s.start)}: "${firstMatchSentence(s.text, FAMILY)}"` };
    }
  }
  return { family: false, reason: null };
}
const FAMILY =
  /\b(sign(ing)? up|register(ing)?|calling (for|about)|enroll(ing)?)\b[^.]{0,30}\bmy (mother|mom|father|dad|grand\w+|aunt|uncle|husband|wife|parents?)\b|\bon (her|his|their) behalf\b/i;
function firstMatchSentence(text: string, re: RegExp): string {
  return sentences(text).find((s) => re.test(s)) ?? text;
}

export function checkFee(segments: Segment[], plan: Plan): RuleResult {
  const cands: { seg: Segment; sent: string; amount: ReturnType<typeof parseAmounts>[number]; freq: "month" | "year" }[] = [];
  for (const seg of segments) {
    if (seg.speaker !== "operator") continue;
    for (const sent of sentences(seg.text)) {
      const freq = frequencyOf(sent);
      const amounts = parseAmounts(sent);
      if (freq && amounts.length) cands.push({ seg, sent, amount: amounts[0], freq });
    }
  }
  if (!cands.length) return missing("No fee with a billing frequency was said.");
  const planStr = `${fmtMoney(plan.price_cents)} per ${plan.frequency}`;
  const bad = cands.find((c) => c.amount.approximate || c.amount.cents !== plan.price_cents || c.freq !== plan.frequency);
  if (bad) {
    const said = `${bad.amount.approximate ? "about " : ""}${fmtMoney(bad.amount.cents)} per ${bad.freq}`;
    const why = bad.amount.approximate ? " An approximate fee is not the fee." : "";
    return {
      status: "mismatch", quote: bad.sent, segment_ids: [bad.seg.id], start: bad.seg.start,
      detail: `Said: ${said}. Plan record: ${planStr}.${why}`,
    };
  }
  const c = cands[0];
  return { status: "present", quote: c.sent, segment_ids: [c.seg.id], start: c.seg.start, detail: `Matches plan record: ${planStr}.` };
}

const PHONE = /(?:\b1[\s.-]?)?\(?\b855\)?[\s.-]?464[\s.-]?6872\b/;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export function checkContact(segments: Segment[], checklist: Checklist): RuleResult {
  const phone = findOperator(segments, [PHONE]);
  const email = findOperator(segments, [EMAIL]);
  const expectedEmail = checklist.contact.email.toLowerCase();
  const emailSaid = email ? (email.sentence.match(EMAIL)?.[0] ?? "").replace(/[.,]$/, "").toLowerCase() : null;
  if (phone && email) {
    if (emailSaid !== expectedEmail) {
      return { ...hit(email), status: "mismatch", detail: `Email said was ${emailSaid}; expected ${expectedEmail}.` };
    }
    const same = phone.segment.id === email.segment.id;
    return {
      status: "present",
      quote: same ? phone.sentence : `${phone.sentence} ... ${email.sentence}`,
      segment_ids: same ? [phone.segment.id] : [phone.segment.id, email.segment.id],
      start: Math.min(phone.segment.start, email.segment.start),
      detail: `Toll-free number ${checklist.contact.toll_free} and email both said.`,
    };
  }
  if (email && !phone) {
    return { ...hit(email), status: "missing", detail: `Email said at ${fmtTime(email.segment.start)}. Toll-free number ${checklist.contact.toll_free} never said.` };
  }
  if (phone && !email) {
    return { ...hit(phone), status: "missing", detail: `Toll-free number said at ${fmtTime(phone.segment.start)}. Email address never said.` };
  }
  return missing("Neither the toll-free number nor the email was said.");
}

export function checkArbitration(segments: Segment[]): RuleResult {
  const both = findOperator(segments, [/\barbitration\b/i, /\bclass[- ]action\b/i], true);
  if (both) return hit(both);
  const arb = findOperator(segments, [/\barbitration\b/i]);
  if (arb) return { ...hit(arb), status: "missing", detail: "Arbitration said; class action waiver never said." };
  const ca = findOperator(segments, [/\bclass[- ]action\b/i]);
  if (ca) return { ...hit(ca), status: "missing", detail: "Class action waiver said; arbitration agreement never said." };
  return missing();
}

export function runRules(input: CallInput, checklist: Checklist, plan: Plan): Map<string, RuleResult> {
  const out = new Map<string, RuleResult>();
  for (const item of checklist.items) {
    if (item.id === "P2") out.set(item.id, checkFee(input.segments, plan));
    else if (item.id === "P5") out.set(item.id, checkContact(input.segments, checklist));
    else if (item.id === "P6") out.set(item.id, checkArbitration(input.segments));
    else {
      const pats = PATTERNS[item.id];
      const h = pats ? findOperator(input.segments, pats, pats.length > 1) : null;
      out.set(item.id, h ? hit(h) : missing());
    }
  }
  return out;
}
