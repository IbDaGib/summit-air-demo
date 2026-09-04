import { describe, expect, it } from "vitest";
import { elapsedSeconds, traceClock } from "./fields";

describe("elapsedSeconds", () => {
  it("is the whole seconds between start and end", () => {
    expect(elapsedSeconds("2026-09-04T05:00:00Z", "2026-09-04T05:01:20Z")).toBe(80);
  });

  it("is null while the call is still connected", () => {
    expect(elapsedSeconds("2026-09-04T05:00:00Z", null)).toBeNull();
  });

  it("rounds to the nearest second", () => {
    expect(elapsedSeconds("2026-09-04T05:00:00.000Z", "2026-09-04T05:00:04.600Z")).toBe(5);
  });

  it("never goes negative when the clocks disagree", () => {
    expect(elapsedSeconds("2026-09-04T05:01:00Z", "2026-09-04T05:00:00Z")).toBe(0);
  });
});

describe("traceClock", () => {
  it("renders a real instant as a Denver clock with seconds", () => {
    // 05:41:07Z is 23:41:07 MDT the previous evening.
    expect(traceClock("2026-09-04T05:41:07Z")).toBe("11:41:07 PM");
  });

  it("is null for the empty string the trace mapper substitutes", () => {
    // _data/client.ts toTrace() writes startedAt: "" when the stored entry has
    // no timestamp, which is every real entry today. This used to throw.
    expect(traceClock("")).toBeNull();
  });

  it("is null for anything that is not a date", () => {
    expect(traceClock("t0")).toBeNull();
  });
});
