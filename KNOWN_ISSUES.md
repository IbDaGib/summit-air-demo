# Known issues

Written as I built. Feeds the self-critique in the demo.

## Dashboard

- [ ] The dashboard reads `app/(dash)/_data/*`, a mock standing in for `db/client.ts`
      and `db/types.ts`, which do not exist yet. Every file there carries a
      `TODO(swap)` naming the import to change. Nothing else in the dashboard
      knows the data is fake.
- [ ] Polling is unconditional: every tick refetches the whole list even when
      nothing changed. Fine for one operator on a demo, wasteful for a room of
      them. An `If-Modified-Since` or a `max(started_at)` cursor would fix it.
- [ ] The 3s poll means a call can be up to 3s stale. Acceptable per the brief;
      Realtime is the upgrade path if that ever stops being true.
- [ ] `DASH_SECRET` is one shared secret with no rotation and no per-user
      identity, so there is no audit trail of who read a transcript. That is the
      deliberate trade in DECISIONS.md, not an oversight — but it is the first
      thing to replace if this outlives the demo.
- [ ] The schedule shows booked windows only. It does not render tech shift
      bounds or holidays, so a window outside a shift would look normal here even
      though the booking path would not create one.

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
