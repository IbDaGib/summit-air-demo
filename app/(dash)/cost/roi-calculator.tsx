"use client";

/**
 * The ROI calculator. Assumptions on the left, what they imply on the right,
 * recomputed on every keystroke through computeRoi.
 *
 * The inputs are uncontrolled (`defaultValue` + onChange) on purpose. A
 * controlled number field re-renders "12." as "12" and eats the decimal point
 * mid-typing, and percent fields would show 0.07 × 100 = 7.000000000000001. The
 * DOM owns the text; state holds the parsed number the model runs on.
 */

import { useState, type ReactNode } from "react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pct, usd, usdPerUnit } from "../_ui/format";
import { computeRoi, type RoiInputs } from "./roi";

type EditableKey = Exclude<keyof RoiInputs, "agentCostPerCallUsd" | "afterHoursShare">;

interface Field {
  key: EditableKey;
  label: string;
  /** Percent fields are shown 0–100 and stored 0–1; the others are stored as typed. */
  kind: "count" | "percent" | "usd";
  step: number;
}

const FIELDS: readonly Field[] = [
  { key: "callsPerMonth", label: "Inbound calls per month", kind: "count", step: 10 },
  { key: "missedCallRate", label: "Missed during peaks", kind: "percent", step: 1 },
  { key: "bookingRateOnAnswered", label: "Booked when answered", kind: "percent", step: 1 },
  { key: "avgTicketUsd", label: "Average service ticket", kind: "usd", step: 25 },
  { key: "installLeadRate", label: "Bookings that become install leads", kind: "percent", step: 1 },
  { key: "avgInstallUsd", label: "Average install", kind: "usd", step: 500 },
];

const UNIT: Record<Field["kind"], string> = { count: "calls", percent: "%", usd: "USD" };

/** 0.25 → 25; 0.07 → 7 (not 7.000000000000001). */
const toPercent = (rate: number) => Math.round(rate * 1000) / 10;
/** 25 → 0.25, clamped to 0–100 first so a stray keystroke cannot exceed 100%. */
const fromPercent = (p: number) => Math.min(Math.max(p, 0), 100) / 100;

const whole = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });
/**
 * 82.5 → "82.5"; 150 → "150". Bookings and missed calls are rates, not tallies:
 * shown to the tenth so "82.5 × $425" multiplies out to the revenue beside it.
 */
const tenth = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

export function RoiCalculator({
  initial,
  measured = true,
}: {
  initial: RoiInputs;
  /** False when the seeds are fallbacks rather than real calls; the badges say so. */
  measured?: boolean;
}) {
  const [inputs, setInputs] = useState<RoiInputs>(initial);
  const out = computeRoi(inputs);
  const negative = out.netMonthlyUsd < 0;

  function update(field: Field, raw: number) {
    // An emptied field parses as NaN. Treat it as zero so the model still has a
    // number, and never as "keep the old value", which would hide the edit.
    const n = Number.isFinite(raw) ? Math.max(0, raw) : 0;
    const value = field.kind === "percent" ? fromPercent(n) : n;
    setInputs((prev) => ({ ...prev, [field.key]: value }));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Assumptions</CardTitle>
          <CardDescription>What a month looks like for the shop. Edit any number — these are yours, not ours.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => {
              const display = f.kind === "percent" ? toPercent(initial[f.key]) : initial[f.key];
              return (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`roi-${f.key}`} className="text-xs text-muted-foreground">
                    {f.label}
                  </Label>
                  <div className="relative">
                    <Input
                      id={`roi-${f.key}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={f.kind === "percent" ? 100 : undefined}
                      step={f.step}
                      defaultValue={display}
                      onChange={(e) => update(f, e.target.valueAsNumber)}
                      className="pr-12 tabular-nums"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
                      {UNIT[f.kind]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <dl className="flex flex-col divide-y border-t text-sm">
            <MeasuredRow
              label="Agent cost per call"
              value={usdPerUnit(initial.agentCostPerCallUsd, "call")}
              badge={measured ? "measured" : "assumed"}
            />
            <MeasuredRow
              label="Calls after hours"
              value={measured ? pct(initial.afterHoursShare * 100) : "—"}
              badge={measured ? "measured" : "no calls yet"}
            />
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat
          label="Recovered bookings / month"
          value={tenth(out.recoveredBookingsPerMonth)}
          detail={`from ${tenth(out.missedCallsPerMonth)} calls that would have rung out`}
        />
        <Stat
          label="Recovered revenue / month"
          value={usd(out.recoveredServiceRevenueUsd + out.recoveredInstallRevenueUsd)}
          detail={
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
              <dt>Service tickets</dt>
              <dd className="text-right tabular-nums">{usd(out.recoveredServiceRevenueUsd)}</dd>
              <dt>Install leads</dt>
              <dd className="text-right tabular-nums">{usd(out.recoveredInstallRevenueUsd)}</dd>
            </dl>
          }
        />
        <Stat
          label="Agent cost / month"
          value={usd(out.agentMonthlyCostUsd)}
          detail={`${whole(inputs.callsPerMonth)} calls × ${usdPerUnit(inputs.agentCostPerCallUsd, "call")} — every call, not only the recovered ones`}
        />
        <Stat
          label="Net / month"
          value={usd(out.netMonthlyUsd)}
          large
          negative={negative}
          detail={
            out.paybackCalls > 0
              ? `Pays for itself after ${whole(out.paybackCalls)} calls — one recovered ticket covers that many.`
              : "No agent cost to pay back."
          }
          className="sm:col-span-2"
        />
      </div>
    </div>
  );
}

function MeasuredRow({ label, value, badge }: { label: string; value: string; badge: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2">
        <span className="tabular-nums">{value}</span>
        <Badge variant="outline" className="text-[10px] tracking-wide text-muted-foreground uppercase">
          {badge}
        </Badge>
      </dd>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
  large = false,
  negative = false,
  className,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  large?: boolean;
  negative?: boolean;
  className?: string;
}) {
  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle
          className={cn(
            "font-mono tabular-nums tracking-tight",
            large ? "text-4xl font-semibold" : "text-2xl",
            negative && "text-destructive",
          )}
        >
          {value}
        </CardTitle>
      </CardHeader>
      {detail ? <CardContent className="text-xs leading-relaxed text-muted-foreground">{detail}</CardContent> : null}
    </Card>
  );
}
