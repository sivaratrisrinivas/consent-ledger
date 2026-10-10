// Builds the ledger: rules first, then model findings (verified word for word), then the caller's acknowledgment.
import type { Ack, CallInput, Checklist, Ledger, LedgerItem, ModelFinding, Plan, Segment } from "../types.js";
import { runRules, detectFamily } from "./rules.js";
import { classifyAck, norm, replyAfter } from "./text.js";
import { callModel, liveProviderAvailable, MODEL_ITEMS, readCache, transcriptHash } from "./model.js";
import { fmtTime } from "../checklist.js";

export type DetectorMode = "rules" | "cached" | "live";

/** Find the segment that holds this quote word for word. Prefers the cited segments, then any operator segment. */
export function verifyQuote(quote: string | null, segments: Segment[], cited: number[]): Segment | null {
  if (!quote) return null;
  const q = norm(quote).replace(/^["']|["']$/g, "");
  if (q.length < 12) return null;
  const ordered = [...segments.filter((s) => cited.includes(s.id)), ...segments.filter((s) => !cited.includes(s.id))];
  return ordered.find((s) => s.speaker === "operator" && norm(s.text).includes(q)) ?? null;
}

export async function getModelFindings(input: CallInput, ids: string[], mode: DetectorMode): Promise<{ findings: ModelFinding[]; label: string }> {
  if (mode === "rules" || ids.length === 0) return { findings: [], label: "rules" };
  const hash = transcriptHash(input.segments, ids);
  if (mode === "live" && liveProviderAvailable()) {
    try {
      const r = await callModel(input.segments, ids);
      return { findings: r.findings, label: `rules+${r.provider}:${r.model}` };
    } catch {
      // fall through to cache, then rules
    }
  }
  const cached = readCache(hash);
  if (cached) return { findings: cached.findings, label: `rules+cached:${cached.provider}:${cached.model}` };
  return { findings: [], label: "rules" };
}

export function requiredItems(input: CallInput, checklist: Checklist) {
  const fam = detectFamily(input);
  return { fam, required: checklist.items.filter((i) => i.group === "phone" || fam.family) };
}

export async function buildLedger(callId: string, input: CallInput, checklist: Checklist, plan: Plan, mode: DetectorMode): Promise<Ledger> {
  const { required } = requiredItems(input, checklist);
  const modelIds = required.map((i) => i.id).filter((id) => id in MODEL_ITEMS);
  const { findings, label } = await getModelFindings(input, modelIds, mode);
  return mergeLedger(callId, input, checklist, plan, findings, label);
}

/** Pure merge step: rules, then model findings (only if their quote is found word for word), then acknowledgment. */
export function mergeLedger(callId: string, input: CallInput, checklist: Checklist, plan: Plan, findings: ModelFinding[], label: string): Ledger {
  const { fam, required } = requiredItems(input, checklist);
  const rules = runRules(input, checklist, plan);
  const byId = new Map(findings.map((f) => [f.id, f]));

  const items: LedgerItem[] = required.map((item) => {
    const r = rules.get(item.id)!;
    let li: LedgerItem = {
      item_id: item.id, label: item.label, clause: item.clause, status: r.status, quote: r.quote,
      segment_ids: r.segment_ids, start: r.start, ack: "n/a", ack_quote: null, ack_start: null,
      source: r.quote || r.status === "present" ? "rules" : "none", detail: r.detail,
    };
    // Model step only for items the rules did not find, and never for the fee or contact checks.
    if (r.status === "missing" && !item.check && byId.has(item.id)) {
      const m = byId.get(item.id)!;
      if (m.status === "present" || m.status === "unclear") {
        const seg = verifyQuote(m.quote, input.segments, m.segment_ids);
        if (seg) {
          li = { ...li, status: m.status, quote: m.quote, segment_ids: [seg.id], start: seg.start, source: "model",
                 detail: m.status === "present" ? "Found by the model step; quote verified word for word." : "Model step was unsure." };
        } else {
          li = { ...li, status: "unclear", source: "model", detail: "Model step said present, but its quote was not found word for word in the transcript, so it is not trusted." };
        }
      }
    }
    // Caller acknowledgment, from the caller's reply right after the quoted segment.
    if (item.requires_ack && li.segment_ids.length && (li.status === "present" || li.status === "mismatch")) {
      const lastSeg = Math.max(...li.segment_ids);
      const reply = replyAfter(input.segments, lastSeg);
      const text = reply.map((s) => s.text).join(" ");
      const ack: Ack = classifyAck(text || null);
      li.ack = ack;
      li.ack_quote = text || null;
      li.ack_start = reply[0]?.start ?? null;
      if (item.requires_ack && li.status === "present" && ack !== "explicit") {
        li.status = "unclear";
        li.detail = ack === "ambiguous"
          ? `Reply at ${fmtTime(li.ack_start)} was only "${text.replace(/[.!]+$/, "")}". This item needs a clear yes.`
          : "No reply from the caller after this item. This item needs a clear yes.";
      }
    }
    return li;
  });

  return {
    call_id: callId,
    family_signup: fam.family,
    family_reason: fam.reason,
    detector: label,
    items,
    blocking: items.filter((i) => i.status !== "present").map((i) => i.item_id),
  };
}
