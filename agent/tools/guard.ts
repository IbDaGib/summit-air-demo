import type { Hazard } from "../policy/types";

const PATTERNS: [RegExp, Exclude<Hazard, "none">][] = [
  [/\b(carbon monoxide|co alarm|co detector)\b/i, "co_alarm"],
  [/\b(smoke|burning smell|smells? like burning|smell(?:s|ing)? burning|sparks?|flames?)\b/i, "smoke_or_burning"],
  [/\b(gas smell|smell(?:s|ing)? (?:of )?gas|rotten eggs?|propane leak|gas leak)\b/i, "gas_smell"],
];

/**
 * "No heat" is the most common phrase on these calls. Treating it as a negation
 * silences the backstop on exactly the sentence it exists for:
 *   "No heat, and there's a gas smell in the basement"
 * These describe the complaint, never the hazard, so they are removed before
 * negation is considered. Credit: Workspace B found this in its own scanner.
 */
const COMPLAINT =
  /\b(?:no|not|isn'?t|won'?t)\s+(?:heat|heating|cooling|cool|air|a\.?c\.?|hot water|airflow|blowing|firing|kicking on|turning on|working)\b/gi;

const NEGATOR = /\b(no|not|isn'?t|aren'?t|don'?t|doesn'?t|didn'?t|without|never)\b/i;

/** Clause boundaries, so a negation cannot reach across a comma or full stop. */
const CLAUSE_SPLIT = /[.,;:!?]|\band\b|\bbut\b/i;

function hazardInClause(clause: string): Exclude<Hazard, "none"> | null {
  // Blank out complaint phrases so they cannot act as negators, preserving
  // offsets so match indices stay meaningful.
  const cleaned = clause.replace(COMPLAINT, (m) => " ".repeat(m.length));

  for (const [re, hazard] of PATTERNS) {
    const m = re.exec(cleaned);
    if (!m) continue;
    // Only text before the hazard, inside this clause, can negate it.
    if (NEGATOR.test(cleaned.slice(0, m.index))) continue;
    return hazard;
  }
  return null;
}

/**
 * Deterministic life-safety check on the facts the model reports.
 *
 * If the model calls any tool while its own free-text fields describe a hazard,
 * escalation is forced regardless of what the model decided. The one thing that
 * must never fail does not depend on the model following instructions.
 *
 * Every clause is checked independently, so a hazard in the second half of a
 * sentence is caught even when the first half contains a negation.
 */
export function safetyBackstop(
  toolName: string,
  args: Record<string, unknown>,
): { hazard: Exclude<Hazard, "none">; town?: string } | null {
  if (toolName === "escalate_emergency" || toolName === "record_call_outcome") return null;

  const declared = args.hazard;
  if (typeof declared === "string" && declared !== "none") {
    return { hazard: declared as Exclude<Hazard, "none">, town: args.town as string | undefined };
  }

  const town = args.town as string | undefined;

  for (const value of Object.values(args)) {
    if (typeof value !== "string") continue;
    for (const clause of value.split(CLAUSE_SPLIT)) {
      const hazard = hazardInClause(clause);
      if (hazard) return { hazard, town };
    }
  }
  return null;
}
