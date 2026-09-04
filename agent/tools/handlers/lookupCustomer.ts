/**
 * lookup_customer — recognise a returning caller from their caller ID.
 *
 * Caller identity is established by the carrier, never by the model.
 * app/api/vapi/tools/route.ts overwrites `args.phone` with
 * `message.call.customer.number` before this handler runs, so the number here
 * is carrier-verified by the time we see it.
 *
 * The two guards below are defence in depth for that, both from a live call
 * where the model invented `phone: "unknown"`:
 *
 *  1. A number shorter than ten digits is refused. The original bug was
 *     `"unknown"` normalising to `""` and `endsWith("")` being true for every
 *     customer, so the agent greeted a stranger by a real customer's name.
 *  2. Property-access notes are stripped from the result. A gate code is for
 *     the technician on the ticket, not for the model's context window — the
 *     agent has no reason to know it and every reason not to say it out loud.
 *     book_appointment reattaches them server-side.
 */
import type { CustomerRecord, ToolHandlers } from "../schemas";
import { type HandlerDeps, logEvent, logFailure, maskPhone } from "./deps";
import { phoneKey } from "./repository";

/** A national number, at minimum. Anything shorter is not an identity. */
export const MINIMUM_PHONE_DIGITS = 10;

export function lookupCustomer(deps: HandlerDeps): ToolHandlers["lookup_customer"] {
  return async ({ phone }): Promise<CustomerRecord | null> => {
    const digits = (phone ?? "").replace(/\D/g, "");
    if (digits.length < MINIMUM_PHONE_DIGITS) {
      logFailure("lookup_customer_rejected", {
        reason: "phone shorter than a national number — not a verified identity",
        digits: digits.length,
      });
      return null;
    }

    try {
      const customer = await deps.repo.findCustomerByPhone(phone);
      logEvent("lookup_customer", {
        matched: Boolean(customer),
        customerId: customer?.id,
        phone: maskPhone(phone),
      });
      if (!customer) return null;

      // accessNotes is dropped on purpose; callerPhone is echoed so the agent
      // can read the number back when a caller asks it to.
      const { accessNotes: _withheld, ...safe } = customer;
      return { ...safe, callerPhone: phone };
    } catch (error) {
      // A lookup failure must not end the call. Returning null sends the agent
      // down the full-intake path, which collects everything anyway — the cost
      // is thirty seconds of the caller's time, not a lost booking.
      logFailure("lookup_customer_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };
}

/** Exported for book_appointment, which reattaches the notes it withholds here. */
export async function storedAccessNotes(
  deps: HandlerDeps,
  phone: string,
  addressLine: string,
): Promise<string | undefined> {
  if (phoneKey(phone).length < MINIMUM_PHONE_DIGITS) return undefined;
  try {
    const customer = await deps.repo.findCustomerByPhone(phone);
    if (!customer?.accessNotes) return undefined;
    // Only for the address actually being booked. book_appointment's phone
    // argument comes from the model, not the carrier, so a mismatched number
    // must not drag another property's gate code onto this ticket.
    const same = (a: string) => a.trim().toLowerCase().replace(/\s+/g, " ");
    return same(customer.addressLine) === same(addressLine) ? customer.accessNotes : undefined;
  } catch {
    return undefined;
  }
}
