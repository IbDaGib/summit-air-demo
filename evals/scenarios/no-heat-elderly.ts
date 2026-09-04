import { assertion, callsTo } from "../assertions";
import type { PriorityResult } from "../../agent/policy/types";
import type { Scenario } from "../types";

/**
 * The canonical January call. Urgency has to come from the reported conditions
 * and the outdoor temperature the runtime injects — never from the calendar.
 * The scenario date is a real January so the transcript is coherent, but the
 * tier must hold even though the demo itself runs in September.
 */
function nextJanuary(): Date {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() : now.getFullYear() + 1;
  return new Date(Date.UTC(year, 0, 14, 15, 30)); // 8:30am Mountain
}

export const noHeatElderly: Scenario = {
  id: "no-heat-elderly",
  title: "No heat in January, elderly occupant",
  intent:
    "The furnace is dead in deep cold and an 84-year-old lives in the house alone. The agent must surface the vulnerable occupant, let assess_situation set the tier, and promise only the response time that tool returned.",
  turnBudget: 16,
  context: { now: nextJanuary(), outdoorTempF: -8 },
  persona: {
    callerName: "Ray Delgado",
    phone: "+14065550177",
    difficulty: "hard",
    opening:
      "Yeah, hi — my mom's furnace quit sometime overnight. It's the middle of January and it's about ten below out there, so the house is getting cold fast.",
    notes:
      "You are worried and talking quickly. You are calling on behalf of your mother, who lives forty minutes from you. You mention your mother's age only if you are asked who is in the house or whether anyone vulnerable is there.",
    facts: [
      {
        key: "vulnerableOccupant",
        value: "It's just my mother in the house — she's eighty-four and she lives there alone.",
        asks: /anyone|who.*(home|house|there)|elderly|older|alone|vulnerable|infant|kids|medical/i,
      },
      { key: "systemDown", value: "It's completely dead — no air, no noise, nothing at the vents.", asks: /completely|down|running at all|any heat|blowing|working/i },
      { key: "propertyType", value: "It's her house, just a regular home.", asks: /residential|commercial|home or business|house or business/i },
      { key: "town", value: "She's in Livingston.", asks: /town|city|where|located|what part/i },
      { key: "address", value: "Two twelve South Fifth Street, Livingston.", asks: /address|street/i },
      { key: "name", value: "I'm Ray Delgado — the account's under Delgado.", asks: /name|who am i|speaking with/i },
      { key: "phone", value: "Four oh six, five five five, zero one seven seven.", asks: /number|phone|reach you|call ?back/i },
      { key: "availability", value: "I can be there any time today, I'll just drive over.", asks: /available|when|works for you|morning or afternoon|today|window/i },
      { key: "issue", value: "No heat at all — it just stopped in the night.", asks: /what.*(wrong|going on|happening)|issue|problem/i },
    ],
  },
  assert(call) {
    const assessments = callsTo(call, "assess_situation");
    const flagged = assessments.filter((a) => a.args.vulnerableOccupant === true);
    const tiers = assessments.map((a) => (a.result as PriorityResult | undefined)?.tier).filter(Boolean);
    const urgent = tiers.filter((t) => t === "P0" || t === "P1");

    return [
      assertion(
        "assess_situation was called",
        assessments.length > 0,
        assessments.length ? `${assessments.length} call(s)` : "the agent never reported the facts",
      ),
      assertion(
        "vulnerable occupant flag was set",
        flagged.length > 0,
        flagged.length
          ? `vulnerableOccupant=true (${String(flagged[0].args.occupantDetail ?? "no detail")})`
          : `flags seen: ${assessments.map((a) => String(a.args.vulnerableOccupant)).join(", ") || "none"}`,
      ),
      assertion(
        "dispatch tier is P0 or P1",
        urgent.length > 0,
        tiers.length ? `tiers returned: ${tiers.join(", ")}` : "no tier was ever computed",
      ),
    ];
  },
};
