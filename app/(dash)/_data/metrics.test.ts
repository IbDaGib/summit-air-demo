import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  hasDbConfig: vi.fn(() => true),
  query: vi.fn(),
}));

vi.mock("../../../db/neon", () => db);

import { getResolvedFollowupQueue } from "./metrics";

describe("getResolvedFollowupQueue", () => {
  beforeEach(() => {
    db.query.mockReset();
  });

  it("fetches resolved rows independently of the open queue cap", async () => {
    db.query.mockResolvedValueOnce([
      {
        id: "resolved-1",
        started_at: "2026-09-04T15:00:00.000Z",
        caller: "Dana Whitmore",
        town: "Bozeman",
        priority: "P2",
        followup_reason: "Confirm access",
        summary: "Caller needs a follow-up.",
        followup_resolved_at: "2026-09-04T16:00:00.000Z",
      },
    ]);

    const rows = await getResolvedFollowupQueue(50);

    expect(rows.map((row) => row.callId)).toEqual(["resolved-1"]);
    expect(db.query).toHaveBeenCalledOnce();
    expect(db.query.mock.calls[0]?.[0]).toContain(
      "c.followup_resolved_at is not null",
    );
    expect(db.query.mock.calls[0]?.[1]).toEqual([50]);
  });
});
