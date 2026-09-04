import { describe, expect, it } from "vitest";
import { duration, pct, usd } from "./_format";

// The six values the tiles show today, pinned so a change to a formatter is a
// deliberate one and not a side effect of the TODO(swap) to ../_ui/format.
describe("_format renders the on-screen tile values", () => {
  it("usd keeps cents below $100 — the per-call regime", () => {
    expect(usd(0.1036)).toBe("$0.10");
    expect(usd(1.0356)).toBe("$1.04");
    expect(usd(0.1625)).toBe("$0.16");
  });

  it("pct is a whole number from 10 up", () => {
    expect(pct(100)).toBe("100%");
    expect(pct(50)).toBe("50%");
  });

  it("duration splits minutes and seconds", () => {
    expect(duration(80)).toBe("1m 20s");
  });
});
