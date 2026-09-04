// TODO(swap): replace with ../_ui/format once Workspace B merges
//
// Stopgap number formatting for /overview. Same signatures as the shared
// module Workspace B is writing, so the swap is an import-path change.

/**
 * Cents below $100 — the per-call and per-minute regime, where $0.10 vs $0.08
 * is the whole story. Whole dollars with grouping from $100 up: $1,040.
 * `compact` collapses thousands to one decimal: $1.0k.
 */
export function usd(n: number, opts?: { compact?: boolean }): string {
  if (opts?.compact && Math.abs(n) >= 1000) {
    return `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1000).toFixed(1)}k`;
  }
  const digits = Math.abs(n) < 100 ? 2 : 0;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * Input is 0–100, as `getAfterHoursShare().pct` returns it. "100%", "50%";
 * one decimal only below 10, where it carries information: "7.5%". Zero is "0%".
 */
export function pct(n: number): string {
  const abs = Math.abs(n);
  if (abs === 0) return "0%";
  return `${abs < 10 ? n.toFixed(1) : Math.round(n).toString()}%`;
}

/** "1m 20s"; under a minute, "45s". Matches the shape of _ui/time.ts#duration. */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
