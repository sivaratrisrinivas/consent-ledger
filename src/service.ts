import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db, Row } from "./db/db.js";
import type { CallInput, Checklist, Ledger, LedgerItem, Plan } from "./types.js";
import { buildLedger, type DetectorMode } from "./detect/ledger.js";
import { fmtMoney, fmtTime, ROOT } from "./checklist.js";
import { charge } from "./payments.js";

export class HttpError extends Error {
  constructor(public status: number, message: string, public body?: Record<string, unknown>) { super(message); }
}

const now = () => new Date().toISOString().replace("T", " ").replace("Z", "");
const newId = (p: string) => `${p}_${randomBytes(5).toString("hex")}`;
let seqCounter = 0;
const nextSeq = () => Date.now() * 1000 + (seqCounter++ % 1000);

export interface FirstChargeOutcome {
  http: 200 | 409;
  body: Record<string, any>;
}

export class ConsentLedger {
  constructor(private db: Db, public checklist: Checklist, public plans: Plan[], public mode: DetectorMode) {}

  async init() {
    for (const p of this.plans) {
      const found = await this.db.query("SELECT code FROM plans WHERE code = ?", [p.code]);
      if (!found.length) await this.db.exec("INSERT INTO plans (code, name, price_cents, frequency, synthetic) VALUES (?, ?, ?, ?, 1)", [p.code, p.name, p.price_cents, p.frequency]);
    }
  }

  plan(code: string): Plan {
    const p = this.plans.find((x) => x.code === code);
    if (!p) throw new HttpError(400, `unknown plan_code: ${code}`);
    return p;
  }

  private async audit(q: Db, regId: string | null, callId: string | null, actor: string, action: string, detail: unknown) {
    await q.exec("INSERT INTO audit_log (seq, registration_id, call_id, actor, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [nextSeq(), regId, callId, actor, action, JSON.stringify(detail), now()]);
  }

  validate(input: any): CallInput {
    if (!input || typeof input !== "object") throw new HttpError(400, "body must be a JSON object");
    if (typeof input.plan_code !== "string") throw new HttpError(400, "plan_code is required");
    if (typeof input.member_name !== "string" || !input.member_name.trim()) throw new HttpError(400, "member_name is required");
    if (!Array.isArray(input.segments) || input.segments.length === 0 || input.segments.length > 2000) throw new HttpError(400, "segments must be a non-empty array");
    input.segments.forEach((s: any, i: number) => {
      if (!["operator", "caller"].includes(s?.speaker)) throw new HttpError(400, `segments[${i}].speaker must be operator or caller`);
      if (typeof s.text !== "string" || typeof s.start !== "number") throw new HttpError(400, `segments[${i}] needs text and start`);
      s.id = typeof s.id === "number" ? s.id : i + 1;
      s.end = typeof s.end === "number" ? s.end : s.start;
    });
    this.plan(input.plan_code);
    return input as CallInput;
  }

  async ingest(raw: any, ids: { callId?: string; regId?: string } = {}, actor = "api") {
    const input = this.validate(raw);
    const callId = ids.callId ?? newId("call");
    const regId = ids.regId ?? newId("reg");
    const plan = this.plan(input.plan_code);
    const ledger = await buildLedger(callId, input, this.checklist, plan, this.mode);
    await this.db.tx(async (q) => {
      const t = now();
      await q.exec("INSERT INTO calls (id, title, plan_code, member_name, caller_role, family_signup, family_reason, detector, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [callId, input.title ?? null, input.plan_code, input.member_name, input.caller_role ?? "self", ledger.family_signup ? 1 : 0, ledger.family_reason, ledger.detector, t]);
      for (const s of input.segments) {
        await q.exec("INSERT INTO segments (call_id, seg_id, speaker, start_s, end_s, text) VALUES (?, ?, ?, ?, ?, ?)", [callId, s.id, s.speaker, s.start, s.end, s.text]);
      }
      for (const i of ledger.items) {
        await q.exec("INSERT INTO ledger_items (call_id, item_id, label, clause, status, quote, segment_ids, start_s, ack, ack_quote, ack_start_s, source, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [callId, i.item_id, i.label, i.clause, i.status, i.quote, JSON.stringify(i.segment_ids), i.start, i.ack, i.ack_quote, i.ack_start, i.source, i.detail]);
      }
      await q.exec("INSERT INTO registrations (id, call_id, plan_code, member_name, status, amount_cents, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)",
        [regId, callId, input.plan_code, input.member_name, plan.price_cents, t, t]);
      await this.audit(q, regId, callId, actor, "call_ingested", { detector: ledger.detector, family_signup: ledger.family_signup, blocking: ledger.blocking });
    });
    return { call_id: callId, registration_id: regId, ledger };
  }

  async getLedger(callId: string, q: Db = this.db): Promise<Ledger> {
    const calls = await q.query("SELECT * FROM calls WHERE id = ?", [callId]);
    if (!calls.length) throw new HttpError(404, "call not found");
    const rows = await q.query("SELECT * FROM ledger_items WHERE call_id = ?", [callId]);
    const order = this.checklist.items.map((i) => i.id);
    const items: LedgerItem[] = rows
      .map((r) => ({
        item_id: r.item_id, label: r.label, clause: r.clause, status: r.status, quote: r.quote,
        segment_ids: JSON.parse(r.segment_ids), start: r.start_s === null ? null : Number(r.start_s), ack: r.ack,
        ack_quote: r.ack_quote, ack_start: r.ack_start_s === null ? null : Number(r.ack_start_s), source: r.source, detail: r.detail,
      }))
      .sort((a, b) => order.indexOf(a.item_id) - order.indexOf(b.item_id));
    const c = calls[0];
    return { call_id: callId, family_signup: !!Number(c.family_signup), family_reason: c.family_reason, detector: c.detector, items, blocking: items.filter((i) => i.status !== "present").map((i) => i.item_id) };
  }

  async getCall(callId: string) {
    const calls = await this.db.query("SELECT * FROM calls WHERE id = ?", [callId]);
    if (!calls.length) throw new HttpError(404, "call not found");
    const segs = await this.db.query("SELECT seg_id, speaker, start_s, end_s, text FROM segments WHERE call_id = ? ORDER BY seg_id", [callId]);
    const regs = await this.db.query("SELECT * FROM registrations WHERE call_id = ?", [callId]);
    const c = calls[0];
    return {
      id: c.id, title: c.title, plan: this.plan(c.plan_code), member_name: c.member_name, caller_role: c.caller_role, created_at: c.created_at,
      segments: segs.map((s) => ({ id: Number(s.seg_id), speaker: s.speaker, start: Number(s.start_s), end: Number(s.end_s), text: s.text })),
      ledger: await this.getLedger(callId),
      registration: regs[0] ? await this.getRegistration(regs[0].id) : null,
    };
  }

  async listCalls() {
    const rows = await this.db.query("SELECT c.id, c.title, c.member_name, c.plan_code, c.family_signup, r.id AS registration_id, r.status FROM calls c JOIN registrations r ON r.call_id = c.id ORDER BY c.id");
    const out = [];
    for (const r of rows) {
      const l = await this.getLedger(r.id);
      out.push({ id: r.id, title: r.title, member_name: r.member_name, plan_code: r.plan_code, family_signup: !!Number(r.family_signup), registration_id: r.registration_id, registration_status: r.status, blocking: l.blocking });
    }
    return out;
  }

  async getRegistration(regId: string) {
    const rows = await this.db.query("SELECT * FROM registrations WHERE id = ?", [regId]);
    if (!rows.length) throw new HttpError(404, "registration not found");
    const r = rows[0];
    const ch = await this.db.query("SELECT * FROM charges WHERE registration_id = ?", [regId]);
    const ov = await this.db.query("SELECT * FROM overrides WHERE registration_id = ? ORDER BY created_at", [regId]);
    return {
      id: r.id, call_id: r.call_id, plan_code: r.plan_code, member_name: r.member_name, status: r.status, amount_cents: Number(r.amount_cents),
      charge: ch[0] ? { id: ch[0].id, amount_cents: Number(ch[0].amount_cents), processor: ch[0].processor, override_id: ch[0].override_id, created_at: ch[0].created_at } : null,
      overrides: ov.map((o) => ({ id: o.id, supervisor_id: o.supervisor_id, reason: o.reason, blocking: JSON.parse(o.blocking), created_at: o.created_at })),
    };
  }

  /** The gate. 200 and a (mock) charge when every required item is present or a supervisor overrode; 409 otherwise. */
  async attemptFirstCharge(regId: string, actor = "billing"): Promise<FirstChargeOutcome> {
    return this.db.tx(async (q) => {
      const rows = await q.query("SELECT * FROM registrations WHERE id = ? FOR UPDATE", [regId]);
      if (!rows.length) throw new HttpError(404, "registration not found");
      const reg = rows[0];
      const existing = await q.query("SELECT * FROM charges WHERE registration_id = ?", [regId]);
      if (existing.length) {
        return { http: 200 as const, body: { result: "already_charged", registration_id: regId, charge_id: existing[0].id, amount: fmtMoney(Number(existing[0].amount_cents)) } };
      }
      const ledger = await this.getLedger(reg.call_id, q);
      const overrides = await q.query("SELECT * FROM overrides WHERE registration_id = ? ORDER BY created_at DESC", [regId]);
      const blocking = ledger.items.filter((i) => i.status !== "present");
      if (blocking.length && !overrides.length) {
        const missing = blocking.map((i) => ({ id: i.item_id, label: i.label, clause: i.clause, status: i.status, detail: i.detail, quote: i.quote, at: i.start === null ? null : fmtTime(i.start) }));
        await q.exec("UPDATE registrations SET status = 'held', updated_at = ? WHERE id = ?", [now(), regId]);
        await this.audit(q, regId, reg.call_id, actor, "first_charge_held", { missing: missing.map((m) => m.id) });
        return { http: 409 as const, body: { error: "first_charge_held", registration_id: regId, message: `First charge held: ${missing.length} required item(s) not confirmed on the call.`, missing } };
      }
      const amount = Number(reg.amount_cents);
      const ch = await charge(regId, amount);
      const overrideId = blocking.length ? overrides[0].id : null;
      await q.exec("INSERT INTO charges (id, registration_id, amount_cents, processor, override_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", [ch.id, regId, amount, ch.processor, overrideId, now()]);
      await q.exec("UPDATE registrations SET status = ?, updated_at = ? WHERE id = ?", [overrideId ? "charged_override" : "charged", now(), regId]);
      await this.audit(q, regId, reg.call_id, actor, "first_charge_made", { charge_id: ch.id, amount: fmtMoney(amount), processor: "mock", override_id: overrideId });
      return { http: 200 as const, body: { result: "charged", registration_id: regId, charge_id: ch.id, amount: fmtMoney(amount), processor: "mock (no real card charged)", via_override: overrideId } };
    });
  }

  async override(regId: string, supervisorId: unknown, reason: unknown) {
    if (typeof supervisorId !== "string" || !/^[A-Za-z0-9._-]{2,80}$/.test(supervisorId)) throw new HttpError(400, "supervisor_id is required (2-80 letters, digits, . _ -)");
    if (typeof reason !== "string" || reason.trim().length < 10) throw new HttpError(400, "reason is required (at least 10 characters)");
    return this.db.tx(async (q) => {
      const rows = await q.query("SELECT * FROM registrations WHERE id = ? FOR UPDATE", [regId]);
      if (!rows.length) throw new HttpError(404, "registration not found");
      const reg = rows[0];
      if (String(reg.status).startsWith("charged")) throw new HttpError(409, "registration already charged; nothing to override");
      const ledger = await this.getLedger(reg.call_id, q);
      if (!ledger.blocking.length) throw new HttpError(409, "nothing is blocking this registration; no override needed");
      const id = newId("ovr");
      await q.exec("INSERT INTO overrides (id, registration_id, supervisor_id, reason, blocking, created_at) VALUES (?, ?, ?, ?, ?, ?)", [id, regId, supervisorId, reason.trim(), JSON.stringify(ledger.blocking), now()]);
      await this.audit(q, regId, reg.call_id, supervisorId, "override_granted", { override_id: id, reason: reason.trim(), overrides_items: ledger.blocking });
      return { override_id: id, registration_id: regId, supervisor_id: supervisorId, overrides_items: ledger.blocking };
    });
  }

  async auditLog(regId: string) {
    const rows = await this.db.query("SELECT seq, actor, action, detail, created_at FROM audit_log WHERE registration_id = ? ORDER BY seq", [regId]);
    return rows.map((r: Row) => ({ seq: Number(r.seq), at: r.created_at, actor: r.actor, action: r.action, detail: JSON.parse(r.detail) }));
  }

  async evidencePack(callId: string): Promise<string> {
    const call = await this.getCall(callId);
    const reg = call.registration!;
    const audit = await this.auditLog(reg.id);
    const l = call.ledger;
    const mark: Record<string, string> = { present: "[x]", missing: "[ ] MISSING", unclear: "[?] UNCLEAR", mismatch: "[!] MISMATCH" };
    const lines: string[] = [];
    lines.push(`# Evidence pack: ${call.title ?? call.id}`, "");
    lines.push(`- Call: ${call.id} (synthetic)`, `- Member: ${call.member_name}`, `- Plan record: ${call.plan.name}, ${fmtMoney(call.plan.price_cents)} per ${call.plan.frequency}`);
    lines.push(`- Family signup (Section 4.2(h) items required): ${l.family_signup ? `yes. ${l.family_reason}` : "no"}`);
    lines.push(`- Registration ${reg.id}: ${reg.status}${reg.charge ? `, charge ${reg.charge.id} (mock)` : ""}`);
    lines.push(`- Checklist: GoGoGrandparent Terms of Service, effective ${this.checklist.source.effective} (${this.checklist.source.url})`);
    lines.push(`- Detector: ${l.detector}`, "");
    lines.push("## Required items", "");
    for (const i of l.items) {
      lines.push(`### ${mark[i.status]} ${i.item_id}. ${i.label}`);
      lines.push(`Clause: ${i.clause}`);
      if (i.quote) lines.push(`> [${fmtTime(i.start)}] OPERATOR: "${i.quote}"`);
      if (i.ack_quote) lines.push(`> [${fmtTime(i.ack_start)}] CALLER: "${i.ack_quote}" (acknowledgment: ${i.ack})`);
      if (i.detail) lines.push(`Note: ${i.detail}`);
      lines.push(`Found by: ${i.source}`, "");
    }
    if (reg.overrides.length) {
      lines.push("## Supervisor overrides", "");
      for (const o of reg.overrides) lines.push(`- ${o.created_at} UTC, ${o.supervisor_id}: "${o.reason}" (items: ${o.blocking.join(", ")})`);
      lines.push("");
    }
    lines.push("## Audit log", "");
    for (const a of audit) lines.push(`- ${a.at} UTC  ${a.actor}  ${a.action}  ${JSON.stringify(a.detail)}`);
    lines.push("", "Synthetic call. Checklist built from public Terms text. Not legal advice.");
    return lines.join("\n") + "\n";
  }

  /** Wipe and load the six synthetic demo calls with fixed ids (call_1..6, reg_1..6). */
  async resetDemo() {
    await this.db.tx(async (q) => {
      for (const t of ["audit_log", "charges", "overrides", "registrations", "ledger_items", "segments", "calls"]) await q.exec(`DELETE FROM ${t}`);
    });
    const dir = join(ROOT, "fixtures", "calls");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
      const c = JSON.parse(readFileSync(join(dir, f), "utf8"));
      await this.ingest(c, { callId: c.id, regId: c.id.replace("call_", "reg_") }, "demo-seed");
    }
  }
}
