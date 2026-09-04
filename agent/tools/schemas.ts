/**
 * Tool contracts — THE single source of truth.
 *
 * Owned by main. Do not edit in a workspace: handlers, the eval harness, and
 * scripts/deploy-assistant.ts all compile against these. Changing a shape here
 * breaks three workspaces at once.
 *
 * `parameters` is JSON Schema because that is what Vapi and the Anthropic/Mistral
 * tool APIs consume. The TS types below mirror it for the handlers.
 */

import type { County, Priority, SituationFacts } from "../policy/types";

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const obj = (
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

export const TOOL_SCHEMAS: Record<string, ToolSchema> = {
  lookup_customer: {
    name: "lookup_customer",
    description:
      "Look up the caller. Call this once at the start of every call. The phone number is supplied by the carrier and you do not need to know it — pass an empty string. The result always includes callerPhone, which you may read back if asked to confirm their number. If no customer is returned, run full intake without mentioning that the number was unrecognized.",
    parameters: obj({ phone: { type: "string" } }, ["phone"]),
  },

  check_service_area: {
    name: "check_service_area",
    description:
      "Check whether a town is inside the service area. Call this as soon as the caller names their town, and always before offering any appointment. Pass the town name ONLY — never a street number, never a full address, never a state. If the caller says '1569 Lone Mountain Trail, Big Sky', pass 'Big Sky'. Never guess coverage.",
    parameters: obj({ town: { type: "string" } }, ["town"]),
  },

  assess_situation: {
    name: "assess_situation",
    description:
      "Report the facts you have gathered and receive the dispatch priority. You do NOT decide the priority — this tool computes it. Call it as soon as you know the issue, whether the system is down, and whether anyone vulnerable is on site. If it returns blockBooking, follow the escalation path and do not offer an appointment.",
    parameters: obj(
      {
        propertyType: { type: "string", enum: ["residential", "commercial"] },
        issue: {
          type: "string",
          enum: [
            "no_heat",
            "no_cooling",
            "poor_performance",
            "noise_or_smell",
            "maintenance",
            "install_quote",
            "other",
          ],
        },
        systemDown: { type: "boolean" },
        hazard: {
          type: "string",
          enum: ["gas_smell", "co_alarm", "smoke_or_burning", "none"],
        },
        vulnerableOccupant: { type: "boolean" },
        occupantDetail: { type: "string" },
        town: { type: "string" },
        revenueStopped: { type: "boolean" },
      },
      ["propertyType", "issue", "systemDown", "hazard", "vulnerableOccupant"],
    ),
  },

  escalate_emergency: {
    name: "escalate_emergency",
    description:
      "Trigger the life-safety escalation path. Returns the exact instructions to read to the caller. Call this immediately on any gas smell, CO alarm, smoke, or burning smell — before collecting anything else. Do not book an appointment after calling this.",
    parameters: obj(
      {
        hazard: {
          type: "string",
          enum: ["gas_smell", "co_alarm", "smoke_or_burning"],
        },
        callbackPhone: { type: "string" },
        town: { type: "string" },
      },
      ["hazard"],
    ),
  },

  find_slots: {
    name: "find_slots",
    description:
      "Find available arrival windows. Call this only after assess_situation has returned a priority, and only for a town that check_service_area confirmed is covered. Do not call it to browse availability before you know the priority, and do not call it again for the same town and date once you have offered windows.",
    parameters: obj(
      {
        town: { type: "string" },
        priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
        earliestDate: {
          type: "string",
          description: "ISO date. Resolve relative dates before calling.",
        },
        preferredTimeOfDay: {
          type: "string",
          enum: ["morning", "afternoon", "any"],
        },
      },
      ["town", "priority"],
    ),
  },

  book_appointment: {
    name: "book_appointment",
    description:
      "Book a confirmed appointment in one of the slots returned by find_slots. Only call this once the caller has verbally agreed to a specific window and you have read their service address back to them. Do NOT call it on a call where escalate_emergency fired, do not call it with a slotId you did not receive from find_slots, and do not call it twice for one caller. When it returns status confirmed, your very next words to the caller must be the `spoken` field it returns, read back in your own cadence — the day, the window and the address. Do not call any other tool and do not say goodbye until the caller has heard that confirmation. If it returns a conflict, apologize briefly and offer the alternatives it returns.",
    parameters: obj(
      {
        slotId: { type: "string" },
        customerName: { type: "string" },
        phone: { type: "string" },
        addressLine: { type: "string" },
        town: { type: "string" },
        accessNotes: {
          type: "string",
          description:
            "Gate codes, lockbox, landmarks, or anything a tech needs to find or enter the property.",
        },
        issueSummary: { type: "string" },
      },
      ["slotId", "customerName", "phone", "addressLine", "town", "issueSummary"],
    ),
  },

  save_callback_request: {
    name: "save_callback_request",
    description:
      "Record a request for a human to call back. Call it as soon as you know a booking is not going to happen on this call: an out-of-area caller, no slot matching their availability, a caller who asks for a person, an upset caller, a billing or warranty question, or any tool failure. Do not end a call that reached none of the three valid endings without calling this. Never invent a booking instead.",
    parameters: obj(
      {
        customerName: { type: "string" },
        phone: { type: "string" },
        reason: { type: "string" },
        notes: { type: "string" },
      },
      ["phone", "reason"],
    ),
  },

  record_call_outcome: {
    name: "record_call_outcome",
    description:
      "Record how this call ended, for the dispatch ticket. This does NOT hang up — it only writes the outcome. Call it only after the caller has HEARD the result: for a booking, that means you have already told them the confirmed day, arrival window and address; for an escalation, the safety instructions; for a callback, that dispatch will ring them. Then use the separate endCall function to actually end the call. Never call this twice, and never say a filler phrase before it — on a real call the agent booked, skipped the confirmation, said 'this will just take a sec, goodbye' and hung up on a caller who never heard their appointment.",
    parameters: obj(
      { outcome: { type: "string", enum: ["booked", "escalated", "callback", "no_action"] } },
      ["outcome"],
    ),
  },
};

export const TOOL_LIST: ToolSchema[] = Object.values(TOOL_SCHEMAS);

/* ------------------------------------------------------------------ *
 * Handler I/O types. Workspace B implements exactly these signatures.
 * ------------------------------------------------------------------ */

export interface CustomerRecord {
  /** Carrier-supplied caller ID, echoed so the agent can confirm it aloud. */
  callerPhone?: string;
  id: string;
  name: string;
  phone: string;
  addressLine: string;
  town: string;
  county: County;
  isMaintenanceMember: boolean;
  vulnerableOccupant: boolean;
  accessNotes?: string;
  lastServiceAt?: string;
}

export interface ServiceAreaResult {
  covered: boolean;
  town: string;
  county?: County;
  /** Set when not covered, e.g. "We cover Gallatin, Park and Madison counties." */
  message?: string;
}

export interface Slot {
  slotId: string;
  techId: string;
  techName: string;
  /** ISO timestamps. */
  startsAt: string;
  endsAt: string;
  /** Caller-facing phrasing, e.g. "tomorrow between 8 and 10 in the morning". */
  spoken: string;
}

export interface BookingResult {
  status: "confirmed" | "conflict" | "error";
  bookingId?: string;
  spoken?: string;
  alternatives?: Slot[];
  message?: string;
}

export interface EscalationResult {
  /** Read this to the caller verbatim, in your own cadence. */
  instructions: string;
  incidentId: string;
}

export interface ToolHandlers {
  lookup_customer(a: { phone: string }): Promise<CustomerRecord | null>;
  check_service_area(a: { town: string }): Promise<ServiceAreaResult>;
  assess_situation(a: SituationFacts): Promise<import("../policy/types").PriorityResult>;
  escalate_emergency(a: {
    hazard: Exclude<import("../policy/types").Hazard, "none">;
    callbackPhone?: string;
    town?: string;
  }): Promise<EscalationResult>;
  find_slots(a: {
    town: string;
    priority: Priority;
    earliestDate?: string;
    preferredTimeOfDay?: "morning" | "afternoon" | "any";
  }): Promise<{ slots: Slot[]; message?: string }>;
  book_appointment(a: {
    slotId: string;
    customerName: string;
    phone: string;
    addressLine: string;
    town: string;
    accessNotes?: string;
    issueSummary: string;
  }): Promise<BookingResult>;
  save_callback_request(a: {
    customerName?: string;
    phone: string;
    reason: string;
    notes?: string;
  }): Promise<{ status: "saved"; requestId: string }>;
  record_call_outcome(a: { outcome: "booked" | "escalated" | "callback" | "no_action" }): Promise<{ ok: true }>;
}
