/**
 * What every handler is given: a data port and a clock.
 *
 * The clock is injected rather than read from `new Date()` inside the handlers
 * so scheduling behaviour is testable at a fixed instant, and so an eval can
 * replay a January scenario in September without touching the system time.
 */
import { createClient } from "@supabase/supabase-js";
import { createInMemoryRepository } from "./memoryRepository";
import type { DispatchRepository } from "./repository";
import { createSupabaseRepository } from "./supabaseRepository";

export interface HandlerDeps {
  repo: DispatchRepository;
  now: () => Date;
}

/**
 * Mask a phone number for the operational log stream.
 *
 * Keeps the last four digits, which is enough to correlate a log line with a
 * call, and drops the rest. Nothing is lost: Vapi already holds the carrier
 * number against the call record, so an incident can still be traced back to a
 * person — just not from the log drain alone.
 *
 * Greptile flagged unredacted callback numbers in the escalation failure log on
 * PR #2. This is the one helper every log site goes through.
 */
export function maskPhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `****${digits.slice(-4)}`;
}

/** Structured, greppable, and safe to ship to a log drain — phone numbers masked. */
export function logEvent(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ evt: event, ...fields }));
}

export function logFailure(event: string, fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ evt: event, ...fields }));
}

let cached: DispatchRepository | null = null;

/**
 * Supabase when it is configured, fixtures when it is not.
 *
 * Falling back rather than throwing is deliberate: a missing environment
 * variable should not be the reason a caller with no heat hears dead air. The
 * warning is loud so a fallback in production is obvious in the logs.
 *
 * Once Workspace A lands db/client.ts, this becomes `return supabaseRepository(db)`.
 */
export function defaultRepository(): DispatchRepository {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    logFailure("repository_fallback", {
      reason: "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is unset",
      using: "in-memory fixtures",
    });
    cached = createInMemoryRepository();
    return cached;
  }

  cached = createSupabaseRepository(
    createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
  );
  return cached;
}

/** Test seam. */
export function resetDefaultRepository(): void {
  cached = null;
}
