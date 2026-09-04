import { describe, expect, it } from "vitest";
import { isHazardous, scanForHazard } from "./safetyScan";

describe("scanForHazard", () => {
  describe("gas", () => {
    it.each([
      "I think I smell gas in the basement",
      "there's a gas smell near the furnace",
      "it smells like rotten eggs down there",
      "smells kind of like propane",
      "I think the gas line is leaking",
      "there is a leaking propane tank out back",
      "probably nothing, but there's a bit of a gas smell",
    ])("fires on %j", (utterance) => {
      expect(scanForHazard(utterance)).toBe("gas_smell");
    });
  });

  describe("carbon monoxide", () => {
    it.each([
      "the carbon monoxide alarm keeps going off",
      "our CO detector went off twice last night",
      "could this be carbon monoxide?",
    ])("fires on %j", (utterance) => {
      expect(scanForHazard(utterance)).toBe("co_alarm");
    });
  });

  describe("smoke and burning", () => {
    it.each([
      "there's smoke coming out of the vents",
      "it smells like something is burning",
      "there's a burning smell whenever it kicks on",
      "the unit was sparking when I reset it",
      "I saw flames inside the furnace",
      "the smoke alarm is going off",
    ])("fires on %j", (utterance) => {
      expect(scanForHazard(utterance)).toBe("smoke_or_burning");
    });
  });

  describe("negation and benign context — the cases that make it usable", () => {
    it.each([
      "there's no gas smell, it just stopped working",
      "no, I don't smell gas",
      "I can't smell gas or anything like that",
      "it isn't a gas smell, more of a musty smell",
      "the smoke detector needs batteries",
      "our smoke alarm is chirping, needs a new battery",
      "the carbon monoxide detector expired and needs replacing",
      "no smoke, no smell, it just blows cold air",
      "the furnace won't fire up at all",
      "it doesn't fire when the thermostat calls for heat",
      "just want the annual tune-up before winter",
      "the gas bill has been really high this month",
      "it's a gas furnace, about twelve years old",
      "we're on propane out here",
    ])("stays silent on %j", (utterance) => {
      expect(scanForHazard(utterance)).toBe("none");
    });
  });

  describe("the four sentences from the round-2 brief", () => {
    it.each([
      ["No heat, and there's a gas smell in the basement", "gas_smell"],
      ["The furnace won't fire, but I smell gas", "gas_smell"],
      ["no cooling upstairs and I smell burning", "smoke_or_burning"],
      ["there is no gas smell", "none"],
    ])("%j -> %s", (utterance, expected) => {
      expect(scanForHazard(utterance)).toBe(expected);
    });
  });

  describe("hedging is not denial (Greptile, PR #2)", () => {
    it.each([
      "I have no idea why it smells like gas",
      "I don't know why it smells like gas",
      "no clue what it is but there's a burning smell",
      "I can't tell if that's a gas smell or not",
    ])("escalates on %j", (utterance) => {
      expect(scanForHazard(utterance)).not.toBe("none");
    });

    it("still treats a real denial as a denial", () => {
      // "no sign of" and "can't smell" negate the hazard itself, unlike "no
      // idea why" — blanking these would evacuate a caller who just told us
      // nothing is wrong.
      expect(scanForHazard("there's no sign of a gas leak")).toBe("none");
      expect(scanForHazard("I can't smell any gas")).toBe("none");
      expect(scanForHazard("no smell of gas at all")).toBe("none");
    });
  });

  it("does not read the complaint 'no heat' as a denial of the hazard that follows", () => {
    // The regression that matters: "no" is in almost every one of these calls.
    expect(scanForHazard("No heat, and there's a gas smell in the basement")).toBe("gas_smell");
    expect(scanForHazard("we have no heat and I smell something burning")).toBe("smoke_or_burning");
    expect(scanForHazard("no cooling at all, and the CO alarm went off")).toBe("co_alarm");
  });

  it("still stays silent when the complaint really is the whole story", () => {
    expect(scanForHazard("no heat, no hot water, nothing at all since last night")).toBe("none");
  });

  it("does not let a negated clause suppress a hazard in the next one", () => {
    expect(scanForHazard("there's no gas smell, but the furnace is smoking")).toBe(
      "smoke_or_burning",
    );
  });

  it("checks every mention in a clause, not just the first", () => {
    expect(scanForHazard("there was no smoke earlier, now there is smoke")).toBe("smoke_or_burning");
    expect(scanForHazard("I didn't smell gas at first but I smell gas now")).toBe("gas_smell");
  });

  it("still escalates when a benign detector mention shares the sentence with a real hazard", () => {
    expect(scanForHazard("the smoke detector needs batteries and I smell gas")).toBe("gas_smell");
  });

  it("reports the most acute hazard when several are described", () => {
    expect(scanForHazard("there's smoke and I smell gas and the CO alarm is going off")).toBe(
      "gas_smell",
    );
  });

  it("is case and whitespace insensitive", () => {
    expect(scanForHazard("  I  SMELL   GAS  ")).toBe("gas_smell");
  });

  it("handles empty input", () => {
    expect(scanForHazard("")).toBe("none");
    expect(scanForHazard("   ")).toBe("none");
  });

  it("is deterministic", () => {
    const u = "there's a burning smell";
    expect(scanForHazard(u)).toBe(scanForHazard(u));
  });

  it("exposes a boolean convenience", () => {
    expect(isHazardous("I smell gas")).toBe(true);
    expect(isHazardous("just a tune-up")).toBe(false);
  });
});
