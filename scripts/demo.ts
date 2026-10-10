// npm run demo: loads the six synthetic calls, prints each ledger, tries the first charge, then shows one supervisor override.
// Works with no API key and no database server (embedded fallback), unless DATABASE_URL points at MySQL.
import { buildApp } from "../src/app.js";
import { fmtTime } from "../src/checklist.js";

const { svc, db } = await buildApp({ seed: true });
const icon: Record<string, string> = { present: "OK      ", missing: "MISSING ", unclear: "UNCLEAR ", mismatch: "MISMATCH" };
console.log(`Consent Ledger demo  (db: ${db.kind}, detector: ${svc.mode})\n`);
for (const c of await svc.listCalls()) {
  const call = await svc.getCall(c.id);
  console.log(`== ${c.id}  ${c.title}${call.ledger.family_signup ? "  [family signup]" : ""}`);
  for (const i of call.ledger.items) {
    const q = i.quote ? `"${i.quote.length > 70 ? i.quote.slice(0, 67) + "..." : i.quote}"` : "";
    console.log(`   ${icon[i.status]} ${i.item_id} [${fmtTime(i.start)}] ${i.label}  ${q}`);
    if (i.status !== "present" && i.detail) console.log(`            ${i.detail}`);
  }
  const r = await svc.attemptFirstCharge(c.registration_id, "demo");
  console.log(`   first-charge -> ${r.http} ${r.http === 200 ? r.body.amount + " charged (mock)" : "held: " + r.body.missing.map((m: any) => m.id).join(", ")}\n`);
}
const ov = await svc.override("reg_4", "sup.jordan", "Called member back at 2:10 pm; read the toll-free number; she confirmed.");
console.log(`override on reg_4 by ${ov.supervisor_id} -> items ${ov.overrides_items.join(", ")}`);
const again = await svc.attemptFirstCharge("reg_4", "demo");
console.log(`first-charge reg_4 -> ${again.http} ${again.body.result} (via override ${again.body.via_override})`);
console.log("\nAudit log for reg_4:");
for (const a of await svc.auditLog("reg_4")) console.log(`   ${a.actor.padEnd(10)} ${a.action.padEnd(18)} ${JSON.stringify(a.detail)}`);
await db.close();
