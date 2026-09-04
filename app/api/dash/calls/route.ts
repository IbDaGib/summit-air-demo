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
import { listCalls } from "../../../(dash)/_data/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const calls = await listCalls();
  return NextResponse.json(
    { calls, fetchedAt: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
