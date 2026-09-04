import { describe, expect, it } from "vitest";
import type { CallSummary } from "../_data/types";
import {
  CURSOR_LAG_MS,
  POLL_MS,
  SLOW_POLL_MS,
  nextCursor,
  nextDelay,
  pickNew,
  toastDescription,
  toastKind,
  toastTitle,
} from "./call-toaster.logic";

const call = (over: Partial<CallSummary> = {}): CallSummary => ({
  id: "c1",
  startedAt: "2026-09-04T15:00:00.000Z",
  endedAt: "2026-09-04T15:04:00.000Z",
  fromNumber: "+14065550100",
  callerName: "Dana Whitmore",
  town: "Bozeman",
  county: "Gallatin",
  priority: "P2",
  outcome: "booked",
  summary: "Furnace short-cycling; booked Thursday AM.",
  ...over,
});

describe("nextCursor", () => {
  it("is anchored on the server's fetchedAt, not the browser clock", () => {
    const fetchedAt = "2026-09-04T15:30:00.000Z";
    const cursor = nextCursor(fetchedAt);
    expect(Date.parse(cursor)).toBe(Date.parse(fetchedAt) - CURSOR_LAG_MS);
  });

  it("lags the server instant so a row written after its started_at is still seen", () => {
    // A call that started at 15:00 and lasted four minutes is inserted at 15:04.
    // A cursor at 15:03 (a poll during the call) must still cover 15:00.
    const cursor = nextCursor("2026-09-04T15:03:00.000Z");
    expect(Date.parse(cursor)).toBeLessThan(Date.parse("2026-09-04T15:00:00.000Z"));
  });

  it("returns a normalised ISO string", () => {
    const cursor = nextCursor("2026-09-04T15:30:00+02:00");
    expect(cursor).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("falls back to the local clock when fetchedAt is unparseable", () => {
    const before = Date.now();
    const cursor = nextCursor("garbage", before);
    expect(Date.parse(cursor)).toBe(before - CURSOR_LAG_MS);
  });
});

describe("pickNew", () => {
  it("returns only calls whose id has not been seen, oldest first", () => {
    const seen = new Set(["a"]);
    const out = pickNew(
      [
        call({ id: "c", startedAt: "2026-09-04T15:02:00.000Z" }),
        call({ id: "a", startedAt: "2026-09-04T15:00:00.000Z" }),
        call({ id: "b", startedAt: "2026-09-04T15:01:00.000Z" }),
      ],
      seen,
    );
    expect(out.map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("does not mutate the seen set", () => {
    const seen = new Set<string>();
    pickNew([call({ id: "x" })], seen);
    expect(seen.size).toBe(0);
  });

  it("dedupes within one batch", () => {
    const out = pickNew([call({ id: "x" }), call({ id: "x" })], new Set());
    expect(out).toHaveLength(1);
  });

  it("is empty for an empty feed", () => {
    expect(pickNew([], new Set(["a"]))).toEqual([]);
  });
});

describe("toastKind", () => {
  it("is an escalation for P0", () => {
    expect(toastKind(call({ priority: "P0", outcome: "booked" }))).toBe("escalation");
  });

  it("is an escalation when the outcome is escalated, whatever the tier", () => {
    expect(toastKind(call({ priority: "P2", outcome: "escalated" }))).toBe("escalation");
    expect(toastKind(call({ priority: null, outcome: "escalated" }))).toBe("escalation");
  });

  it("is an ordinary call otherwise, including untiered calls", () => {
    expect(toastKind(call({ priority: "P1", outcome: "booked" }))).toBe("call");
    expect(toastKind(call({ priority: "P3", outcome: "callback" }))).toBe("call");
    expect(toastKind(call({ priority: null, outcome: "in_progress" }))).toBe("call");
    expect(toastKind(call({ priority: null, outcome: "no_outcome" }))).toBe("call");
  });
});

describe("toastTitle", () => {
  it("leads with the caller's name and the priority chip text", () => {
    expect(toastTitle(call())).toBe("Dana Whitmore · P2");
  });

  it("falls back to the town when the caller is unknown", () => {
    expect(toastTitle(call({ callerName: null, town: "Livingston" }))).toBe("Livingston · P2");
  });

  it("falls back to the number, then a neutral label, when both are missing", () => {
    expect(toastTitle(call({ callerName: null, town: null }))).toBe("+14065550100 · P2");
    expect(toastTitle(call({ callerName: null, town: null, fromNumber: null }))).toBe(
      "Unknown caller · P2",
    );
  });

  it("shows an em dash for an untiered call, like the chip does", () => {
    expect(toastTitle(call({ priority: null }))).toBe("Dana Whitmore · —");
  });
});

describe("toastDescription", () => {
  it("is the summary when there is one", () => {
    expect(toastDescription(call())).toBe("Furnace short-cycling; booked Thursday AM.");
  });

  it('is "Summary pending" for a null or blank summary', () => {
    expect(toastDescription(call({ summary: null }))).toBe("Summary pending");
    expect(toastDescription(call({ summary: "   " }))).toBe("Summary pending");
  });
});

describe("nextDelay", () => {
  it("polls every 5s while healthy", () => {
    expect(nextDelay(0)).toBe(POLL_MS);
    expect(nextDelay(1)).toBe(POLL_MS);
    expect(nextDelay(2)).toBe(POLL_MS);
  });

  it("backs off to 30s after three consecutive failures", () => {
    expect(nextDelay(3)).toBe(SLOW_POLL_MS);
    expect(nextDelay(10)).toBe(SLOW_POLL_MS);
  });

  it("recovers as soon as the failure count resets", () => {
    expect(nextDelay(0)).toBe(POLL_MS);
  });
});
