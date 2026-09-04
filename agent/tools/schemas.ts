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
      "Check whether a town is inside the service area. Call before offering any appointment. Never guess coverage.",
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
      "Find available arrival windows. Say something like 'let me pull up the schedule' BEFORE calling this so the caller is not left in silence.",
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
      "Book a confirmed appointment in one of the slots returned by find_slots. Only call this once the caller has verbally agreed to a specific window and you have read their address back to them. If it returns a conflict, apologize briefly and offer the alternatives it returns.",
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
      "Record a request for a human to call back. Use for: out-of-area callers, no slot matching their availability, a caller who asks for a person, an upset caller, or any tool failure. This is the graceful-failure path — never invent a booking instead.",
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

  end_call: {
    name: "end_call",
    description:
      "End the call. Call this after you have confirmed a booking, completed an escalation, or logged a callback request and said goodbye.",
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
  end_call(a: { outcome: "booked" | "escalated" | "callback" | "no_action" }): Promise<{ ok: true }>;
}
