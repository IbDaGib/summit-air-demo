/**
 * TEMPORARY in-memory handlers.
 *
 * Purpose: get a real phone call working end-to-end tonight, before Workspace B
 * lands the database-backed versions. Same ToolHandlers interface, so the swap
 * is one import line in app/api/vapi/tools/route.ts.
 *
 * Workspace B owns agent/tools/handlers/* — this file is deliberately
 * self-contained and touches none of its files (no import of policy/priority).
 * Delete it once B has merged.
 */
import type {
  BookingResult,
  CustomerRecord,
  EscalationResult,
  ServiceAreaResult,
  Slot,
  ToolHandlers,
} from "../schemas";
import type { County, PriorityResult, SituationFacts } from "../../policy/types";

const AREA: Record<string, County> = {
  bozeman: "Gallatin",
  belgrade: "Gallatin",
  manhattan: "Gallatin",
  "three forks": "Gallatin",
  "big sky": "Gallatin",
  livingston: "Park",
  ennis: "Madison",
  "west yellowstone": "Madison",
};

// Tolerate the ways speech-to-text mangles these town names.
const ALIASES: Record<string, string> = {
  boseman: "bozeman",
  bozman: "bozeman",
  belgrad: "belgrade",
  "bell grade": "belgrade",
  livingstone: "livingston",
  "big skye": "big sky",
};

const norm = (t: string) => {
  const k = t.trim().toLowerCase().replace(/\s+/g, " ");
  return ALIASES[k] ?? k;
};

const CUSTOMERS: CustomerRecord[] = [
  {
    id: "stub-1",
    name: "Dave Whitaker",
    phone: "+14065550118",
    addressLine: "412 Cottonwood Road",
    town: "Bozeman",
    county: "Gallatin",
    isMaintenanceMember: true,
    vulnerableOccupant: false,
    accessNotes: "Gate code 4412, dog in the yard",
    lastServiceAt: "2026-03-14",
  },
];

const ESCALATION: Record<string, string> = {
  gas_smell:
    "Please stop what you're doing and leave the building right now — take everyone with you. Don't touch any light switches, the thermostat, or anything electrical on the way out, and don't use anything that could spark. Once you're outside and away from the house, call nine one one or NorthWestern Energy at eight eight eight, four six seven, two five five three. I'm flagging this as an emergency on our end and a technician will follow up as soon as it's safe.",
  co_alarm:
    "Get everyone out of the building right away and into fresh air, then call nine one one from outside. Carbon monoxide is serious and I don't want you staying in there to talk to me. I'm flagging this as an emergency on our end right now.",
  smoke_or_burning:
    "Leave the building now and call nine one one from outside. If you can safely reach your breaker panel on the way out, shut off power to the system — but only if it's safe. Don't go back in. I'm flagging this as an emergency here.",
};

/** Minimal tiering so a live call works tonight. Workspace B owns the real one. */
function stubPriority(f: SituationFacts): PriorityResult {
  if (f.hazard !== "none") {
    return {
      tier: "P0",
      reason: `Reported ${f.hazard.replace(/_/g, " ")} — life safety.`,
      responseTarget: "Emergency escalation, no appointment.",
      blockBooking: true,
    };
  }
  const cold = typeof f.outdoorTempF === "number" && f.outdoorTempF <= 32;
  if (f.systemDown && f.issue === "no_heat" && (f.vulnerableOccupant || cold)) {
    return {
      tier: "P1",
      reason: f.vulnerableOccupant
        ? "No heat with a vulnerable occupant in the home."
        : "No heat with freezing outdoor temperatures — risk of frozen pipes.",
      responseTarget: "Same day; on-call technician after hours.",
      blockBooking: false,
    };
  }
  if (f.systemDown && f.issue === "no_cooling" && f.vulnerableOccupant) {
    return {
      tier: "P1",
      reason: "No cooling with a vulnerable occupant in the home.",
      responseTarget: "Same day.",
      blockBooking: false,
    };
  }
  if (f.propertyType === "commercial" && f.revenueStopped) {
    return {
      tier: "P1",
      reason: "Commercial system down; business cannot operate.",
      responseTarget: "Same day.",
      blockBooking: false,
    };
  }
  // Demonstrated on a live call: "not keeping up" + elderly occupant tiered P3
  // "Non-urgent service request". A house that cannot hold heat with a
  // vulnerable occupant is not routine, whether or not the system is fully dead.
  if (!f.systemDown && f.vulnerableOccupant && (f.issue === "no_heat" || f.issue === "poor_performance")) {
    return {
      tier: cold ? "P1" : "P2",
      reason: cold
        ? "System underperforming with a vulnerable occupant and freezing outdoor temperatures."
        : "System underperforming with a vulnerable occupant in the home.",
      responseTarget: cold ? "Same day." : "Next business day, prioritised.",
      blockBooking: false,
    };
  }
  if (f.systemDown) {
    return {
      tier: "P2",
      reason: "System is down with no aggravating factors.",
      responseTarget: "Next business day.",
      blockBooking: false,
    };
  }
  return {
    tier: "P3",
    reason: f.issue === "maintenance" ? "Routine maintenance." : "Non-urgent service request.",
    responseTarget: "Next available routine appointment.",
    blockBooking: false,
  };
}

const TECHS = [
  { id: "t1", name: "Marcus" },
  { id: "t2", name: "Priya" },
  { id: "t3", name: "Josh" },
];

const booked = new Set<string>();

/** Generates 8-10 / 10-12 / 1-3 / 3-5 windows over the next business days. */
function generateSlots(priority: string, earliest?: string): Slot[] {
  const out: Slot[] = [];
  const start = earliest ? new Date(earliest) : new Date();
  const urgent = priority === "P0" || priority === "P1";
  const windows = [
    [8, 10],
    [10, 12],
    [13, 15],
    [15, 17],
  ];
  for (let d = urgent ? 0 : 1; d <= (urgent ? 1 : 4) && out.length < 6; d++) {
    const day = new Date(start);
    day.setDate(day.getDate() + d);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    if (day.toISOString().slice(0, 10) === "2026-09-07") continue; // Labor Day
    for (const [h, e] of windows) {
      const s = new Date(day);
      s.setHours(h, 0, 0, 0);
      if (s.getTime() < Date.now()) continue;
      const en = new Date(day);
      en.setHours(e, 0, 0, 0);
      const tech = TECHS[out.length % TECHS.length];
      const id = `${tech.id}-${s.toISOString()}`;
      if (booked.has(id)) continue;
      const rel = d === 0 ? "today" : d === 1 ? "tomorrow" : dayName(s);
      const ampm = h < 12 ? "in the morning" : "in the afternoon";
      const h12 = (n: number) => (n > 12 ? n - 12 : n);
      out.push({
        slotId: id,
        techId: tech.id,
        techName: tech.name,
        startsAt: s.toISOString(),
        endsAt: en.toISOString(),
        spoken: `${rel} between ${h12(h)} and ${h12(e)} ${ampm}`,
      });
      if (out.length >= 6) break;
    }
  }
  return out;
}

const dayName = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "America/Denver" }).format(d);

export const stubHandlers: ToolHandlers = {
  async lookup_customer({ phone }) {
    // A model-supplied "unknown" used to normalise to "" — and endsWith("")
    // is always true, so this returned a real customer's name, address and
    // gate code to any caller. Require a full national number.
    const digits = (phone ?? "").replace(/\D/g, "");
    if (digits.length < 10) return null;
    const last10 = digits.slice(-10);
    const found = CUSTOMERS.find((c) => c.phone.replace(/\D/g, "").endsWith(last10));
    // Echo the carrier-supplied number back so the agent can confirm it aloud.
    // A caller asked "can you repeat it back?" and the agent had to say it
    // could not see the caller ID.
    return found ? { ...found, callerPhone: phone } : ({ callerPhone: phone } as never);
  },

  async check_service_area({ town }): Promise<ServiceAreaResult> {
    const county = AREA[norm(town)];
    return county
      ? { covered: true, town, county }
      : {
          covered: false,
          town,
          message:
            "We cover Gallatin, Park and Madison counties — Bozeman, Belgrade, Manhattan, Three Forks, Big Sky, Livingston and Ennis.",
        };
  },

  async assess_situation(facts) {
    return stubPriority(facts);
  },

  async escalate_emergency({ hazard }): Promise<EscalationResult> {
    const incidentId = `inc-${Date.now()}`;
    console.log(JSON.stringify({ evt: "safety_escalation", hazard, incidentId }));
    return { instructions: ESCALATION[hazard], incidentId };
  },

  async find_slots({ town, priority, earliestDate }) {
    const county = AREA[norm(town)];
    if (!county) {
      return { slots: [], message: `${town} is outside the service area.` };
    }
    const slots = generateSlots(priority, earliestDate);
    return slots.length
      ? { slots }
      : { slots: [], message: "No windows available in that range." };
  },

  async book_appointment(a): Promise<BookingResult> {
    if (booked.has(a.slotId)) {
      return {
        status: "conflict",
        message: "That window was just taken.",
        alternatives: generateSlots("P2"),
      };
    }
    booked.add(a.slotId);
    const id = `bk-${Date.now()}`;
    console.log(JSON.stringify({ evt: "booked", id, ...a }));
    return {
      status: "confirmed",
      bookingId: id,
      spoken: `You're all set — a technician will be out to ${a.addressLine} in that window.`,
    };
  },

  async save_callback_request(a) {
    const requestId = `cb-${Date.now()}`;
    console.log(JSON.stringify({ evt: "callback_request", requestId, ...a }));
    return { status: "saved", requestId };
  },

  async end_call({ outcome }) {
    console.log(JSON.stringify({ evt: "end_call", outcome }));
    return { ok: true };
  },
};
