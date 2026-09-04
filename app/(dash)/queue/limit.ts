/**
 * How many rows each queue tab shows, and what the tab badge says when there
 * were more.
 *
 * The page asks metrics for LIMIT + 1 rows and renders LIMIT. The spare row is
 * the only signal that the fetch was cut short, and the badge then reads "50+"
 * rather than a number that would pass for a total. A real count waits on a
 * total in metrics.ts; this keeps the badge honest until then.
 */
export const LIMIT = 50;

/** "7" up to the cap; "50+" once the fetch came back with more than that. */
export function countLabel(n: number, limit = LIMIT): string {
  return n > limit ? `${limit}+` : String(n);
}
