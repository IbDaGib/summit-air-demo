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
  resolvedAt: string | null = null,
): FollowupItem => ({
  callId,
  startedAt,
  caller: `Caller ${callId}`,
  town: "Bozeman",
  priority,
  reason: null,
  summary: null,
  resolvedAt,
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

/**
 * With ?resolved=1 the fetch includes rows a person already closed. metrics.ts
 * orders those last; the sorter must keep them there — a resolved P0 is not
 * work, and must never sit above an open P3.
 */
describe("sortFollowups with resolved rows", () => {
  const DONE = "2026-09-03T12:00:00.000Z";
  const MIXED: FollowupItem[] = [
    item("r0", "P0", "2026-09-03T08:00:00.000Z", DONE), // resolved, hottest tier, newest
    item("o3", "P3", "2026-09-01T08:00:00.000Z"), // open, coolest tier, oldest
    item("r2", "P2", "2026-09-02T08:00:00.000Z", DONE),
    item("o1", "P1", "2026-09-02T09:00:00.000Z"),
    item("rn", null, "2026-09-03T09:00:00.000Z", DONE), // resolved and untiered
    item("on", null, "2026-09-02T10:00:00.000Z"), // open and untiered
  ];

  it("puts every open row above every resolved row, whatever the priority", () => {
    const out = sortFollowups(MIXED);
    const firstResolved = out.findIndex((i) => i.resolvedAt !== null);
    const lastOpen = out.map((i) => i.resolvedAt === null).lastIndexOf(true);
    expect(firstResolved).toBeGreaterThan(lastOpen);
  });

  it("orders the open rows by tier, then newest, with untiered last", () => {
    const out = sortFollowups(MIXED).filter((i) => i.resolvedAt === null);
    expect(out.map((i) => i.callId)).toEqual(["o1", "o3", "on"]);
  });

  it("orders the resolved rows the same way among themselves", () => {
    const out = sortFollowups(MIXED).filter((i) => i.resolvedAt !== null);
    expect(out.map((i) => i.callId)).toEqual(["r0", "r2", "rn"]);
  });

  it("does not let a resolved P0 outrank an open P3", () => {
    const out = sortFollowups([
      item("done-p0", "P0", "2026-09-03T08:00:00.000Z", DONE),
      item("open-p3", "P3", "2026-09-01T08:00:00.000Z"),
    ]);
    expect(out.map((i) => i.callId)).toEqual(["open-p3", "done-p0"]);
  });
});
