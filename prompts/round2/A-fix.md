# Workspace A — round 2

Greptile reviewed PR #1: **Confidence 4/5**, one blocking issue.

> "The booking replacement should be made atomic before merging because a failed
> seed can erase the previous valid demo schedule and leave only partial
> replacement data. The cleanup and replacement inserts are separate database
> requests, so any failure after cleanup commits leaves destructive partial
> state despite the seed's idempotence guarantee."

**Files needing attention:** `db/seed.ts`

## Do
1. `git fetch origin && git rebase origin/main` first — main has moved four commits.
2. Make booking replacement atomic. Either a single transactional RPC, or an
   upsert that never deletes before it can insert. A failed seed must leave the
   previous schedule intact.
3. Read the inline comment on the PR and address it.

## Heads up: we are likely moving off Supabase
Supabase has a multi-region outage on project creation and we may switch to
**Neon** (plain Postgres, same `0001_init.sql`, `btree_gist` supported). Do not
do that migration — just note in `db/client.ts` which parts are `supabase-js`
specific so the swap is mechanical.

## Validate
`npx next typegen && npx tsc --noEmit`, then `npm run seed` twice, then kill the
seed mid-run and confirm the prior schedule survived. Paste real output.
