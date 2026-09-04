import { describe, expect, it } from "vitest";
import { safetyBackstop } from "./guard";

// Regression: "no heat" is the most common phrase on these calls. A naive
// negation window reads it as negating a hazard mentioned in the same sentence,
// which silences the backstop on exactly the call it exists for.
// Found by Workspace B in its own scanner; this proves main's guard has it too.
describe("negation window must not swallow complaint phrases", () => {
  it("escalates when 'No heat' precedes a real gas smell", () => {
    expect(
      safetyBackstop("assess_situation", {
        hazard: "none",
        issueSummary: "No heat, and there's a gas smell in the basement",
      })?.hazard,
    ).toBe("gas_smell");
  });

  it("escalates on 'no cooling' plus a burning smell", () => {
    expect(
      safetyBackstop("assess_situation", {
        hazard: "none",
        issueSummary: "no cooling upstairs and I smell burning",
      })?.hazard,
    ).toBe("smoke_or_burning");
  });

  it("still ignores a genuinely negated hazard", () => {
    expect(
      safetyBackstop("assess_situation", { hazard: "none", issueSummary: "there is no gas smell" }),
    ).toBeNull();
  });
});
