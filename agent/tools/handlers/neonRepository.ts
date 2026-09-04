/**
 * Neon (plain Postgres) implementation of DispatchRepository.
 *
 * Supabase went down mid-build — a multi-region outage on project creation — so
 * this is the third adapter behind the same port. The call logic did not change
 * at all, which is the whole point of the port: swapping a customer's database,
 * or eventually ServiceTitan, is one file.
 *
 * Every window comparison is done in SQL against `tstzrange`, so the database
 * decides overlap using the same operator the EXCLUDE constraint uses. Doing it
 * in TypeScript would risk the scheduler and the constraint disagreeing.
 */
import { isExclusionViolation, one, query } from "../../../db/neon";
import type { County } from "../../policy/types";
import type { CustomerRecord } from "../schemas";
import {
  phoneKey,
  type BusyWindow,
  type CreateBookingResult,
  type DispatchRepository,
  type NewBooking,
  type Tech,
} from "./repository";

/** "08:00:00" -> 8 */
function hourOf(t: unknown): number {
  const [h] = String(t ?? "0").split(":");
  return Number(h) || 0;
}

export function createNeonRepository(): DispatchRepository {
  return {
    async findCustomerByPhone(phone) {
      const key = phoneKey(phone);
      if (key.length < 10) return null;
      const r = await one<Record<string, unknown>>(
        `select id, name, phone, address_line, town, county,
                is_maintenance_member, vulnerable_occupant, access_notes, last_service_at
         from customers
         where right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1
         limit 1`,
        [key],
      );
      if (!r) return null;
      return {
        id: String(r.id),
        name: String(r.name),
        phone: String(r.phone),
        addressLine: String(r.address_line),
        town: String(r.town),
        county: r.county as County,
        isMaintenanceMember: Boolean(r.is_maintenance_member),
        vulnerableOccupant: Boolean(r.vulnerable_occupant),
        accessNotes: (r.access_notes as string) ?? undefined,
        lastServiceAt: r.last_service_at
          ? new Date(String(r.last_service_at)).toISOString()
          : undefined,
      } satisfies CustomerRecord;
    },

    async listTechs(county) {
      const rows = await query<Record<string, unknown>>(
        `select id, name, home_county, skills, shift_start, shift_end, on_call
         from techs where home_county = $1::county_name order by name`,
        [county],
      );
      return rows.map<Tech>((r) => ({
        id: String(r.id),
        name: String(r.name),
        county: r.home_county as County,
        skills: (r.skills as string[]) ?? [],
        shiftStartHour: hourOf(r.shift_start),
        shiftEndHour: hourOf(r.shift_end),
        onCall: Boolean(r.on_call),
      }));
    },

    async listBusyWindows(techIds, from, to) {
      if (!techIds.length) return [];
      const rows = await query<Record<string, unknown>>(
        `select tech_id, lower(arrival_window) as starts_at, upper(arrival_window) as ends_at
         from bookings
         where tech_id = any($1::uuid[])
           and status <> 'cancelled'
           and arrival_window && tstzrange($2, $3, '[)')`,
        [techIds, from.toISOString(), to.toISOString()],
      );
      return rows.map<BusyWindow>((r) => ({
        techId: String(r.tech_id),
        startsAt: new Date(String(r.starts_at)),
        endsAt: new Date(String(r.ends_at)),
      }));
    },

    async listHolidays(from, to) {
      const rows = await query<{ day: string }>(
        `select to_char(day, 'YYYY-MM-DD') as day
         from holidays where day between $1::date and $2::date`,
        [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)],
      );
      return new Set(rows.map((r) => r.day));
    },

    async createBooking(booking: NewBooking): Promise<CreateBookingResult> {
      try {
        const r = await one<{ id: string }>(
          `insert into bookings (
             tech_id, customer_name, phone, address_line, town, county,
             arrival_window, priority, issue_summary, access_notes
           ) values (
             $1::uuid, $2, $3, $4, $5, $6::county_name,
             tstzrange($7, $8, '[)'), $9::priority_tier, $10, $11
           )
           returning id`,
          [
            booking.techId,
            booking.customerName,
            booking.phone,
            booking.addressLine,
            booking.town,
            booking.county,
            booking.startsAt.toISOString(),
            booking.endsAt.toISOString(),
            booking.priority,
            booking.issueSummary,
            booking.accessNotes ?? null,
          ],
        );
        if (!r) return { status: "error", message: "insert returned no row" };
        return { status: "confirmed", bookingId: r.id };
      } catch (err) {
        // The database refuses a double-booking. Surface it as a value so the
        // handler can offer alternatives instead of the call seeing a 500.
        if (isExclusionViolation(err)) return { status: "conflict" };
        return {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },

    async createCallbackRequest(input) {
      const r = await one<{ id: string }>(
        `insert into callback_requests (customer_name, phone, reason, notes)
         values ($1, $2, $3, $4) returning id`,
        [input.customerName ?? null, input.phone, input.reason, input.notes ?? null],
      );
      return { requestId: r?.id ?? "unknown" };
    },

    async recordSafetyIncident(input) {
      const r = await one<{ id: string }>(
        `insert into safety_incidents (hazard, town, phone)
         values ($1, $2, $3) returning id`,
        [input.hazard, input.town ?? null, input.phone ?? null],
      );
      return { incidentId: r?.id ?? "unknown" };
    },
  };
}
