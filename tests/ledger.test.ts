// The six synthetic demo calls must produce the expected ledger. This checks code behavior, not model accuracy.
import { describe, expect, it } from "vitest";
import { buildLedger, mergeLedger } from "../src/detect/ledger.js";
import { checklist, fixture, planFor } from "./helpers.js";
import { fmtTime } from "../src/checklist.js";

const ledgerFor = (n: number, mode: "cached" | "rules" = "cached") => {
  const c = fixture(n);
  return buildLedger(c.id, c, checklist, planFor(c), mode);
};
const item = (l: any, id: string) => l.items.find((i: any) => i.item_id === id);

describe("six synthetic calls", () => {
  it("1. clean self-signup: all 7 phone items present, nothing blocks", async () => {
    const l = await ledgerFor(1);
    expect(l.family_signup).toBe(false);
    expect(l.items.map((i) => i.item_id)).toEqual(["P1", "P2", "P3", "P4", "P5", "P6", "A1"]);
    expect(l.blocking).toEqual([]);
    expect(item(l, "A1").ack).toBe("explicit");
  });

  it("2. daughter signs up her mother: family items required and present", async () => {
    const l = await ledgerFor(2);
    expect(l.family_signup).toBe(true);
    expect(l.family_reason).toMatch(/sign up my mother/);
    expect(l.items).toHaveLength(11);
    expect(l.blocking).toEqual([]);
    expect(item(l, "F2").ack_quote).toMatch(/power of attorney/);
  });

  it("3. fee said as 'about twenty a month' vs $34.00 plan: mismatch at 01:42", async () => {
    const l = await ledgerFor(3);
    expect(l.blocking).toEqual(["P2"]);
    const p2 = item(l, "P2");
    expect(p2.status).toBe("mismatch");
    expect(p2.quote).toBe("So the Value plan is about twenty a month, billed monthly.");
    expect(fmtTime(p2.start)).toBe("01:42");
    expect(p2.detail).toContain("Plan record: $34.00 per month");
  });

  it("4. toll-free number never said: contact item missing, email still quoted", async () => {
    const l = await ledgerFor(4);
    expect(l.blocking).toEqual(["P5"]);
    expect(item(l, "P5").status).toBe("missing");
    expect(item(l, "P5").detail).toMatch(/Toll-free number 1 \(855\) 464-6872 never said/);
  });

  it("5. only 'uh-huh' to auto-renewal: unclear, holds the charge", async () => {
    const l = await ledgerFor(5);
    expect(l.blocking).toEqual(["P3"]);
    expect(item(l, "P3").status).toBe("unclear");
    expect(item(l, "P3").ack).toBe("ambiguous");
    expect(item(l, "P3").ack_quote).toBe("Uh-huh.");
  });

  it("6. paraphrased renewal: passes via the model step with a verified quote", async () => {
    const l = await ledgerFor(6);
    expect(l.detector).toMatch(/cached/);
    expect(l.blocking).toEqual([]);
    expect(item(l, "P3").source).toBe("model");
    expect(fixture(6).segments.some((s: any) => s.text.includes(item(l, "P3").quote))).toBe(true);
  });

  it("6 in rules-only mode: the paraphrase is missed, which is why the model step exists", async () => {
    const l = await ledgerFor(6, "rules");
    expect(l.blocking).toEqual(["P3"]);
  });
});

describe("quote verification", () => {
  it("a model quote that is not word for word in the transcript becomes unclear", () => {
    const c = fixture(6);
    const fake = [{ id: "P3", status: "present" as const, quote: "Your plan renews automatically every year unless you cancel.", segment_ids: [7] }];
    const l = mergeLedger(c.id, c, checklist, planFor(c), fake, "test");
    expect(item(l, "P3").status).toBe("unclear");
    expect(item(l, "P3").detail).toMatch(/not found word for word/);
    expect(l.blocking).toEqual(["P3"]);
  });

  it("the model cannot overrule the deterministic fee check", () => {
    const c = fixture(3);
    const fake = [{ id: "P2", status: "present" as const, quote: "So the Value plan is about twenty a month, billed monthly.", segment_ids: [15] }];
    const l = mergeLedger(c.id, c, checklist, planFor(c), fake, "test");
    expect(item(l, "P2").status).toBe("mismatch");
  });
});
