import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  hasDbConfig: vi.fn(() => true),
  query: vi.fn(),
}));

vi.mock("../../../db/neon", () => db);

import { listCallsSince, ticketFields } from "./client";

beforeEach(() => {
  db.query.mockReset();
});

describe("listCallsSince", () => {
  it("queries the complete time window without a row cap", async () => {
    db.query.mockResolvedValueOnce([]);

    await listCallsSince("2026-09-04T15:00:00.000Z");

    expect(db.query).toHaveBeenCalledOnce();
    expect(db.query.mock.calls[0]?.[0]).toContain("where c.started_at > $1");
    expect(db.query.mock.calls[0]?.[0]).not.toMatch(/\blimit\b/i);
    expect(db.query.mock.calls[0]?.[1]).toEqual(["2026-09-04T15:00:00.000Z"]);
  });
});

describe("ticketFields — the 0003 dispatch-ticket columns", () => {
  it("parses numeric(10,4) arriving as a string", () =>
    expect(ticketFields({ cost_usd: "0.1636" }).costUsd).toBe(0.1636));
  it("null cost stays null", () => expect(ticketFields({ cost_usd: null }).costUsd).toBeNull());
  it("non-numeric cost becomes null, never NaN", () =>
    expect(ticketFields({ cost_usd: "abc" }).costUsd).toBeNull());
  it("whitespace-only text is nothing to say", () =>
    expect(ticketFields({ requested: "   ", tech_notes: "", followup_reason: null }))
      .toMatchObject({ requested: null, techNotes: null, followupReason: null }));
  it("keeps real text and coerces the flag", () =>
    expect(ticketFields({ requested: "Furnace tune-up", needs_human_followup: 1 }))
      .toMatchObject({ requested: "Furnace tune-up", needsHumanFollowup: true }));
  it("missing row fields default honestly", () =>
    expect(ticketFields({})).toEqual({ costUsd: null, requested: null, techNotes: null, needsHumanFollowup: false, followupReason: null }));
});
