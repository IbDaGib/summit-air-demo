import { assertion, called, callsTo } from "../assertions";
import type { BookingResult } from "../../agent/tools/schemas";
import type { Scenario } from "../types";

/** The boring happy path, which is most of the volume and has to be clean. */
const REQUIRED_BOOKING_FIELDS = [
  "slotId",
  "customerName",
  "phone",
  "addressLine",
  "town",
  "issueSummary",
] as const;

export const routineMaintenance: Scenario = {
  id: "routine-maintenance",
  title: "Routine pre-winter maintenance, known customer",
  intent:
    "A maintenance-plan customer wants a furnace tune-up. The agent should recognise the number, confirm the address on file rather than re-asking, collect the remaining intake, and land a confirmed booking.",
  turnBudget: 16,
  context: { now: new Date(), outdoorTempF: 58 },
  persona: {
    // Matches the seeded customer in agent/tools/handlers/stub.ts, so this run
    // also exercises the known-customer branch of turnContext().
    callerName: "Dave Whitaker",
    phone: "+14065550118",
    difficulty: "easy",
    opening: "Hi there — I'd like to get the furnace looked at before it gets cold. Just the yearly tune-up.",
    notes: "You are relaxed and cooperative. You have used Summit Air before and you are not in a hurry.",
    facts: [
      { key: "issue", value: "Nothing's wrong with it, it's just the annual service.", asks: /what.*(wrong|going on|need)|issue|problem|tune|maintenance/i },
      { key: "systemDown", value: "No, it runs fine — I just want it serviced.", asks: /completely|down|running|working|heat at all|blowing/i },
      { key: "propertyType", value: "It's my house.", asks: /residential|commercial|home or business|house or business/i },
      {
        key: "vulnerableOccupant",
        value: "Just me and my wife, nobody elderly or any little ones.",
        asks: /anyone|who.*(home|house)|elderly|infant|kids|children|vulnerable|medical/i,
      },
      { key: "town", value: "Bozeman.", asks: /town|city|where|located|what part/i },
      { key: "address", value: "Four twelve Cottonwood Road — same as always.", asks: /address|street|confirm.*(address|file)|still at/i },
      { key: "name", value: "Dave Whitaker.", asks: /name|who am i|speaking with/i },
      { key: "phone", value: "Four oh six, five five five, zero one one eight.", asks: /number|phone|reach you|call ?back/i },
      {
        key: "availability",
        value: "Mornings are best for me, any day next week.",
        asks: /available|when|works for you|morning or afternoon|window|time/i,
      },
    ],
  },
  assert(call) {
    const bookings = callsTo(call, "book_appointment");
    const confirmed = bookings.filter((b) => (b.result as BookingResult | undefined)?.status === "confirmed");
    const args = (confirmed[0] ?? bookings[0])?.args ?? {};
    const missing = REQUIRED_BOOKING_FIELDS.filter((f) => {
      const v = args[f];
      return typeof v !== "string" || v.trim() === "";
    });
    const assess = callsTo(call, "assess_situation")[0];
    const intakeMissing = assess
      ? (["propertyType", "issue"] as const)
          .filter((f) => !assess.args[f])
          .concat(
            (["systemDown", "vulnerableOccupant"] as const).filter(
              (f) => typeof assess.args[f] !== "boolean",
            ) as never[],
          )
      : ["assess_situation was never called"];

    return [
      assertion(
        "a booking was confirmed",
        confirmed.length > 0,
        confirmed.length
          ? `bookingId ${(confirmed[0].result as BookingResult).bookingId}`
          : `book_appointment calls: ${bookings.length}, ended by ${call.endedBy}`,
      ),
      assertion(
        "all required booking fields were collected",
        confirmed.length > 0 && missing.length === 0,
        missing.length ? `missing: ${missing.join(", ")}` : "slotId, name, phone, address, town, issue summary all present",
      ),
      assertion(
        "situation facts were reported before booking",
        intakeMissing.length === 0,
        intakeMissing.length ? `missing from assess_situation: ${intakeMissing.join(", ")}` : "propertyType, issue, systemDown, vulnerableOccupant all reported",
      ),
      assertion(
        "the service area was checked",
        called(call, "check_service_area"),
        called(call, "check_service_area") ? "checked before offering a slot" : "coverage was assumed, never checked",
      ),
    ];
  },
};
