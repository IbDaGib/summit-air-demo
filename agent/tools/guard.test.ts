import { describe, expect, it } from "vitest";
import { safetyBackstop } from "./guard";

describe("safetyBackstop", () => {
  it("fires when the model declares a hazard", () => {
    expect(safetyBackstop("assess_situation", { hazard: "gas_smell" })?.hazard).toBe("gas_smell");
  });

  it("fires on a hazard buried in free text while the model claims none", () => {
    const r = safetyBackstop("assess_situation", {
      hazard: "none",
      issue: "no_heat",
      occupantDetail: "it's probably nothing but there is a bit of a gas smell in the basement",
    });
    expect(r?.hazard).toBe("gas_smell");
  });

  it("catches a CO alarm", () => {
    expect(
      safetyBackstop("find_slots", { town: "Bozeman", notes: "the CO alarm keeps going off" })
        ?.hazard,
    ).toBe("co_alarm");
  });

  it("does not fire on negated mentions", () => {
    expect(
      safetyBackstop("assess_situation", { hazard: "none", occupantDetail: "there is no gas smell" }),
    ).toBeNull();
  });

  it("does not fire on a routine call", () => {
    expect(
      safetyBackstop("assess_situation", {
        hazard: "none",
        issue: "maintenance",
        occupantDetail: "annual tune-up before winter",
      }),
    ).toBeNull();
  });

  it("never re-forces on escalate_emergency itself", () => {
    expect(safetyBackstop("escalate_emergency", { hazard: "gas_smell" })).toBeNull();
  });
});
