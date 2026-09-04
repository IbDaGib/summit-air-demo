/**
 * Applies db/migrations/*.sql in order.
 *
 *   npx tsx --env-file=.env.local scripts/apply-migrations.mts
 *
 * Uses the WebSocket Client rather than the HTTP `neon()` helper because the
 * migrations contain PL/pgSQL bodies delimited by $$, which cannot be safely
 * split into single statements.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const dir = join(process.cwd(), "db", "migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const client = new Client(url);
await client.connect();

const version = await client.query("select current_database() as db, version() as v");
console.log(`connected: ${version.rows[0].db} — ${String(version.rows[0].v).slice(0, 30)}`);

for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  try {
    await client.query(sql);
    console.log(`  ✓ ${f}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Re-running a migration is expected during setup; only real errors matter.
    if (/already exists/i.test(msg)) {
      console.log(`  ~ ${f} (already applied: ${msg.slice(0, 60)})`);
    } else {
      console.error(`  ✗ ${f}\n    ${msg}`);
      await client.end();
      process.exit(1);
    }
  }
}

const tables = await client.query(
  `select table_name from information_schema.tables
   where table_schema='public' order by table_name`,
);
console.log(`tables: ${tables.rows.map((r) => r.table_name).join(", ")}`);

const ex = await client.query(
  `select conname from pg_constraint where conname = 'bookings_no_overlap'`,
);
console.log(`exclusion constraint: ${ex.rows.length ? "present" : "MISSING"}`);

const fn = await client.query(
  `select proname from pg_proc where proname = 'replace_seed_schedule'`,
);
console.log(`replace_seed_schedule: ${fn.rows.length ? "present" : "MISSING"}`);

await client.end();
