"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { DailyPoint } from "../_data/metrics";

/**
 * Outcome is not on the thermal ramp (see _ui/outcome.tsx), so the stack uses
 * the neutral chart tokens. Booked sits at the bottom in the brightest tone —
 * it is the segment a stakeholder is looking for. "Other" is everything the
 * daily series cannot split further: callbacks and calls with no recorded
 * outcome. The card footer disaggregates those two from the totals.
 */
const config = {
  booked: { label: "Booked", color: "var(--chart-1)" },
  escalated: { label: "Escalated (safety)", color: "var(--chart-2)" },
  other: { label: "Callback or no recorded outcome", color: "var(--chart-3)" },
} satisfies ChartConfig;

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `day` is already a Denver calendar date, "YYYY-MM-DD". Splitting the string
 * and reading the weekday back in UTC keeps it that date; parsing it as a local
 * Date would shift it a day for any viewer east of Denver.
 */
function ymd(day: string): { y: number; m: number; d: number; weekday: string } {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d, weekday: WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}

/** "Wed 3" — the axis tick. */
export function dayTick(day: string): string {
  const { d, weekday } = ymd(day);
  return `${weekday} ${d}`;
}

/** "Wed, Sep 3" — the tooltip heading. */
function dayHeading(day: string): string {
  const { m, d, weekday } = ymd(day);
  return `${weekday}, ${MONTH[m - 1]} ${d}`;
}

export function VolumeChart({ data }: { data: DailyPoint[] }) {
  if (data.length === 0 || data.every((p) => p.calls === 0)) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        {data.length === 0
          ? "No call data yet."
          : `No calls in the last ${data.length} days.`}
      </div>
    );
  }

  const rows = data.map((p) => ({
    day: p.day,
    booked: p.booked,
    escalated: p.escalated,
    other: Math.max(0, p.calls - p.booked - p.escalated),
  }));

  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -16 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={dayTick}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent labelFormatter={(value) => dayHeading(String(value))} />}
        />
        {/* No grow-in animation: the bars are the content, and a stakeholder
            screen-share (or a static capture) must never catch an empty chart. */}
        <Bar dataKey="booked" stackId="calls" fill="var(--color-booked)" isAnimationActive={false} />
        <Bar dataKey="escalated" stackId="calls" fill="var(--color-escalated)" isAnimationActive={false} />
        <Bar dataKey="other" stackId="calls" fill="var(--color-other)" isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
