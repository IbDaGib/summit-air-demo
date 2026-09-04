# Known issues

Written as I built. Feeds the self-critique in the demo.

- [ ] No live Supabase project is wired up — the Supabase vars in `.env.local` are
      empty. `db/seed.ts` was validated end to end against a local Postgres +
      PostgREST stand-in (`.context/local-supabase/`), not against the real
      project. First thing to do once a project exists: apply
      `db/migrations/0001_init.sql` and run `npm run seed`.
- [ ] `db/seed.ts` upserts customers on `id`. If a live call ever inserts a
      customer with a seeded phone number under a different id, re-seeding fails
      on the unique phone index instead of merging. Correct fix is an upsert on
      `phone`, which needs the id left out of the payload.
- [ ] `db/types.ts` is hand-written against `0001_init.sql` and nothing checks
      that the two still agree. Codegen would, but it needs a live database, which
      CI does not have.

## Accepted, not fixed

- **Seed replacement is non-destructive but not fully atomic.** The seed upserts
  bookings in batches of 25 and prunes afterwards, so a failure mid-run leaves a
  mixture of old and new rows rather than an empty schedule. The destructive
  failure mode is gone; full atomicity needs a transactional Postgres function,
  which is not worth adding to demo fixtures that are re-runnable by design.
  Greptile flagged this twice on PR #1 and it is a fair call — just not one worth
  spending the remaining time on.
- [ ]
