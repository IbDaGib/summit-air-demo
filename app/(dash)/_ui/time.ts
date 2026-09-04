/**
 * Every timestamp in this app is a `timestamptz` from Postgres. Dispatch runs on
 * Montana time, so nothing is ever rendered in the viewer's local zone: each
 * formatter below pins `timeZone: DENVER`. That also makes server and client
 * output identical, so the 3s poll cannot cause a hydration mismatch.
 *
 * Nothing here derives urgency or seasonality from a date — these are display
 * and layout helpers only. Urgency comes from reported conditions and outdoor
 * temperature (agent/policy/priority.ts).
 */

export const DENVER = "America/Denver";

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: DENVER, ...opts });

/** "2:41 PM" */
const clock = fmt({ hour: "numeric", minute: "2-digit" });
/** "2:41:07 PM" — the trace needs seconds to read as a sequence. */
const clockSeconds = fmt({ hour: "numeric", minute: "2-digit", second: "2-digit" });
/** "Sep 3" */
const monthDay = fmt({ month: "short", day: "numeric" });
/** "Wed" */
const weekday = fmt({ weekday: "short" });
/** Sortable Denver calendar day, e.g. "2026-09-03". */
const ymd = fmt({ year: "numeric", month: "2-digit", day: "2-digit" });

/** Denver wall-clock parts of an instant, as numbers. */
const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: DENVER,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export const denverTime = (iso: string) => clock.format(new Date(iso));
export const denverTimeWithSeconds = (iso: string) => clockSeconds.format(new Date(iso));
export const denverMonthDay = (iso: string) => monthDay.format(new Date(iso));
export const denverWeekday = (iso: string) => weekday.format(new Date(iso));

/** "2026-09-03" in Denver — the key the schedule grid buckets bookings by. */
export const denverDayKey = (at: string | Date) => {
  const d = typeof at === "string" ? new Date(at) : at;
  const [m, day, y] = ymd.format(d).split("/");
  return `${y}-${m}-${day}`;
};

/** "8–10 AM" — an arrival window, the way dispatch says it out loud. */
export function arrivalWindow(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const meridiem = (d: Date) => (clock.format(d).endsWith("AM") ? "AM" : "PM");
  const bare = (d: Date) => clock.format(d).replace(/:00/, "").replace(/\s?[AP]M/, "");
  return meridiem(s) === meridiem(e)
    ? `${bare(s)}–${bare(e)} ${meridiem(e)}`
    : `${bare(s)} ${meridiem(s)}–${bare(e)} ${meridiem(e)}`;
}

/** "just now", "4m ago", "2h ago", "3d ago". */
export function relativeAge(iso: string, now: number = Date.now()): string {
  const secs = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (secs < 45) return "just now";
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86_400) return `${Math.round(secs / 3600)}h ago`;
  return `${Math.round(secs / 86_400)}d ago`;
}

/** "6m 12s" — call length. */
export function duration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "live";
  const secs = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

/** Minutes America/Denver is offset from UTC at that instant (DST-aware). */
export function denverOffsetMinutes(at: Date): number {
  const p = Object.fromEntries(
    parts.formatToParts(at).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return (asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000;
}

/** The Denver wall-clock hour at an instant, 0–23. */
function denverHourAt(at: Date): number {
  const p = Object.fromEntries(
    parts.formatToParts(at).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return Number(p.hour);
}

/**
 * The instant at which it is `hour:00` in Denver, `dayOffset` days from `from`.
 * Used to lay out the schedule grid and to seed fixtures — going through the
 * real zone offset means the grid stays correct across a DST boundary.
 *
 * TODO(swap): db/range.ts (Workspace A, PR #1) resolves the same offset per
 * date from the IANA database. Once that merges, delete this and use its
 * `denverTimestamp(day, hour)` rather than keeping a second implementation.
 * One difference to check when swapping: `denverOffset()` there anchors at
 * 12:00 UTC, which is past the 02:00 changeover, so it is correct for
 * working-hours windows but not for the midnight range bounds the schedule
 * page asks for on a DST date.
 */
export function denverInstant(dayOffset: number, hour: number, from: Date = new Date()): Date {
  const shifted = new Date(from.getTime() + dayOffset * 86_400_000);
  const day = denverDayKey(shifted);
  const wallAsUtc = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00Z`).getTime();

  // Two passes, because the offset has to be resolved at the *target* instant.
  // Reading it from the wall-time-as-UTC guess puts it on the wrong side of a
  // DST transition — an 8:00 window on Denver's spring-forward date rendered as
  // 9:00. The first pass lands near the answer, the second resolves the offset
  // there and corrects it.
  const first = new Date(wallAsUtc - denverOffsetMinutes(new Date(wallAsUtc)) * 60_000);
  const second = new Date(wallAsUtc - denverOffsetMinutes(first) * 60_000);

  // Spring forward: 02:00–02:59 does not exist in Denver, so no instant has the
  // requested hour and the second pass lands an hour *before* what was asked
  // for (02:00 -> 01:00 MST). The first pass is the instant the clock jumps to
  // (03:00 MDT), which is what asking for "2 AM" has to mean on that date.
  return denverHourAt(second) === hour ? second : first;
}
