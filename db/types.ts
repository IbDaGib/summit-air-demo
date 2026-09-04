/**
 * Row types for the Summit Air schema.
 *
 * Hand-written on purpose: `supabase gen types` needs a live database, and the
 * tool handlers, the eval harness and the dashboard all have to compile in CI
 * where there isn't one. These mirror db/migrations/0001_init.sql exactly — if
 * you add a migration, edit this file in the same commit.
 *
 * Conventions, matching what PostgREST actually returns over the wire:
 *  - `timestamptz` and `date` arrive as ISO strings, not Date objects.
 *  - `time` arrives as "HH:MM:SS".
 *  - `tstzrange` arrives as its Postgres text form, e.g.
 *    `["2026-09-04 08:00:00-06","2026-09-04 10:00:00-06")`. Use the helpers in
 *    db/range.ts rather than parsing it inline.
 *  - Nullable columns are `T | null` on Row and optional on Insert.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/* ------------------------------------------------------------------ *
 * Enums — `create type` in the migration.
 * ------------------------------------------------------------------ */

/** Postgres `priority_tier`. Structurally identical to agent Priority. */
export type PriorityTier = "P0" | "P1" | "P2" | "P3";

/** Postgres `county_name`. Structurally identical to agent County. */
export type CountyName = "Gallatin" | "Park" | "Madison";

/**
 * `bookings.status` is a plain text column, not an enum, so a new status does not
 * need a migration. Only 'cancelled' is load-bearing: the no-overlap constraint
 * exempts it.
 */
export type BookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";

/** Skill tags on `techs.skills`. The column is text[]; this is the vocabulary. */
export type TechSkill = "gas" | "refrigerant" | "commercial_rooftop" | "mini_split";

/* ------------------------------------------------------------------ *
 * customers
 * ------------------------------------------------------------------ */

export type CustomerRow = {
  id: string;
  phone: string;
  name: string;
  address_line: string;
  town: string;
  county: CountyName;
  is_maintenance_member: boolean;
  vulnerable_occupant: boolean;
  access_notes: string | null;
  /** timestamptz */
  last_service_at: string | null;
  /** timestamptz */
  created_at: string;
};

export type CustomerInsert = {
  id?: string;
  phone: string;
  name: string;
  address_line: string;
  town: string;
  county: CountyName;
  is_maintenance_member?: boolean;
  vulnerable_occupant?: boolean;
  access_notes?: string | null;
  last_service_at?: string | null;
  created_at?: string;
};

export type CustomerUpdate = Partial<CustomerInsert>;

/* ------------------------------------------------------------------ *
 * techs
 * ------------------------------------------------------------------ */

export type TechRow = {
  id: string;
  name: string;
  home_county: CountyName;
  skills: string[];
  /** time, "HH:MM:SS" in America/Denver wall-clock terms. */
  shift_start: string;
  /** time, "HH:MM:SS" in America/Denver wall-clock terms. */
  shift_end: string;
  on_call: boolean;
};

export type TechInsert = {
  id?: string;
  name: string;
  home_county: CountyName;
  skills?: string[];
  shift_start?: string;
  shift_end?: string;
  on_call?: boolean;
};

export type TechUpdate = Partial<TechInsert>;

/* ------------------------------------------------------------------ *
 * holidays
 * ------------------------------------------------------------------ */

export type HolidayRow = {
  /** date, "YYYY-MM-DD". No tech is scheduled on these days. */
  day: string;
  label: string;
};

export type HolidayInsert = HolidayRow;
export type HolidayUpdate = Partial<HolidayRow>;

/* ------------------------------------------------------------------ *
 * bookings
 * ------------------------------------------------------------------ */

export type BookingRow = {
  id: string;
  tech_id: string;
  customer_name: string;
  phone: string;
  address_line: string;
  town: string;
  county: CountyName;
  /** tstzrange text form — see db/range.ts. */
  arrival_window: string;
  priority: PriorityTier;
  issue_summary: string;
  access_notes: string | null;
  status: BookingStatus;
  call_id: string | null;
  /** timestamptz */
  created_at: string;
};

export type BookingInsert = {
  id?: string;
  tech_id: string;
  customer_name: string;
  phone: string;
  address_line: string;
  town: string;
  county: CountyName;
  arrival_window: string;
  priority: PriorityTier;
  issue_summary: string;
  access_notes?: string | null;
  status?: BookingStatus;
  call_id?: string | null;
  created_at?: string;
};

export type BookingUpdate = Partial<BookingInsert>;

/* ------------------------------------------------------------------ *
 * calls
 * ------------------------------------------------------------------ */

/**
 * Written incrementally during the call, so every field after `started_at` is
 * nullable — a dropped call still leaves a usable row.
 */
export type CallRow = {
  id: string;
  vapi_call_id: string | null;
  from_number: string | null;
  customer_id: string | null;
  /** timestamptz */
  started_at: string;
  /** timestamptz */
  ended_at: string | null;
  /** Extracted SituationFacts. */
  facts: Json | null;
  priority: PriorityTier | null;
  outcome: string | null;
  transcript: string | null;
  summary: string | null;
  sentiment: string | null;
  /** Array of { tool, args, result, durationMs } — the dashboard's debug surface. */
  tool_trace: Json | null;
  recording_url: string | null;
};

export type CallInsert = {
  id?: string;
  vapi_call_id?: string | null;
  from_number?: string | null;
  customer_id?: string | null;
  started_at?: string;
  ended_at?: string | null;
  facts?: Json | null;
  priority?: PriorityTier | null;
  outcome?: string | null;
  transcript?: string | null;
  summary?: string | null;
  sentiment?: string | null;
  tool_trace?: Json | null;
  recording_url?: string | null;
};

export type CallUpdate = Partial<CallInsert>;

/* ------------------------------------------------------------------ *
 * callback_requests
 * ------------------------------------------------------------------ */

export type CallbackRequestRow = {
  id: string;
  call_id: string | null;
  customer_name: string | null;
  phone: string;
  reason: string;
  notes: string | null;
  resolved: boolean;
  /** timestamptz */
  created_at: string;
};

export type CallbackRequestInsert = {
  id?: string;
  call_id?: string | null;
  customer_name?: string | null;
  phone: string;
  reason: string;
  notes?: string | null;
  resolved?: boolean;
  created_at?: string;
};

export type CallbackRequestUpdate = Partial<CallbackRequestInsert>;

/* ------------------------------------------------------------------ *
 * safety_incidents
 * ------------------------------------------------------------------ */

export type SafetyIncidentRow = {
  id: string;
  call_id: string | null;
  hazard: string;
  town: string | null;
  phone: string | null;
  /** timestamptz */
  created_at: string;
};

export type SafetyIncidentInsert = {
  id?: string;
  call_id?: string | null;
  hazard: string;
  town?: string | null;
  phone?: string | null;
  created_at?: string;
};

export type SafetyIncidentUpdate = Partial<SafetyIncidentInsert>;

/* ------------------------------------------------------------------ *
 * Schema map for the typed Supabase client.
 *
 * Same shape `supabase gen types typescript` emits, so swapping to codegen
 * later is a file replacement and not a refactor.
 * ------------------------------------------------------------------ */

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: CustomerRow;
        Insert: CustomerInsert;
        Update: CustomerUpdate;
        Relationships: [];
      };
      techs: {
        Row: TechRow;
        Insert: TechInsert;
        Update: TechUpdate;
        Relationships: [];
      };
      holidays: {
        Row: HolidayRow;
        Insert: HolidayInsert;
        Update: HolidayUpdate;
        Relationships: [];
      };
      bookings: {
        Row: BookingRow;
        Insert: BookingInsert;
        Update: BookingUpdate;
        Relationships: [
          {
            foreignKeyName: "bookings_tech_id_fkey";
            columns: ["tech_id"];
            isOneToOne: false;
            referencedRelation: "techs";
            referencedColumns: ["id"];
          },
        ];
      };
      calls: {
        Row: CallRow;
        Insert: CallInsert;
        Update: CallUpdate;
        Relationships: [
          {
            foreignKeyName: "calls_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      callback_requests: {
        Row: CallbackRequestRow;
        Insert: CallbackRequestInsert;
        Update: CallbackRequestUpdate;
        Relationships: [
          {
            foreignKeyName: "callback_requests_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
        ];
      };
      safety_incidents: {
        Row: SafetyIncidentRow;
        Insert: SafetyIncidentInsert;
        Update: SafetyIncidentUpdate;
        Relationships: [
          {
            foreignKeyName: "safety_incidents_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: {
      priority_tier: PriorityTier;
      county_name: CountyName;
    };
    CompositeTypes: Record<never, never>;
  };
};

/**
 * SQLSTATE for an exclusion-constraint violation. `book_appointment` catches this
 * and returns a conflict with alternatives instead of throwing into a live call.
 */
export const EXCLUSION_VIOLATION = "23P01";

/** Name of the constraint that makes double-booking a tech impossible. */
export const NO_OVERLAP_CONSTRAINT = "bookings_no_overlap";
