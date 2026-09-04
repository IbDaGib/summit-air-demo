# Workspace D — round 2

Greptile reviewed PR #4: **Confidence 4/5**, one blocking issue.

> "The DST construction defect should be fixed before merging because it
> displays certain spring-forward booking windows one hour late. `denverInstant`
> applies an offset calculated on the wrong side of the DST transition."

**Files needing attention:** `app/(dash)/_ui/time.ts`, `app/(dash)/_data/fixtures.ts`

## Do
1. `git fetch origin && git rebase origin/main` — main has moved four commits.
2. Fix `denverInstant` so the offset is resolved for the target wall time, not
   on the wrong side of the transition. Workspace A solved the same problem in
   `db/range.ts` by resolving the offset per date from the IANA database —
   **once PR #1 merges, import that instead of keeping a second implementation.**
   Add a test at the spring-forward boundary (2027-03-14, 02:00).
3. Fix the two bare service-date strings in `fixtures.ts` flagged as violating
   the timezone-aware convention.
4. Address the 2 inline PR comments.

## New work if you have room
`app/api/vapi/events/` is still empty — the end-of-call webhook. Without it no
transcript, summary, sentiment or priority is persisted, so the dashboard has
only mock data. If you finish the fixes, say so and stop; I may give this to a
fresh workspace instead.

## Validate
`npx next typegen && npx tsc --noEmit && npm run build`. Paste real output.
