/**
 * Timezone and `tstzrange` helpers.
 *
 * Two things go wrong with scheduling code and both are avoided here:
 *
 *  1. Bare local timestamps. Every value written to Postgres carries an explicit
 *     UTC offset. Nothing in this file ever emits "2026-09-04T08:00:00".
 *  2. Hardcoding -07:00 (or -06:00) for Mountain time. Montana observes DST, so
 *     the offset is derived per date from the IANA database. A January demo of a
 *     September build must still produce correct instants.
 *
 * Arrival windows are half-open `[start, end)`. That matters: back-to-back
 * windows ending and starting at 10:00 must NOT count as an overlap, or the
 * EXCLUDE constraint would reject a perfectly valid consecutive booking.
 */

export const TIMEZONE = "America/Denver";

const OFFSET_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  timeZoneName: "longOffset",
});

const DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  weekday: "short",
});

/** "YYYY-MM-DD" for the given instant in Mountain time. Defaults to now. */
export function denverDate(instant: Date = new Date()): string {
  return DATE_FMT.format(instant);
}

/** "Mon" … "Sun" for the given instant in Mountain time. */
export function denverWeekday(instant: Date): string {
  return WEEKDAY_FMT.format(instant);
}

/** A Date fixed at noon UTC on a "YYYY-MM-DD" — a safe anchor for day math. */
function anchor(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** "YYYY-MM-DD" shifted by whole days, staying on calendar days. */
export function addDays(day: string, delta: number): string {
  const a = anchor(day);
  a.setUTCDate(a.getUTCDate() + delta);
  return a.toISOString().slice(0, 10);
}

/** True for Mon–Fri in Mountain time. Holidays are a separate check. */
export function isWeekday(day: string): boolean {
  const name = denverWeekday(anchor(day));
  return name !== "Sat" && name !== "Sun";
}

/**
 * UTC offset in effect in Mountain time on that calendar day, as "-06:00" /
 * "-07:00". Resolved at 12:00 UTC (06:00 local), which is past the 02:00 DST
 * changeover, so it is the offset that applies to any working-hours window on
 * that day.
 */
export function denverOffset(day: string): string {
  const parts = OFFSET_FMT.formatToParts(anchor(day));
  const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  // "GMT-06:00", or "GMT-6" / "GMT" in thinner ICU builds.
  const m = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(raw);
  if (!m) return "+00:00";
  const [, sign, hh, mm] = m;
  return `${sign}${hh.padStart(2, "0")}:${mm ?? "00"}`;
}

/**
 * An ISO timestamp for Mountain wall-clock time on a given day, with the offset
 * spelled out: denverTimestamp("2026-09-04", 8) -> "2026-09-04T08:00:00-06:00".
 */
export function denverTimestamp(day: string, hour: number, minute = 0): string {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${day}T${hh}:${mm}:00${denverOffset(day)}`;
}

/**
 * Literal for a `tstzrange` column. Half-open, and each bound keeps its offset.
 * PostgREST casts the string to tstzrange server-side.
 */
export function tstzRange(startsAt: string, endsAt: string): string {
  return `["${startsAt}","${endsAt}")`;
}

/** Half-open arrival window from Mountain wall-clock hours on a given day. */
export function denverWindow(day: string, startHour: number, endHour: number): string {
  return tstzRange(denverTimestamp(day, startHour), denverTimestamp(day, endHour));
}

/**
 * Read a `tstzrange` back out of a row. Postgres renders it as
 * `["2026-09-04 08:00:00-06","2026-09-04 10:00:00-06")`; the space and the
 * two-digit offset both need normalizing before Date can parse it.
 */
export function parseTstzRange(raw: string): { startsAt: Date; endsAt: Date } {
  const m = /^[[(]\s*"?([^",]+)"?\s*,\s*"?([^",]+)"?\s*[\])]$/.exec(raw.trim());
  if (!m) throw new Error(`Not a tstzrange literal: ${raw}`);
  return { startsAt: parsePgTimestamp(m[1]), endsAt: parsePgTimestamp(m[2]) };
}

function parsePgTimestamp(value: string): Date {
  let s = value.trim().replace(" ", "T");
  // "-06" -> "-06:00"; leave "-06:00" and "Z" alone.
  s = s.replace(/([+-]\d{2})$/, "$1:00");
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Unparseable timestamp: ${value}`);
  return d;
}

/** Mountain-time clock rendering, e.g. "8:00 AM". Never render UTC to a human. */
export function denverClock(instant: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
}
