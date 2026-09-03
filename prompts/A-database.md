# Workspace A — database, seed, holidays

Implement the data layer. `db/migrations/0001_init.sql` already exists and is
**owned by main** — read it, do not rewrite it. Add new migrations as
`0002_*.sql` if you genuinely need a change, and say so in your report.

## Build
1. `db/seed.ts` — idempotent, runnable via `npm run seed`.
   - **6 techs** across Gallatin / Park / Madison. Give them real skill tags
     (`gas`, `refrigerant`, `commercial_rooftop`, `mini_split`) and staggered shifts.
     One tech has `on_call = true`.
   - **~14 customers** in Bozeman, Belgrade, Manhattan, Three Forks, Big Sky,
     Livingston, Ennis. Two are maintenance members. One has
     `vulnerable_occupant = true`.
   - **Pre-seeded bookings** filling roughly 70% of the next 5 business days, so
     `find_slots` has to do real work and the collision constraint gets exercised.
   - **Holidays**: Labor Day, 2026-09-07. No tech works it.
2. `db/client.ts` — a Supabase server client reading `NEXT_PUBLIC_SUPABASE_URL`
   and `SUPABASE_SERVICE_ROLE_KEY`. Server-only; never import from a client component.
3. `db/types.ts` — hand-written row types matching the migration. Do not depend on
   codegen; it needs a live database and other workspaces have to compile without one.

## Constraints
- Do not touch: `agent/**`, `app/**`, `evals/**`, `package.json`.
- All timestamps `timestamptz`. Seed times are Mountain — write them with an
  explicit offset, never a bare local string.

## Validate
`npx tsc --noEmit` passes. `npm run seed` runs twice in a row without error.
Report the exact SQL you'd run to prove the EXCLUDE constraint rejects an overlap.
