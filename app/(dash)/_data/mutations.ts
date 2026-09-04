/**
 * The dashboard's only writes. Owned by main.
 *
 * Both are plain, reversible toggles — no operator attribution, by decision
 * (DECISIONS.md "Dashboard writes"). Nothing is deleted: resolving stamps a
 * timestamp, un-resolving clears it. Pages call these from server actions; the
 * proxy's shared secret is the only gate, and these functions record nothing
 * about who called them because there is nothing true to record.
 */
import { hasDbConfig, query } from "../../../db/neon";

export async function setFollowupResolved(callId: string, resolved: boolean): Promise<void> {
  if (!hasDbConfig()) return;
  await query(
    `update calls set followup_resolved_at = case when $2::boolean then now() else null end
     where id::text = $1 and needs_human_followup`,
    [callId, resolved],
  );
}

export async function setCallbackResolved(id: string, resolved: boolean): Promise<void> {
  if (!hasDbConfig()) return;
  await query(
    `update callback_requests
     set resolved = $2::boolean, resolved_at = case when $2::boolean then now() else null end
     where id::text = $1`,
    [id, resolved],
  );
}
