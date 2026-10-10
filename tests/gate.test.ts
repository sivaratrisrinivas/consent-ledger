// Gate, override and audit logic through the real HTTP and GraphQL routes (embedded DB, no network).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { openSqlite, migrate } from "../src/db/db.js";

let ctx: Awaited<ReturnType<typeof buildApp>>;
const H = { "x-api-key": "test-key" };

beforeAll(async () => {
  const db = await openSqlite(":memory:");
  await migrate(db);
  ctx = await buildApp({ db, apiKey: "test-key", mode: "cached" });
});
afterAll(async () => { await ctx.app.close(); await ctx.db.close(); });

const post = (url: string, payload?: unknown, headers = H) => ctx.app.inject({ method: "POST", url, payload: payload as any, headers });

describe("first-charge gate", () => {
  it("rejects writes without the API key", async () => {
    expect((await post("/registrations/reg_1/first-charge", undefined, {} as any)).statusCode).toBe(401);
  });

  it("charges a clean call (200) and is idempotent", async () => {
    const a = await post("/registrations/reg_1/first-charge");
    expect(a.statusCode).toBe(200);
    expect(a.json()).toMatchObject({ result: "charged", amount: "$34.00" });
    const b = await post("/registrations/reg_1/first-charge");
    expect(b.json()).toMatchObject({ result: "already_charged", charge_id: a.json().charge_id });
  });

  it("holds call 3 with 409 and returns the quote and timestamp", async () => {
    const r = await post("/registrations/reg_3/first-charge");
    expect(r.statusCode).toBe(409);
    expect(r.json().missing).toEqual([expect.objectContaining({ id: "P2", status: "mismatch", at: "01:42", quote: "So the Value plan is about twenty a month, billed monthly." })]);
  });

  it("override needs a supervisor id and a real reason", async () => {
    expect((await post("/registrations/reg_4/override", { reason: "called back and confirmed" })).statusCode).toBe(400);
    expect((await post("/registrations/reg_4/override", { supervisor_id: "sup.jordan", reason: "ok" })).statusCode).toBe(400);
    expect((await post("/registrations/reg_1/override", { supervisor_id: "sup.jordan", reason: "already charged registration" })).statusCode).toBe(409);
  });

  it("held, then overridden, then charged, with every step in the audit log", async () => {
    expect((await post("/registrations/reg_4/first-charge")).statusCode).toBe(409);
    const ov = await post("/registrations/reg_4/override", { supervisor_id: "sup.jordan", reason: "Called back, read the toll-free number, member confirmed." });
    expect(ov.statusCode).toBe(201);
    const ch = await post("/registrations/reg_4/first-charge");
    expect(ch.statusCode).toBe(200);
    expect(ch.json().via_override).toBe(ov.json().override_id);
    const audit = (await ctx.app.inject({ url: "/registrations/reg_4/audit" })).json().entries.map((e: any) => `${e.actor}:${e.action}`);
    expect(audit).toEqual(["demo-seed:call_ingested", "billing:first_charge_held", "sup.jordan:override_granted", "billing:first_charge_made"]);
  });

  it("evidence pack has the timestamped quotes and the override", async () => {
    const r = await ctx.app.inject({ url: "/calls/call_4/evidence-pack" });
    expect(r.headers["content-type"]).toMatch(/markdown/);
    expect(r.body).toContain("[ ] MISSING P5.");
    expect(r.body).toContain('[00:28] OPERATOR: "The Basic plan is $14.00 per month, billed monthly."');
    expect(r.body).toContain("sup.jordan");
  });

  it("POST /calls ingests a new transcript and validates input", async () => {
    expect((await post("/calls", { plan_code: "nope", member_name: "X", segments: [] })).statusCode).toBe(400);
    const c = await (await import("./helpers.js")).fixture(5);
    const r = await post("/calls", { ...c, id: undefined });
    expect(r.statusCode).toBe(201);
    expect(r.json().ledger.blocking).toEqual(["P3"]);
  });

  it("GraphQL: query a ledger and attempt a charge", async () => {
    const q = await post("/graphql", { query: '{ call(id: "call_5") { ledger { blocking items { itemId status at ack } } } }' });
    expect(q.json().data.call.ledger.blocking).toEqual(["P3"]);
    const m = await post("/graphql", { query: 'mutation { attemptFirstCharge(registrationId: "reg_5") { httpStatus missing } }' });
    expect(m.json().data.attemptFirstCharge).toEqual({ httpStatus: 409, missing: ["P3"] });
  });
});

describe("errors", () => {
  it("client errors keep their status (e.g. 415), not 500", async () => {
    const r = await ctx.app.inject({ method: "POST", url: "/demo/reset", payload: "x=1", headers: { ...H, "content-type": "application/x-www-form-urlencoded" } });
    expect(r.statusCode).toBe(415);
  });
});
