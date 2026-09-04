/**
 * Formatters the queue page needs that do not exist in _ui/time.ts yet.
 *
 * Deliberately local to /queue. The shared app/(dash)/_ui/format.ts has merged
 * and is number formatters only (usd, usdPerUnit, pct, duration, count) — it has
 * neither relativeTime nor formatPhone, so there is no swap to make. If a second
 * page needs these, promote them to _ui/ then.
 *
 * Everything here is display-only and pinned to America/Denver, like the rest
 * of _ui/time.ts. Nothing derives urgency from a date.
 */
import { DENVER, denverDayKey, denverMonthDay, denverTime, denverWeekday } from "../_ui/time";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Parts for "Mon 2 Sep" — en-US gives "Sep", en-GB would give "Sept". */
const dayParts = new Intl.DateTimeFormat("en-US", {
  timeZone: DENVER,
  weekday: "short",
  day: "numeric",
  month: "short",
});

/**
 * "just now", "3m ago", "2h ago", "yesterday", else "Mon 2 Sep".
 *
 * "yesterday" means the previous Denver calendar day, not 24–48 hours ago: a
 * call at 1am on Monday, read at 11pm Tuesday, is "yesterday" — it happened on
 * yesterday's sheet. Under 24 hours the hour count is more useful and is kept.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const diff = Math.max(0, now.getTime() - at.getTime());
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  const yesterday = new Date(now.getTime() - DAY);
  if (denverDayKey(at) === denverDayKey(yesterday)) return "yesterday";
  const p = Object.fromEntries(dayParts.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "Wed Sep 3, 2:41 PM Denver" — the tooltip behind a relative time. */
export function denverStamp(iso: string): string {
  return `${denverWeekday(iso)} ${denverMonthDay(iso)}, ${denverTime(iso)} Denver`;
}

/** +14065550118 -> (406) 555-0118. Anything unexpected is shown as-is. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return ten.length === 10
    ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`
    : raw;
}

/**
 * A text column as something to show, or null. The database accepts an empty
 * or whitespace-only string where a person left the field blank; treating
 * that as text renders an empty cell, or a tel: link with nothing behind it.
 */
export function present(s: string | null | undefined): string | null {
  const t = s?.trim() ?? "";
  return t === "" ? null : t;
}
