import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import YAML from "yaml";
import type { Checklist, Plan } from "./types.js";

// Works from src/ (tsx) and dist/src/ (compiled).
const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = here.includes(`${"dist"}`) ? join(here, "..", "..") : join(here, "..");

export function loadChecklist(): Checklist {
  return YAML.parse(readFileSync(join(ROOT, "disclosures.yaml"), "utf8")) as Checklist;
}

export function loadPlans(): Plan[] {
  return JSON.parse(readFileSync(join(ROOT, "fixtures", "plans.json"), "utf8")).plans as Plan[];
}

export function fmtTime(sec: number | null): string {
  if (sec === null || sec === undefined) return "--:--";
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function fmtMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
