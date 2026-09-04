/**
 * Dispatch triage. The model reports facts; this function decides the tier.
 *
 * PURE by contract — no I/O, no database, no LLM call, and no `new Date()`
 * inside. The current time arrives as a parameter so every branch is testable
 * with a fixed clock. See DECISIONS.md, "Priority computed in code".
 *
 * Seasonality is never inferred from the calendar. A Bozeman house at 8°F in
 * October is the same emergency as one at 8°F in January, and the demo runs in
 * September against a January scenario — `getMonth()` would silently
 * de-prioritise every no-heat call in it.
 */
import { scanForHazard } from "./safetyScan";
import type { Hazard, PriorityResult, SituationFacts } from "./types";

/** At or below this, an unheated building is a frozen-pipe problem too. */
export const FREEZING_F = 32;

const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 17;
const TIMEZONE = "America/Denver";

const CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hourCycle: "h23",
  hour: "2-digit",
  weekday: "short",
});

/**
 * Whether `now` falls inside normal dispatch hours in Montana. Uses the hour of
 * day and the day of week only — never the month.
 */
function inBusinessHours(now: Date): boolean {
  let hour = 0;
  let weekday = "";
  for (const part of CLOCK.formatToParts(now)) {
    if (part.type === "hour") hour = Number(part.value);
    if (part.type === "weekday") weekday = part.value;
  }
  if (weekday === "Sat" || weekday === "Sun") return false;
  return hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;
}

const HAZARD_LABEL: Record<Exclude<Hazard, "none">, string> = {
  gas_smell: "a gas smell",
  co_alarm: "a carbon monoxide alarm",
  smoke_or_burning: "smoke or a burning smell",
};

/**
 * The hazard we act on. The model's own `hazard` field wins when it is set, but
 * free text it filed as harmless is scanned too: a caller who says "it's
 * probably nothing, but there's a bit of a gas smell" has reported a gas smell
 * regardless of which enum the model picked.
 */
function effectiveHazard(facts: SituationFacts): Hazard {
  if (facts.hazard !== "none") return facts.hazard;
  return scanForHazard(facts.occupantDetail ?? "");
}

const isFreezing = (temp: number | undefined): temp is number =>
  typeof temp === "number" && Number.isFinite(temp) && temp <= FREEZING_F;

export function computePriority(facts: SituationFacts, now: Date): PriorityResult {
  const hazard = effectiveHazard(facts);
  const freezing = isFreezing(facts.outdoorTempF);
  const occupant = facts.occupantDetail?.trim();

  // P0 — life safety. Outranks everything, including the caller's preference.
  if (hazard !== "none") {
    return {
      tier: "P0",
      reason: `Caller reported ${HAZARD_LABEL[hazard]} — life-safety hazard, evacuation and 911 before anything else.`,
      responseTarget:
        "Immediate escalation: read the evacuation instructions, confirm a callback number, end the call. No appointment.",
      blockBooking: true,
    };
  }

  const sameDay = inBusinessHours(now)
    ? "Same day — dispatched today ahead of routine work."
    : "Tonight — the on-call technician is paged now.";

  // P1 — no heat, system down, with something that makes cold dangerous.
  if (facts.systemDown && facts.issue === "no_heat" && (facts.vulnerableOccupant || freezing)) {
    let reason: string;
    if (facts.vulnerableOccupant && freezing) {
      reason = `Heat is out with a vulnerable occupant on site${
        occupant ? ` (${occupant})` : ""
      } and the outdoor temperature at ${facts.outdoorTempF}°F.`;
    } else if (facts.vulnerableOccupant) {
      reason = `Heat is out with a vulnerable occupant on site${occupant ? ` (${occupant})` : ""}.`;
    } else {
      reason = `Heat is out with the outdoor temperature at ${facts.outdoorTempF}°F — the building and its pipes are at risk even with nobody vulnerable inside.`;
    }
    return { tier: "P1", reason, responseTarget: sameDay, blockBooking: false };
  }

  // P1 — no cooling with someone who cannot tolerate the heat.
  if (facts.systemDown && facts.issue === "no_cooling" && facts.vulnerableOccupant) {
    return {
      tier: "P1",
      reason: `Cooling is out with a vulnerable occupant on site${occupant ? ` (${occupant})` : ""}.`,
      responseTarget: sameDay,
      blockBooking: false,
    };
  }

  // P1 — a commercial customer who cannot trade is losing money by the hour.
  if (facts.propertyType === "commercial" && facts.revenueStopped) {
    return {
      tier: "P1",
      reason: "Commercial property cannot operate until the system is repaired — revenue is stopped.",
      responseTarget: sameDay,
      blockBooking: false,
    };
  }

  // A system that is running but not keeping up, with someone in the house who
  // cannot tolerate the cold. Confirmed on a live call, where "not keeping up"
  // plus an 84-year-old occupant tiered P3 "Non-urgent service request" —
  // exactly the gap logged in KNOWN_ISSUES after round one. `systemDown` is a
  // binary the caller does not think in: a furnace holding a house at 52°F is
  // not a working furnace.
  if (
    !facts.systemDown &&
    facts.vulnerableOccupant &&
    (facts.issue === "no_heat" || facts.issue === "poor_performance")
  ) {
    const who = occupant ? ` (${occupant})` : "";
    return freezing
      ? {
          tier: "P1",
          reason: `System is not keeping up with a vulnerable occupant on site${who} and the outdoor temperature at ${facts.outdoorTempF}°F.`,
          responseTarget: sameDay,
          blockBooking: false,
        }
      : {
          tier: "P2",
          reason: `System is not keeping up with a vulnerable occupant on site${who}.`,
          responseTarget: "Next business day, ahead of routine work.",
          blockBooking: false,
        };
  }

  // P2 — the system is down, but nothing compounds it.
  if (facts.systemDown) {
    return {
      tier: "P2",
      reason:
        "System is down with no hazard, vulnerable occupant, freezing temperature or business interruption reported.",
      responseTarget: "Next business day — first available arrival window.",
      blockBooking: false,
    };
  }

  // P3 — everything still running. Note that this is decided on the reported
  // facts, not on how urgent the caller says it is.
  const routineReason =
    facts.issue === "maintenance"
      ? "Routine maintenance — no system failure reported."
      : facts.issue === "install_quote"
        ? "Installation quote — no system failure reported."
        : "System is still running; no failure, hazard or vulnerable occupant reported.";

  return {
    tier: "P3",
    reason: routineReason,
    responseTarget: "Routine — the next available arrival window, usually within the week.",
    blockBooking: false,
  };
}
