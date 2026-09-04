/**
 * find_slots — the offerable arrival windows for a town and a tier.
 *
 * All of the scheduling rules live in the pure buildSlots; this handler is the
 * part that talks to the database and turns an empty result into a sentence the
 * agent can say.
 */
import { resolveTown } from "../../policy/serviceArea";
import type { Priority } from "../../policy/types";
import type { Slot, ToolHandlers } from "../schemas";
import { type HandlerDeps, logEvent, logFailure } from "./deps";
import { buildSlots, horizonFor } from "./scheduling";
import { addDays, calendarDayOf, zonedTimeToInstant } from "./time";

export interface SlotSearch {
  town: string;
  priority: Priority;
  earliestDate?: string;
  preferredTimeOfDay?: "morning" | "afternoon" | "any";
  limit?: number;
  /** Windows already known to be taken, e.g. the one that just lost a race. */
  exclude?: string[];
}

/**
 * Load the diary and compute windows. Shared with book_appointment so the
 * alternatives offered after a conflict come from exactly the same rules as the
 * original offer.
 */
export async function loadSlots(deps: HandlerDeps, search: SlotSearch): Promise<Slot[]> {
  const match = resolveTown(search.town ?? "");
  if (!match) return [];

  const now = deps.now();
  const horizon = horizonFor(search.priority);
  const from = zonedTimeToInstant(addDays(calendarDayOf(now), horizon.startOffset), 0);
  const to = zonedTimeToInstant(addDays(calendarDayOf(now), horizon.endOffset + 1), 0);

  const techs = await deps.repo.listTechs(match.county);
  if (techs.length === 0) return [];

  const [busy, holidays] = await Promise.all([
    deps.repo.listBusyWindows(
      techs.map((t) => t.id),
      from,
      to,
    ),
    deps.repo.listHolidays(from, to),
  ]);

  const excluded = new Set(search.exclude ?? []);
  return buildSlots({
    techs,
    busy,
    holidays,
    priority: search.priority,
    now,
    earliestDate: search.earliestDate,
    preferredTimeOfDay: search.preferredTimeOfDay,
    limit: (search.limit ?? 4) + excluded.size,
  })
    .filter((slot) => !excluded.has(slot.slotId))
    .slice(0, search.limit ?? 4);
}

export function findSlots(deps: HandlerDeps): ToolHandlers["find_slots"] {
  return async ({ town, priority, earliestDate, preferredTimeOfDay }) => {
    // P0 blocks booking, so there is nothing to shop for. Refusing here means
    // the escalation path cannot be walked back into a scheduling conversation.
    if (priority === "P0") {
      logFailure("find_slots_refused_p0", { town });
      return {
        slots: [],
        message:
          "This is a P0 life-safety call. Call escalate_emergency, read the instructions and end the call. Do not offer an appointment.",
      };
    }

    const match = resolveTown(town ?? "");
    if (!match) {
      return {
        slots: [],
        message: `${town} is outside the service area — offer a callback instead of a window.`,
      };
    }

    try {
      const slots = await loadSlots(deps, { town, priority, earliestDate, preferredTimeOfDay });
      logEvent("find_slots", {
        town: match.town,
        county: match.county,
        priority,
        preferredTimeOfDay,
        returned: slots.length,
      });

      if (slots.length > 0) return { slots };

      // A preference that finds nothing is worth one more look before giving
      // up — "nothing on a morning, but I have two afternoons" is a better turn
      // than "nothing at all".
      if (preferredTimeOfDay && preferredTimeOfDay !== "any") {
        const relaxed = await loadSlots(deps, { town, priority, earliestDate });
        if (relaxed.length > 0) {
          return {
            slots: relaxed,
            message: `Nothing free ${
              preferredTimeOfDay === "morning" ? "in the mornings" : "in the afternoons"
            }. These are the next windows — offer them, and if none work, log a callback.`,
          };
        }
      }

      return {
        slots: [],
        message:
          "No arrival windows available in that range. Apologise, take the caller's number and log a callback rather than promising a time.",
      };
    } catch (error) {
      logFailure("find_slots_failed", {
        town,
        priority,
        message: error instanceof Error ? error.message : String(error),
      });
      return {
        slots: [],
        message:
          "The schedule is unavailable right now. Do not invent a time — apologise briefly, take the caller's number and call save_callback_request.",
      };
    }
  };
}
