import { describe, expect, it } from "vitest";
import { stubHandlers } from "./stub";

describe("lookup_customer must not leak on a bogus phone", () => {
  for (const bad of ["unknown", "", "N/A", "123", "caller"]) {
    it(`returns null for ${JSON.stringify(bad)}`, async () => {
      expect(await stubHandlers.lookup_customer({ phone: bad })).toBeNull();
    });
  }
  it("still matches a real number", async () => {
    const c = await stubHandlers.lookup_customer({ phone: "+14065550118" });
    expect(c?.name).toBe("Dave Whitaker");
  });
});

describe("priority: underperforming system with a vulnerable occupant", () => {
  const base = {
    propertyType: "residential" as const,
    issue: "poor_performance" as const,
    systemDown: false,
    hazard: "none" as const,
    vulnerableOccupant: true,
    town: "Bozeman",
  };
  it("is not routine", async () => {
    const r = await stubHandlers.assess_situation(base);
    expect(r.tier).not.toBe("P3");
    expect(r.tier).toBe("P2");
  });
  it("is same-day when it is freezing", async () => {
    const r = await stubHandlers.assess_situation({ ...base, outdoorTempF: 12 });
    expect(r.tier).toBe("P1");
  });
});
