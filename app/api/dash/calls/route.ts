/**
 * The 3s poll behind app/(dash)/calls. Returns the same CallSummary rows the
 * page rendered on the server, so the client swap is a straight replacement.
 *
 * Protected by proxy.ts along with the rest of /calls and /schedule — the
 * matcher covers /api/dash. Server-side only; nothing here reaches a client
 * bundle, which is what keeps SUPABASE_SERVICE_ROLE_KEY out of the browser once
 * the real db/client.ts is wired in.
 */

import { NextResponse } from "next/server";
import { listCalls, listCallsSince } from "../../../(dash)/_data/client";

export const dynamic = "force-dynamic";

/**
 * `?since=<ISO>` returns only calls that started after that instant, so the
 * global toaster gets a delta rather than diffing two fifty-row lists. Rows
 * appear here when the end-of-call report is written, which means a "new" call
 * already carries its outcome and priority — a toast can say "booked" or
 * "escalated" and be right.
 */
export async function GET(req: Request) {
  const since = new URL(req.url).searchParams.get("since");
  const calls =
    since && !Number.isNaN(Date.parse(since)) ? await listCallsSince(since) : await listCalls();
  return NextResponse.json(
    { calls, fetchedAt: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
