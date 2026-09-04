import { describe, expect, it } from "vitest";
import { formatPhone, present, relativeTime } from "./_format";

// 7:00 AM MDT on Thursday 3 September 2026 — the moment dispatch opens the page.
const NOW = new Date("2026-09-03T13:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("relativeTime", () => {
  it("counts minutes and hours inside a day", () => {
    expect(relativeTime(ago(30_000), NOW)).toBe("just now");
    expect(relativeTime(ago(3 * 60_000), NOW)).toBe("3m ago");
    expect(relativeTime(ago(59 * 60_000), NOW)).toBe("59m ago");
    expect(relativeTime(ago(2 * 3_600_000), NOW)).toBe("2h ago");
    expect(relativeTime(ago(23 * 3_600_000), NOW)).toBe("23h ago");
  });

  it("says yesterday once the call is a day old and on yesterday's Denver sheet", () => {
    // 6:00 AM MDT Wednesday — 25 hours before NOW.
    expect(relativeTime("2026-09-02T12:00:00Z", NOW)).toBe("yesterday");
  });

  it("uses the Denver calendar, not the UTC one, to decide what yesterday is", () => {
    // 11:30 PM MDT Wednesday 2 Sep. In UTC it is already Thursday 3 Sep.
    const lateWednesday = new Date("2026-09-03T05:30:00Z");
    // 12:30 AM MDT Tuesday 1 Sep — 47 hours earlier. Yesterday in Denver;
    // two days back by UTC dates.
    expect(relativeTime("2026-09-01T06:30:00Z", lateWednesday)).toBe("yesterday");
  });

  it("falls back to a weekday and date", () => {
    expect(relativeTime("2026-09-01T12:00:00Z", NOW)).toBe("Tue 1 Sep");
    expect(relativeTime("2026-08-15T12:00:00Z", NOW)).toBe("Sat 15 Aug");
  });

  it("renders the Denver day, not the UTC day, in the fallback", () => {
    // 11:00 PM MDT Monday 31 Aug is 05:00 UTC Tuesday 1 Sep.
    expect(relativeTime("2026-09-01T05:00:00Z", NOW)).toBe("Mon 31 Aug");
  });

  it("does not go negative when the clock is ahead of the row", () => {
    expect(relativeTime(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe("just now");
  });
});

describe("formatPhone", () => {
  it("formats E.164 US numbers for dialling", () => {
    expect(formatPhone("+14065550118")).toBe("(406) 555-0118");
    expect(formatPhone("4065550118")).toBe("(406) 555-0118");
  });

  it("leaves anything else alone rather than guessing", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhone("")).toBe("");
    // Whitespace is not a number either. It comes back untouched, which is
    // why callers check `present` before they build a tel: link from it.
    expect(formatPhone("   ")).toBe("   ");
  });
});

describe("present", () => {
  it("passes real text through, trimmed", () => {
    expect(present("Bozeman")).toBe("Bozeman");
    expect(present(" Bozeman ")).toBe("Bozeman");
  });

  it("treats null, empty and whitespace-only as absent", () => {
    expect(present(null)).toBeNull();
    expect(present(undefined)).toBeNull();
    expect(present("")).toBeNull();
    expect(present("   ")).toBeNull();
  });
});
