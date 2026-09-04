import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAfterHoursShare,
  getCallVolume,
  getCostSummary,
  getDailySeries,
  getPriorityMix,
  getTownBreakdown,
  last30Days,
  type CallVolume,
  type TownRow,
} from "../_data/metrics";
import { denverInstant } from "../_ui/time";
import { KpiTiles } from "./kpi-tile";
import { PriorityDonut } from "./priority-donut";
import { VolumeChart } from "./volume-chart";

// Every figure is a live aggregate; a call that just ended has to be counted.
export const dynamic = "force-dynamic";

const SERIES_DAYS = 14;

/**
 * The page a stakeholder sees first. Six numbers, the daily shape of the
 * traffic, what kind of calls they were, and where they came from. A server
 * component: it awaits the metrics contract and hands plain data to the two
 * client charts. No hero — the numbers are the argument.
 */
export default async function OverviewPage() {
  // The chart's legend counts must describe the same days as its bars. The
  // series is bucketed on Denver calendar days, so the range is too.
  const now = new Date();
  const chartRange = {
    from: denverInstant(-(SERIES_DAYS - 1), 0, now),
    to: denverInstant(1, 0, now),
  };
  // One window, built once, for every tile. Each metric defaults to
  // last30Days() — a fresh new Date() per call — so without this the six
  // numbers would each describe a window a few milliseconds apart.
  const range = last30Days(now);

  const [volume, chartVolume, mix, afterHours, cost, series, towns] = await Promise.all([
    getCallVolume(range),
    getCallVolume(chartRange),
    getPriorityMix(range),
    getAfterHoursShare(range),
    getCostSummary(range),
    getDailySeries(SERIES_DAYS),
    getTownBreakdown(range),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Figures are from real test calls against the live agent. All customer data is mock.
        </p>
      </div>

      <KpiTiles volume={volume} afterHours={afterHours} cost={cost} />

      <Card>
        <CardHeader>
          <CardTitle>Calls per day</CardTitle>
          <CardDescription>
            Last {SERIES_DAYS} days, America/Denver. Each bar is stacked by outcome.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VolumeChart data={series} />
        </CardContent>
        <CardFooter>
          <OutcomeLegend volume={chartVolume} />
        </CardFooter>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Priority mix</CardTitle>
            <CardDescription>
              The tier is computed from reported conditions, not chosen by the model.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PriorityDonut mix={mix} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calls by town</CardTitle>
            <CardDescription>
              The town the caller named; county from the service-area list.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TownsTable rows={towns} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * The volume chart's legend, with counts for the same window. The chart's
 * "other" segment is split here into what it actually holds — callbacks, and
 * calls with no booking, callback or escalation. That second bucket is
 * `CallVolume.unresolved`, which counts outcome NULL *or* 'no_action': calls
 * still in progress (a live call sits here until it ends), calls the agent
 * ended with no action, and calls from before outcome recording existed. None
 * of those is a failure of any kind and must not be read as one.
 */
function OutcomeLegend({ volume }: { volume: CallVolume }) {
  const items = [
    { swatch: "bg-chart-1", label: "Booked", n: volume.booked },
    { swatch: "bg-chart-2", label: "Escalated (safety)", n: volume.escalated },
    { swatch: "bg-chart-3", label: "Callback", n: volume.callback },
    {
      swatch: "bg-chart-3",
      label: "No booking, callback or escalation",
      n: volume.unresolved,
      title: "Still in progress, ended with no action, or ended before outcome recording existed.",
    },
  ];
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-2" title={it.title}>
          <span className={`h-2 w-2 shrink-0 rounded-[2px] ${it.swatch}`} aria-hidden />
          <span className="text-muted-foreground">{it.label}</span>
          <span className="font-medium tabular-nums">{it.n.toLocaleString("en-US")}</span>
        </li>
      ))}
      {volume.total === 0 ? (
        <li className="text-muted-foreground">No calls in this window.</li>
      ) : null}
    </ul>
  );
}

const TH = "h-8 text-xs font-medium text-muted-foreground";

function TownsTable({ rows }: { rows: TownRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
        No calls yet. Towns appear here as callers name them.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={TH}>Town</TableHead>
          <TableHead className={TH}>County</TableHead>
          <TableHead className={`${TH} text-right`}>Calls</TableHead>
          <TableHead className={`${TH} text-right`}>Booked</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const unknown = r.town === "Unknown";
          return (
            <TableRow key={r.town}>
              <TableCell className={unknown ? "text-muted-foreground" : "font-medium"}>
                {r.town}
              </TableCell>
              <TableCell className="text-muted-foreground">{r.county ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.calls.toLocaleString("en-US")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {r.booked.toLocaleString("en-US")}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
