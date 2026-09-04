/**
 * Aggregate reads for the client-facing views. Owned by main.
 *
 * Every function here is a single SQL statement against Neon and returns a
 * plain, serialisable shape. Pages compose these; they do not write their own
 * SQL. When DATABASE_URL is absent each returns an empty-but-valid shape so a
 * fresh checkout still builds and every page must render an honest empty state.
 *
 * Ranges are half-open [from, to) in UTC. "Business hours" means 08:00–17:00
 * America/Denver, Monday to Friday — the same definition policy/priority.ts uses
 * to decide whether a P1 is "today" or "on-call tonight".
 */
import { hasDbConfig, query } from "../../../db/neon";

export interface DateRange {
  from: Date;
  to: Date;
}

/** Default window: the last 30 days. With demo data this is everything. */
export function last30Days(now = new Date()): DateRange {
  const to = new Date(now);
  const from = new Date(now.getTime() - 30 * 86_400_000);
  return { from, to };
}

const R = (r: DateRange) => [r.from.toISOString(), r.to.toISOString()];

/* ------------------------------------------------------------------ */

export interface CallVolume {
  total: number;
  booked: number;
  escalated: number;
  callback: number;
  /**
   * Not booked, not escalated, not a callback. Counts `outcome IS NULL` — calls
   * still in progress, dropped, or ended before outcome recording existed — AND
   * `outcome = 'no_action'`, which is a real agent-recorded ending ("just asking
   * about your hours"). Label it on that basis; "no recorded outcome" is false
   * for the no_action share. Splitting no_action out is a contract change and
   * is logged in KNOWN_ISSUES.
   */
  unresolved: number;
}

export async function getCallVolume(range = last30Days()): Promise<CallVolume> {
  if (!hasDbConfig()) return { total: 0, booked: 0, escalated: 0, callback: 0, unresolved: 0 };
  const [r] = await query<Record<string, number>>(
    `select count(*)::int as total,
            count(*) filter (where outcome = 'booked')::int as booked,
            count(*) filter (where outcome = 'escalated')::int as escalated,
            count(*) filter (where outcome = 'callback')::int as callback,
            count(*) filter (where outcome is null or outcome = 'no_action')::int as unresolved
     from calls where started_at >= $1 and started_at < $2`,
    R(range),
  );
  return r as unknown as CallVolume;
}

/* ------------------------------------------------------------------ */

export interface PriorityMix {
  P0: number;
  P1: number;
  P2: number;
  P3: number;
  /** Calls that ended before assess_situation ran (out-of-area, dropped). */
  untiered: number;
}

export async function getPriorityMix(range = last30Days()): Promise<PriorityMix> {
  if (!hasDbConfig()) return { P0: 0, P1: 0, P2: 0, P3: 0, untiered: 0 };
  const [r] = await query<Record<string, number>>(
    `select count(*) filter (where priority = 'P0')::int as "P0",
            count(*) filter (where priority = 'P1')::int as "P1",
            count(*) filter (where priority = 'P2')::int as "P2",
            count(*) filter (where priority = 'P3')::int as "P3",
            count(*) filter (where priority is null)::int as untiered
     from calls where started_at >= $1 and started_at < $2`,
    R(range),
  );
  return r as unknown as PriorityMix;
}

/* ------------------------------------------------------------------ */

export interface CostSummary {
  calls: number;
  /** Sum of Vapi's per-call cost — telephony, STT, TTS, LLM and platform fee. */
  totalUsd: number;
  avgPerCallUsd: number;
  avgPerMinuteUsd: number;
  totalMinutes: number;
  avgDurationSeconds: number;
  /** Cost of calls that ended in a booking, divided by bookings. The number that matters. */
  costPerBookingUsd: number | null;
}

export async function getCostSummary(range = last30Days()): Promise<CostSummary> {
  if (!hasDbConfig()) {
    return {
      calls: 0, totalUsd: 0, avgPerCallUsd: 0, avgPerMinuteUsd: 0,
      totalMinutes: 0, avgDurationSeconds: 0, costPerBookingUsd: null,
    };
  }
  const [r] = await query<Record<string, string | number | null>>(
    `select count(*)::int as calls,
            coalesce(sum(cost_usd), 0)::float as total_usd,
            coalesce(avg(cost_usd), 0)::float as avg_per_call_usd,
            coalesce(sum(duration_seconds), 0)::float / 60 as total_minutes,
            coalesce(avg(duration_seconds), 0)::float as avg_duration_seconds,
            (sum(cost_usd) filter (where outcome = 'booked'))::float as booked_cost,
            count(*) filter (where outcome = 'booked')::int as booked
     from calls where started_at >= $1 and started_at < $2`,
    R(range),
  );
  const totalMinutes = Number(r.total_minutes);
  const booked = Number(r.booked);
  return {
    calls: Number(r.calls),
    totalUsd: Number(r.total_usd),
    avgPerCallUsd: Number(r.avg_per_call_usd),
    avgPerMinuteUsd: totalMinutes > 0 ? Number(r.total_usd) / totalMinutes : 0,
    totalMinutes,
    avgDurationSeconds: Number(r.avg_duration_seconds),
    costPerBookingUsd: booked > 0 && r.booked_cost != null ? Number(r.booked_cost) / booked : null,
  };
}

/* ------------------------------------------------------------------ */

export interface SentimentMix {
  calm: number;
  anxious: number;
  frustrated: number;
  distressed: number;
  unknown: number;
}

export async function getSentimentMix(range = last30Days()): Promise<SentimentMix> {
  if (!hasDbConfig()) return { calm: 0, anxious: 0, frustrated: 0, distressed: 0, unknown: 0 };
  const [r] = await query<Record<string, number>>(
    `select count(*) filter (where sentiment = 'calm')::int as calm,
            count(*) filter (where sentiment = 'anxious')::int as anxious,
            count(*) filter (where sentiment = 'frustrated')::int as frustrated,
            count(*) filter (where sentiment = 'distressed')::int as distressed,
            count(*) filter (where sentiment is null)::int as unknown
     from calls where started_at >= $1 and started_at < $2`,
    R(range),
  );
  return r as unknown as SentimentMix;
}

/* ------------------------------------------------------------------ */

export interface AfterHoursShare {
  total: number;
  /** Outside 08:00–17:00 America/Denver, or on a weekend. */
  afterHours: number;
  pct: number;
}

/**
 * The "never miss a call at 2am in January" number. This is the value prop for
 * a shop whose phones ring hardest when nobody is at the desk.
 */
export async function getAfterHoursShare(range = last30Days()): Promise<AfterHoursShare> {
  if (!hasDbConfig()) return { total: 0, afterHours: 0, pct: 0 };
  const [r] = await query<Record<string, number>>(
    `with local as (
       select started_at at time zone 'America/Denver' as t from calls
       where started_at >= $1 and started_at < $2
     )
     select count(*)::int as total,
            count(*) filter (
              where extract(hour from t) < 8 or extract(hour from t) >= 17
                 or extract(isodow from t) in (6, 7)
            )::int as after_hours
     from local`,
    R(range),
  );
  const total = Number(r.total), afterHours = Number(r.after_hours);
  return { total, afterHours, pct: total ? (afterHours / total) * 100 : 0 };
}

/* ------------------------------------------------------------------ */

export interface TownRow {
  town: string;
  county: string | null;
  calls: number;
  booked: number;
}

export async function getTownBreakdown(range = last30Days()): Promise<TownRow[]> {
  if (!hasDbConfig()) return [];
  // Group on town alone: calls record the town the caller named but not always
  // the county, so grouping on both split "Bozeman" into two rows. The county is
  // recovered from the service-area list, which is the source of truth.
  return query<TownRow>(
    `with sa(town, county) as (values
       ('Bozeman','Gallatin'),('Belgrade','Gallatin'),('Manhattan','Gallatin'),
       ('Three Forks','Gallatin'),('Big Sky','Gallatin'),('Livingston','Park'),
       ('Ennis','Madison'),('West Yellowstone','Madison'))
     select t.town,
            coalesce(max(t.county), max(sa.county)) as county,
            count(*)::int as calls,
            count(*) filter (where t.outcome = 'booked')::int as booked
     from (
       select coalesce(c.town, cu.town, 'Unknown') as town,
              coalesce(c.county, cu.county)::text as county, c.outcome
       from calls c left join customers cu on cu.id = c.customer_id
       where c.started_at >= $1 and c.started_at < $2
     ) t left join sa on lower(sa.town) = lower(t.town)
     group by t.town order by calls desc, t.town`,
    R(range),
  );
}

/* ------------------------------------------------------------------ */

export interface TechUtilization {
  techId: string;
  name: string;
  county: string;
  onCall: boolean;
  /** Confirmed bookings in the next five business days. */
  bookedWindows: number;
  /** 4 two-hour windows × 5 business days. */
  capacityWindows: number;
  pct: number;
}

export async function getTechUtilization(): Promise<TechUtilization[]> {
  if (!hasDbConfig()) return [];
  const rows = await query<Record<string, unknown>>(
    `select t.id, t.name, t.home_county::text as county, t.on_call,
            count(b.id) filter (
              where b.status <> 'cancelled'
                and lower(b.arrival_window) >= date_trunc('day', now() at time zone 'America/Denver') at time zone 'America/Denver'
                and lower(b.arrival_window) <  (date_trunc('day', now() at time zone 'America/Denver') + interval '7 days') at time zone 'America/Denver'
            )::int as booked
     from techs t left join bookings b on b.tech_id = t.id
     group by t.id, t.name, t.home_county, t.on_call order by t.name`,
  );
  const capacity = 4 * 5;
  return rows.map((r) => ({
    techId: String(r.id),
    name: String(r.name),
    county: String(r.county),
    onCall: Boolean(r.on_call),
    bookedWindows: Number(r.booked),
    capacityWindows: capacity,
    pct: (Number(r.booked) / capacity) * 100,
  }));
}

/* ------------------------------------------------------------------ */

export interface FollowupItem {
  callId: string;
  startedAt: string;
  caller: string;
  town: string | null;
  priority: string | null;
  reason: string | null;
  summary: string | null;
  /** When a person marked this done; null while it is still open. */
  resolvedAt: string | null;
}

/** Dispatch's real morning work queue: calls that still need a person. */
export async function getFollowupQueue(
  limit = 50,
  opts: { includeResolved?: boolean } = {},
): Promise<FollowupItem[]> {
  if (!hasDbConfig()) return [];
  const rows = await query<Record<string, unknown>>(
    `select c.id, c.started_at, coalesce(cu.name, c.from_number, 'Unknown caller') as caller,
            coalesce(c.town, cu.town) as town, c.priority::text as priority,
            c.followup_reason, c.summary, c.followup_resolved_at
     from calls c left join customers cu on cu.id = c.customer_id
     where c.needs_human_followup
       and ($2::boolean or c.followup_resolved_at is null)
     order by (c.followup_resolved_at is not null), c.priority nulls last, c.started_at desc
     limit $1`,
    [limit, Boolean(opts.includeResolved)],
  );
  return rows.map((r) => ({
    callId: String(r.id),
    startedAt: new Date(String(r.started_at)).toISOString(),
    caller: String(r.caller),
    town: (r.town as string) ?? null,
    priority: (r.priority as string) ?? null,
    reason: (r.followup_reason as string) ?? null,
    summary: (r.summary as string) ?? null,
    resolvedAt: r.followup_resolved_at ? new Date(String(r.followup_resolved_at)).toISOString() : null,
  }));
}

export interface CallbackItem {
  id: string;
  createdAt: string;
  customerName: string | null;
  phone: string;
  reason: string;
  notes: string | null;
  resolved: boolean;
  resolvedAt: string | null;
}

export async function getCallbackQueue(limit = 50): Promise<CallbackItem[]> {
  if (!hasDbConfig()) return [];
  const rows = await query<Record<string, unknown>>(
    `select id, created_at, customer_name, phone, reason, notes, resolved, resolved_at
     from callback_requests order by resolved, created_at desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    createdAt: new Date(String(r.created_at)).toISOString(),
    customerName: (r.customer_name as string) ?? null,
    phone: String(r.phone),
    reason: String(r.reason),
    notes: (r.notes as string) ?? null,
    resolved: Boolean(r.resolved),
    resolvedAt: r.resolved_at ? new Date(String(r.resolved_at)).toISOString() : null,
  }));
}

export interface SafetyIncidentRow {
  id: string;
  createdAt: string;
  hazard: string;
  town: string | null;
  phone: string | null;
}

export async function getSafetyIncidents(limit = 50): Promise<SafetyIncidentRow[]> {
  if (!hasDbConfig()) return [];
  const rows = await query<Record<string, unknown>>(
    `select id, created_at, hazard, town, phone from safety_incidents
     order by created_at desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: String(r.id),
    createdAt: new Date(String(r.created_at)).toISOString(),
    hazard: String(r.hazard),
    town: (r.town as string) ?? null,
    phone: (r.phone as string) ?? null,
  }));
}

/* ------------------------------------------------------------------ */

export interface DailyPoint {
  /** YYYY-MM-DD in America/Denver. */
  day: string;
  calls: number;
  booked: number;
  escalated: number;
  costUsd: number;
}

/** One point per day, gaps filled with zeros so charts do not lie by omission. */
export async function getDailySeries(days = 14): Promise<DailyPoint[]> {
  if (!hasDbConfig()) return [];
  return query<DailyPoint>(
    `with days as (
       select generate_series(
         (date_trunc('day', now() at time zone 'America/Denver') - ($1::int - 1) * interval '1 day')::date,
         (date_trunc('day', now() at time zone 'America/Denver'))::date,
         interval '1 day'
       )::date as d
     ),
     agg as (
       select (started_at at time zone 'America/Denver')::date as d,
              count(*)::int as calls,
              count(*) filter (where outcome = 'booked')::int as booked,
              count(*) filter (where outcome = 'escalated')::int as escalated,
              coalesce(sum(cost_usd), 0)::float as cost_usd
       from calls group by 1
     )
     select to_char(days.d, 'YYYY-MM-DD') as day,
            coalesce(agg.calls, 0)::int as calls,
            coalesce(agg.booked, 0)::int as booked,
            coalesce(agg.escalated, 0)::int as escalated,
            coalesce(agg.cost_usd, 0)::float as "costUsd"
     from days left join agg on agg.d = days.d order by days.d`,
    [days],
  );
}
