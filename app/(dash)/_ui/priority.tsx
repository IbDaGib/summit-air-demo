/**
 * The thermal ramp.
 *
 * Cold-to-hot is the axis of this business, so severity is encoded as heat and
 * reads before the label does: P0 ember, P1 amber, P2 steel, P3 slate. The ramp
 * runs on three surfaces at once — the row rail, the chip fill, and the chip
 * text — so a P0 is unmistakable in peripheral vision on a shared screen.
 *
 * Class strings are written out in full rather than composed, because Tailwind
 * scans source text and never sees an interpolated class name.
 */

import type { Priority } from "../_data/types";

interface Ramp {
  /** 3px rail down the left edge of a row. The at-a-glance channel. */
  rail: string;
  /** Chip background + ring. */
  chip: string;
  /** Solid dot, for dense contexts where a chip is too heavy. */
  dot: string;
  /** Tint for a whole panel keyed to a priority. */
  panel: string;
  label: string;
}

export const RAMP: Record<Priority, Ramp> = {
  P0: {
    rail: "bg-red-500 shadow-[0_0_12px_-1px_rgba(239,68,68,0.75)]",
    chip: "bg-red-500/20 text-red-200 ring-1 ring-inset ring-red-400/60",
    dot: "bg-red-500",
    panel: "border-red-500/40 bg-red-500/5",
    label: "Emergency",
  },
  P1: {
    rail: "bg-amber-400",
    chip: "bg-amber-400/15 text-amber-200 ring-1 ring-inset ring-amber-400/50",
    dot: "bg-amber-400",
    panel: "border-amber-400/35 bg-amber-400/5",
    label: "Same day",
  },
  P2: {
    rail: "bg-sky-500",
    chip: "bg-sky-500/15 text-sky-200 ring-1 ring-inset ring-sky-400/40",
    dot: "bg-sky-500",
    panel: "border-sky-500/30 bg-sky-500/5",
    label: "Next business day",
  },
  P3: {
    rail: "bg-slate-500",
    chip: "bg-slate-500/15 text-slate-300 ring-1 ring-inset ring-slate-400/30",
    dot: "bg-slate-500",
    panel: "border-slate-500/30 bg-slate-500/5",
    label: "Routine",
  },
};

/** No tier yet — the call is still in intake. Deliberately unlit. */
const UNSET: Ramp = {
  rail: "bg-zinc-700",
  chip: "bg-zinc-700/30 text-zinc-400 ring-1 ring-inset ring-zinc-600/50",
  dot: "bg-zinc-600",
  panel: "border-zinc-700 bg-zinc-900",
  label: "Not yet assessed",
};

export const ramp = (p: Priority | null): Ramp => (p ? RAMP[p] : UNSET);

export function PriorityChip({
  priority,
  size = "md",
}: {
  priority: Priority | null;
  size?: "sm" | "md";
}) {
  const r = ramp(priority);
  const pad = size === "sm" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      title={r.label}
      className={`inline-flex items-center gap-1.5 rounded font-mono font-semibold tracking-wide tabular-nums ${pad} ${r.chip}`}
    >
      {priority ?? "—"}
    </span>
  );
}

/** The chip plus its meaning, for the detail page where there is room. */
export function PriorityBadge({ priority }: { priority: Priority | null }) {
  const r = ramp(priority);
  return (
    <span className="inline-flex items-center gap-2">
      <PriorityChip priority={priority} />
      <span className="text-xs text-zinc-400">{r.label}</span>
    </span>
  );
}

/**
 * The whole ramp, once, at the bottom of the call list. An operator seeing this
 * screen for the first time should not have to ask what amber means.
 */
export function RampLegend() {
  const order: Priority[] = ["P0", "P1", "P2", "P3"];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {order.map((p) => (
        <span key={p} className="inline-flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${RAMP[p].dot}`} />
          <span className="font-mono text-[11px] font-semibold text-zinc-300">{p}</span>
          <span className="text-[11px] text-zinc-500">{RAMP[p].label}</span>
        </span>
      ))}
    </div>
  );
}
