# Known issues

Written as I built. Feeds the self-critique in the demo.

- [ ]

## Accepted, not fixed

- **Seed replacement is non-destructive but not fully atomic.** The seed upserts
  bookings in batches of 25 and prunes afterwards, so a failure mid-run leaves a
  mixture of old and new rows rather than an empty schedule. The destructive
  failure mode is gone; full atomicity needs a transactional Postgres function,
  which is not worth adding to demo fixtures that are re-runnable by design.
  Greptile flagged this twice on PR #1 and it is a fair call — just not one worth
  spending the remaining time on.
