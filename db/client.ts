/**
 * Supabase client for server code.
 *
 * SERVER ONLY. This uses SUPABASE_SERVICE_ROLE_KEY, which bypasses row-level
 * security — importing it from a client component would ship a full-access
 * database key to the browser. There is a runtime guard below, but the real
 * protection is: only import this from route handlers, server components,
 * scripts and the eval harness.
 *
 * The key is deliberately NOT prefixed NEXT_PUBLIC_, so Next will not inline it
 * into client bundles.
 *
 * The client is built lazily. Module-load-time construction would make
 * `next build` fail on any machine without credentials, and CI does not have a
 * database.
 *
 * ---------------------------------------------------------------------------
 * PORTING TO NEON (or any plain Postgres)
 *
 * Supabase is only ever reached over PostgREST here — no auth, storage, realtime
 * or edge functions — so the swap is mechanical. Everything that would change
 * lives in three places, and nothing else in the repo needs to move:
 *
 *  1. This file. `createClient(url, key)` becomes a `pg` Pool over
 *     `DATABASE_URL`, and `Db` becomes whatever that exposes. The two env vars
 *     below become one connection string; keep it un-prefixed so it stays off
 *     the client bundle. `hasDbConfig()` and the browser guard carry over as-is.
 *
 *  2. Query call sites — the `.from(...).select/insert/upsert/delete` chains in
 *     db/seed.ts and agent/tools/handlers/*. These are supabase-js's PostgREST
 *     query builder, not SQL, so each becomes a parameterized statement. Three
 *     details to keep:
 *       - `{ onConflict: "id" }` is `insert ... on conflict (id) do update`.
 *       - Errors arrive as a returned `{ error }`, not a throw. Node-postgres
 *         throws, so `book_appointment` needs a try/catch to keep honouring
 *         "never throw into a live call".
 *       - The exclusion violation is `error.code === "23P01"` either way; that
 *         is a Postgres SQLSTATE, not a Supabase invention.
 *
 *  3. `db.rpc("replace_seed_schedule", ...)` in db/seed.ts. The function itself
 *     is plain PL/pgSQL and runs unchanged on Neon; only the PostgREST-flavoured
 *     invocation changes, to `select * from replace_seed_schedule($1)`.
 *
 * Not portable and not used: RLS policies (the service role bypasses them),
 * `auth.uid()`, and the PostgREST schema cache — which is why a missing function
 * surfaces as PGRST202 today and would be a plain "does not exist" on Neon.
 *
 * db/types.ts is hand-written and stays exactly as it is. Both migrations are
 * ordinary Postgres and need no edits; Neon ships btree_gist, so the EXCLUDE
 * constraint comes across intact.
 * ---------------------------------------------------------------------------
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type Db = SupabaseClient<Database>;

let cached: Db | null = null;

/** True when both env vars are present, so callers can degrade instead of throw. */
export function hasDbConfig(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * The shared service-role client. Throws if called in a browser or without
 * credentials — both are configuration bugs, not runtime conditions to handle.
 */
export function getDb(): Db {
  if (typeof window !== "undefined") {
    throw new Error(
      "db/client.ts is server-only: it holds the service-role key. Import it from a " +
        "route handler or server component, never from a client component.",
    );
  }
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example " +
        "to .env.local and fill them in.",
    );
  }

  cached = createClient<Database>(url, serviceRoleKey, {
    auth: {
      // A service-role client has no user session to persist or refresh.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "x-application-name": "summit-air-dispatch" },
    },
  });
  return cached;
}

/** Drops the memoized client. For tests that swap env vars between cases. */
export function resetDb(): void {
  cached = null;
}
