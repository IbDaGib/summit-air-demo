/**
 * The `?since=` delta for the global toaster. A row lands in `calls` when the
 * end-of-call report arrives, carrying a `started_at` that is already a call's
 * length in the past. Filtering on `started_at` therefore hides every real call
 * from a cursor pinned to the server clock (found by Workspace C, round 4).
 * `ended_at` is written in the same insert and is within seconds of it, so it
 * is the honest "entered at" instant; `started_at` is only the fallback for a
 * row with no end time.
 */
export interface SinceRow {
  startedAt: string;
  endedAt: string | null;
}

/** The instant a row became visible to the dashboard. */
export const enteredAt = (c: SinceRow): number => Date.parse(c.endedAt ?? c.startedAt);

/** Rows entered strictly after `since`. An unparseable `since` means "everything". */
export function newerThan<T extends SinceRow>(rows: T[], since: string | null): T[] {
  const cutoff = since === null ? NaN : Date.parse(since);
  return Number.isNaN(cutoff) ? rows : rows.filter((c) => enteredAt(c) > cutoff);
}
