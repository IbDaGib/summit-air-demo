import { describe, expect, it, vi } from "vitest";
import { dayTick } from "./volume-chart";

// volume-chart.tsx imports the shadcn chart wrapper through the "@/" alias,
// which only Next resolves — there is no vitest config. Nothing here renders
// the chart, so the wrapper is stubbed and only the tick formatter runs.
vi.mock("@/components/ui/chart", () => ({}));

describe("dayTick", () => {
  it("reads the Denver date back in UTC, so the viewer's zone cannot shift it", () => {
    // 2026-09-03 is a Thursday. Parsed as a local Date west of UTC it would be
    // the evening of Wed 2; the tick must stay on the date the SQL bucketed.
    expect(dayTick("2026-09-03")).toBe("Thu 3");
  });
});
