/**
 * In-memory DispatchRepository.
 *
 * Two jobs. It keeps the eval harness and the unit tests deterministic and
 * offline, and it keeps a live demo call working when Supabase is not
 * configured — the handlers behave identically either way, so what you hear on
 * the phone is what the tests cover.
 *
 * It enforces the same overlap rule as the bookings EXCLUDE constraint, so the
 * conflict path is exercised without a Postgres instance.
 */
import type { County } from "../../policy/types";
import type { CustomerRecord } from "../schemas";
import {
  type BusyWindow,
  type CreateBookingResult,
  type DispatchRepository,
  type NewBooking,
  type Tech,
  phoneKey,
} from "./repository";
import { addDays, calendarDayOf, dateKeyOf, zonedTimeToInstant } from "./time";

const TECHS: Tech[] = [
  { id: "tech-marcus", name: "Marcus", county: "Gallatin", skills: ["gas", "refrigerant"], shiftStartHour: 7, shiftEndHour: 16, onCall: false },
  { id: "tech-priya", name: "Priya", county: "Gallatin", skills: ["refrigerant", "mini_split"], shiftStartHour: 8, shiftEndHour: 17, onCall: false },
  { id: "tech-josh", name: "Josh", county: "Gallatin", skills: ["gas", "commercial_rooftop"], shiftStartHour: 10, shiftEndHour: 19, onCall: true },
  { id: "tech-dana", name: "Dana", county: "Park", skills: ["gas", "mini_split"], shiftStartHour: 8, shiftEndHour: 17, onCall: false },
  { id: "tech-luis", name: "Luis", county: "Madison", skills: ["gas", "refrigerant"], shiftStartHour: 8, shiftEndHour: 17, onCall: false },
  { id: "tech-ray", name: "Ray", county: "Madison", skills: ["commercial_rooftop"], shiftStartHour: 9, shiftEndHour: 18, onCall: false },
];

const CUSTOMERS: CustomerRecord[] = [
  {
    id: "cust-whitaker",
    name: "Dave Whitaker",
    phone: "+14065550118",
    addressLine: "412 Cottonwood Road",
    town: "Bozeman",
    county: "Gallatin",
    isMaintenanceMember: true,
    vulnerableOccupant: false,
    accessNotes: "Gate code 4412, dog in the yard",
    lastServiceAt: "2026-03-14",
  },
  {
    id: "cust-reyes",
    name: "Marta Reyes",
    phone: "+14065550142",
    addressLine: "88 Jackrabbit Lane",
    town: "Belgrade",
    county: "Gallatin",
    isMaintenanceMember: false,
    vulnerableOccupant: true,
    accessNotes: "Mother-in-law suite at the back, ring the side bell",
    lastServiceAt: "2025-11-02",
  },
  {
    id: "cust-okafor",
    name: "Ben Okafor",
    phone: "+14065550177",
    addressLine: "3 Yellowstone Avenue",
    town: "Livingston",
    county: "Park",
    isMaintenanceMember: true,
    vulnerableOccupant: false,
    lastServiceAt: "2026-05-21",
  },
];

const HOLIDAYS = new Set<string>(["2026-09-07"]); // Labor Day — no tech works it.

const WINDOW_HOURS = [8, 10, 13, 15];

/**
 * Deterministic pseudo-occupancy: the same tech, day and hour is always either
 * busy or free, with no stored state and no randomness. Roughly 60% booked, so
 * find_slots has to do real work instead of always returning the 8am window.
 */
function isPreBooked(techId: string, dateKey: string, hour: number): boolean {
  const seed = `${techId}|${dateKey}|${hour}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 10 < 6;
}

export interface InMemoryRepositoryOptions {
  techs?: Tech[];
  customers?: CustomerRecord[];
  holidays?: Iterable<string>;
  /** Turn the synthetic pre-booked windows off for tests that want an empty diary. */
  preBooked?: boolean;
}

export function createInMemoryRepository(
  options: InMemoryRepositoryOptions = {},
): DispatchRepository {
  const techs = options.techs ?? TECHS;
  const customers = options.customers ?? CUSTOMERS;
  const holidays = new Set(options.holidays ?? HOLIDAYS);
  const preBooked = options.preBooked ?? true;
  const written: BusyWindow[] = [];
  let sequence = 0;

  const synthetic = (techIds: string[], from: Date, to: Date): BusyWindow[] => {
    if (!preBooked) return [];
    const out: BusyWindow[] = [];
    let day = calendarDayOf(from);
    const lastKey = dateKeyOf(calendarDayOf(to));
    for (let guard = 0; guard < 45; guard++) {
      const key = dateKeyOf(day);
      if (!holidays.has(key)) {
        for (const techId of techIds) {
          for (const hour of WINDOW_HOURS) {
            if (!isPreBooked(techId, key, hour)) continue;
            out.push({
              techId,
              startsAt: zonedTimeToInstant(day, hour),
              endsAt: zonedTimeToInstant(day, hour + 2),
            });
          }
        }
      }
      if (key >= lastKey) break;
      day = addDays(day, 1);
    }
    return out;
  };

  return {
    async findCustomerByPhone(phone) {
      const digits = phoneKey(phone);
      if (!digits) return null;
      return customers.find((c) => phoneKey(c.phone) === digits) ?? null;
    },

    async listTechs(county: County) {
      return techs.filter((t) => t.county === county);
    },

    async listBusyWindows(techIds, from, to) {
      const ids = new Set(techIds);
      const overlaps = (w: BusyWindow) => w.endsAt > from && w.startsAt < to;
      return [...synthetic([...ids], from, to), ...written.filter((w) => ids.has(w.techId))].filter(
        overlaps,
      );
    },

    async listHolidays() {
      return new Set(holidays);
    },

    async createBooking(booking: NewBooking): Promise<CreateBookingResult> {
      // Same rule the database enforces with `exclude using gist`.
      const clash = [
        ...written,
        ...synthetic([booking.techId], booking.startsAt, booking.endsAt),
      ].some(
        (w) =>
          w.techId === booking.techId &&
          w.startsAt < booking.endsAt &&
          w.endsAt > booking.startsAt,
      );
      if (clash) return { status: "conflict" };
      written.push({
        techId: booking.techId,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
      });
      return { status: "confirmed", bookingId: `booking-${++sequence}` };
    },

    async createCallbackRequest() {
      return { requestId: `callback-${++sequence}` };
    },

    async recordSafetyIncident() {
      return { incidentId: `incident-${++sequence}` };
    },
  };
}
