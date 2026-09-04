import { CONTEXT } from "./context";
import { EXAMPLES } from "./examples";
import { IDENTITY } from "./identity";
import { SAFETY } from "./safety";
import { OBJECTIVES } from "./objectives";
import { STYLE } from "./style";
import type { CustomerRecord } from "../tools/schemas";

/**
 * Runtime state injected per turn. Deliberately NOT baked into the static
 * prompt: the static half is what gets deployed to Vapi, the dynamic half is
 * what the runtime appends each turn.
 */
export interface CallContext {
  now: Date;
  callerPhone?: string;
  knownCustomer?: CustomerRecord | null;
  outdoorTempF?: number;
  /** Required fields not yet collected. Tracked in code, not by the model. */
  stillNeeded?: string[];
}

/** The static system prompt. This is what deploy-assistant.ts pushes to Vapi. */
export function systemPrompt(): string {
  return [SAFETY, IDENTITY, CONTEXT, OBJECTIVES, STYLE, EXAMPLES].join("\n\n");
}

const MOUNTAIN = "America/Denver";

/**
 * Per-turn state, appended after the static prompt.
 *
 * Note the absence of any month-based seasonality: urgency comes from
 * outdoorTempF and what the caller reports, never from the calendar. The demo
 * runs in September and the canonical scenario is January.
 */
export function turnContext(ctx: CallContext): string {
  const lines: string[] = [];

  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: MOUNTAIN,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(ctx.now);
  lines.push(`Current local time: ${local} (Mountain Time).`);

  if (typeof ctx.outdoorTempF === "number") {
    lines.push(`Current outdoor temperature: ${Math.round(ctx.outdoorTempF)}°F.`);
  }

  if (ctx.knownCustomer) {
    const c = ctx.knownCustomer;
    lines.push(
      `Known customer: ${c.name}, ${c.addressLine}, ${c.town}.` +
        (c.isMaintenanceMember ? " Maintenance plan member." : "") +
        (c.accessNotes ? ` Access notes on file: ${c.accessNotes}` : ""),
    );
    lines.push("Greet them by name and confirm this address rather than re-asking.");
  } else if (ctx.callerPhone) {
    lines.push(
      "No customer on file for this number. Run full intake and do not mention that the number was unrecognized.",
    );
  }

  if (ctx.stillNeeded?.length) {
    lines.push(`Still needed before you can book: ${ctx.stillNeeded.join(", ")}.`);
  } else if (ctx.stillNeeded) {
    lines.push("All required details collected. Move to booking.");
  }

  return lines.join("\n");
}
