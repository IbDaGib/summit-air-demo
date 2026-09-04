/**
 * The pure half of the global call toaster: cursor arithmetic, dedupe, the
 * escalation rule, and the copy. No React, no fetch, no timers — everything the
 * component decides is decided here so it can be tested without a browser.
 *
 * Fields come from `CallSummary` (`_data/types.ts`), the same rows
 * `GET /api/dash/calls` returns. Nothing here invents a field.
 */

import type { CallSummary } from "../_data/types";

export type ToastKind = "call" | "escalation";

/** Healthy cadence. */
export const POLL_MS = 5_000;
/** After `FAILURES_BEFORE_BACKOFF` consecutive failures, ease off to this. */
export const SLOW_POLL_MS = 30_000;
export const FAILURES_BEFORE_BACKOFF = 3;

/**
 * How far behind the server's `fetchedAt` the cursor sits.
 *
 * `?since=` filters on `calls.started_at`, but a row is only written when the
 * end-of-call report lands (agent/postcall/store.ts) — minutes after it started.
 * A cursor pinned to "now" would therefore skip every real call: by the time the
 * row exists, its `started_at` is already behind the cursor. Lagging the cursor
 * by longer than any call keeps late-written rows inside the delta; dedupe on
 * id keeps them from toasting twice. 30 minutes is well past the longest call
 * Vapi will hold open, and the lag costs a few extra rows per poll, not a second
 * request.
 */
export const CURSOR_LAG_MS = 30 * 60_000;

/**
 * The `since` for the next poll, derived from the server's clock. Browser and
 * server clocks can disagree by minutes on a wall display; the server's
 * `fetchedAt` is the only instant that is consistent with `started_at`.
 * `fallbackNow` is only consulted when the server sends something unparseable.
 */
export function nextCursor(fetchedAt: string, fallbackNow: number = Date.now()): string {
  const at = Date.parse(fetchedAt);
  const anchor = Number.isNaN(at) ? fallbackNow : at;
  return new Date(anchor - CURSOR_LAG_MS).toISOString();
}

/**
 * Calls not yet toasted, oldest first so a burst reads in the order it happened.
 * Does not touch `seen`; the caller records ids once the toast has actually fired.
 */
export function pickNew(calls: CallSummary[], seen: ReadonlySet<string>): CallSummary[] {
  const out: CallSummary[] = [];
  const inBatch = new Set<string>();
  for (const c of calls) {
    if (seen.has(c.id) || inBatch.has(c.id)) continue;
    inBatch.add(c.id);
    out.push(c);
  }
  return out.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

/**
 * P0 is a life-safety tier; an escalated outcome means the agent handed the
 * caller to a human. Either one is the toast that must not auto-dismiss.
 */
export function toastKind(call: CallSummary): ToastKind {
  return call.priority === "P0" || call.outcome === "escalated" ? "escalation" : "call";
}

/** Who, then how hot: "Dana Whitmore · P2". The chip text matches PriorityChip. */
export function toastTitle(call: CallSummary): string {
  const who = call.callerName ?? call.town ?? call.fromNumber ?? "Unknown caller";
  return `${who} · ${call.priority ?? "—"}`;
}

/** The one-line summary, or an honest placeholder while extraction is pending. */
export function toastDescription(call: CallSummary): string {
  const s = call.summary?.trim();
  return s ? s : "Summary pending";
}

/** Poll cadence for a given run of consecutive failures. Resets with success. */
export function nextDelay(consecutiveFailures: number): number {
  return consecutiveFailures >= FAILURES_BEFORE_BACKOFF ? SLOW_POLL_MS : POLL_MS;
}
