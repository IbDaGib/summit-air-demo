/**
 * Supabase-backed implementation of DispatchRepository.
 *
 * The row types below are a hand-written mirror of db/migrations/0001_init.sql.
 * Workspace A owns db/types.ts; once it lands, delete these and re-export from
 * there — the field names were chosen to match the columns exactly so it is a
 * substitution, not a refactor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
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
import { calendarDayOf, dateKeyOf, parseClockHour } from "./time";

/** Postgres raises this when the bookings EXCLUDE constraint rejects an overlap. */
export const EXCLUSION_VIOLATION = "23P01";

interface CustomerRow {
  id: string;
  phone: string;
  name: string;
  address_line: string;
  town: string;
  county: County;
  is_maintenance_member: boolean;
  vulnerable_occupant: boolean;
  access_notes: string | null;
  last_service_at: string | null;
}

interface TechRow {
  id: string;
  name: string;
  home_county: County;
  skills: string[] | null;
  shift_start: string;
  shift_end: string;
  on_call: boolean;
}

interface BookingWindowRow {
  tech_id: string;
  arrival_window: string;
}

interface HolidayRow {
  day: string;
}

/**
 * Postgres renders a tstzrange as `["2026-01-14 15:00:00+00","...17:00:00+00")`.
 * supabase-js hands it back as that literal string, so it has to be parsed.
 */
export function parseTstzRange(range: string): { startsAt: Date; endsAt: Date } | null {
  const match = /^[[(]\s*"?([^",]+)"?\s*,\s*"?([^",)]+)"?\s*[\])]$/.exec(range.trim());
  if (!match) return null;
  const startsAt = new Date(match[1].replace(" ", "T"));
  const endsAt = new Date(match[2].replace(" ", "T"));
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return null;
  return { startsAt, endsAt };
}

const toTstzRange = (start: Date, end: Date) => `[${start.toISOString()},${end.toISOString()})`;

const toCustomerRecord = (row: CustomerRow): CustomerRecord => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  addressLine: row.address_line,
  town: row.town,
  county: row.county,
  isMaintenanceMember: row.is_maintenance_member,
  vulnerableOccupant: row.vulnerable_occupant,
  accessNotes: row.access_notes ?? undefined,
  lastServiceAt: row.last_service_at ?? undefined,
});

/** supabase-js returns errors as values; a thrown driver error carries the code too. */
function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "database error";
}

export function createSupabaseRepository(client: SupabaseClient): DispatchRepository {
  return {
    async findCustomerByPhone(phone) {
      const digits = phoneKey(phone);
      if (!digits) return null;
      // The column stores E.164; match on the last ten digits so caller ID
      // formatting differences do not lose a known customer.
      const { data, error } = await client
        .from("customers")
        .select(
          "id, phone, name, address_line, town, county, is_maintenance_member, vulnerable_occupant, access_notes, last_service_at",
        )
        .like("phone", `%${digits}`)
        .limit(1);
      if (error) throw error;
      const row = (data as CustomerRow[] | null)?.[0];
      return row ? toCustomerRecord(row) : null;
    },

    async listTechs(county) {
      const { data, error } = await client
        .from("techs")
        .select("id, name, home_county, skills, shift_start, shift_end, on_call")
        .eq("home_county", county);
      if (error) throw error;
      return ((data as TechRow[] | null) ?? []).map<Tech>((row) => ({
        id: row.id,
        name: row.name,
        county: row.home_county,
        skills: row.skills ?? [],
        shiftStartHour: parseClockHour(row.shift_start),
        shiftEndHour: parseClockHour(row.shift_end),
        onCall: row.on_call,
      }));
    },

    async listBusyWindows(techIds, from, to) {
      if (techIds.length === 0) return [];
      const { data, error } = await client
        .from("bookings")
        .select("tech_id, arrival_window")
        .in("tech_id", techIds)
        .neq("status", "cancelled")
        .overlaps("arrival_window", toTstzRange(from, to));
      if (error) throw error;
      const windows: BusyWindow[] = [];
      for (const row of (data as BookingWindowRow[] | null) ?? []) {
        const parsed = parseTstzRange(row.arrival_window);
        if (parsed) windows.push({ techId: row.tech_id, ...parsed });
      }
      return windows;
    },

    async listHolidays(from, to) {
      const { data, error } = await client
        .from("holidays")
        .select("day")
        .gte("day", dateKeyOf(calendarDayOf(from)))
        .lte("day", dateKeyOf(calendarDayOf(to)));
      if (error) throw error;
      return new Set(((data as HolidayRow[] | null) ?? []).map((row) => row.day.slice(0, 10)));
    },

    async createBooking(booking: NewBooking): Promise<CreateBookingResult> {
      try {
        const { data, error } = await client
          .from("bookings")
          .insert({
            tech_id: booking.techId,
            customer_name: booking.customerName,
            phone: booking.phone,
            address_line: booking.addressLine,
            town: booking.town,
            county: booking.county,
            arrival_window: toTstzRange(booking.startsAt, booking.endsAt),
            priority: booking.priority,
            issue_summary: booking.issueSummary,
            access_notes: booking.accessNotes ?? null,
          })
          .select("id")
          .single();

        // The whole point of the EXCLUDE constraint: the database refuses the
        // double-booking and we turn that into an offer of another window.
        if (errorCode(error) === EXCLUSION_VIOLATION) return { status: "conflict" };
        if (error) return { status: "error", message: errorMessage(error) };
        return { status: "confirmed", bookingId: (data as { id: string }).id };
      } catch (thrown) {
        if (errorCode(thrown) === EXCLUSION_VIOLATION) return { status: "conflict" };
        return { status: "error", message: errorMessage(thrown) };
      }
    },

    async createCallbackRequest(input) {
      const { data, error } = await client
        .from("callback_requests")
        .insert({
          customer_name: input.customerName ?? null,
          phone: input.phone,
          reason: input.reason,
          notes: input.notes ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { requestId: (data as { id: string }).id };
    },

    async recordSafetyIncident(input) {
      const { data, error } = await client
        .from("safety_incidents")
        .insert({ hazard: input.hazard, town: input.town ?? null, phone: input.phone ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return { incidentId: (data as { id: string }).id };
    },
  };
}
