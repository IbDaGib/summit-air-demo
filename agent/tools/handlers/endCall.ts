/**
 * record_call_outcome — records how the call finished.
 *
 * The outcome is the row the dashboard counts, so it is logged even though the
 * tool itself does nothing else.
 */
import type { ToolHandlers } from "../schemas";
import { type HandlerDeps, logEvent } from "./deps";

export function endCall(deps: HandlerDeps): ToolHandlers["record_call_outcome"] {
  return async ({ outcome }): Promise<{ ok: true }> => {
    logEvent("record_call_outcome", { outcome, at: deps.now().toISOString() });
    return { ok: true };
  };
}
