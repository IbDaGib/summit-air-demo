import { cn } from "cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CostSummary } from "../_data/metrics";
import { count, duration, usd, usdPerUnit } from "../_ui/format";

/**
 * Where a call's cost goes, from the measured cost model. Static on purpose:
 * Vapi reports one number per call, not a split, so these shares come from the
 * per-provider rates on a 92-second reference call. They are here to make one
 * thing visible without arithmetic — the model is the smallest slice.
 */
const SHARES = [
  { label: "Platform, telephony & transcription", width: 70, display: "70%", token: "--chart-1" },
  { label: "Voice synthesis", width: 15, display: "15%", token: "--chart-2" },
  { label: "Language model", width: 15, display: "15%", token: "--chart-3" },
  { label: "Post-call extraction", width: 0.5, display: "<1%", token: "--chart-4" },
] as const;

export function CostBreakdown({ summary }: { summary: CostSummary }) {
  const measured = summary.calls > 0;
  const noBookings = summary.costPerBookingUsd == null;

  return (
    <section className="flex flex-col gap-2">
      <Card>
        <CardHeader>
          <CardTitle>What the agent costs</CardTitle>
          <CardDescription>
            Vapi&rsquo;s per-call cost — telephony, transcription, voice, model and platform fee — over the
            last 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Measured</TableHead>
                <TableHead className="text-right font-normal text-muted-foreground">30 days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {measured ? (
                <>
                  <Row label="Calls" value={count(summary.calls)} />
                  <Row label="Total spend" value={usd(summary.totalUsd)} />
                  <Row label="Avg per call" value={usdPerUnit(summary.avgPerCallUsd, "call")} />
                  <Row label="Avg per minute" value={usdPerUnit(summary.avgPerMinuteUsd, "min")} />
                  <Row label="Avg call length" value={duration(summary.avgDurationSeconds)} />
                  <Row
                    label="Cost per booking"
                    value={noBookings ? "— no bookings yet" : usd(summary.costPerBookingUsd)}
                    muted={noBookings}
                  />
                </>
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={2} className="whitespace-normal py-6 text-muted-foreground">
                    No calls in the last 30 days, so nothing has been measured yet. The first call fills
                    this in.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead colSpan={2}>Where the money goes</TableHead>
                <TableHead className="text-right font-normal text-muted-foreground">Share (est.)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {SHARES.map((s) => (
                <TableRow key={s.label}>
                  <TableCell className="whitespace-normal text-muted-foreground">{s.label}</TableCell>
                  <TableCell className="w-[38%]">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        aria-hidden
                        className="h-full rounded-full"
                        style={{ width: `${s.width}%`, minWidth: 2, background: `var(${s.token})` }}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{s.display}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Measured from Vapi&rsquo;s per-call cost on real test calls. The language model is the smallest
        slice — changing the voice provider moves the bill; changing the model does not. Shares are
        estimated from provider list rates on a 92-second reference call — Vapi reports one cost per
        call, not a split.
      </p>
    </section>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <TableRow>
      <TableCell className="text-muted-foreground">{label}</TableCell>
      <TableCell className={cn("text-right tabular-nums", muted && "text-muted-foreground")}>{value}</TableCell>
    </TableRow>
  );
}
