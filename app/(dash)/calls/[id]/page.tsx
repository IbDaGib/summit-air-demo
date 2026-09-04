import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getCall } from "../../_data/client";
import type { CallDetail, SituationFacts, ToolTraceEntry } from "../../_data/types";
import { PriorityBadge, ramp } from "../../_ui/priority";
import { OutcomeChip } from "../../_ui/outcome";
import {
  denverMonthDay,
  denverTime,
  denverTimeWithSeconds,
  duration,
  relativeAge,
} from "../../_ui/time";

export const dynamic = "force-dynamic";

export default async function CallDetailPage(props: PageProps<"/calls/[id]">) {
  const { id } = await props.params;
  const call = await getCall(id);
  if (!call) notFound();

  const r = ramp(call.priority);

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative border-b border-zinc-800 px-5 py-4">
        <span className={`absolute inset-y-0 left-0 w-[3px] ${r.rail}`} aria-hidden />
        <Link href="/calls" className="text-xs text-zinc-500 hover:text-zinc-300">
          ← All calls
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-base font-semibold tracking-tight">
            {call.callerName ?? <span className="text-zinc-400 italic">Unrecognized caller</span>}
          </h1>
          <span className="font-mono text-sm text-zinc-400">{call.fromNumber ?? "—"}</span>
          <PriorityBadge priority={call.priority} />
          <OutcomeChip outcome={call.outcome} />
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
          <Meta label="Started">
            {denverTime(call.startedAt)} · {denverMonthDay(call.startedAt)} MT
            <span className="ml-1.5 text-zinc-600">({relativeAge(call.startedAt)})</span>
          </Meta>
          <Meta label="Duration">{duration(call.startedAt, call.endedAt)}</Meta>
          <Meta label="Town">
            {call.town ?? "—"}
            {call.county ? ` · ${call.county} County` : ""}
          </Meta>
          <Meta label="Sentiment">{call.sentiment ?? "—"}</Meta>
          <Meta label="Vapi call">
            <span className="font-mono">{call.vapiCallId ?? "—"}</span>
          </Meta>
        </dl>
        {call.summary ? <p className="mt-3 max-w-3xl text-sm text-zinc-300">{call.summary}</p> : null}
      </div>

      <div className="grid flex-1 gap-px bg-zinc-900 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="bg-zinc-950 p-5">
          <SectionTitle>Transcript</SectionTitle>
          <Transcript call={call} />
        </section>

        <div className="flex flex-col gap-px bg-zinc-900">
          <section className="bg-zinc-950 p-5">
            <SectionTitle>Computed priority</SectionTitle>
            <ComputedPriority call={call} />
          </section>
          <section className="bg-zinc-950 p-5">
            <SectionTitle>Extracted facts</SectionTitle>
            <Facts facts={call.facts} />
          </section>
          <section className="flex-1 bg-zinc-950 p-5">
            <SectionTitle>
              Tool-call trace
              <span className="ml-2 font-normal text-zinc-600">
                {call.toolTrace.length} call{call.toolTrace.length === 1 ? "" : "s"} ·{" "}
                {call.toolTrace.reduce((n, t) => n + t.durationMs, 0).toLocaleString("en-US")} ms
                total
              </span>
            </SectionTitle>
            <Trace entries={call.toolTrace} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Transcript({ call }: { call: CallDetail }) {
  if (call.transcript.length === 0) {
    return <Empty>No transcript captured.</Empty>;
  }
  return (
    <ol className="space-y-3">
      {call.transcript.map((turn, i) => (
        <li key={i} className="grid grid-cols-[auto_1fr] gap-x-3">
          <span className="pt-0.5 font-mono text-[11px] tabular-nums text-zinc-600">
            {denverTime(turn.at)}
          </span>
          <div>
            <span
              className={`mr-2 text-[11px] font-semibold tracking-wide uppercase ${
                turn.role === "agent" ? "text-sky-400" : "text-zinc-400"
              }`}
            >
              {turn.role === "agent" ? "Agent" : "Caller"}
            </span>
            <span className="text-sm text-zinc-300">{turn.text}</span>
          </div>
        </li>
      ))}
      {call.outcome === "in_progress" ? (
        <li className="flex items-center gap-2 pt-1 text-xs text-sky-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />
          Call still connected
        </li>
      ) : null}
    </ol>
  );
}

/**
 * The tier is never model output — computePriority() derives it from the facts
 * above. This panel exists so that claim is checkable on the screen rather than
 * taken on trust.
 */
function ComputedPriority({ call }: { call: CallDetail }) {
  const pr = call.priorityResult;
  if (!pr) return <Empty>No tier assigned — the call ended before intake completed.</Empty>;
  const r = ramp(pr.tier);
  return (
    <div className={`rounded border p-3 ${r.panel}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <PriorityBadge priority={pr.tier} />
        {pr.blockBooking ? (
          <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-medium text-red-200 ring-1 ring-inset ring-red-400/40">
            Booking blocked
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-zinc-200">{pr.reason}</p>
      <p className="mt-1 text-xs text-zinc-400">
        <span className="text-zinc-500">Response target:</span> {pr.responseTarget}
      </p>
      <p className="mt-2 text-[11px] text-zinc-600">
        Computed by agent/policy/priority.ts from the facts below. The model
        reports facts; it does not choose the tier.
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

  return (
    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {entries.map(([key, value]) => {
        const alarming =
          (key === "hazard" && value !== "none") ||
          (key === "vulnerableOccupant" && value === true) ||
          (key === "revenueStopped" && value === true);
        return (
          <div key={key} className="contents">
            <dt className="text-xs text-zinc-500">{FACT_LABELS[key]}</dt>
            <dd
              className={`font-mono text-xs ${alarming ? "text-red-300" : "text-zinc-300"}`}
            >
              {key === "outdoorTempF" ? `${value}°F` : String(value)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Arguments in, result out, wall time. The live-debugging surface. */
function Trace({ entries }: { entries: ToolTraceEntry[] }) {
  if (entries.length === 0) return <Empty>No tools were called.</Empty>;
  return (
    <ol className="space-y-2">
      {entries.map((t) => (
        <li
          key={t.toolCallId}
          className={`rounded border p-2.5 ${
            t.error
              ? "border-amber-500/40 bg-amber-500/5"
              : t.forcedEscalation
                ? "border-red-500/40 bg-red-500/5"
                : "border-zinc-800 bg-zinc-900/40"
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs font-semibold text-zinc-100">{t.name}</span>
            <span className="font-mono text-[11px] tabular-nums text-zinc-500">
              {denverTimeWithSeconds(t.startedAt)}
            </span>
            <span
              className={`ml-auto font-mono text-[11px] tabular-nums ${
                t.durationMs >= 1000 ? "text-amber-300" : "text-zinc-500"
              }`}
            >
              {t.durationMs.toLocaleString("en-US")} ms
            </span>
          </div>

          {t.forcedEscalation ? (
            <p className="mt-1.5 text-[11px] text-red-200">
              Safety backstop overrode this call — agent/tools/guard.ts matched a
              hazard in the arguments and ran escalate_emergency instead.
            </p>
          ) : null}
          {t.error ? (
            <p className="mt-1.5 font-mono text-[11px] text-amber-200">{t.error}</p>
          ) : null}

          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            <Payload label="args" value={t.args} />
            <Payload label="result" value={t.result} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Payload({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] tracking-wide text-zinc-600 uppercase">{label}</div>
      <pre className="max-h-52 overflow-auto rounded bg-black/50 p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-zinc-400">
        {value === null || value === undefined ? "null" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">
      {children}
    </h2>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="inline text-zinc-600">{label}: </dt>
      <dd className="inline text-zinc-400">{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-zinc-600 italic">{children}</p>;
}
