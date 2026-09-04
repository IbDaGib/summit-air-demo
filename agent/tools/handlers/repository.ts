/**
 * The data the tool handlers need, expressed as a port.
 *
 * Handlers depend on this interface, never on Supabase or on Postgres directly.
 * Two things fall out of that: the eval harness can drive the real handlers
 * against deterministic fixtures without a database, and swapping Supabase for
 * a customer's own Postgres — or for ServiceTitan — is one new implementation
 * rather than a rewrite of the call logic.
 */
import type { County, Priority } from "../../policy/types";
import type { CustomerRecord } from "../schemas";

export interface Tech {
  id: string;
  name: string;
  county: County;
  skills: string[];
  /** Local Montana wall-clock hours, e.g. 8 and 17. */
  shiftStartHour: number;
  shiftEndHour: number;
  onCall: boolean;
}

/** A window a tech is already committed to. Cancelled bookings are not included. */
export interface BusyWindow {
  techId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface NewBooking {
  techId: string;
  customerName: string;
  phone: string;
  addressLine: string;
  town: string;
  county: County;
  startsAt: Date;
  endsAt: Date;
  priority: Priority;
  issueSummary: string;
  accessNotes?: string;
}

/**
 * `conflict` is the EXCLUDE-constraint rejection (SQLSTATE 23P01) surfaced as a
 * value rather than an exception. Double-booking is refused by the database;
 * the handler's job is to turn that refusal into a sentence the caller can act
 * on, not to let it reach the call as a 500.
 */
export type CreateBookingResult =
  | { status: "confirmed"; bookingId: string }
  | { status: "conflict" }
  | { status: "error"; message: string };

export interface DispatchRepository {
  findCustomerByPhone(phone: string): Promise<CustomerRecord | null>;
  listTechs(county: County): Promise<Tech[]>;
  listBusyWindows(techIds: string[], from: Date, to: Date): Promise<BusyWindow[]>;
  /** Montana date keys ("2026-09-07") on which nobody works. */
  listHolidays(from: Date, to: Date): Promise<Set<string>>;
  createBooking(booking: NewBooking): Promise<CreateBookingResult>;
  createCallbackRequest(input: {
    customerName?: string;
    phone: string;
    reason: string;
    notes?: string;
  }): Promise<{ requestId: string }>;
  recordSafetyIncident(input: {
    hazard: string;
    town?: string;
    phone?: string;
  }): Promise<{ incidentId: string }>;
}

/** Last 10 digits, so "(406) 555-0118", "+14065550118" and "406-555-0118" match. */
export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}
