import type { Hazard } from "../policy/types";

const PATTERNS: [RegExp, Exclude<Hazard, "none">][] = [
  [/\b(carbon monoxide|co alarm|co detector)\b/i, "co_alarm"],
  [/\b(smoke|burning smell|smells? like burning|sparks?|flames?)\b/i, "smoke_or_burning"],
  [/\b(gas smell|smell(?:s|ing)? (?:of )?gas|rotten eggs?|propane leak|gas leak)\b/i, "gas_smell"],
];

const NEGATED = /\b(no|not|isn'?t|aren'?t|don'?t|doesn'?t|without)\b[^.?!]{0,24}$/i;

/**
 * Deterministic life-safety check on the facts the model reports.
 *
 * If the model calls assess_situation or find_slots while its own free-text
 * fields describe a hazard, we force the escalation path regardless of what it
 * decided. The one thing that must never fail does not depend on the model
 * following instructions.
 */
export function safetyBackstop(
  toolName: string,
  args: Record<string, unknown>,
): { hazard: Exclude<Hazard, "none">; town?: string } | null {
  if (toolName === "escalate_emergency" || toolName === "end_call") return null;

  const declared = args.hazard;
  if (typeof declared === "string" && declared !== "none") {
    return { hazard: declared as Exclude<Hazard, "none">, town: args.town as string | undefined };
  }

  const text = Object.values(args)
    .filter((v): v is string => typeof v === "string")
    .join(" . ");

  for (const [re, hazard] of PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    if (NEGATED.test(before)) continue;
    return { hazard, town: args.town as string | undefined };
  }
  return null;
}
