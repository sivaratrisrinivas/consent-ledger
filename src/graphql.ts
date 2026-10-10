import type { ConsentLedger } from "./service.js";

export const schema = /* GraphQL */ `
  type ChecklistItem { id: ID!, group: String!, clause: String!, label: String!, termsText: String!, requiresAck: Boolean! }
  type LedgerItem {
    itemId: ID!, label: String!, clause: String!, status: String!, quote: String, at: String,
    ack: String!, ackQuote: String, source: String!, detail: String
  }
  type Ledger { familySignup: Boolean!, familyReason: String, detector: String!, blocking: [String!]!, items: [LedgerItem!]! }
  type Override { id: ID!, supervisorId: String!, reason: String!, blocking: [String!]!, createdAt: String! }
  type Registration { id: ID!, status: String!, memberName: String!, amount: String!, overrides: [Override!]! }
  type Call { id: ID!, title: String, memberName: String!, planCode: String!, ledger: Ledger!, registration: Registration }
  type CallSummary { id: ID!, title: String, registrationId: ID!, registrationStatus: String!, blocking: [String!]! }
  type FirstChargeResult { httpStatus: Int!, result: String!, message: String, missing: [String!]!, chargeId: String }
  type Query {
    checklist: [ChecklistItem!]!
    calls: [CallSummary!]!
    call(id: ID!): Call
  }
  type Mutation {
    attemptFirstCharge(registrationId: ID!): FirstChargeResult!
    override(registrationId: ID!, supervisorId: String!, reason: String!): Registration!
  }
`;

const mm = (s: number | null) => (s === null ? null : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`);

export function resolvers(svc: ConsentLedger, checkKey: (key: unknown) => void) {
  const reg = async (id: string) => {
    const r = await svc.getRegistration(id);
    return { id: r.id, status: r.status, memberName: r.member_name, amount: `$${(r.amount_cents / 100).toFixed(2)}`,
      overrides: r.overrides.map((o) => ({ id: o.id, supervisorId: o.supervisor_id, reason: o.reason, blocking: o.blocking, createdAt: o.created_at })) };
  };
  return {
    Query: {
      checklist: () => svc.checklist.items.map((i) => ({ id: i.id, group: i.group, clause: i.clause, label: i.label, termsText: i.terms_text, requiresAck: i.requires_ack })),
      calls: async () => (await svc.listCalls()).map((c) => ({ id: c.id, title: c.title, registrationId: c.registration_id, registrationStatus: c.registration_status, blocking: c.blocking })),
      call: async (_: unknown, { id }: { id: string }) => {
        const c = await svc.getCall(id);
        return {
          id: c.id, title: c.title, memberName: c.member_name, planCode: c.plan.code,
          ledger: { familySignup: c.ledger.family_signup, familyReason: c.ledger.family_reason, detector: c.ledger.detector, blocking: c.ledger.blocking,
            items: c.ledger.items.map((i) => ({ itemId: i.item_id, label: i.label, clause: i.clause, status: i.status, quote: i.quote, at: mm(i.start), ack: i.ack, ackQuote: i.ack_quote, source: i.source, detail: i.detail })) },
          registration: c.registration ? await reg(c.registration.id) : null,
        };
      },
    },
    Mutation: {
      attemptFirstCharge: async (_: unknown, { registrationId }: { registrationId: string }, ctx: any) => {
        checkKey(ctx.reply.request.headers["x-api-key"]);
        const r = await svc.attemptFirstCharge(registrationId, "graphql");
        return { httpStatus: r.http, result: r.body.result ?? r.body.error, message: r.body.message ?? null, missing: (r.body.missing ?? []).map((m: any) => m.id), chargeId: r.body.charge_id ?? null };
      },
      override: async (_: unknown, a: { registrationId: string; supervisorId: string; reason: string }, ctx: any) => {
        checkKey(ctx.reply.request.headers["x-api-key"]);
        await svc.override(a.registrationId, a.supervisorId, a.reason);
        return reg(a.registrationId);
      },
    },
  };
}
