/**
 * save_callback_request — the graceful-failure path.
 *
 * Every other tool can fall back to this one, so this one has nowhere to fall
 * back to. If the write fails it is retried once and then written to the error
 * log in full, and the handler still reports success — because at that point
 * the lead genuinely is captured, in the log drain rather than the table, and
 * telling the caller "someone will ring you back" is true. Silently returning a
 * failure here would mean an agent apologising in a loop while a real lead
 * evaporates.
 */
import type { ToolHandlers } from "../schemas";
import { type HandlerDeps, logEvent, logFailure } from "./deps";

export function saveCallbackRequest(deps: HandlerDeps): ToolHandlers["save_callback_request"] {
  return async (input): Promise<{ status: "saved"; requestId: string }> => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { requestId } = await deps.repo.createCallbackRequest(input);
        logEvent("callback_request", { requestId, reason: input.reason, attempt });
        return { status: "saved", requestId };
      } catch (error) {
        logFailure("callback_request_write_failed", {
          attempt,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const requestId = `callback-log-${deps.now().getTime()}`;
    logFailure("callback_request_log_only", {
      requestId,
      ...input,
      note: "Not persisted to callback_requests. This log line IS the lead — replay it.",
    });
    return { status: "saved", requestId };
  };
}
