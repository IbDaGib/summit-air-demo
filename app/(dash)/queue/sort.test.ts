import { describe, expect, it } from "vitest";
import type { FollowupItem } from "../_data/metrics";
import { sortFollowups } from "./sort";

/**
 * A shuffled morning queue. Priorities are deliberately out of order and the
 * two P0s are given start times in the wrong order, so the test can tell the
 * difference between "grouped by priority" and "sorted by priority, newest
 * first within a tier".
 */
const item = (
  callId: string,
  priority: string | null,
  startedAt: string,
): FollowupItem => ({
  callId,
  startedAt,
  caller: `Caller ${callId}`,
  town: "Bozeman",
  priority,
  reason: null,
  summary: null,
});

const FIXTURE: FollowupItem[] = [
  item("a", "P2", "2026-09-02T14:00:00.000Z"),
  item("b", "P0", "2026-09-01T09:00:00.000Z"), // older P0
  item("c", null, "2026-09-03T01:00:00.000Z"), // newest of all, but untiered
  item("d", "P1", "2026-09-02T20:00:00.000Z"),
  item("e", "P3", "2026-09-02T22:00:00.000Z"),
  item("f", "P0", "2026-09-02T23:30:00.000Z"), // newer P0
];

describe("sortFollowups", () => {
  it("orders P0 first, then P1, P2, P3, with untiered last", () => {
    const out = sortFollowups(FIXTURE);
    expect(out.map((i) => i.priority)).toEqual(["P0", "P0", "P1", "P2", "P3", null]);
  });

  it("puts the newest call first within a tier", () => {
    const out = sortFollowups(FIXTURE);
    const p0s = out.filter((i) => i.priority === "P0").map((i) => i.callId);
    expect(p0s).toEqual(["f", "b"]);
  });

  it("does not let a newer untiered call jump the queue", () => {
    const out = sortFollowups(FIXTURE);
    expect(out.at(-1)?.callId).toBe("c");
  });

  it("treats an unrecognised tier like untiered, after every known tier", () => {
    const out = sortFollowups([
      item("x", "P9", "2026-09-03T00:00:00.000Z"),
      item("y", "P3", "2026-09-01T00:00:00.000Z"),
      item("z", null, "2026-09-02T00:00:00.000Z"),
    ]);
    expect(out.map((i) => i.callId)).toEqual(["y", "x", "z"]);
  });

  it("returns a new array and leaves the input untouched", () => {
    const input = [...FIXTURE];
    const out = sortFollowups(input);
    expect(out).not.toBe(input);
    expect(input.map((i) => i.callId)).toEqual(FIXTURE.map((i) => i.callId));
  });

  it("handles an empty queue", () => {
    expect(sortFollowups([])).toEqual([]);
  });
});
