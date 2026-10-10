// Calls the free-tier model once per demo call and saves the reply to fixtures/model-cache/.
// The demo and tests read these files, so they work with no key. Run with GROQ_API_KEY set in your shell: npm run gen-cache
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadChecklist, ROOT } from "../src/checklist.js";
import { detectFamily } from "../src/detect/rules.js";
import { callModel, MODEL_ITEMS, readCache, transcriptHash, writeCache } from "../src/detect/model.js";

const checklist = loadChecklist();
const dir = join(ROOT, "fixtures", "calls");
for (const f of readdirSync(dir).sort()) {
  const call = JSON.parse(readFileSync(join(dir, f), "utf8"));
  const fam = detectFamily(call).family;
  const ids = checklist.items.filter((i) => i.group === "phone" || fam).map((i) => i.id).filter((id) => id in MODEL_ITEMS);
  const hash = transcriptHash(call.segments, ids);
  if (readCache(hash) && !process.argv.includes("--force")) { console.log(call.id, hash, "cached"); continue; }
  let r;
  for (let attempt = 1; ; attempt++) {
    try { r = await callModel(call.segments, ids); break; }
    catch (e) {
      // Free tier has a small tokens-per-minute budget. Wait and retry.
      if (attempt >= 4) throw e;
      console.log(call.id, String(e), "waiting 60s");
      await new Promise((res) => setTimeout(res, 60000));
    }
  }
  writeCache(hash, { ...r, call: call.id });
  console.log(call.id, hash, r.provider, r.findings.map((x) => `${x.id}:${x.status}`).join(" "));
}
