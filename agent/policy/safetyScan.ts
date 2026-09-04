/**
 * Deterministic life-safety keyword scan over a caller utterance.
 *
 * This is a backstop, not a classifier. It exists so that escalation does not
 * depend on the model having followed its prompt: the runtime runs it on every
 * caller turn and forces `escalate_emergency` on a hit, whatever the model
 * decided to do next.
 *
 * Design bias: a false escalation costs one awkward call, a missed gas leak
 * costs a house. Where a phrase is genuinely ambiguous we fire. Where a phrase
 * is reliably benign — a smoke detector that needs batteries, "there's no gas
 * smell" — we stay quiet, because an agent that evacuates every third caller
 * gets switched off, and a backstop nobody trusts protects nobody.
 *
 * Pure: no I/O, no model call, same answer every time.
 */
import type { Hazard } from "./types";

type RealHazard = Exclude<Hazard, "none">;

/**
 * Words that flip the meaning of a hazard phrase when they appear shortly
 * before it: "there's no gas smell", "I don't smell anything burning".
 *
 * The window stops at a comma as well as at a full stop, so the negation in
 * "there was no smoke earlier, now there is smoke" does not reach across it.
 */
const NEGATION =
  /\b(?:no|not|nothing|none|never|without|isn'?t|wasn'?t|aren'?t|weren'?t|don'?t|doesn'?t|didn'?t|can'?t|cannot|couldn'?t)\b[^.,;]{0,32}$/i;

/**
 * Negation words that are not denying the hazard, and so must not suppress it.
 * Both families are blanked out of the text before negation is considered.
 *
 * The complaint family: "no heat" is what the caller is ringing about, and it is
 * the single most common phrase on these calls. Without it, "no heat, and
 * there's a gas smell in the basement" reads as a negated gas smell and the
 * backstop stays silent on the exact sentence it exists for.
 *
 * The hedge family: "I have no idea why it smells like gas" is a gas smell
 * being reported by someone who cannot explain it, not a denial. Greptile
 * flagged this on PR #2; the transport backstop in agent/tools/guard.ts still
 * suppresses it, which is main's to fix.
 *
 * Deliberately excluded: "no sign of", "no smell of", "can't smell". Those do
 * negate the hazard, and blanking them would evacuate a caller who just told us
 * there is nothing wrong.
 */
const COMPLAINT_NOT_NEGATION =
  /\b(?:no|not|isn'?t|aren'?t|won'?t|doesn'?t|don'?t|didn'?t|can'?t)\s+(?:heat|heating|cool(?:ing)?|cold\s+air|warm\s+air|hot\s+water|air(?:\s?flow)?|power|a\/?c|blower|fan|blowing|fir(?:e|ing)|kick(?:ing)?\s+on|turn(?:ing)?\s+on|start(?:ing)?|work(?:ing)?|runn?(?:ing)?)\b/gi;

const HEDGE_NOT_NEGATION =
  /\b(?:no|not|don'?t|doesn'?t|didn'?t|can'?t|cannot|couldn'?t|wouldn'?t)\s+(?:idea|clue|know(?:ing)?|tell(?:ing)?|certain|positive)\b/gi;

/** A detector being serviced is not a detector going off. */
const DEVICE = /\b(?:smoke|co|c\.o\.|carbon monoxide)\s+(?:alarm|detector|monitor)s?\b/i;
const DEVICE_MAINTENANCE =
  /\b(?:batter(?:y|ies)|chirp(?:ing|s|ed)?|low battery|dead|expired|replace(?:d|ment)?|install(?:ed|ing|ation)?|test(?:ing|ed)?|new one|needs?\b)/i;
const DEVICE_ACTIVE =
  /\b(?:going off|goes off|went off|keeps? going off|sounding|blaring|screaming|shrieking|wailing|triggered|activated|alarming|won'?t stop)\b/i;

interface Rule {
  hazard: RealHazard;
  /** Global, so every occurrence in a clause is checked, not just the first. */
  pattern: RegExp;
}

/** "smells" / "smelling" / "smelled". */
const SMELL = String.raw`smell(?:s|ing|ed)?`;
/** Hedging the caller puts between the verb and the thing: "smells kind of like gas". */
const HEDGE = String.raw`(?:\s+(?:kind\s+of|kinda|sort\s+of|sorta|a\s+bit|a\s+little|really|faintly|strongly|just|definitely))?`;

/**
 * Ordered most-acute first. Gas outranks CO outranks smoke: if a caller says
 * both, the gas script (leave now, touch nothing electrical) is the one that
 * also covers the others.
 */
const RULES: Rule[] = [
  {
    hazard: "gas_smell",
    pattern: new RegExp(
      [
        // "gas smell", "propane odour", "gas leak"
        String.raw`\b(?:natural\s+)?(?:gas|propane)\s+(?:smell|odou?r|leak)\b`,
        // "smells like gas", "I smell propane", "smells kind of like propane"
        String.raw`\b${SMELL}${HEDGE}\s+(?:like\s+|of\s+)?(?:natural\s+)?(?:gas|propane)\b`,
        // "gas is leaking", "the gas line is leaking", "leaking propane"
        String.raw`\b(?:natural\s+)?(?:gas|propane)\s+(?:line|lines|pipe|pipes|valve|main|meter|tank)?\s*(?:is\s+|was\s+|has\s+been\s+)?leak(?:ing|s|ed)?\b`,
        String.raw`\bleak(?:ing|s|ed)?\s+(?:natural\s+)?(?:gas|propane)\b`,
        // the classic mercaptan description
        String.raw`\brotten\s+eggs?\b`,
        String.raw`\bsulf(?:ur|ph)\w*\s+smell\b|\b${SMELL}${HEDGE}\s+(?:like\s+)?sulf`,
      ].join("|"),
      "gi",
    ),
  },
  {
    hazard: "co_alarm",
    pattern:
      /\bcarbon\s+monoxide\b|\b(?:co|c\.o\.)\s+(?:alarm|detector|monitor|levels?|poisoning)\b/gi,
  },
  {
    hazard: "smoke_or_burning",
    pattern: new RegExp(
      [
        String.raw`\bsmoke\b|\bsmoking\b|\bsmoulder(?:ing)?\b|\bsmolder(?:ing)?\b`,
        String.raw`\bburn(?:ing|t)\s+(?:smell|odou?r)\b`,
        // "smells like something is burning", "smelled burnt"
        String.raw`\b${SMELL}${HEDGE}\s+(?:like\s+)?(?:something\s+(?:is\s+|was\s+)?)?burn(?:ing|t)\b`,
        String.raw`\bspark(?:s|ing|ed)?\b|\bflames?\b|\bscorch(?:ed|ing|\s+mark)`,
        // Deliberately not a bare \bfire\b: "the furnace won't fire" is the most
        // common sentence in this business and means the opposite.
        String.raw`\bon\s+fire\b|\bcaught\s+fire\b|\bthere(?:'s|\s+is|\s+was)\s+a\s+fire\b`,
      ].join("|"),
      "gi",
    ),
  },
];

/**
 * Split on sentence punctuation and on "but", so that negation in one clause
 * does not suppress a hazard reported in the next: "there's no gas smell, but
 * the furnace is smoking" is still an escalation.
 */
function clauses(utterance: string): string[] {
  return utterance
    .split(/[.;!?\n]+|,\s*(?=(?:but|and|or|then)\b)|\bbut\b/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

function negatedAt(clause: string, index: number): boolean {
  const before = clause
    .slice(0, index)
    .replace(COMPLAINT_NOT_NEGATION, " ")
    .replace(HEDGE_NOT_NEGATION, " ");
  return NEGATION.test(before);
}

/**
 * Scan one caller utterance for a life-safety hazard.
 *
 * Returns "none" when nothing fires — that is not a statement that the call is
 * safe, only that no keyword matched.
 */
export function scanForHazard(utterance: string): Hazard {
  if (!utterance) return "none";
  const text = utterance.replace(/\s+/g, " ");
  const found = new Set<RealHazard>();

  for (const clause of clauses(text)) {
    // A detector mentioned only in a maintenance context ("the smoke detector
    // needs batteries") describes an errand, not an emergency. The suppression
    // covers only the device phrase itself, so "the smoke detector needs
    // batteries and I smell gas" still escalates on the gas.
    const device = DEVICE.exec(clause);
    const maintenanceOnly =
      device !== null && DEVICE_MAINTENANCE.test(clause) && !DEVICE_ACTIVE.test(clause);

    for (const rule of RULES) {
      // Every occurrence, not just the first: in "no smoke earlier, now there
      // is smoke" the first mention is negated and the second is the report.
      for (const match of clause.matchAll(rule.pattern)) {
        if (match.index === undefined) continue;
        if (negatedAt(clause, match.index)) continue;
        if (
          maintenanceOnly &&
          device !== null &&
          match.index >= device.index &&
          match.index < device.index + device[0].length
        ) {
          continue;
        }
        found.add(rule.hazard);
        break;
      }
    }
  }

  // RULES is ordered most-acute first, so the first hit wins no matter which
  // clause it came from.
  return RULES.find((rule) => found.has(rule.hazard))?.hazard ?? "none";
}

/** Convenience for callers that only need the yes/no. */
export function isHazardous(utterance: string): boolean {
  return scanForHazard(utterance) !== "none";
}
