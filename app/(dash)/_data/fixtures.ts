/**
 * Demo fixtures for the mock db client. Summit Air is the fictional company from
 * the case study — every customer, number and address here is invented.
 *
 * TODO(swap): delete this file together with _data/client.ts once `db/client.ts`
 * reads the real Supabase tables.
 *
 * Two rules these fixtures respect, because the dashboard is what a reviewer
 * looks at:
 *   - No call that escalated for a life-safety hazard is ever followed by a
 *     booking (agent invariant: escalate_emergency -> no book_appointment).
 *   - No firm repair prices anywhere. Diagnostic visits only.
 *
 * Timestamps are relative to process start, so the list always looks live.
 */

import type {
  Booking,
  CallDetail,
  CallOutcome,
  County,
  Priority,
  PriorityResult,
  Sentiment,
  SituationFacts,
  Tech,
  ToolTraceEntry,
  TranscriptTurn,
} from "./types";
import { denverInstant } from "../_ui/time";

const BOOT = Date.now();
const iso = (secondsAgo: number) => new Date(BOOT - secondsAgo * 1000).toISOString();

export const TECHS: Tech[] = [
  { id: "tech-marcus", name: "Marcus Reyes", homeCounty: "Gallatin", skills: ["furnace", "heat_pump", "gas"], shiftStart: "07:00", shiftEnd: "16:00", onCall: true },
  { id: "tech-priya", name: "Priya Anand", homeCounty: "Gallatin", skills: ["furnace", "ac", "controls"], shiftStart: "08:00", shiftEnd: "17:00", onCall: false },
  { id: "tech-josh", name: "Josh Tiller", homeCounty: "Gallatin", skills: ["furnace", "ductwork"], shiftStart: "08:00", shiftEnd: "17:00", onCall: false },
  { id: "tech-dana", name: "Dana Kowalczyk", homeCounty: "Park", skills: ["furnace", "boiler", "gas"], shiftStart: "08:00", shiftEnd: "17:00", onCall: false },
  { id: "tech-elias", name: "Elias Brandt", homeCounty: "Madison", skills: ["furnace", "heat_pump"], shiftStart: "08:00", shiftEnd: "17:00", onCall: false },
  { id: "tech-noor", name: "Noor Haddad", homeCounty: "Gallatin", skills: ["commercial_rtu", "controls", "ac"], shiftStart: "08:00", shiftEnd: "17:00", onCall: false },
];

/* ------------------------------------------------------------------ *
 * Builders — keep the call specs below readable.
 * ------------------------------------------------------------------ */

type TurnSpec = [TranscriptTurn["role"], string];

type TraceSpec = {
  name: string;
  atSec: number;
  ms: number;
  args: Record<string, unknown>;
  result: unknown;
  error?: string;
  forcedEscalation?: boolean;
};

interface CallSpec {
  id: string;
  startedSecondsAgo: number;
  /** null while the call is still connected. */
  lengthSec: number | null;
  fromNumber: string;
  callerName: string | null;
  customerId: string | null;
  town: string | null;
  county: County | null;
  priority: Priority | null;
  priorityResult: PriorityResult | null;
  outcome: CallOutcome;
  summary: string | null;
  sentiment: Sentiment | null;
  facts: SituationFacts | null;
  turns: TurnSpec[];
  trace: TraceSpec[];
}

function build(spec: CallSpec): CallDetail {
  const startedAt = iso(spec.startedSecondsAgo);
  const start = Date.parse(startedAt);
  const live = spec.lengthSec === null;

  // Space the turns evenly across the call so the transcript reads as a clock.
  const turnGap = ((spec.lengthSec ?? spec.startedSecondsAgo) * 1000) / Math.max(spec.turns.length, 1);

  const transcript: TranscriptTurn[] = spec.turns.map(([role, text], i) => ({
    role,
    text,
    at: new Date(start + Math.round(turnGap * i)).toISOString(),
  }));

  const toolTrace: ToolTraceEntry[] = spec.trace.map((t, i) => ({
    toolCallId: `${spec.id}-tc-${i + 1}`,
    name: t.name,
    args: t.args,
    result: t.result,
    durationMs: t.ms,
    startedAt: new Date(start + t.atSec * 1000).toISOString(),
    ...(t.error ? { error: t.error } : {}),
    ...(t.forcedEscalation ? { forcedEscalation: true } : {}),
  }));

  return {
    id: spec.id,
    vapiCallId: `vapi_${spec.id.replace(/-/g, "")}`,
    fromNumber: spec.fromNumber,
    callerName: spec.callerName,
    customerId: spec.customerId,
    town: spec.town,
    county: spec.county,
    startedAt,
    endedAt: live ? null : new Date(start + (spec.lengthSec ?? 0) * 1000).toISOString(),
    priority: spec.priority,
    priorityResult: spec.priorityResult,
    outcome: spec.outcome,
    summary: spec.summary,
    sentiment: spec.sentiment,
    facts: spec.facts,
    transcript,
    toolTrace,
    recordingUrl: live ? null : `https://storage.vapi.ai/${spec.id}.wav`,
    costUsd: 0.1625,
    requested: "Furnace not keeping up; wants a technician this week",
    techNotes: "Elderly occupant on site. Gate code 4412, dog in the yard.",
    needsHumanFollowup: false,
    followupReason: null,
  };
}

const ESCALATION_GAS =
  "Please stop what you're doing and leave the building right now — take everyone with you. Don't touch any light switches, the thermostat, or anything electrical on the way out, and don't use anything that could spark. Once you're outside and away from the house, call nine one one or NorthWestern Energy at eight eight eight, four six seven, two five five three. I'm flagging this as an emergency on our end and a technician will follow up as soon as it's safe.";

const ESCALATION_CO =
  "Get everyone out of the building right away and into fresh air, then call nine one one from outside. Carbon monoxide is serious and I don't want you staying in there to talk to me. I'm flagging this as an emergency on our end right now.";

/* ------------------------------------------------------------------ *
 * Calls, oldest spec last. listCalls() sorts by started_at desc.
 * ------------------------------------------------------------------ */

export const CALLS: CallDetail[] = [
  build({
    id: "call-1104",
    startedSecondsAgo: 38,
    lengthSec: null,
    fromNumber: "+14065550173",
    callerName: null,
    customerId: null,
    town: "Belgrade",
    county: "Gallatin",
    priority: "P2",
    priorityResult: {
      tier: "P2",
      reason: "System is down with no aggravating factors.",
      responseTarget: "Next business day.",
      blockBooking: false,
    },
    outcome: "in_progress",
    // Written post-call by the extraction pass — null while the call is live.
    summary: null,
    sentiment: "calm",
    facts: {
      propertyType: "residential",
      issue: "no_heat",
      systemDown: true,
      hazard: "none",
      vulnerableOccupant: false,
      town: "Belgrade",
      outdoorTempF: 26,
    },
    turns: [
      ["agent", "Thanks for calling Summit Air, this is the scheduling line. What's going on with your system?"],
      ["caller", "Hey — my furnace quit sometime last night. House is cold, it's not kicking on at all."],
      ["agent", "Sorry about that. Is anyone in the house who'd have a hard time in the cold — someone elderly, an infant, anyone on oxygen?"],
      ["caller", "No, it's just me and my wife, we're fine, just annoyed."],
      ["agent", "Understood. And do you smell any gas, or is a carbon monoxide alarm going off?"],
      ["caller", "No, nothing like that."],
      ["agent", "Good. Let me pull up the schedule and find you a window."],
    ],
    trace: [
      { name: "lookup_customer", atSec: 2, ms: 41, args: { phone: "+14065550173" }, result: null },
      {
        name: "check_service_area",
        atSec: 19,
        ms: 12,
        args: { town: "Belgrade" },
        result: { covered: true, town: "Belgrade", county: "Gallatin" },
      },
      {
        name: "assess_situation",
        atSec: 33,
        ms: 3,
        args: {
          propertyType: "residential",
          issue: "no_heat",
          systemDown: true,
          hazard: "none",
          vulnerableOccupant: false,
          town: "Belgrade",
        },
        result: {
          tier: "P2",
          reason: "System is down with no aggravating factors.",
          responseTarget: "Next business day.",
          blockBooking: false,
        },
      },
    ],
  }),

  build({
    id: "call-1103",
    startedSecondsAgo: 11 * 60,
    lengthSec: 96,
    fromNumber: "+14065550142",
    callerName: "Ruth Vandermolen",
    customerId: "cust-ruth",
    town: "Livingston",
    county: "Park",
    priority: "P0",
    priorityResult: {
      tier: "P0",
      reason: "Reported gas smell — life safety.",
      responseTarget: "Emergency escalation, no appointment.",
      blockBooking: true,
    },
    outcome: "escalated",
    summary: "Gas smell at the furnace in Livingston — caller evacuated, referred to 911 and NorthWestern Energy. Tech follow-up logged.",
    sentiment: "distressed",
    facts: {
      propertyType: "residential",
      issue: "noise_or_smell",
      systemDown: false,
      hazard: "gas_smell",
      vulnerableOccupant: false,
      town: "Livingston",
      outdoorTempF: 29,
    },
    turns: [
      ["agent", "Thanks for calling Summit Air. What's going on with your system?"],
      ["caller", "There's a smell down by the furnace, like rotten eggs. It's been getting stronger since this morning."],
      ["agent", "Okay — I need you to stop and listen to me for a second. Please leave the building right now and take everyone with you. Don't touch any light switches or the thermostat on the way out, and don't use anything that could spark."],
      ["caller", "Okay. Okay, I'm going out the front."],
      ["agent", "Good. Once you're outside and away from the house, call nine one one or NorthWestern Energy at eight eight eight, four six seven, two five five three. I'm flagging this as an emergency here and a technician will follow up as soon as it's safe."],
      ["caller", "I'm outside now. Thank you."],
      ["agent", "You did the right thing. Stay outside until the utility clears the house. Goodbye."],
    ],
    trace: [
      {
        name: "lookup_customer",
        atSec: 2,
        ms: 38,
        args: { phone: "+14065550142" },
        result: {
          id: "cust-ruth",
          name: "Ruth Vandermolen",
          phone: "+14065550142",
          addressLine: "88 Bennett Street",
          town: "Livingston",
          county: "Park",
          isMaintenanceMember: false,
          vulnerableOccupant: false,
        },
      },
      {
        name: "escalate_emergency",
        atSec: 14,
        ms: 27,
        args: { hazard: "gas_smell", callbackPhone: "+14065550142", town: "Livingston" },
        result: { instructions: ESCALATION_GAS, incidentId: "inc-88214" },
      },
      // No booking follows an escalation. The follow-up is a human callback.
      {
        name: "save_callback_request",
        atSec: 74,
        ms: 44,
        args: {
          customerName: "Ruth Vandermolen",
          phone: "+14065550142",
          reason: "life_safety_followup",
          notes: "Gas smell, incident inc-88214. Caller evacuated. Technician to attend once NorthWestern Energy clears the property. Do not schedule until cleared.",
        },
        result: { status: "saved", requestId: "cb-4471" },
      },
      { name: "end_call", atSec: 93, ms: 4, args: { outcome: "escalated" }, result: { ok: true } },
    ],
  }),

  build({
    id: "call-1102",
    startedSecondsAgo: 34 * 60,
    lengthSec: 268,
    fromNumber: "+14065550118",
    callerName: "Dave Whitaker",
    customerId: "cust-dave",
    town: "Bozeman",
    county: "Gallatin",
    priority: "P1",
    priorityResult: {
      tier: "P1",
      reason: "No heat with a vulnerable occupant in the home.",
      responseTarget: "Same day; on-call technician after hours.",
      blockBooking: false,
    },
    outcome: "booked",
    summary: "No heat in Bozeman with an 84-year-old occupant on site. Booked same-day with Marcus; gate code on file.",
    sentiment: "anxious",
    facts: {
      propertyType: "residential",
      issue: "no_heat",
      systemDown: true,
      hazard: "none",
      vulnerableOccupant: true,
      occupantDetail: "mother-in-law, 84, lives with them",
      town: "Bozeman",
      outdoorTempF: 24,
    },
    turns: [
      ["agent", "Thanks for calling Summit Air. What's going on with your system?"],
      ["caller", "Furnace is dead. Blower's not even turning. It's twenty-four degrees out and my mother-in-law lives with us — she's eighty-four."],
      ["agent", "That changes how I prioritize this, so thank you for telling me. Is she comfortable right now?"],
      ["caller", "She's got blankets and a space heater in her room, but I don't love it."],
      ["agent", "Understood. Any gas smell, or a carbon monoxide alarm going off?"],
      ["caller", "No, nothing. It just stopped."],
      ["agent", "Okay. Let me pull up the schedule — with an eighty-four-year-old in the house and temperatures where they are, I'm treating this as same-day."],
      ["agent", "I can get a technician to you this afternoon between one and three. Does that work?"],
      ["caller", "Yes. Yes, please."],
      ["agent", "Let me read your address back — four twelve Cottonwood Road, Bozeman. And I have a gate code four four one two and a dog in the yard on file. Still right?"],
      ["caller", "That's right. Dog's friendly, he just barks."],
      ["agent", "You're all set. Marcus will be out between one and three this afternoon. He'll go over the diagnostic visit with you before any work happens. Anything else?"],
      ["caller", "No, that's great. Thank you."],
    ],
    trace: [
      {
        name: "lookup_customer",
        atSec: 2,
        ms: 44,
        args: { phone: "+14065550118" },
        result: {
          id: "cust-dave",
          name: "Dave Whitaker",
          phone: "+14065550118",
          addressLine: "412 Cottonwood Road",
          town: "Bozeman",
          county: "Gallatin",
          isMaintenanceMember: true,
          vulnerableOccupant: false,
          accessNotes: "Gate code 4412, dog in the yard",
          lastServiceAt: "2026-03-14T00:00:00-06:00",
        },
      },
      {
        name: "assess_situation",
        atSec: 71,
        ms: 3,
        args: {
          propertyType: "residential",
          issue: "no_heat",
          systemDown: true,
          hazard: "none",
          vulnerableOccupant: true,
          occupantDetail: "mother-in-law, 84, lives with them",
          town: "Bozeman",
        },
        result: {
          tier: "P1",
          reason: "No heat with a vulnerable occupant in the home.",
          responseTarget: "Same day; on-call technician after hours.",
          blockBooking: false,
        },
      },
      {
        name: "find_slots",
        atSec: 118,
        ms: 214,
        args: { town: "Bozeman", priority: "P1", preferredTimeOfDay: "any" },
        result: {
          slots: [
            { slotId: "tech-marcus-1300", techId: "tech-marcus", techName: "Marcus Reyes", startsAt: "2026-09-03T19:00:00.000Z", endsAt: "2026-09-03T21:00:00.000Z", spoken: "today between 1 and 3 in the afternoon" },
            { slotId: "tech-priya-1500", techId: "tech-priya", techName: "Priya Anand", startsAt: "2026-09-03T21:00:00.000Z", endsAt: "2026-09-03T23:00:00.000Z", spoken: "today between 3 and 5 in the afternoon" },
          ],
        },
      },
      {
        name: "book_appointment",
        atSec: 209,
        ms: 187,
        args: {
          slotId: "tech-marcus-1300",
          customerName: "Dave Whitaker",
          phone: "+14065550118",
          addressLine: "412 Cottonwood Road",
          town: "Bozeman",
          accessNotes: "Gate code 4412, dog in the yard",
          issueSummary: "No heat, blower not running. 84-year-old occupant on site.",
        },
        result: {
          status: "confirmed",
          bookingId: "bk-9921",
          spoken: "You're all set — a technician will be out to 412 Cottonwood Road in that window.",
        },
      },
      { name: "end_call", atSec: 265, ms: 3, args: { outcome: "booked" }, result: { ok: true } },
    ],
  }),

  build({
    id: "call-1101",
    startedSecondsAgo: 62 * 60,
    lengthSec: 141,
    fromNumber: "+14065550196",
    callerName: null,
    customerId: null,
    town: "Bozeman",
    county: "Gallatin",
    priority: "P0",
    priorityResult: {
      tier: "P0",
      reason: "Reported co alarm — life safety.",
      responseTarget: "Emergency escalation, no appointment.",
      blockBooking: true,
    },
    outcome: "escalated",
    summary: "CO alarm sounding in Bozeman. Model tried to triage it as a normal service call; the safety backstop forced escalation.",
    sentiment: "anxious",
    facts: {
      propertyType: "residential",
      issue: "noise_or_smell",
      systemDown: false,
      hazard: "co_alarm",
      vulnerableOccupant: false,
      town: "Bozeman",
      outdoorTempF: 31,
    },
    turns: [
      ["agent", "Thanks for calling Summit Air. What's going on?"],
      ["caller", "Our carbon monoxide detector went off twice in the last hour. Is that the furnace?"],
      ["agent", "Get everyone out of the building right away and into fresh air, then call nine one one from outside. Carbon monoxide is serious and I don't want you staying in there to talk to me."],
      ["caller", "We're heading out the door now."],
      ["agent", "Good. I'm flagging this as an emergency on our end right now. Stay outside until the fire department clears the house."],
    ],
    trace: [
      { name: "lookup_customer", atSec: 2, ms: 36, args: { phone: "+14065550196" }, result: null },
      // The model called assess_situation with the hazard in a free-text field.
      // guard.ts matched it and ran the escalation path instead. This is the
      // single most useful row on this page.
      {
        name: "assess_situation",
        atSec: 21,
        ms: 31,
        forcedEscalation: true,
        args: {
          propertyType: "residential",
          issue: "noise_or_smell",
          systemDown: false,
          hazard: "none",
          vulnerableOccupant: false,
          town: "Bozeman",
          occupantDetail: "carbon monoxide detector went off twice in an hour",
        },
        result: { instructions: ESCALATION_CO, incidentId: "inc-88209" },
      },
      { name: "end_call", atSec: 138, ms: 3, args: { outcome: "escalated" }, result: { ok: true } },
    ],
  }),

  build({
    id: "call-1100",
    startedSecondsAgo: 97 * 60,
    lengthSec: 204,
    fromNumber: "+14065550151",
    callerName: "Cold Smoke Coffee",
    customerId: "cust-coldsmoke",
    town: "Bozeman",
    county: "Gallatin",
    priority: "P1",
    priorityResult: {
      tier: "P1",
      reason: "Commercial system down; business cannot operate.",
      responseTarget: "Same day.",
      blockBooking: false,
    },
    outcome: "booked",
    summary: "Rooftop unit down at Cold Smoke Coffee, kitchen too hot to run service. Booked same-day with Noor.",
    sentiment: "frustrated",
    facts: {
      propertyType: "commercial",
      issue: "no_cooling",
      systemDown: true,
      hazard: "none",
      vulnerableOccupant: false,
      town: "Bozeman",
      outdoorTempF: 31,
      revenueStopped: true,
    },
    turns: [
      ["agent", "Thanks for calling Summit Air. What's going on with your system?"],
      ["caller", "Our rooftop unit is down and the kitchen is unusable. We've had to stop serving hot food."],
      ["agent", "So you're not able to operate right now — got it, that's the part that matters for how I schedule this."],
      ["caller", "Right. We were told yesterday somebody would call back and nobody did."],
      ["agent", "I'm sorry about that. Let me pull up the schedule and get you a real window right now."],
      ["agent", "Noor can be there this afternoon between three and five. She works our commercial rooftop units."],
      ["caller", "That works. Please make it happen."],
      ["agent", "Booked. Two twelve East Main, Bozeman — she'll come to the back entrance off the alley as noted. You're set."],
    ],
    trace: [
      {
        name: "lookup_customer",
        atSec: 2,
        ms: 40,
        args: { phone: "+14065550151" },
        result: {
          id: "cust-coldsmoke",
          name: "Cold Smoke Coffee",
          phone: "+14065550151",
          addressLine: "212 East Main Street",
          town: "Bozeman",
          county: "Gallatin",
          isMaintenanceMember: true,
          vulnerableOccupant: false,
          accessNotes: "Back entrance off the alley; ask for the shift lead",
        },
      },
      {
        name: "assess_situation",
        atSec: 58,
        ms: 2,
        args: {
          propertyType: "commercial",
          issue: "no_cooling",
          systemDown: true,
          hazard: "none",
          vulnerableOccupant: false,
          town: "Bozeman",
          revenueStopped: true,
        },
        result: {
          tier: "P1",
          reason: "Commercial system down; business cannot operate.",
          responseTarget: "Same day.",
          blockBooking: false,
        },
      },
      {
        name: "find_slots",
        atSec: 96,
        ms: 231,
        args: { town: "Bozeman", priority: "P1", preferredTimeOfDay: "afternoon" },
        result: {
          slots: [
            { slotId: "tech-noor-1500", techId: "tech-noor", techName: "Noor Haddad", startsAt: "2026-09-03T21:00:00.000Z", endsAt: "2026-09-03T23:00:00.000Z", spoken: "today between 3 and 5 in the afternoon" },
          ],
        },
      },
      {
        name: "book_appointment",
        atSec: 168,
        ms: 203,
        args: {
          slotId: "tech-noor-1500",
          customerName: "Cold Smoke Coffee",
          phone: "+14065550151",
          addressLine: "212 East Main Street",
          town: "Bozeman",
          accessNotes: "Back entrance off the alley; ask for the shift lead",
          issueSummary: "Rooftop unit down, kitchen unusable, business cannot operate.",
        },
        result: {
          status: "confirmed",
          bookingId: "bk-9919",
          spoken: "You're all set — a technician will be out to 212 East Main Street in that window.",
        },
      },
      { name: "end_call", atSec: 201, ms: 3, args: { outcome: "booked" }, result: { ok: true } },
    ],
  }),

  build({
    id: "call-1099",
    startedSecondsAgo: 143 * 60,
    lengthSec: 176,
    fromNumber: "+14065550107",
    callerName: null,
    customerId: null,
    town: "Ennis",
    county: "Madison",
    priority: "P2",
    priorityResult: {
      tier: "P2",
      reason: "System is down with no aggravating factors.",
      responseTarget: "Next business day.",
      blockBooking: false,
    },
    outcome: "booked",
    summary: "Furnace short-cycling in Ennis, house not holding temperature. Booked tomorrow morning with Elias.",
    sentiment: "calm",
    facts: {
      propertyType: "residential",
      issue: "poor_performance",
      systemDown: true,
      hazard: "none",
      vulnerableOccupant: false,
      town: "Ennis",
      outdoorTempF: 27,
    },
    turns: [
      ["agent", "Thanks for calling Summit Air. What's going on with your system?"],
      ["caller", "The furnace keeps starting and shutting off after about a minute. House won't hold temperature."],
      ["agent", "Short-cycling — that's a real one. Is it running at all right now, or is it fully off?"],
      ["caller", "It tries. It just won't stay on."],
      ["agent", "Any gas smell or CO alarm?"],
      ["caller", "Nope."],
      ["agent", "Let me pull up the schedule. Elias covers Ennis — I can do tomorrow between eight and ten in the morning."],
      ["caller", "That's fine."],
      ["agent", "Booked. Fourteen Jack Creek Road, Ennis. You're set."],
    ],
    trace: [
      { name: "lookup_customer", atSec: 2, ms: 35, args: { phone: "+14065550107" }, result: null },
      { name: "check_service_area", atSec: 12, ms: 9, args: { town: "Ennis" }, result: { covered: true, town: "Ennis", county: "Madison" } },
      {
        name: "assess_situation",
        atSec: 64,
        ms: 2,
        args: { propertyType: "residential", issue: "poor_performance", systemDown: true, hazard: "none", vulnerableOccupant: false, town: "Ennis" },
        result: { tier: "P2", reason: "System is down with no aggravating factors.", responseTarget: "Next business day.", blockBooking: false },
      },
      {
        name: "find_slots",
        atSec: 88,
        ms: 198,
        args: { town: "Ennis", priority: "P2", preferredTimeOfDay: "morning" },
        result: {
          slots: [
            { slotId: "tech-elias-0800", techId: "tech-elias", techName: "Elias Brandt", startsAt: "2026-09-04T14:00:00.000Z", endsAt: "2026-09-04T16:00:00.000Z", spoken: "tomorrow between 8 and 10 in the morning" },
          ],
        },
      },
      {
        name: "book_appointment",
        atSec: 140,
        ms: 176,
        args: {
          slotId: "tech-elias-0800",
          customerName: "Hannah Reyes-Ito",
          phone: "+14065550107",
          addressLine: "14 Jack Creek Road",
          town: "Ennis",
          issueSummary: "Furnace short-cycling, not holding temperature.",
        },
        result: { status: "confirmed", bookingId: "bk-9915", spoken: "You're all set — a technician will be out to 14 Jack Creek Road in that window." },
      },
      { name: "end_call", atSec: 173, ms: 3, args: { outcome: "booked" }, result: { ok: true } },
    ],
  }),

  build({
    id: "call-1098",
    startedSecondsAgo: 191 * 60,
    lengthSec: 122,
    fromNumber: "+14065550188",
    callerName: null,
    customerId: null,
    town: "Butte",
    county: null,
    priority: "P3",
    priorityResult: {
      tier: "P3",
      reason: "Non-urgent service request.",
      responseTarget: "Next available routine appointment.",
      blockBooking: false,
    },
    outcome: "callback",
    summary: "Butte is outside the service area. Logged a callback so a human can refer them rather than dead-ending the caller.",
    sentiment: "calm",
    facts: {
      propertyType: "residential",
      issue: "poor_performance",
      systemDown: false,
      hazard: "none",
      vulnerableOccupant: false,
      town: "Butte",
    },
    turns: [
      ["agent", "Thanks for calling Summit Air. What's going on with your system?"],
      ["caller", "One of my upstairs rooms never gets warm. I'm over in Butte."],
      ["agent", "Let me check whether we cover you."],
      ["agent", "We're Gallatin, Park and Madison counties — Bozeman, Belgrade, Manhattan, Three Forks, Big Sky, Livingston and Ennis. Butte is outside that, so I can't send a technician."],
      ["caller", "Ah, alright."],
      ["agent", "What I can do is take your number and have someone here call you back with a referral to a shop that covers Butte. Would that help?"],
      ["caller", "Sure, that'd be great."],
      ["agent", "Done — someone will get back to you. Sorry I couldn't do more today."],
    ],
    trace: [
      { name: "lookup_customer", atSec: 2, ms: 33, args: { phone: "+14065550188" }, result: null },
      {
        name: "check_service_area",
        atSec: 26,
        ms: 11,
        args: { town: "Butte" },
        result: {
          covered: false,
          town: "Butte",
          message: "We cover Gallatin, Park and Madison counties — Bozeman, Belgrade, Manhattan, Three Forks, Big Sky, Livingston and Ennis.",
        },
      },
      {
        name: "save_callback_request",
        atSec: 98,
        ms: 51,
        args: {
          phone: "+14065550188",
          reason: "out_of_area",
          notes: "Butte. Upstairs room not heating. Wants a referral to a shop that covers Silver Bow County.",
        },
        result: { status: "saved", requestId: "cb-4468" },
      },
      { name: "end_call", atSec: 119, ms: 3, args: { outcome: "callback" }, result: { ok: true } },
    ],
  }),

  build({
    id: "call-1097",
    startedSecondsAgo: 246 * 60,
    lengthSec: 233,
    fromNumber: "+14065550164",
    callerName: "Tomasz Bielak",
    customerId: "cust-tomasz",
    town: "Big Sky",
    county: "Gallatin",
    priority: "P3",
    priorityResult: {
      tier: "P3",
      reason: "Routine maintenance.",
      responseTarget: "Next available routine appointment.",
      blockBooking: false,
    },
    outcome: "booked",
    summary: "Maintenance-member pre-season furnace check in Big Sky. Booked Friday afternoon with Josh.",
    sentiment: "calm",
    facts: {
      propertyType: "residential",
      issue: "maintenance",
      systemDown: false,
      hazard: "none",
      vulnerableOccupant: false,
      town: "Big Sky",
      outdoorTempF: 33,
    },
    turns: [
      ["agent", "Thanks for calling Summit Air. What can I do for you?"],
      ["caller", "I'm on the maintenance plan — I'd like to get the furnace looked at before it gets properly cold."],
      ["agent", "Good timing. Nothing wrong with it right now, no odd noises or smells?"],
      ["caller", "No, it's fine. Just want it checked."],
      ["agent", "Let me pull up the schedule. I've got Friday afternoon, between one and three, in Big Sky."],
      ["caller", "Friday afternoon works."],
      ["agent", "Booked. Seven twenty-one Lone Peak Drive. Josh will be out then."],
    ],
    trace: [
      {
        name: "lookup_customer",
        atSec: 2,
        ms: 42,
        args: { phone: "+14065550164" },
        result: {
          id: "cust-tomasz",
          name: "Tomasz Bielak",
          phone: "+14065550164",
          addressLine: "721 Lone Peak Drive",
          town: "Big Sky",
          county: "Gallatin",
          isMaintenanceMember: true,
          vulnerableOccupant: false,
          lastServiceAt: "2026-04-02T00:00:00-06:00",
        },
      },
      {
        name: "assess_situation",
        atSec: 52,
        ms: 2,
        args: { propertyType: "residential", issue: "maintenance", systemDown: false, hazard: "none", vulnerableOccupant: false, town: "Big Sky" },
        result: { tier: "P3", reason: "Routine maintenance.", responseTarget: "Next available routine appointment.", blockBooking: false },
      },
      {
        name: "find_slots",
        atSec: 88,
        ms: 187,
        args: { town: "Big Sky", priority: "P3", preferredTimeOfDay: "afternoon" },
        result: {
          slots: [
            { slotId: "tech-josh-1300", techId: "tech-josh", techName: "Josh Tiller", startsAt: "2026-09-05T19:00:00.000Z", endsAt: "2026-09-05T21:00:00.000Z", spoken: "Friday between 1 and 3 in the afternoon" },
          ],
        },
      },
      {
        name: "book_appointment",
        atSec: 196,
        ms: 165,
        args: {
          slotId: "tech-josh-1300",
          customerName: "Tomasz Bielak",
          phone: "+14065550164",
          addressLine: "721 Lone Peak Drive",
          town: "Big Sky",
          issueSummary: "Pre-season maintenance check, no fault reported.",
        },
        result: { status: "confirmed", bookingId: "bk-9908", spoken: "You're all set — a technician will be out to 721 Lone Peak Drive in that window." },
      },
      { name: "end_call", atSec: 230, ms: 3, args: { outcome: "booked" }, result: { ok: true } },
    ],
  }),

  build({
    id: "call-1096",
    startedSecondsAgo: 288 * 60,
    lengthSec: 209,
    fromNumber: "+14065550135",
    callerName: null,
    customerId: null,
    town: "Manhattan",
    county: "Gallatin",
    priority: "P2",
    priorityResult: {
      tier: "P2",
      reason: "System is down with no aggravating factors.",
      responseTarget: "Next business day.",
      blockBooking: false,
    },
    outcome: "callback",
    summary: "find_slots timed out mid-call. Agent took the number and logged a callback instead of inventing a booking.",
    sentiment: "frustrated",
    facts: {
      propertyType: "residential",
      issue: "no_heat",
      systemDown: true,
      hazard: "none",
      vulnerableOccupant: false,
      town: "Manhattan",
      outdoorTempF: 28,
    },
    turns: [
      ["agent", "Thanks for calling Summit Air. What's going on with your system?"],
      ["caller", "No heat since yesterday evening. Nothing at all out of the vents."],
      ["agent", "Any gas smell or a CO alarm going off?"],
      ["caller", "No."],
      ["agent", "Let me pull up the schedule."],
      ["agent", "I'm sorry — our scheduling system isn't responding for me right now. I don't want to tell you a time I can't guarantee. Can I take your number and have someone call you straight back?"],
      ["caller", "I guess. How long?"],
      ["agent", "It'll be flagged as a same-day callback. Someone will have the schedule in front of them. Sorry about this."],
    ],
    trace: [
      { name: "lookup_customer", atSec: 2, ms: 39, args: { phone: "+14065550135" }, result: null },
      {
        name: "assess_situation",
        atSec: 44,
        ms: 2,
        args: { propertyType: "residential", issue: "no_heat", systemDown: true, hazard: "none", vulnerableOccupant: false, town: "Manhattan" },
        result: { tier: "P2", reason: "System is down with no aggravating factors.", responseTarget: "Next business day.", blockBooking: false },
      },
      {
        name: "find_slots",
        atSec: 79,
        ms: 8014,
        error: "scheduling query timed out after 8000ms",
        args: { town: "Manhattan", priority: "P2", preferredTimeOfDay: "any" },
        result: {
          error: "scheduling query timed out after 8000ms",
          guidance:
            "This tool is unavailable. Apologize briefly, take the caller's number, and call save_callback_request. Do not tell them an appointment is confirmed.",
        },
      },
      {
        name: "save_callback_request",
        atSec: 168,
        ms: 47,
        args: {
          phone: "+14065550135",
          reason: "tool_failure",
          notes: "No heat, system fully down, Manhattan. find_slots timed out. Same-day callback — caller is already unhappy about the wait.",
        },
        result: { status: "saved", requestId: "cb-4462" },
      },
      { name: "end_call", atSec: 206, ms: 3, args: { outcome: "callback" }, result: { ok: true } },
    ],
  }),

  build({
    id: "call-1095",
    startedSecondsAgo: 331 * 60,
    lengthSec: 24,
    fromNumber: "+14065550129",
    callerName: null,
    customerId: null,
    town: null,
    county: null,
    priority: null,
    priorityResult: null,
    outcome: "no_action",
    summary: "Wrong number. Caller was looking for a plumber.",
    sentiment: "calm",
    facts: null,
    turns: [
      ["agent", "Thanks for calling Summit Air. What's going on with your system?"],
      ["caller", "Oh — sorry, I was trying to reach a plumber. Wrong number."],
      ["agent", "No problem at all. We're heating and cooling only. Have a good one."],
    ],
    trace: [
      { name: "lookup_customer", atSec: 2, ms: 34, args: { phone: "+14065550129" }, result: null },
      { name: "end_call", atSec: 21, ms: 3, args: { outcome: "no_action" }, result: { ok: true } },
    ],
  }),
];

/* ------------------------------------------------------------------ *
 * Bookings for the schedule grid.
 *
 * [dayOffset, startHour (Denver), techIndex, priority, customer, town, county,
 *  issue]. Windows are two hours. No tech holds two overlapping windows — the
 * same thing the `bookings_no_overlap` EXCLUDE constraint guarantees in
 * Postgres, which is what this grid exists to make visible.
 * ------------------------------------------------------------------ */

type BookingSeed = [number, number, number, Priority, string, string, County, string];

const BOOKING_SEEDS: BookingSeed[] = [
  [0, 13, 0, "P1", "Dave Whitaker", "Bozeman", "Gallatin", "No heat, blower not running. 84-year-old occupant on site."],
  [0, 15, 5, "P1", "Cold Smoke Coffee", "Bozeman", "Gallatin", "Rooftop unit down, kitchen unusable."],
  [0, 15, 1, "P2", "Owen Fitzgerald", "Belgrade", "Gallatin", "Furnace not igniting on call for heat."],
  [0, 10, 3, "P2", "Marisol Vega", "Livingston", "Park", "Boiler losing pressure overnight."],

  [1, 8, 4, "P2", "Hannah Reyes-Ito", "Ennis", "Madison", "Furnace short-cycling, not holding temperature."],
  [1, 8, 0, "P2", "Gerald Nakamura", "Bozeman", "Gallatin", "Intermittent no-heat, suspect flame sensor."],
  [1, 10, 0, "P3", "Beth Ann Corrigan", "Bozeman", "Gallatin", "Annual furnace service, maintenance plan."],
  [1, 10, 2, "P2", "Sylvain Ouellet", "Belgrade", "Gallatin", "Weak airflow on the upper floor."],
  [1, 13, 1, "P2", "Rana Farouk", "Manhattan", "Gallatin", "Thermostat not driving the furnace."],
  [1, 15, 3, "P3", "Willa Osterberg", "Livingston", "Park", "Pre-season check, no fault reported."],

  [2, 8, 1, "P2", "Cody Ferrell", "Three Forks", "Gallatin", "Furnace runs but the house stays cold."],
  [2, 10, 5, "P2", "Bridger Peak Dental", "Bozeman", "Gallatin", "Two zones not cooling; waiting room unusable."],
  [2, 10, 4, "P3", "Anneke de Vries", "West Yellowstone", "Madison", "Maintenance plan visit."],
  [2, 13, 0, "P2", "Luis Ontiveros", "Bozeman", "Gallatin", "Furnace tripping the breaker."],
  [2, 15, 2, "P3", "Kelsey Braun", "Belgrade", "Gallatin", "Filter service and duct inspection."],

  [3, 8, 3, "P2", "Ivor Blackfeather", "Livingston", "Park", "No heat in the shop building."],
  [3, 10, 0, "P3", "Tomasz Bielak", "Big Sky", "Gallatin", "Pre-season maintenance check."],
  [3, 13, 2, "P3", "Marguerite Salois", "Bozeman", "Gallatin", "Humidifier not running with the furnace."],
  [3, 13, 5, "P2", "Gallatin Valley Storage", "Belgrade", "Gallatin", "Office unit blowing warm air."],
  [3, 15, 1, "P2", "Yusuf Adeyemi", "Bozeman", "Gallatin", "Furnace noisy on startup."],

  [4, 8, 4, "P3", "Cheyenne Wolf Tail", "Ennis", "Madison", "Annual service, maintenance plan."],
  [4, 10, 1, "P2", "Priscilla Hardaway", "Manhattan", "Gallatin", "Uneven heat between floors."],
  [4, 13, 2, "P3", "Bridger Fabrication", "Bozeman", "Gallatin", "Warehouse unit heater service."],
  [4, 15, 0, "P2", "Nadia Vukovic", "Bozeman", "Gallatin", "Furnace shutting down after 20 minutes."],
];

/**
 * Built per call rather than at module load: the day offsets are relative to
 * now, so a demo left running overnight still shows the next five days.
 */
export function seedBookings(from: Date = new Date()): Booking[] {
  return BOOKING_SEEDS.map(
    ([dayOffset, hour, techIdx, priority, customerName, town, county, issueSummary], i) => {
      const startsAt = denverInstant(dayOffset, hour, from);
      const endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
      return {
        id: `bk-seed-${i + 1}`,
        techId: TECHS[techIdx].id,
        customerName,
        town,
        county,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        priority,
        issueSummary,
        status: "confirmed" as const,
        callId: null,
      };
    },
  );
}
