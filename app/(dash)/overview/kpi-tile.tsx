import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import type { AfterHoursShare, CallVolume, CostSummary } from "../_data/metrics";
import { duration, pct, usd } from "./_format";
import { bookingRate, escalationRate } from "./kpi";

/**
 * One number a stakeholder can read from across the room. Label above, value
 * large, and a footnote that qualifies it — the rate, the denominator, or why
 * there is no value yet. The footnote is where a small dataset stays honest:
 * "50%" alone would flatter one booking out of two.
 */
export function KpiTile({
  label,
  value,
  footnote,
}: {
  label: string;
  value: string;
  footnote: string;
}) {
  return (
    <Card size="sm" className="gap-2">
      <CardHeader>
        <CardDescription className="text-[11px] font-medium tracking-wide uppercase">
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold leading-none tracking-tight tabular-nums">
          {value}
        </div>
        <p className="mt-2 truncate text-xs text-muted-foreground tabular-nums" title={footnote}>
          {footnote}
        </p>
      </CardContent>
    </Card>
  );
}

const NO_CALLS = "no calls in the last 30 days";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The six numbers, in the order a stakeholder asks about them: how many calls,
 * what came of them, when they arrived, what they cost.
 */
export function KpiTiles({
  volume,
  afterHours,
  cost,
}: {
  volume: CallVolume;
  afterHours: AfterHoursShare;
  cost: CostSummary;
}) {
  const resolved = volume.booked + volume.escalated + volume.callback;
  const noCalls = volume.total === 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label="Calls answered"
        value={volume.total.toLocaleString("en-US")}
        footnote={
          noCalls
            ? NO_CALLS
            : `last 30 days · avg ${duration(cost.avgDurationSeconds)} on the line`
        }
      />
      <KpiTile
        label="Booked"
        value={volume.booked.toLocaleString("en-US")}
        footnote={
          resolved === 0
            ? noCalls
              ? NO_CALLS
              : "no calls have a recorded outcome yet"
            : `${pct(bookingRate(volume) * 100)} of the ${plural(resolved, "call")} with a recorded outcome`
        }
      />
      <KpiTile
        label="Escalated (safety)"
        value={volume.escalated.toLocaleString("en-US")}
        footnote={
          noCalls
            ? NO_CALLS
            : `${pct(escalationRate(volume) * 100)} of ${plural(volume.total, "call")}`
        }
      />
      <KpiTile
        label="After-hours"
        value={pct(afterHours.pct)}
        footnote={
          afterHours.total === 0
            ? NO_CALLS
            : `${afterHours.afterHours} of ${afterHours.total} calls outside 8–5 Mountain, Mon–Fri`
        }
      />
      <KpiTile
        label="Avg cost / call"
        value={cost.calls === 0 ? "—" : usd(cost.avgPerCallUsd)}
        footnote={
          cost.calls === 0 ? NO_CALLS : `${usd(cost.totalUsd)} across ${plural(cost.calls, "call")}`
        }
      />
      <KpiTile
        label="Cost per booking"
        value={cost.costPerBookingUsd === null ? "—" : usd(cost.costPerBookingUsd)}
        footnote={
          cost.costPerBookingUsd === null
            ? "no bookings yet"
            : `across ${plural(volume.booked, "booking")}`
        }
      />
    </div>
  );
}
