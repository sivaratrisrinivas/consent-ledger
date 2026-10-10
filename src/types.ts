export type Speaker = "operator" | "caller";

export interface Segment {
  id: number;
  speaker: Speaker;
  start: number; // seconds from call start
  end: number;
  text: string;
}

export interface CallInput {
  id?: string;
  title?: string;
  plan_code: string;
  member_name: string;
  caller_role?: "self" | "loved_one";
  segments: Segment[];
}

export interface ChecklistItem {
  id: string;
  key: string;
  group: "phone" | "family";
  clause: string;
  terms_text: string;
  label: string;
  requires_ack: boolean;
  check?: "plan_match" | "contact_match";
}

export interface Checklist {
  version: string;
  source: { url: string; effective: string; checked: string };
  contact: { toll_free: string; email: string };
  items: ChecklistItem[];
}

export interface Plan {
  code: string;
  name: string;
  price_cents: number;
  frequency: "month" | "year";
}

export type ItemStatus = "present" | "missing" | "unclear" | "mismatch";
export type Ack = "explicit" | "ambiguous" | "none" | "n/a";

export interface LedgerItem {
  item_id: string;
  label: string;
  clause: string;
  status: ItemStatus;
  quote: string | null;
  segment_ids: number[];
  start: number | null; // seconds
  ack: Ack;
  ack_quote: string | null;
  ack_start: number | null;
  source: "rules" | "model" | "none";
  detail: string | null;
}

export interface Ledger {
  call_id: string;
  family_signup: boolean;
  family_reason: string | null;
  detector: string;
  items: LedgerItem[];
  blocking: string[]; // item ids that hold the first charge
}

/** What a model (or its cached reply) says about one item. */
export interface ModelFinding {
  id: string;
  status: "present" | "missing" | "unclear";
  quote: string | null;
  segment_ids: number[];
}
