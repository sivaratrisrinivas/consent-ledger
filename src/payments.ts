// Mock payment processor. No real card is ever charged.
import { randomBytes } from "node:crypto";

export interface ChargeResult {
  id: string;
  amount_cents: number;
  processor: "mock";
}

export async function charge(registrationId: string, amountCents: number): Promise<ChargeResult> {
  return { id: `ch_mock_${randomBytes(5).toString("hex")}`, amount_cents: amountCents, processor: "mock" };
}
