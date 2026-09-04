import { describe, expect, it } from "vitest";
import { enteredAt, newerThan } from "./since";

const row = (startedAt: string, endedAt: string | null, id = startedAt) => ({ id, startedAt, endedAt });

describe("newerThan", () => {
  // The bug this exists to prevent: a call that started 2 minutes before the
  // cursor but ended (and was inserted) after it must be a "new" call.
  it("uses the end time, so a call inserted after the cursor is new even if it started before it", () => {
    const cursor = "2026-09-04T18:00:00.000Z";
    const call = row("2026-09-04T17:58:10.000Z", "2026-09-04T18:00:05.000Z");
    expect(newerThan([call], cursor)).toEqual([call]);
  });

  it("excludes a call that ended exactly at the cursor (strictly after)", () => {
    const cursor = "2026-09-04T18:00:00.000Z";
    expect(newerThan([row("2026-09-04T17:50:00.000Z", cursor)], cursor)).toEqual([]);
  });

  it("falls back to the start time when a row has no end time", () => {
    const cursor = "2026-09-04T18:00:00.000Z";
    const before = row("2026-09-04T17:59:59.000Z", null, "before");
    const after = row("2026-09-04T18:00:01.000Z", null, "after");
    expect(newerThan([before, after], cursor).map((r) => r.id)).toEqual(["after"]);
  });

  it("returns everything for a missing or unparseable since", () => {
    const rows = [row("2026-09-04T17:00:00.000Z", null), row("2026-09-04T18:00:00.000Z", null)];
    expect(newerThan(rows, null)).toEqual(rows);
    expect(newerThan(rows, "garbage")).toEqual(rows);
    expect(newerThan(rows, "")).toEqual(rows);
  });

  it("enteredAt prefers endedAt", () => {
    expect(enteredAt(row("2026-09-04T17:00:00.000Z", "2026-09-04T17:03:00.000Z"))).toBe(
      Date.parse("2026-09-04T17:03:00.000Z"),
    );
  });
});
