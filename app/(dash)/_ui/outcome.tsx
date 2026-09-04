/**
 * Outcome is deliberately NOT on the thermal ramp — it is a different axis, and
 * colouring it with the same palette would make "escalated" compete with "P0"
 * for the same channel. Outcomes are quiet, mostly monochrome, with one
 * exception: an escalation is a life-safety event and gets an ember dot.
 */

import type { CallOutcome } from "../_data/types";

const STYLES: Record<CallOutcome, { label: string; className: string; dot?: string }> = {
  booked: { label: "Booked", className: "text-emerald-300/90 ring-emerald-400/25 bg-emerald-400/10" },
  escalated: {
    label: "Escalated",
    className: "text-red-200 ring-red-400/40 bg-red-500/10",
    dot: "bg-red-500",
  },
  callback: { label: "Callback", className: "text-zinc-300 ring-zinc-500/40 bg-zinc-500/10" },
  no_action: { label: "No action", className: "text-zinc-500 ring-zinc-700 bg-zinc-800/40" },
  in_progress: {
    label: "In progress",
    className: "text-sky-200 ring-sky-400/40 bg-sky-500/10",
    dot: "bg-sky-400 animate-pulse",
  },
};

export function OutcomeChip({ outcome }: { outcome: CallOutcome }) {
  const s = STYLES[outcome];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs ring-1 ring-inset whitespace-nowrap ${s.className}`}
    >
      {s.dot ? <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /> : null}
      {s.label}
    </span>
  );
}
