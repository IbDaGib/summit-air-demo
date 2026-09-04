import { assertion, called, callsTo } from "../assertions";
import type { ServiceAreaResult } from "../../agent/tools/schemas";
import type { Scenario } from "../types";

/** Butte is Silver Bow County — two counties outside the service area. */
export const outOfArea: Scenario = {
  id: "out-of-area",
  title: "Caller in Butte, outside the service area",
  intent:
    "The caller is in Butte, which Summit Air does not serve. The agent must check coverage, decline kindly, offer to pass the details along, and write no booking.",
  turnBudget: 12,
  context: { now: new Date(), outdoorTempF: 74 },
  persona: {
    callerName: "Nadine Cross",
    phone: "+14065550163",
    difficulty: "normal",
    opening: "Hi — my air conditioning is blowing warm air and I'd like to get somebody out to look at it.",
    notes:
      "You do not mention where you live until you are asked. If you are told they do not cover your area you are disappointed but polite, and you will accept a callback.",
    facts: [
      { key: "town", value: "I'm in Butte.", asks: /town|city|where|located|what part|address/i },
      { key: "address", value: "Nine forty West Granite Street, Butte.", asks: /address|street/i },
      { key: "issue", value: "It runs, it just blows warm air.", asks: /what.*(wrong|going on)|issue|problem|cooling|blowing/i },
      { key: "systemDown", value: "It turns on, it's just not cooling.", asks: /completely|down|running|working|turn on/i },
      { key: "propertyType", value: "It's a house.", asks: /residential|commercial|home or business/i },
      { key: "name", value: "Nadine Cross.", asks: /name|who am i|speaking with/i },
      { key: "phone", value: "Four oh six, five five five, zero one six three.", asks: /number|phone|reach you|call ?back/i },
      {
        key: "vulnerableOccupant",
        value: "Just me here.",
        asks: /anyone|who.*(home|house)|elderly|infant|kids|children|vulnerable/i,
      },
      { key: "availability", value: "Any afternoon this week works.", asks: /available|when|works for you|morning or afternoon|window/i },
    ],
  },
  assert(call) {
    const checks = callsTo(call, "check_service_area");
    const declined = checks.some((c) => (c.result as ServiceAreaResult | undefined)?.covered === false);

    return [
      assertion(
        "coverage was checked and came back not covered",
        declined,
        checks.length
          ? `towns checked: ${checks.map((c) => `${String(c.args.town)}=${(c.result as ServiceAreaResult).covered}`).join(", ")}`
          : "check_service_area was never called",
      ),
      assertion(
        "no booking was written",
        !called(call, "book_appointment"),
        called(call, "book_appointment")
          ? "booked an appointment outside the service area"
          : "no book_appointment call",
      ),
      assertion(
        "the caller was handed to a human rather than dropped",
        called(call, "save_callback_request"),
        called(call, "save_callback_request")
          ? "callback request logged"
          : `tools called: ${call.toolCalls.map((t) => t.name).join(", ")}`,
      ),
    ];
  },
};
