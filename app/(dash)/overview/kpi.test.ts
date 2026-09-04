import { describe, expect, it } from "vitest";
import { bookingRate, escalationRate } from "./kpi";

describe("kpi derivations", () => {
  it("booking rate is booked / calls with an outcome, not / total", () => {
    expect(bookingRate({ total: 10, booked: 1, escalated: 0, callback: 1, unresolved: 8 })).toBeCloseTo(0.5);
  });
  it("is 0 with no resolved calls rather than NaN", () => {
    expect(bookingRate({ total: 3, booked: 0, escalated: 0, callback: 0, unresolved: 3 })).toBe(0);
  });
  it("escalation rate counts escalated over total", () => {
    expect(escalationRate({ total: 4, booked: 1, escalated: 1, callback: 1, unresolved: 1 })).toBeCloseTo(0.25);
  });
});
