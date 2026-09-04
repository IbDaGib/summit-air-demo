import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCall } from "../../_data/client";
import type { CallDetail, SituationFacts, ToolTraceEntry } from "../../_data/types";
import { duration, usd } from "../../_ui/format";
import { OutcomeChip } from "../../_ui/outcome";
import { PriorityBadge, PriorityChip, ramp } from "../../_ui/priority";
import { denverMonthDay, denverTime, relativeAge } from "../../_ui/time";
import { elapsedSeconds, traceClock } from "./fields";

export const dynamic = "force-dynamic";

/**
 * One call, fully expanded. Server component: the header and every tab are
 * rendered here and handed to the client-side Tabs as slots, so the transcript
 * and the trace payloads never ship as JavaScript.
 */
export default async function CallDetailPage(props: PageProps<"/calls/[id]">) {
  const { id } = await props.params;
  // Same lookup predicate in both reads, so they describe the same row.
  const call = await getCall(id);
  if (!call) notFound();

  const r = ramp(call.priority);
  const pr = call.priorityResult;
  const secs = elapsedSeconds(call.startedAt, call.endedAt);
  const traceMs = call.toolTrace.reduce((n, t) => n + t.durationMs, 0);

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Link
        href="/calls"
        className="w-fit text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        ← All calls
      </Link>

      <Card className="relative">
        <span className={`absolute inset-y-0 left-0 w-[3px] ${r.rail}`} aria-hidden />
        <CardHeader>
          <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-lg">
            <h1 className="contents">
            {call.callerName ?? (
              <span className="font-normal text-muted-foreground italic">Unrecognized caller</span>
            )}
            <span className="font-mono text-sm font-normal text-muted-foreground tabular-nums">
              {call.fromNumber ?? "—"}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {call.town ?? "—"}
              {call.county ? ` · ${call.county} County` : ""}
            </span>
          </h1>
          </CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
            <span className="inline-flex items-center gap-2">
              <PriorityChip priority={call.priority} />
              {/* The reason goes on the ticket; the ramp label stands in until it exists. */}
              <span className="text-sm text-foreground">{pr?.reason ?? r.label}</span>
            </span>
            {pr?.blockBooking ? <Badge variant="destructive">Booking blocked</Badge> : null}
            <OutcomeChip outcome={call.outcome} />
            <Badge variant="outline" className="gap-1 font-normal">
              <span className="text-muted-foreground">Sentiment</span>
              <span className="capitalize">{call.sentiment ?? "—"}</span>
            </Badge>
            {call.needsHumanFollowup ? <Badge variant="secondary">Needs a human</Badge> : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <Meta label="Started">
              <span className="tabular-nums">
                {denverTime(call.startedAt)} · {denverMonthDay(call.startedAt)} MT
              </span>
              <span className="ml-1.5 text-muted-foreground/60">({relativeAge(call.startedAt)})</span>
            </Meta>
            <Meta label="Duration">
              <span className="tabular-nums">{secs === null ? "live" : duration(secs)}</span>
            </Meta>
            <Meta label="Cost">
              <span className="tabular-nums">{usd(call.costUsd)}</span>
            </Meta>
            <Meta label="Vapi call">
              <span className="font-mono">{call.vapiCallId ?? "—"}</span>
            </Meta>
          </dl>
          {call.summary ? <p className="max-w-3xl text-sm">{call.summary}</p> : null}
        </CardContent>
      </Card>

      <Tabs defaultValue="transcript" className="gap-3">
        <TabsList variant="line">
          <TabsTrigger value="transcript">
            Transcript
            <Count n={call.transcript.length} />
          </TabsTrigger>
          <TabsTrigger value="trace">
            Tool trace
            <Count n={call.toolTrace.length} />
          </TabsTrigger>
          <TabsTrigger value="ticket">Ticket</TabsTrigger>
        </TabsList>

        <TabsContent value="transcript">
          <Card className="py-0">
            <CardContent className="py-4">
              <Transcript call={call} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trace">
          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex items-baseline gap-2 border-b px-4 py-2 text-xs text-muted-foreground">
              <span className="font-medium tracking-wide text-foreground/80 uppercase">
                Tool-call trace
              </span>
              <span className="tabular-nums">
                {call.toolTrace.length} call{call.toolTrace.length === 1 ? "" : "s"} ·{" "}
                {traceMs.toLocaleString("en-US")} ms total
              </span>
            </div>
            <Trace entries={call.toolTrace} />
          </Card>
        </TabsContent>

        <TabsContent value="ticket">
          <Ticket call={call} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Transcript
 * ------------------------------------------------------------------ */

function Transcript({ call }: { call: CallDetail }) {
  if (call.transcript.length === 0) {
    return <Empty>No transcript captured.</Empty>;
  }
  return (
    <ol className="space-y-3">
      {call.transcript.map((turn, i) => (
        <li key={i} className="grid grid-cols-[auto_1fr] gap-x-3">
          <span className="pt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground/60">
            {denverTime(turn.at)}
          </span>
          <div>
            <span
              className={cn(
                "mr-2 text-[11px] font-semibold tracking-wide uppercase",
                turn.role === "agent" ? "text-sky-400" : "text-muted-foreground",
              )}
            >
              {turn.role === "agent" ? "Agent" : "Caller"}
            </span>
            <span className="text-sm text-foreground/90">{turn.text}</span>
          </div>
        </li>
      ))}
      {call.outcome === "in_progress" ? (
        <li className="flex items-center gap-2 pt-1 text-xs text-sky-300">
          <span className="size-1.5 animate-pulse rounded-full bg-sky-400" aria-hidden />
          Call still connected
        </li>
      ) : null}
    </ol>
  );
}

/* ------------------------------------------------------------------ *
 * Tool trace
 * ------------------------------------------------------------------ */

/** Arguments in, result out, wall time. The live-debugging surface. */
function Trace({ entries }: { entries: ToolTraceEntry[] }) {
  if (entries.length === 0) return <Empty className="px-4 py-6">No tools were called.</Empty>;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent [&_th]:h-8 [&_th]:px-3 [&_th]:text-[11px] [&_th]:font-medium [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase">
          <TableHead className="w-px pl-4">Tool</TableHead>
          <TableHead className="w-[38%]">Args</TableHead>
          <TableHead className="w-[38%]">Result</TableHead>
          <TableHead className="w-px pr-4 text-right">ms</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
        {entries.map((t) => {
          const at = traceClock(t.startedAt);
          return (
            <TableRow
              key={t.toolCallId}
              className={cn(
                t.forcedEscalation && "bg-destructive/5 hover:bg-destructive/5",
                !t.forcedEscalation && t.error && "bg-amber-500/5 hover:bg-amber-500/5",
              )}
            >
              <TableCell className="pl-4">
                <div className="flex flex-col items-start gap-1">
                  <span className="font-mono text-xs font-semibold">{t.name}</span>
                  {at ? (
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {at}
                    </span>
                  ) : null}
                  {t.forcedEscalation ? (
                    <Badge variant="destructive">Forced escalation</Badge>
                  ) : null}
                  {t.error ? (
                    <Badge variant="outline" className="text-amber-300">
                      Error
                    </Badge>
                  ) : null}
                </div>
                {t.forcedEscalation ? (
                  <p className="mt-2 max-w-[36ch] text-[11px] whitespace-normal text-destructive">
                    Safety backstop overrode this call — agent/tools/guard.ts matched a hazard in
                    the arguments and ran escalate_emergency instead.
                  </p>
                ) : null}
                {t.error ? (
                  <p className="mt-2 max-w-[36ch] font-mono text-[11px] whitespace-normal text-amber-200">
                    {t.error}
                  </p>
                ) : null}
              </TableCell>
              <TableCell className="whitespace-normal">
                <Payload value={t.args} />
              </TableCell>
              <TableCell className="whitespace-normal">
                <Payload value={t.result} />
              </TableCell>
              <TableCell
                className={cn(
                  "pr-4 text-right font-mono text-[11px] tabular-nums",
                  t.durationMs >= 1000 ? "text-amber-300" : "text-muted-foreground",
                )}
              >
                {t.durationMs.toLocaleString("en-US")}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function Payload({ value }: { value: unknown }) {
  return (
    <pre className="max-h-52 min-w-0 overflow-auto rounded bg-background/60 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
      {value === null || value === undefined ? "null" : JSON.stringify(value, null, 2)}
    </pre>
  );
}

/* ------------------------------------------------------------------ *
 * Ticket
 * ------------------------------------------------------------------ */

/**
 * What dispatch reads: the post-call extraction, why the tier is what it is,
 * and the facts it was computed from.
 */
function Ticket({ call }: { call: CallDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle>Ticket</CardTitle>
          <CardDescription>Written by the post-call extraction pass.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <Field label="Summary">{call.summary ?? <Empty inline>No summary.</Empty>}</Field>
            <Field label="Requested">
              {call.requested ?? <Empty inline>Not recorded.</Empty>}
            </Field>
            <Field label="Tech notes">
              {call.techNotes ?? <Empty inline>None.</Empty>}
            </Field>
            <Field label="Follow-up">
              {call.needsHumanFollowup ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Needs a human</Badge>
                  {call.followupReason ?? <Empty inline>No reason given.</Empty>}
                </span>
              ) : (
                <Empty inline>None flagged.</Empty>
              )}
            </Field>
          </dl>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Computed priority</CardTitle>
            <CardDescription>
              Derived by agent/policy/priority.ts from the facts below. The model reports facts;
              it does not choose the tier.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ComputedPriority call={call} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Extracted facts</CardTitle>
          </CardHeader>
          <CardContent>
            <Facts facts={call.facts} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * The tier is never model output — computePriority() derives it from the
 * facts. This panel exists so that claim is checkable on the screen rather
 * than taken on trust.
 */
function ComputedPriority({ call }: { call: CallDetail }) {
  const pr = call.priorityResult;
  if (!pr) {
    return call.priority ? (
      <div className="flex flex-col gap-2">
        <PriorityBadge priority={call.priority} />
        <Empty>
          The tier was assigned during the call, but its reason and response target were not
          stored with it.
        </Empty>
      </div>
    ) : (
      <Empty>No tier assigned — the call ended before intake completed.</Empty>
    );
  }
  const r = ramp(pr.tier);
  return (
    <div className={cn("rounded-md border p-3", r.panel)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PriorityBadge priority={pr.tier} />
        {pr.blockBooking ? <Badge variant="destructive">Booking blocked</Badge> : null}
      </div>
      <p className="mt-2 text-sm">{pr.reason}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        <span className="text-muted-foreground/70">Response target:</span> {pr.responseTarget}
      </p>
    </div>
  );
}

const FACT_LABELS: Record<keyof SituationFacts, string> = {
  propertyType: "Property",
  issue: "Issue",
  systemDown: "System down",
  hazard: "Hazard",
  vulnerableOccupant: "Vulnerable occupant",
  occupantDetail: "Occupant detail",
  town: "Town",
  outdoorTempF: "Outdoor temp",
  revenueStopped: "Revenue stopped",
};

function Facts({ facts }: { facts: SituationFacts | null }) {
  if (!facts) return <Empty>No facts extracted.</Empty>;
  const entries = (Object.keys(FACT_LABELS) as (keyof SituationFacts)[])
    .filter((k) => facts[k] !== undefined)
    .map((k) => [k, facts[k]] as const);
  if (entries.length === 0) return <Empty>No facts extracted.</Empty>;

  return (
    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {entries.map(([key, value]) => {
        const alarming =
          (key === "hazard" && value !== "none") ||
          (key === "vulnerableOccupant" && value === true) ||
          (key === "revenueStopped" && value === true);
        return (
          <div key={key} className="contents">
            <dt className="text-xs text-muted-foreground">{FACT_LABELS[key]}</dt>
            <dd className={cn("font-mono text-xs tabular-nums", alarming && "text-destructive")}>
              {key === "outdoorTempF" ? `${value}°F` : String(value)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/* ------------------------------------------------------------------ *
 * Small parts
 * ------------------------------------------------------------------ */

/** Count in a tab trigger. Zero is a legitimate count, so it is shown, quietly. */
function Count({ n }: { n: number }) {
  return (
    <Badge
      variant={n > 0 ? "secondary" : "outline"}
      className="h-4 min-w-5 px-1.5 text-[10px] tabular-nums"
    >
      {n}
    </Badge>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="inline text-muted-foreground/70">{label}: </dt>
      <dd className="inline">{children}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="pt-px text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Empty({
  children,
  inline = false,
  className,
}: {
  children: ReactNode;
  inline?: boolean;
  className?: string;
}) {
  const Tag = inline ? "span" : "p";
  return <Tag className={cn("text-sm text-muted-foreground italic", className)}>{children}</Tag>;
}
