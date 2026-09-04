"use client";

import { Cell, Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { PriorityMix } from "../_data/metrics";
import type { Priority } from "../_data/types";
import { RAMP, ramp } from "../_ui/priority";

/**
 * The thermal ramp from _ui/priority.tsx, addressed as the CSS variables its
 * Tailwind classes resolve to, so a recharts <Cell> can be filled with it.
 * RAMP's `dot` classes (bg-red-500, …) are what make Tailwind emit these
 * --color-* variables at all, and the legend below renders those same classes,
 * so a slice and its swatch cannot disagree.
 */
const TIER_FILL: Record<Priority, string> = {
  P0: "var(--color-red-500)", // RAMP.P0.dot = bg-red-500
  P1: "var(--color-amber-400)", // RAMP.P1.dot = bg-amber-400
  P2: "var(--color-sky-500)", // RAMP.P2.dot = bg-sky-500
  P3: "var(--color-slate-500)", // RAMP.P3.dot = bg-slate-500
};
/** ramp(null).dot = bg-zinc-600. Deliberately unlit, like the chip. */
const UNTIERED_FILL = "var(--color-zinc-600)";

const TIERS: Priority[] = ["P0", "P1", "P2", "P3"];

const config = {
  P0: { label: `P0 · ${RAMP.P0.label}`, color: TIER_FILL.P0 },
  P1: { label: `P1 · ${RAMP.P1.label}`, color: TIER_FILL.P1 },
  P2: { label: `P2 · ${RAMP.P2.label}`, color: TIER_FILL.P2 },
  P3: { label: `P3 · ${RAMP.P3.label}`, color: TIER_FILL.P3 },
  untiered: { label: "Untiered", color: UNTIERED_FILL },
} satisfies ChartConfig;

type SliceKey = keyof typeof config;

export function PriorityDonut({ mix }: { mix: PriorityMix }) {
  const tiered = TIERS.reduce((n, p) => n + mix[p], 0);
  const total = tiered + mix.untiered;

  if (total === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
        No calls to tier yet.
      </div>
    );
  }

  const slices = [
    ...TIERS.map((p): { key: SliceKey; value: number } => ({ key: p, value: mix[p] })),
    { key: "untiered" as const, value: mix.untiered },
  ].filter((s) => s.value > 0);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative shrink-0">
        <ChartContainer config={config} className="aspect-square h-44 w-44">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="key" />} />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="key"
              innerRadius={54}
              outerRadius={80}
              paddingAngle={slices.length > 1 ? 2 : 0}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={`var(--color-${s.key})`} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums">
            {tiered.toLocaleString("en-US")}
          </span>
          <span className="mt-1 text-[11px] tracking-wide text-muted-foreground uppercase">
            tiered
          </span>
        </div>
      </div>

      <ul className="w-full space-y-2 text-xs">
        {TIERS.map((p) => (
          <li key={p} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${RAMP[p].dot}`} />
            <span className="w-6 font-mono font-semibold">{p}</span>
            <span className="text-muted-foreground">{RAMP[p].label}</span>
            <span className="ml-auto pl-3 tabular-nums">{mix[p].toLocaleString("en-US")}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 border-t pt-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ramp(null).dot}`} />
          <span className="w-6 font-mono font-semibold text-muted-foreground">—</span>
          <span className="text-muted-foreground">Untiered · ended before assessment</span>
          <span className="ml-auto pl-3 tabular-nums text-muted-foreground">
            {mix.untiered.toLocaleString("en-US")}
          </span>
        </li>
      </ul>
    </div>
  );
}
