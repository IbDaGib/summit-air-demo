/**
 * Timezone-aware time helpers. Summit Air dispatches in Montana, so every
 * caller-facing time is rendered in America/Denver regardless of where this
 * process runs — a Vercel function in UTC must not offer "8 in the morning"
 * and mean 2am.
 *
 * All arithmetic goes through Intl rather than a date library: no dependency,
 * and DST is handled by the platform's own tz database.
 */

export const TIMEZONE = "America/Denver";

const FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "long",
});

/** A calendar date in Montana, independent of any instant. */
export interface CalendarDay {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export interface ZonedParts extends CalendarDay {
  hour: number;
  minute: number;
  second: number;
  weekday: string;
  /** "2026-01-14" in Montana. The key we compare days by. */
  dateKey: string;
}

export function zonedParts(instant: Date): ZonedParts {
  const found: Record<string, string> = {};
  for (const part of FORMAT.formatToParts(instant)) {
    if (part.type !== "literal") found[part.type] = part.value;
  }
  return {
    year: Number(found.year),
    month: Number(found.month),
    day: Number(found.day),
    hour: Number(found.hour),
    minute: Number(found.minute),
    second: Number(found.second),
    weekday: found.weekday ?? "",
    dateKey: `${found.year}-${found.month}-${found.day}`,
  };
}

/** Montana's offset from UTC at a given instant, in milliseconds. */
function offsetMs(instant: Date): number {
  const p = zonedParts(instant);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant.getTime();
}

/**
 * The instant at which Montana's wall clock reads the given date and time.
 * Resolved twice so a time that straddles a DST transition lands correctly.
 */
export function zonedTimeToInstant(day: CalendarDay, hour: number, minute = 0): Date {
  const naive = Date.UTC(day.year, day.month - 1, day.day, hour, minute);
  const first = naive - offsetMs(new Date(naive));
  const second = naive - offsetMs(new Date(first));
  return new Date(second);
}

export function calendarDayOf(instant: Date): CalendarDay {
  const { year, month, day } = zonedParts(instant);
  return { year, month, day };
}

export function dateKeyOf(day: CalendarDay): string {
  return `${String(day.year).padStart(4, "0")}-${String(day.month).padStart(2, "0")}-${String(
    day.day,
  ).padStart(2, "0")}`;
}

export function addDays(day: CalendarDay, count: number): CalendarDay {
  const d = new Date(Date.UTC(day.year, day.month - 1, day.day));
  d.setUTCDate(d.getUTCDate() + count);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 0 = Sunday. */
export function weekdayIndex(day: CalendarDay): number {
  return new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
}

export function isWeekend(day: CalendarDay): boolean {
  const i = weekdayIndex(day);
  return i === 0 || i === 6;
}

/** "08:00" or "08:00:00" -> 8. Postgres `time` columns come back either way. */
export function parseClockHour(value: string): number {
  const hour = Number(value.slice(0, 2));
  return Number.isFinite(hour) ? hour : 0;
}

const to12Hour = (hour: number): number => (hour % 12 === 0 ? 12 : hour % 12);

/**
 * How a person says an arrival window out loud: "tomorrow between 8 and 10 in
 * the morning". Written for text-to-speech — no digits-as-times, no am/pm
 * abbreviations, nothing a voice will read as "eight colon zero zero".
 */
export function spokenWindow(start: Date, end: Date, now: Date): string {
  const s = zonedParts(start);
  const e = zonedParts(end);
  const today = calendarDayOf(now);

  let when: string;
  if (s.dateKey === dateKeyOf(today)) when = "today";
  else if (s.dateKey === dateKeyOf(addDays(today, 1))) when = "tomorrow";
  else if (s.dateKey === dateKeyOf(addDays(today, 2))) when = `the day after tomorrow, ${s.weekday}`;
  else when = s.weekday;

  const partOfDay = s.hour < 12 ? "in the morning" : s.hour < 17 ? "in the afternoon" : "in the evening";
  return `${when} between ${to12Hour(s.hour)} and ${to12Hour(e.hour)} ${partOfDay}`;
}

/** "Thursday the 4th of September" — for reading a date back on a confirmation. */
export function spokenDate(instant: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(instant);
}
