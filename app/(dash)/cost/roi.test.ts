import { describe, expect, it } from "vitest";
import { computeRoi, DEFAULT_ROI_INPUTS, type RoiInputs } from "./roi";

/** The measured seed the page uses tonight: $0.10 a call, every call after hours. */
const MEASURED: RoiInputs = {
  ...DEFAULT_ROI_INPUTS,
  agentCostPerCallUsd: 0.1,
  afterHoursShare: 1,
};

describe("computeRoi with the default assumptions", () => {
  const out = computeRoi(MEASURED);

  it("recovers a quarter of calls at the default miss rate", () => {
    expect(out.missedCallsPerMonth).toBe(600 * 0.25);
  });

  it("books just over half of the recovered calls", () => {
    expect(out.recoveredBookingsPerMonth).toBeCloseTo(150 * 0.55, 10);
  });

  it("values recovered bookings at the average ticket", () => {
    expect(out.recoveredServiceRevenueUsd).toBeCloseTo(82.5 * 425, 6);
  });

  it("adds install leads on top of service tickets", () => {
    expect(out.recoveredInstallRevenueUsd).toBeCloseTo(82.5 * 0.05 * 9500, 6);
  });

  it("charges the agent for every call, not only the recovered ones", () => {
    expect(out.agentMonthlyCostUsd).toBeCloseTo(600 * 0.1, 10);
  });

  it("nets out positive", () => {
    expect(out.netMonthlyUsd).toBeGreaterThan(0);
    expect(out.netMonthlyUsd).toBeCloseTo(
      out.recoveredServiceRevenueUsd + out.recoveredInstallRevenueUsd - out.agentMonthlyCostUsd,
      6,
    );
  });

  it("paybackCalls is how many calls one recovered ticket funds: ceil(ticket / cost per call)", () => {
    expect(out.paybackCalls).toBe(Math.ceil(425 / 0.1));
    expect(out.paybackCalls).toBe(4250);
  });
});

describe("computeRoi edge cases", () => {
  it("recovers nothing when no calls are missed", () => {
    const out = computeRoi({ ...MEASURED, missedCallRate: 0 });
    expect(out.missedCallsPerMonth).toBe(0);
    expect(out.recoveredBookingsPerMonth).toBe(0);
    expect(out.recoveredServiceRevenueUsd).toBe(0);
    expect(out.recoveredInstallRevenueUsd).toBe(0);
    // The agent still answers every call, so its cost does not vanish.
    expect(out.agentMonthlyCostUsd).toBeCloseTo(60, 10);
    expect(out.netMonthlyUsd).toBeCloseTo(-60, 10);
  });

  it("doubles the agent bill when call volume doubles", () => {
    const base = computeRoi(MEASURED);
    const doubled = computeRoi({ ...MEASURED, callsPerMonth: MEASURED.callsPerMonth * 2 });
    expect(doubled.agentMonthlyCostUsd).toBeCloseTo(base.agentMonthlyCostUsd * 2, 10);
    expect(doubled.missedCallsPerMonth).toBeCloseTo(base.missedCallsPerMonth * 2, 10);
  });

  it("rounds payback up to a whole call", () => {
    // 425 / 0.15 = 2833.33…, which is 2834 calls once the last one is counted.
    expect(computeRoi({ ...MEASURED, agentCostPerCallUsd: 0.15 }).paybackCalls).toBe(2834);
  });

  it("reports zero payback calls, not Infinity, when the agent is free", () => {
    const out = computeRoi({ ...MEASURED, agentCostPerCallUsd: 0 });
    expect(out.paybackCalls).toBe(0);
    expect(Number.isFinite(out.paybackCalls)).toBe(true);
    expect(out.agentMonthlyCostUsd).toBe(0);
  });

  it("goes negative when a tiny ticket cannot cover the agent", () => {
    const out = computeRoi({
      ...MEASURED,
      missedCallRate: 0.01,
      bookingRateOnAnswered: 0.1,
      avgTicketUsd: 1,
      installLeadRate: 0,
    });
    expect(out.netMonthlyUsd).toBeLessThan(0);
  });
});

describe("DEFAULT_ROI_INPUTS", () => {
  it("carries the case-study shop, not the measured seeds", () => {
    expect(DEFAULT_ROI_INPUTS).toEqual({
      callsPerMonth: 600,
      missedCallRate: 0.25,
      bookingRateOnAnswered: 0.55,
      avgTicketUsd: 425,
      installLeadRate: 0.05,
      avgInstallUsd: 9500,
    });
    expect(DEFAULT_ROI_INPUTS).not.toHaveProperty("agentCostPerCallUsd");
    expect(DEFAULT_ROI_INPUTS).not.toHaveProperty("afterHoursShare");
  });
});
