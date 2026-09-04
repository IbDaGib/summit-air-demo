"use client";

/**
 * Polls /api/dash/calls every 3s and swaps the rows.
 *
 * Polling, not Realtime, on purpose: on a screen-shared demo the two are
 * indistinguishable, and this one has no subscription lifecycle to get wrong.
 * See DECISIONS.md.
 *
 * The server renders the first page of rows, so the table is populated on first
 * paint and the poll only ever replaces data that is already there — no
 * loading flash between ticks.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { CallSummary } from "../_data/types";
import { PriorityChip, ramp } from "../_ui/priority";
import { OutcomeChip } from "../_ui/outcome";
import { denverTime, denverMonthDay, relativeAge } from "../_ui/time";

const POLL_MS = 3000;

export function CallsTable({ initialCalls }: { initialCalls: CallSummary[] }) {
  const [calls, setCalls] = useState(initialCalls);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  // Re-renders the "4m ago" column without refetching.
  const [, setTick] = useState(0);
  const seen = useRef(new Set(initialCalls.map((c) => c.id)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/dash/calls", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { calls: CallSummary[] };
      const arrived = body.calls.filter((c) => !seen.current.has(c.id)).map((c) => c.id);
      if (arrived.length) {
        setFresh(new Set(arrived));
        arrived.forEach((id) => seen.current.add(id));
        // Let the highlight fade rather than snapping off on the next tick.
        window.setTimeout(() => setFresh(new Set()), 6000);
      }
      setCalls(body.calls);
      setLastSync(Date.now());
      setStale(false);
    } catch {
      // A dropped poll is not worth clearing the table over — keep the last
      // known rows on screen and say so.
      setStale(true);
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      // No point polling a tab nobody is looking at; resume on focus.
      if (document.visibilityState === "visible") void poll();
      setTick((n) => n + 1);
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  return (
    <>
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <h1 className="text-sm font-semibold tracking-tight text-zinc-200">Calls</h1>
        <span className="text-xs text-zinc-500">{calls.length} most recent</span>
        <PollStatus lastSync={lastSync} stale={stale} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[11px] font-medium tracking-wide text-zinc-500 uppercase">
              <Th className="w-px pl-5">Time</Th>
              <Th>Caller</Th>
              <Th>Town</Th>
              <Th className="w-px">Priority</Th>
              <Th className="w-px">Outcome</Th>
              <Th className="pr-5">Summary</Th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <Row key={c.id} call={c} isNew={fresh.has(c.id)} />
            ))}
            {calls.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center text-sm text-zinc-500">
                  No calls yet. The list refreshes every {POLL_MS / 1000} seconds.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Row({ call, isNew }: { call: CallSummary; isNew: boolean }) {
  const r = ramp(call.priority);
  return (
    <tr
      className={`group border-b border-zinc-900 transition-colors ${
        isNew ? "bg-sky-500/10" : "hover:bg-zinc-900/60"
      }`}
    >
      <Td className="relative pl-5 whitespace-nowrap">
        {/* The rail is the at-a-glance channel: severity before you read a word. */}
        <span className={`absolute inset-y-0 left-0 w-[3px] ${r.rail}`} aria-hidden />
        <Link href={`/calls/${call.id}`} className="block">
          <span className="font-mono tabular-nums text-zinc-200">{denverTime(call.startedAt)}</span>
          <span className="ml-2 text-xs text-zinc-500">{denverMonthDay(call.startedAt)}</span>
          <span className="ml-2 text-xs text-zinc-600" suppressHydrationWarning>
            {relativeAge(call.startedAt)}
          </span>
        </Link>
      </Td>
      <Td>
        <Link href={`/calls/${call.id}`} className="block">
          {call.callerName ? (
            <span className="text-zinc-200">{call.callerName}</span>
          ) : (
            <span className="text-zinc-500 italic">Unrecognized</span>
          )}
          <span className="ml-2 font-mono text-xs text-zinc-600">
            {formatPhone(call.fromNumber)}
          </span>
        </Link>
      </Td>
      <Td className="whitespace-nowrap">
        <Link href={`/calls/${call.id}`} className="block text-zinc-300">
          {call.town ?? <span className="text-zinc-600">—</span>}
          {call.county ? (
            <span className="ml-1.5 text-xs text-zinc-600">{call.county}</span>
          ) : null}
        </Link>
      </Td>
      <Td>
        <Link href={`/calls/${call.id}`} className="block">
          <PriorityChip priority={call.priority} />
        </Link>
      </Td>
      <Td>
        <Link href={`/calls/${call.id}`} className="block">
          <OutcomeChip outcome={call.outcome} />
        </Link>
      </Td>
      <Td className="pr-5">
        <Link href={`/calls/${call.id}`} className="block max-w-[52ch] truncate text-zinc-400">
          {call.summary ?? (
            <span className="text-zinc-600 italic">
              {call.outcome === "in_progress" ? "Call in progress…" : "No summary"}
            </span>
          )}
        </Link>
      </Td>
    </tr>
  );
}

function PollStatus({ lastSync, stale }: { lastSync: number | null; stale: boolean }) {
  if (stale) {
    return (
      <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-amber-300">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Reconnecting — showing last known data
      </span>
    );
  }
  return (
    <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-zinc-500">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      Live
      <span className="text-zinc-600">
        · every {POLL_MS / 1000}s
        {lastSync ? ` · synced ${relativeAge(new Date(lastSync).toISOString())}` : ""}
      </span>
    </span>
  );
}

/** +14065550118 -> (406) 555-0118. Anything unexpected is shown as-is. */
function formatPhone(e164: string | null): string {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  return ten.length === 10
    ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
    : e164;
}

function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <th className={`border-b border-zinc-800 px-3 pb-2 font-medium ${className}`}>{children}</th>
  );
}

function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-middle ${className}`}>{children}</td>;
}
