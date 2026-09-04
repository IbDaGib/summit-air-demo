import { describe, expect, it, vi } from "vitest";
import { RAMP, ramp } from "../_ui/priority";
import { TIER_FILL, UNTIERED_FILL } from "./priority-donut";

// Same stub as volume-chart.test.ts: the "@/" alias has no resolver outside Next.
vi.mock("@/components/ui/chart", () => ({}));

/** "bg-red-500" is the Tailwind class; Tailwind v4 emits it as --color-red-500. */
const cssVarFor = (dotClass: string) => `var(--color-${dotClass.slice(3)})`;

describe("donut fills mirror the thermal ramp", () => {
  for (const p of Object.keys(RAMP) as (keyof typeof RAMP)[]) {
    it(`${p} slice is the variable behind RAMP.${p}.dot`, () => {
      expect(RAMP[p].dot.startsWith("bg-")).toBe(true);
      expect(TIER_FILL[p]).toBe(cssVarFor(RAMP[p].dot));
    });
  }

  it("the untiered slice is the variable behind ramp(null).dot", () => {
    expect(UNTIERED_FILL).toBe(cssVarFor(ramp(null).dot));
  });
});
