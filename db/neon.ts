/**
 * Neon (plain Postgres) data access.
 *
 * Replaces the supabase-js client. Supabase had a multi-region outage on project
 * creation during the build, so this moved to Neon — the migration ran unchanged
 * because it is plain Postgres and `btree_gist` is available on both, so the
 * `bookings_no_overlap` exclusion constraint survived the switch intact.
 *
 * Deliberately plain SQL rather than a shim over supabase-js's `.from().select()`
 * chain: less code, and the queries read as the queries they are.
 */
import { neon } from "@neondatabase/serverless";
import { Client } from "@neondatabase/serverless";

export function hasDbConfig(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function url(): string {
  const u = process.env.DATABASE_URL;
  if (!u) {
    throw new Error(
      "DATABASE_URL is not set. Run `vercel env pull` or set it in .env.local.",
    );
  }
  return u;
}

/** HTTP query — one statement, one round trip. Right for reads. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const sql = neon(url());
  return (await sql.query(text, params)) as T[];
}

export async function one<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/**
 * WebSocket client, for anything needing more than one statement — a
 * transaction, or the PL/pgSQL bodies in the migrations.
 */
export async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client(url());
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Postgres exclusion-constraint violation. What a double-booking looks like. */
export const EXCLUSION_VIOLATION = "23P01";

export function isExclusionViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === EXCLUSION_VIOLATION
  );
}

/**
 * Parameterised multi-row upsert built from the rows' own keys.
 *
 * Every value is a bound parameter — nothing is interpolated into SQL. Column
 * names are validated against a strict identifier pattern, since they come from
 * object keys rather than user input but should not be trusted implicitly.
 */
export async function upsertRows(
  table: string,
  rows: Record<string, unknown>[],
  conflictTarget: string,
): Promise<number> {
  if (!rows.length) return 0;
  const ident = /^[a-z_][a-z0-9_]*$/;
  if (!ident.test(table)) throw new Error(`unsafe table name: ${table}`);

  const cols = Object.keys(rows[0]);
  for (const c of cols) if (!ident.test(c)) throw new Error(`unsafe column name: ${c}`);
  if (!ident.test(conflictTarget)) throw new Error(`unsafe conflict target: ${conflictTarget}`);

  const params: unknown[] = [];
  const tuples = rows.map((r) => {
    const placeholders = cols.map((c) => {
      params.push(r[c] ?? null);
      return `$${params.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });

  const updates = cols
    .filter((c) => c !== conflictTarget)
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");

  const text =
    `insert into ${table} (${cols.join(", ")}) values ${tuples.join(", ")} ` +
    `on conflict (${conflictTarget}) do update set ${updates}`;

  await query(text, params);
  return rows.length;
}
