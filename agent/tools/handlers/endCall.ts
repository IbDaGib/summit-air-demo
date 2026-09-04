/**
 * end_call — records how the call finished.
 *
 * The outcome is the row the dashboard counts, so it is logged even though the
 * tool itself does nothing else.
 */
import type { ToolHandlers } from "../schemas";
import { type HandlerDeps, logEvent } from "./deps";

export function endCall(deps: HandlerDeps): ToolHandlers["end_call"] {
  return async ({ outcome }): Promise<{ ok: true }> => {
    logEvent("end_call", { outcome, at: deps.now().toISOString() });
    return { ok: true };
  };
}
