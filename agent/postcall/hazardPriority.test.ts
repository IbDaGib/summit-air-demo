import { describe, expect, it } from "vitest";
import { computePriority } from "../policy/priority";
import type { Hazard } from "../policy/types";

/**
 * A hazard call never reaches assess_situation, so the events webhook derives
 * the tier from the hazard the escalation tool was given. These pin the values
 * that derivation depends on — the gas leak of 2026-09-04 was stored untiered.
 */
const derive = (hazard: Hazard) =>
  computePriority(
    {
      propertyType: "residential",
      issue: "other",
      systemDown: false,
      hazard,
      vulnerableOccupant: false,
    },
    new Date("2026-09-04T18:19:50Z"),
  );

describe("hazard-derived priority", () => {
  for (const h of ["gas_smell", "co_alarm", "smoke_or_burning"] as const) {
    it(`${h} is P0 and blocks booking`, () => {
      const r = derive(h);
      expect(r.tier).toBe("P0");
      expect(r.blockBooking).toBe(true);
      expect(r.reason).toMatch(/life-safety/i);
    });
  }
  it("is not P0 when there is no hazard", () => {
    expect(derive("none").tier).not.toBe("P0");
  });
});
