import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadChecklist, loadPlans } from "../src/checklist.js";

export const checklist = loadChecklist();
export const plans = loadPlans();
export const fixture = (n: number) => JSON.parse(readFileSync(join(ROOT, "fixtures", "calls", `call_${n}.json`), "utf8"));
export const planFor = (c: any) => plans.find((p) => p.code === c.plan_code)!;
