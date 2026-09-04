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
