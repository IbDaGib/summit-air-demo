"use server";

/**
 * The two writes /queue can make. Thin wrappers over _data/mutations.ts so the
 * client never imports a database module, and so the page revalidates once,
 * here, rather than in every caller.
 *
 * Auth: server actions POST to the page URL (/queue), and proxy.ts denies every
 * /queue request that does not carry the dashboard cookie — so an unauthenticated
 * POST never reaches this file. The cookie is checked again here anyway; the
 * Next docs are explicit that actions are reachable by direct POST and should
 * not lean on a proxy alone. There is no per-user identity behind the cookie, so
 * nothing about the caller is recorded (DECISIONS.md, "Dashboard writes are a
 * plain toggle").
 *
 * Failures come back as a value rather than a throw: Next replaces thrown
 * messages with a generic one in production, and the toast should be able to
 * say why.
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { setCallbackResolved, setFollowupResolved } from "../_data/mutations";

export type ResolveResult = { ok: true } | { ok: false; error: string };

/** Both tables key on Postgres `uuid` columns; anything else is not an id we issued. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same cookie name and comparison target as proxy.ts. */
const COOKIE = "summit_dash";

async function authorised(): Promise<boolean> {
  const secret = process.env.DASH_SECRET;
  if (!secret) return false;
  const supplied = (await cookies()).get(COOKIE)?.value;
  return supplied !== undefined && supplied === secret;
}

async function run(
  id: unknown,
  resolved: unknown,
  write: (id: string, resolved: boolean) => Promise<void>,
): Promise<ResolveResult> {
  if (!(await authorised())) return { ok: false, error: "Not signed in to the dashboard." };
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: "Malformed id." };
  if (typeof resolved !== "boolean") return { ok: false, error: "Malformed request." };
  try {
    await write(id, resolved);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Database write failed." };
  }
  revalidatePath("/queue");
  return { ok: true };
}

export async function resolveFollowup(callId: string, resolved: boolean): Promise<ResolveResult> {
  return run(callId, resolved, setFollowupResolved);
}

export async function resolveCallback(id: string, resolved: boolean): Promise<ResolveResult> {
  return run(id, resolved, setCallbackResolved);
}
