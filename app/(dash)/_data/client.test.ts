import { describe, expect, it } from "vitest";
import { ticketFields } from "./client";

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
