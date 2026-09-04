/**
 * book_appointment — the only handler that writes something the caller is told
 * to rely on, so it is the one that must never throw into the call.
 *
 * Four refusals, in order:
 *  1. a hazard described in the free text it was handed;
 *  2. a P0 slot id — an escalated call does not end in a booking;
 *  3. a town we do not cover;
 *  4. the database rejecting the overlap (SQLSTATE 23P01), which is not an
 *     error condition but the constraint doing its job.
 *
 * ON ESCALATION STATE (Greptile, PR #2): "escalation is terminal" is enforced
 * at the route boundary by agent/tools/callState.ts, which keys on Vapi's call
 * id and blocks find_slots and book_appointment outright once
 * escalate_emergency has fired. That is the right place for it — a tool handler
 * receives no call id and so cannot know. This handler deliberately does NOT
 * keep a second copy of that state; the two checks below are stateless
 * defence in depth for drivers that do not go through the route, such as the
 * eval harness.
 */
import { scanForHazard } from "../../policy/safetyScan";
import { resolveTown } from "../../policy/serviceArea";
import type { BookingResult, ToolHandlers } from "../schemas";
import { type HandlerDeps, logEvent, logFailure, maskPhone } from "./deps";
import { loadSlots } from "./findSlots";
import { storedAccessNotes } from "./lookupCustomer";
import { decodeSlotId } from "./scheduling";
import { spokenWindow } from "./time";

export function bookAppointment(deps: HandlerDeps): ToolHandlers["book_appointment"] {
  return async (args): Promise<BookingResult> => {
    try {
      // 1. Life safety outranks the booking, whatever the model decided.
      // Stateless: it can only see the text of this call. The authoritative,
      // stateful check lives in callState.ts at the route boundary.
      const hazard = scanForHazard(`${args.issueSummary ?? ""}. ${args.accessNotes ?? ""}`);
      if (hazard !== "none") {
        logFailure("booking_refused_hazard", { hazard, phone: maskPhone(args.phone) });
        return {
          status: "error",
          message:
            "This call describes a life-safety hazard. Call escalate_emergency and do not book an appointment.",
        };
      }

      // 2. Coverage. The county column is not nullable, and we do not guess it.
      const match = resolveTown(args.town ?? "");
      if (!match) {
        return {
          status: "error",
          message: `${args.town} is outside the service area. Log a callback instead of booking.`,
        };
      }

      const slot = decodeSlotId(args.slotId ?? "");
      if (!slot) {
        return {
          status: "error",
          message:
            "That slot id is not one find_slots returned. Call find_slots again and offer a window from the result.",
        };
      }

      if (slot.priority === "P0") {
        logFailure("booking_refused_p0", { slotId: args.slotId });
        return {
          status: "error",
          message:
            "This is a P0 life-safety call. Call escalate_emergency instead — a call that escalated does not end in a booking.",
        };
      }

      // A window that has already started cannot be promised.
      if (slot.startsAt.getTime() <= deps.now().getTime()) {
        const alternatives = await loadSlots(deps, {
          town: match.town,
          priority: slot.priority,
          exclude: [args.slotId],
        });
        return {
          status: "conflict",
          message: "That window has already started.",
          alternatives,
          spoken: alternatives.length
            ? `That window has already passed — the next one I have is ${alternatives[0].spoken}.`
            : "That window has already passed and I don't have another one to offer — let me take your number.",
        };
      }

      // lookup_customer withholds gate and lockbox notes from the model, so
      // reattach them here: the technician needs them on the ticket even though
      // the agent never saw them.
      const onFile = args.accessNotes
        ? undefined
        : await storedAccessNotes(deps, args.phone, args.addressLine);

      const result = await deps.repo.createBooking({
        techId: slot.techId,
        customerName: args.customerName,
        phone: args.phone,
        addressLine: args.addressLine,
        town: match.town,
        county: match.county,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        priority: slot.priority,
        issueSummary: args.issueSummary,
        accessNotes: args.accessNotes ?? onFile,
      });

      if (result.status === "conflict") {
        // The EXCLUDE constraint refused a double-booking. Recover inside the
        // conversation: another tech may still be free for the same window.
        const alternatives = await loadSlots(deps, {
          town: match.town,
          priority: slot.priority,
          exclude: [args.slotId],
        });
        logEvent("booking_conflict", {
          slotId: args.slotId,
          town: match.town,
          alternatives: alternatives.length,
        });
        return {
          status: "conflict",
          message: "That window was taken while we were talking.",
          alternatives,
          spoken: alternatives.length
            ? `I'm sorry — that window just went while we were talking. The next one I have is ${alternatives[0].spoken}. Does that work?`
            : "I'm sorry — that window just went while we were talking, and I don't have another one to offer today. Let me take your number and have someone call you straight back.",
        };
      }

      if (result.status === "error") {
        logFailure("booking_failed", { slotId: args.slotId, message: result.message });
        return {
          status: "error",
          message:
            "The booking did not save. Do not tell the caller it is confirmed — apologise, take their number and call save_callback_request.",
        };
      }

      const window = spokenWindow(slot.startsAt, slot.endsAt, deps.now());
      logEvent("booking_confirmed", {
        bookingId: result.bookingId,
        techId: slot.techId,
        priority: slot.priority,
        town: match.town,
        startsAt: slot.startsAt.toISOString(),
      });
      return {
        status: "confirmed",
        bookingId: result.bookingId,
        spoken: `You're all set. A technician will be out to ${args.addressLine} in ${match.town} ${window}.`,
      };
    } catch (error) {
      // Nothing above should reach here, but an unhandled throw would surface to
      // the caller as silence or a hang-up. Fail into the callback path instead.
      logFailure("booking_unhandled_error", {
        slotId: args.slotId,
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        status: "error",
        message:
          "The booking system is unavailable. Do not confirm anything — take the caller's number and call save_callback_request.",
      };
    }
  };
}
