/**
 * The order dispatch works the follow-up queue: open rows first, then the
 * hottest tier, and within a tier the call that landed most recently. Anything
 * without a tier — the call ended before assess_situation ran — goes to the
 * bottom of its group, because a person has to read it before they can rank it.
 *
 * Resolved rows only appear when the page asks for them (?resolved=1). They
 * sort below every open row whatever their tier: a closed P0 is a record, not
 * work, and must never sit above an open P3.
 *
 * The SQL behind getFollowupQueue orders the same way — resolved last, then the
 * priority enum, then newest. This is the explicit, tested version so the page
 * does not depend on enum declaration order, and so a future change to either
 * side cannot quietly undo the other.
 */
import type { FollowupItem } from "../_data/metrics";

const RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const UNRANKED = 9;

const rank = (p: string | null): number => (p ? (RANK[p] ?? UNRANKED) : UNRANKED);

export function sortFollowups(items: FollowupItem[]): FollowupItem[] {
  return [...items].sort((a, b) => {
    const da = a.resolvedAt === null ? 0 : 1;
    const db = b.resolvedAt === null ? 0 : 1;
    if (da !== db) return da - db;
    const ra = rank(a.priority);
    const rb = rank(b.priority);
    if (ra !== rb) return ra - rb;
    return b.startedAt.localeCompare(a.startedAt);
  });
}
