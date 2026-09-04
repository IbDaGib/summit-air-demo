/**
 * Small derivations the detail page renders. Pure, so they are tested without
 * a database or a DOM.
 */
import { denverTimeWithSeconds } from "../../_ui/time";

/**
 * Whole seconds a call lasted, or null while it is still connected. Fed to
 * `_ui/format.ts` `duration()` so call length reads the same here as it does
 * on the cost page.
 */
export function elapsedSeconds(startedAt: string, endedAt: string | null): number | null {
  if (!endedAt) return null;
  return Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
}

/**
 * Denver clock-with-seconds for a trace entry, or null when the entry carries
 * no usable timestamp. Real entries written by agent/tools/callState.ts have
 * no `startedAt` at all; `_data/client.ts` maps that to "", and formatting ""
 * threw RangeError and took the whole page down.
 */
export function traceClock(iso: string): string | null {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  return denverTimeWithSeconds(iso);
}
