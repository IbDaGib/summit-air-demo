import { describe, expect, it } from "vitest";
import { fromPercent, parseFieldValue, toPercent } from "./fields";

describe("parseFieldValue", () => {
  it("treats an emptied field as zero, not as 'keep the old value'", () => {
    expect(parseFieldValue("count", "")).toBe(0);
    expect(parseFieldValue("usd", "")).toBe(0);
    expect(parseFieldValue("percent", "")).toBe(0);
  });

  it("clamps negatives to zero", () => {
    expect(parseFieldValue("count", "-5")).toBe(0);
    expect(parseFieldValue("usd", "-5")).toBe(0);
    expect(parseFieldValue("percent", "-5")).toBe(0);
  });

  it("treats anything unparseable as zero", () => {
    expect(parseFieldValue("count", "abc")).toBe(0);
  });

  it("stores percents as a 0–1 rate, capped at 100%", () => {
    expect(parseFieldValue("percent", "150")).toBe(1);
    expect(parseFieldValue("percent", "7")).toBe(0.07);
    expect(parseFieldValue("percent", "100")).toBe(1);
  });

  it("stores counts and dollars as typed", () => {
    expect(parseFieldValue("count", "600")).toBe(600);
    expect(parseFieldValue("usd", "425")).toBe(425);
  });

  it("reads a trailing decimal point mid-typing as the whole number", () => {
    expect(parseFieldValue("count", "12.")).toBe(12);
  });
});

describe("toPercent", () => {
  it("scales a rate to a whole percent without float noise", () => {
    expect(toPercent(0.07)).toBe(7);
    expect(toPercent(0.25)).toBe(25);
    expect(toPercent(1)).toBe(100);
  });

  it("keeps one decimal without float noise", () => {
    const p = toPercent(0.0745);
    expect(p).toBe(7.5);
    expect(String(p)).toMatch(/^\d+(\.\d)?$/);
  });
});

describe("fromPercent", () => {
  it("scales a percent to a 0–1 rate", () => {
    expect(fromPercent(7)).toBe(0.07);
    expect(fromPercent(25)).toBe(0.25);
  });

  it("clamps to 0–100 before scaling", () => {
    expect(fromPercent(150)).toBe(1);
    expect(fromPercent(-5)).toBe(0);
  });

  it("round-trips with toPercent", () => {
    for (const rate of [0, 0.05, 0.07, 0.25, 0.55, 1]) {
      expect(fromPercent(toPercent(rate))).toBe(rate);
    }
  });
});
