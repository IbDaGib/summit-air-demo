import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAfterHoursShare, getCostSummary, getDailySeries } from "../_data/metrics";
import { CostBreakdown } from "./cost-breakdown";
import { CostChart } from "./cost-chart";
import { DEFAULT_ROI_INPUTS, type RoiInputs } from "./roi";
import { RoiCalculator } from "./roi-calculator";

/**
 * The page that makes the business case. Read top to bottom: what a call
 * costs and where that money goes, what recovered calls are worth against
 * that cost, and the spend line so nobody has to take the average on trust.
 *
 * The measured numbers come from tonight's calls, so nothing here may be
 * prerendered at build time.
 */
export const dynamic = "force-dynamic";

/** Used only when nothing has been measured yet — the figure real calls landed on. */
const FALLBACK_COST_PER_CALL_USD = 0.1;

export default async function CostPage() {
  const [summary, afterHours, series] = await Promise.all([
    getCostSummary(),
    getAfterHoursShare(),
    getDailySeries(30),
  ]);

  // A call with no recorded cost is not a measurement of what a call costs.
  const measured = summary.calls > 0 && summary.avgPerCallUsd > 0;
  const initial: RoiInputs = {
    ...DEFAULT_ROI_INPUTS,
    // Seeded at the precision the calculator displays (a tenth of a cent), so
    // "600 calls × $0.104 / call" multiplies out to the figure shown beside it.
    agentCostPerCallUsd:
      summary.avgPerCallUsd > 0 ? Math.round(summary.avgPerCallUsd * 1000) / 1000 : FALLBACK_COST_PER_CALL_USD,
    afterHoursShare: afterHours.pct / 100,
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Cost &amp; ROI</h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          The case is not labour substitution, it is recovered revenue: a missed call during the first
          cold snap is a lost $300–500 ticket or an $8–12k install lead. Fifteen missed calls on one bad
          afternoon pays for the year.
        </p>
      </header>

      <CostBreakdown summary={summary} />

      <RoiCalculator initial={initial} measured={measured} />

      <Card>
        <CardHeader>
          <CardTitle>Spend per day</CardTitle>
          <CardDescription>
            Vapi per-call cost summed by Denver calendar day, last 30 days. A day with no calls is zero,
            not a gap.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CostChart data={series.map(({ day, costUsd }) => ({ day, costUsd }))} />
        </CardContent>
      </Card>
    </div>
  );
}
