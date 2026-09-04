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

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-base font-semibold tracking-tight">Calls</h1>
        <span className="text-sm text-muted-foreground tabular-nums">
          {calls.length} most recent
        </span>
        <PollStatus lastSync={lastSync} stale={stale} />
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent [&_th]:h-8 [&_th]:px-3 [&_th]:text-[11px] [&_th]:font-medium [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:uppercase">
              <TableHead className="w-px pl-4">Time</TableHead>
              <TableHead>Caller</TableHead>
              <TableHead>Town</TableHead>
              <TableHead className="w-px">Priority</TableHead>
              <TableHead className="w-px">Outcome</TableHead>
              <TableHead className="pr-4">Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_td]:px-3 [&_td]:py-2">
            {calls.map((c) => (
              <Row key={c.id} call={c} isNew={fresh.has(c.id)} />
            ))}
            {calls.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={6}
                  className="py-16 text-center text-sm whitespace-normal text-muted-foreground"
                >
                  No calls yet. The list refreshes every {POLL_MS / 1000} seconds.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}

function Row({ call, isNew }: { call: CallSummary; isNew: boolean }) {
  const r = ramp(call.priority);
  const href = `/calls/${call.id}`;
  return (
    // A row that arrived on the last tick is tinted so the eye lands on it;
    // the tint is the same "live" channel the in-progress chip uses.
    <TableRow className={cn("group", isNew && "bg-sky-500/10 hover:bg-sky-500/10")}>
      <TableCell className="relative pl-4">
        {/* The rail is the at-a-glance channel: severity before you read a word. */}
        <span className={`absolute inset-y-0 left-0 w-[3px] ${r.rail}`} aria-hidden />
        <Link href={href} className="block">
          <span className="font-mono tabular-nums">{denverTime(call.startedAt)}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {denverMonthDay(call.startedAt)}
          </span>
          <span className="ml-2 text-xs text-muted-foreground/60" suppressHydrationWarning>
            {relativeAge(call.startedAt)}
          </span>
        </Link>
      </TableCell>
      <TableCell>
        <Link href={href} className="block">
          {call.callerName ? (
            <span>{call.callerName}</span>
          ) : (
            <span className="text-muted-foreground italic">Unrecognized</span>
          )}
          <span className="ml-2 font-mono text-xs text-muted-foreground/70 tabular-nums">
            {formatPhone(call.fromNumber)}
          </span>
        </Link>
      </TableCell>
      <TableCell>
        <Link href={href} className="block">
          {call.town ?? <span className="text-muted-foreground/60">—</span>}
          {call.county ? (
            <span className="ml-1.5 text-xs text-muted-foreground">{call.county}</span>
          ) : null}
        </Link>
      </TableCell>
      <TableCell>
        <Link href={href} className="block">
          <PriorityChip priority={call.priority} />
        </Link>
      </TableCell>
      <TableCell>
        <Link href={href} className="block">
          <OutcomeChip outcome={call.outcome} />
        </Link>
      </TableCell>
      {/* w-full + max-w-0 lets this column absorb the slack and truncate, instead
          of pushing the table wider than the card. */}
      <TableCell className="w-full max-w-0 pr-4">
        <Link href={href} className="block max-w-[64ch] truncate text-muted-foreground">
          {call.summary ?? (
            <span className="text-muted-foreground/60 italic">
              {call.outcome === "in_progress" ? "Call in progress…" : "No summary"}
            </span>
          )}
        </Link>
      </TableCell>
    </TableRow>
  );
}

/**
 * The poll's own status, as a badge. Green pulse while ticking; amber, and the
 * last-known-data caveat, when a tick failed. Sits at the far right of the
 * title row.
 */
function PollStatus({ lastSync, stale }: { lastSync: number | null; stale: boolean }) {
  if (stale) {
    return (
      <Badge variant="outline" className="ml-auto gap-1.5 font-normal text-amber-300">
        <span className="size-1.5 rounded-full bg-amber-400" aria-hidden />
        Reconnecting — showing last known data
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="ml-auto gap-1.5 font-normal">
      <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden />
      Live
      <span className="text-muted-foreground tabular-nums">
        · every {POLL_MS / 1000}s
        {lastSync ? ` · synced ${relativeAge(new Date(lastSync).toISOString())}` : ""}
      </span>
    </Badge>
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
