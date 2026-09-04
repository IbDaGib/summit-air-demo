"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { DailyPoint } from "../_data/metrics";
import { usd } from "../_ui/format";

/** Only what the line needs. The page strips the rest before crossing to the client. */
export type CostPoint = Pick<DailyPoint, "day" | "costUsd">;

const config = {
  costUsd: { label: "Spend", color: "var(--chart-1)" },
} satisfies ChartConfig;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-09-03" → "Sep 3". Split by hand rather than through Date: the key is
 * already a Denver calendar day and must not be re-zoned by the viewer's clock.
 */
function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  const month = MONTHS[Number(m) - 1];
  return month ? `${month} ${Number(d)}` : day;
}

export function CostChart({ data }: { data: CostPoint[] }) {
  if (data.length === 0 || data.every((p) => p.costUsd === 0)) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No spend recorded in the last 30 days. The line draws itself from the first call.
      </p>
    );
  }

  return (
    <ChartContainer config={config} className="aspect-[3/1] min-h-48 w-full">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickFormatter={shortDay}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
        />
        <YAxis
          tickFormatter={(v: number) => usd(v)}
          tickLine={false}
          axisLine={false}
          width={56}
          className="tabular-nums"
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideIndicator
              labelFormatter={(label) => shortDay(String(label))}
              formatter={(value) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="text-muted-foreground">{config.costUsd.label}</span>
                  <span className="font-mono font-medium text-foreground tabular-nums">{usd(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="costUsd"
          stroke="var(--color-costUsd)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
