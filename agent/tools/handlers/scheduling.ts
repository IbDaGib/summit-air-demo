/**
 * Arrival-window generation. Pure: techs, existing commitments, holidays and a
 * clock go in, offerable windows come out. No I/O, so every scheduling rule is
 * unit-testable and the same code answers find_slots and the conflict-recovery
 * path in book_appointment.
 */
import type { Priority } from "../../policy/types";
import type { BusyWindow, Tech } from "./repository";
import type { Slot } from "../schemas";
import {
  type CalendarDay,
  addDays,
  calendarDayOf,
  dateKeyOf,
  isWeekend,
  spokenWindow,
  zonedTimeToInstant,
} from "./time";

/** Two-hour arrival windows, Montana local. Techs are filtered against their shift. */
const WINDOW_STARTS = [8, 10, 13, 15];
const WINDOW_LENGTH_HOURS = 2;

/** Do not offer a window a dispatcher could not physically staff. */
const MINIMUM_LEAD_MINUTES = 60;

interface Horizon {
  /** Days ahead of today at which the search starts. 0 = today. */
  startOffset: number;
  /** Days ahead of today at which it stops. */
  endOffset: number;
  /** P1 work displaces the weekend; routine work does not. */
  includeWeekends: boolean;
}

/**
 * How far out to look, by tier. Urgent calls search from right now; routine
 * calls start tomorrow so today's remaining capacity stays free for emergencies.
 */
export function horizonFor(priority: Priority): Horizon {
  switch (priority) {
    case "P0":
    case "P1":
      return { startOffset: 0, endOffset: 2, includeWeekends: true };
    case "P2":
      return { startOffset: 0, endOffset: 5, includeWeekends: false };
    default:
      return { startOffset: 1, endOffset: 14, includeWeekends: false };
  }
}

export interface BuildSlotsInput {
  techs: Tech[];
  busy: BusyWindow[];
  /** Montana date keys on which nobody works. */
  holidays: Set<string>;
  priority: Priority;
  now: Date;
  /** ISO date, already resolved from whatever relative phrase the caller used. */
  earliestDate?: string;
  preferredTimeOfDay?: "morning" | "afternoon" | "any";
  limit?: number;
}

const overlaps = (a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) =>
  a.startsAt < b.endsAt && a.endsAt > b.startsAt;

function parseEarliest(earliestDate: string | undefined, fallback: CalendarDay): CalendarDay {
  if (!earliestDate) return fallback;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(earliestDate.trim());
  if (!match) return fallback;
  const requested = { year: +match[1], month: +match[2], day: +match[3] };
  return dateKeyOf(requested) > dateKeyOf(fallback) ? requested : fallback;
}

/**
 * The offerable windows, soonest first.
 *
 * One window is offered once even when several techs are free for it — a caller
 * choosing between "Marcus at 8" and "Priya at 8" is a worse conversation than
 * choosing between 8 and 10, and the tech assignment is dispatch's business.
 */
export function buildSlots(input: BuildSlotsInput): Slot[] {
  const { techs, busy, holidays, priority, now, preferredTimeOfDay = "any" } = input;
  if (techs.length === 0) return [];

  const limit = input.limit ?? 4;
  const horizon = horizonFor(priority);
  const today = calendarDayOf(now);
  const earliest = parseEarliest(input.earliestDate, addDays(today, horizon.startOffset));
  const notBefore = new Date(now.getTime() + MINIMUM_LEAD_MINUTES * 60_000);

  const busyByTech = new Map<string, BusyWindow[]>();
  for (const window of busy) {
    const list = busyByTech.get(window.techId);
    if (list) list.push(window);
    else busyByTech.set(window.techId, [window]);
  }

  const slots: Slot[] = [];
  for (let offset = 0; offset <= horizon.endOffset; offset++) {
    const day = addDays(earliest, offset);
    if (holidays.has(dateKeyOf(day))) continue;
    if (isWeekend(day) && !horizon.includeWeekends) continue;

    for (const startHour of WINDOW_STARTS) {
      if (preferredTimeOfDay === "morning" && startHour >= 12) continue;
      if (preferredTimeOfDay === "afternoon" && startHour < 12) continue;

      const startsAt = zonedTimeToInstant(day, startHour);
      const endsAt = zonedTimeToInstant(day, startHour + WINDOW_LENGTH_HOURS);
      if (startsAt < notBefore) continue;

      // Rotate which tech gets offered first so the diary fills evenly rather
      // than burying the first tech in the list.
      const rotated = techs.map((_, i) => techs[(i + slots.length) % techs.length]);
      const tech = rotated.find(
        (candidate) =>
          startHour >= candidate.shiftStartHour &&
          startHour + WINDOW_LENGTH_HOURS <= candidate.shiftEndHour &&
          !(busyByTech.get(candidate.id) ?? []).some((w) => overlaps(w, { startsAt, endsAt })),
      );
      if (!tech) continue;

      slots.push({
        slotId: encodeSlotId({ techId: tech.id, startsAt, endsAt, priority }),
        techId: tech.id,
        techName: tech.name,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        spoken: spokenWindow(startsAt, endsAt, now),
      });
      if (slots.length >= limit) return slots;
    }
  }
  return slots;
}

export interface DecodedSlot {
  techId: string;
  startsAt: Date;
  endsAt: Date;
  priority: Priority;
}

const PRIORITIES: Priority[] = ["P0", "P1", "P2", "P3"];

/**
 * The slot id carries everything book_appointment needs.
 *
 * book_appointment's arguments are fixed by the tool contract and do not
 * include a priority or a tech, and there is no call id to key server state on
 * — so the identifier find_slots hands the model is the state. It round-trips
 * through the model untouched, which keeps the webhook stateless.
 */
export function encodeSlotId(slot: DecodedSlot): string {
  return [slot.techId, slot.startsAt.toISOString(), slot.endsAt.toISOString(), slot.priority].join(
    "|",
  );
}

export function decodeSlotId(slotId: string): DecodedSlot | null {
  const parts = slotId.split("|");
  if (parts.length !== 4) return null;
  const [techId, startIso, endIso, priority] = parts;
  const startsAt = new Date(startIso);
  const endsAt = new Date(endIso);
  if (!techId) return null;
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return null;
  if (endsAt <= startsAt) return null;
  if (!PRIORITIES.includes(priority as Priority)) return null;
  return { techId, startsAt, endsAt, priority: priority as Priority };
}
