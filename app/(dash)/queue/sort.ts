/**
 * The order dispatch works the follow-up queue: hottest tier first, and within
 * a tier the call that landed most recently. Anything without a tier — the call
 * ended before assess_situation ran — goes to the bottom, because a person has
 * to read it before they can rank it.
 *
 * The SQL behind getFollowupQueue orders by the priority enum, which happens
 * to sort the same way today. This is the explicit, tested version so the page
 * does not depend on enum declaration order.
 */
import type { FollowupItem } from "../_data/metrics";

const RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const UNRANKED = 9;

export function sortFollowups(items: FollowupItem[]): FollowupItem[] {
  return [...items].sort((a, b) => {
    const ra = a.priority ? (RANK[a.priority] ?? UNRANKED) : UNRANKED;
    const rb = b.priority ? (RANK[b.priority] ?? UNRANKED) : UNRANKED;
    if (ra !== rb) return ra - rb;
    return b.startedAt.localeCompare(a.startedAt);
  });
}
