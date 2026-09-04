/**
 * The database-backed ToolHandlers.
 *
 * Nothing here imports Vapi, Next, or any other transport: the same object is
 * driven by the phone webhook and by the text eval harness, which is what makes
 * an eval score mean something about a real call.
 *
 * To put these on the phone, change one line in app/api/vapi/tools/route.ts:
 *
 *   import { handlers as dbHandlers } from "../../../../agent/tools/handlers";
 *   const handlers: ToolHandlers = dbHandlers;
 */
import type { ToolHandlers } from "../schemas";
import { assessSituation } from "./assessSituation";
import { bookAppointment } from "./bookAppointment";
import { checkServiceArea } from "./checkServiceArea";
import { type HandlerDeps, defaultRepository } from "./deps";
import { endCall } from "./endCall";
import { escalateEmergency } from "./escalateEmergency";
import { findSlots } from "./findSlots";
import { lookupCustomer } from "./lookupCustomer";
import { saveCallbackRequest } from "./saveCallbackRequest";

export function createHandlers(deps: HandlerDeps): ToolHandlers {
  return {
    lookup_customer: lookupCustomer(deps),
    check_service_area: checkServiceArea(deps),
    assess_situation: assessSituation(deps),
    escalate_emergency: escalateEmergency(deps),
    find_slots: findSlots(deps),
    book_appointment: bookAppointment(deps),
    save_callback_request: saveCallbackRequest(deps),
    end_call: endCall(deps),
  };
}

/**
 * The instance the webhook uses. Constructing it is cheap — the Supabase client
 * is lazy and no connection is opened until a tool is actually called.
 */
export const handlers: ToolHandlers = createHandlers({
  repo: defaultRepository(),
  now: () => new Date(),
});

export type { HandlerDeps } from "./deps";
export { createInMemoryRepository } from "./memoryRepository";
export { createSupabaseRepository } from "./supabaseRepository";
export type { DispatchRepository } from "./repository";
