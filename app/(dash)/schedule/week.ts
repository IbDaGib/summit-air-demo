/**
 * The schedule's unit of navigation is a Denver week, Mon–Fri, addressed by
 * the Monday's calendar date: `?week=2026-09-07`.
 *
 * Everything here is pure. Calendar arithmetic on a key happens in UTC via
 * `Date.UTC`, where a day is always 86,400,000 ms, so shifting by a week can
 * never land 23 or 25 hours off across a DST change. Only the two places that
 * need a real instant — the query bounds and the column headers — go through
 * `denverInstant`, which resolves the zone offset at the target instant.
 *
 * Weeks are ISO: Monday first, Sunday last. A `now` on Sunday therefore
 * belongs to the week that began six days earlier, not the one starting
 * tomorrow. That is the behaviour a dispatcher expects on a Sunday evening —
 * "this week" is the one they are finishing.
 */

import { denverDayKey, denverInstant, denverMonthDay } from "../_ui/time";

/** `YYYY-MM-DD` of a Monday, as a Denver calendar date. */
export type WeekKey = string;

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A key as UTC midnight of that calendar date. NaN for nonsense like month 13. */
function keyToUtc(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToKey(ms: number): WeekKey {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 0 = Monday … 6 = Sunday. */
function isoWeekday(ms: number): number {
  return (new Date(ms).getUTCDay() + 6) % 7;
}

/**
 * An instant that is unambiguously on `key` in Denver, to seed `denverInstant`.
 * Noon UTC is 05:00 or 06:00 in Denver, so it is on the same calendar day on
 * both sides of a transition; `denverInstant` then resolves the exact offset.
 */
function anchor(key: WeekKey): Date {
  return new Date(`${key}T12:00:00Z`);
}

/** Monday of the Denver week containing `now`. */
export function weekKeyOf(now: Date): WeekKey {
  const today = keyToUtc(denverDayKey(now));
  return utcToKey(today - isoWeekday(today) * DAY);
}

/**
 * `?week=` from the URL, or the current week when it is missing, repeated,
 * malformed, a date that does not exist, or not a Monday. Never throws — a
 * mistyped address bar should show this week, not an error page.
 */
export function parseWeekParam(param: string | string[] | undefined, now: Date): WeekKey {
  if (typeof param !== "string" || !KEY.test(param)) return weekKeyOf(now);
  const ms = keyToUtc(param);
  // Round-tripping catches both NaN and rollover (Feb 30 -> Mar 2).
  if (Number.isNaN(ms) || utcToKey(ms) !== param) return weekKeyOf(now);
  if (isoWeekday(ms) !== 0) return weekKeyOf(now);
  return param;
}

/** The key `weeks` whole weeks away. Negative goes back. */
export function shiftWeek(key: WeekKey, weeks: number): WeekKey {
  return utcToKey(keyToUtc(key) + weeks * WEEK);
}

/**
 * Query bounds for the week: Monday 00:00 through Saturday 00:00, Denver, as
 * a half-open `[from, to)` range. Saturday and Sunday are not shown, so
 * anything booked on them is deliberately outside the window.
 */
export function weekRange(key: WeekKey): { from: Date; to: Date } {
  const a = anchor(key);
  return { from: denverInstant(0, 0, a), to: denverInstant(5, 0, a) };
}

/** Mon–Fri as Denver-noon instants — safe to label with any of the time.ts formatters. */
export function weekDays(key: WeekKey): Date[] {
  const a = anchor(key);
  return [0, 1, 2, 3, 4].map((i) => denverInstant(i, 12, a));
}

/** "Sep 7 – 11", or "Sep 28 – Oct 2" when the week straddles a month. */
export function weekLabel(key: WeekKey): string {
  const days = weekDays(key);
  const mon = denverMonthDay(days[0].toISOString());
  const fri = denverMonthDay(days[4].toISOString());
  const [monMonth] = mon.split(" ");
  const [friMonth, friDay] = fri.split(" ");
  return monMonth === friMonth ? `${mon} – ${friDay}` : `${mon} – ${fri}`;
}

/** Whole weeks between `key` and the week containing `now`; negative is the past. */
export function weekOffset(key: WeekKey, now: Date): number {
  return Math.round((keyToUtc(key) - keyToUtc(weekKeyOf(now))) / WEEK);
}

/** "this week", "next week", "last week", "in 3 weeks", "2 weeks ago". */
export function weekRelation(key: WeekKey, now: Date): string {
  const n = weekOffset(key, now);
  if (n === 0) return "this week";
  if (n === 1) return "next week";
  if (n === -1) return "last week";
  return n > 0 ? `in ${n} weeks` : `${-n} weeks ago`;
}
