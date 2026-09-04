/**
 * lookup_customer — recognise a returning caller from their caller ID.
 */
import type { CustomerRecord, ToolHandlers } from "../schemas";
import { type HandlerDeps, logEvent, logFailure } from "./deps";

export function lookupCustomer(deps: HandlerDeps): ToolHandlers["lookup_customer"] {
  return async ({ phone }): Promise<CustomerRecord | null> => {
    try {
      const customer = await deps.repo.findCustomerByPhone(phone ?? "");
      logEvent("lookup_customer", { matched: Boolean(customer), customerId: customer?.id });
      return customer;
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
