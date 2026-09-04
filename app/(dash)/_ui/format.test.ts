import { describe, expect, it } from "vitest";
import { count, duration, pct, usd, usdPerUnit } from "./format";

describe("usd", () => {
  it("shows cents below a dollar", () => {
    expect(usd(0.1036)).toBe("$0.10");
  });

  it("keeps two decimals below $100", () => {
    expect(usd(1.04)).toBe("$1.04");
    expect(usd(99.5)).toBe("$99.50");
  });

  it("drops cents and groups thousands at or above $100", () => {
    expect(usd(100)).toBe("$100");
    expect(usd(1040)).toBe("$1,040");
    expect(usd(1040.49)).toBe("$1,040");
  });

  it("compacts thousands to one decimal", () => {
    expect(usd(1040, { compact: true })).toBe("$1.0k");
    expect(usd(12_500, { compact: true })).toBe("$12.5k");
  });

  it("compacts millions to one decimal", () => {
    expect(usd(1_250_000, { compact: true })).toBe("$1.3M");
  });

  it("does not compact below a thousand", () => {
    expect(usd(425, { compact: true })).toBe("$425");
    expect(usd(1.04, { compact: true })).toBe("$1.04");
  });

  it("renders zero as zero dollars", () => {
    expect(usd(0)).toBe("$0.00");
    expect(usd(0, { compact: true })).toBe("$0.00");
  });

  it("carries a sign on negative amounts", () => {
    expect(usd(-1.04)).toBe("-$1.04");
    expect(usd(-1040)).toBe("-$1,040");
    expect(usd(-1040, { compact: true })).toBe("-$1.0k");
  });

  it("renders null, undefined and non-finite as an em dash", () => {
    expect(usd(null)).toBe("—");
    expect(usd(undefined)).toBe("—");
    expect(usd(Number.NaN)).toBe("—");
    expect(usd(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("usdPerUnit", () => {
  it("shows three decimals below a dollar", () => {
    expect(usdPerUnit(0.0781, "min")).toBe("$0.078 / min");
    expect(usdPerUnit(0.1036, "call")).toBe("$0.104 / call");
  });

  it("falls back to usd at or above a dollar", () => {
    expect(usdPerUnit(1.04, "call")).toBe("$1.04 / call");
    expect(usdPerUnit(1040, "month")).toBe("$1,040 / month");
  });

  it("renders zero with three decimals", () => {
    expect(usdPerUnit(0, "min")).toBe("$0.000 / min");
  });

  it("renders null and undefined as an em dash without a unit", () => {
    expect(usdPerUnit(null, "min")).toBe("—");
    expect(usdPerUnit(undefined, "min")).toBe("—");
  });
});

describe("count", () => {
  it("groups thousands and leaves small tallies alone", () => {
    expect(count(4250)).toBe("4,250");
    expect(count(600)).toBe("600");
    expect(count(0)).toBe("0");
  });

  it("rounds a fractional figure to a whole number", () => {
    expect(count(82.5)).toBe("83");
    expect(count(82.4)).toBe("82");
  });

  it("renders null, undefined and non-finite as an em dash", () => {
    expect(count(null)).toBe("—");
    expect(count(undefined)).toBe("—");
    expect(count(Number.NaN)).toBe("—");
  });
});

describe("pct", () => {
  it("shows whole percents at or above ten", () => {
    expect(pct(100)).toBe("100%");
    expect(pct(45.6)).toBe("46%");
    expect(pct(10)).toBe("10%");
  });

  it("shows one decimal below ten", () => {
    expect(pct(7.5)).toBe("7.5%");
    expect(pct(0.4)).toBe("0.4%");
  });

  it("drops a trailing .0 below ten", () => {
    expect(pct(7)).toBe("7%");
    expect(pct(0)).toBe("0%");
  });

  it("renders null and undefined as an em dash", () => {
    expect(pct(null)).toBe("—");
    expect(pct(undefined)).toBe("—");
  });
});

describe("duration", () => {
  it("shows seconds only under a minute", () => {
    expect(duration(45)).toBe("45s");
  });

  it("shows minutes and seconds under an hour", () => {
    expect(duration(80)).toBe("1m 20s");
    expect(duration(125)).toBe("2m 5s");
  });

  it("shows hours and minutes at or above an hour", () => {
    expect(duration(3600)).toBe("1h 0m");
    expect(duration(3660)).toBe("1h 1m");
    expect(duration(7325)).toBe("2h 2m");
  });

  it("rounds fractional seconds", () => {
    expect(duration(79.6)).toBe("1m 20s");
    expect(duration(44.4)).toBe("44s");
  });

  it("renders zero as 0s", () => {
    expect(duration(0)).toBe("0s");
  });

  it("renders null and undefined as an em dash", () => {
    expect(duration(null)).toBe("—");
    expect(duration(undefined)).toBe("—");
  });
});
