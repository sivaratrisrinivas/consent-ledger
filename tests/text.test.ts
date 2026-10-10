import { describe, expect, it } from "vitest";
import { classifyAck, parseAmounts, frequencyOf } from "../src/detect/text.js";

describe("text helpers", () => {
  it("parses dollar amounts and number words, and flags 'about'", () => {
    expect(parseAmounts("The Value plan is $34.00 per month.")).toMatchObject([{ cents: 3400, approximate: false }]);
    expect(parseAmounts("It is about twenty a month.")).toMatchObject([{ cents: 2000, approximate: true }]);
    expect(parseAmounts("That's four hundred and eighty a year.")).toMatchObject([{ cents: 48000 }]);
    expect(frequencyOf("billed once a year")).toBe("year");
  });

  it("treats uh-huh and yeah as ambiguous, a real yes as explicit", () => {
    for (const s of ["Uh-huh.", "Mm-hmm.", "Yeah.", "Okay."]) expect(classifyAck(s)).toBe("ambiguous");
    for (const s of ["Yes, I authorize that.", "Understood.", "Yes, $34 a month is fine."]) expect(classifyAck(s)).toBe("explicit");
    for (const s of ["Wait, how much?", "No, I don't want that.", ""]) expect(classifyAck(s)).toBe("none");
  });
});
