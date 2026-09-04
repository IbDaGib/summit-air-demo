-- Proof that double-booking a tech is impossible at the database level.
--
-- Run it anywhere (Supabase SQL editor, psql). It works on a seeded database and
-- leaves nothing behind: the whole thing rolls back. Case 1 is the point; cases
-- 2-4 exist so a passing case 1 cannot be explained by the constraint simply
-- rejecting everything.
--
--   psql "$DATABASE_URL" -f db/checks/no_overlap.sql

begin;

create temp table probe on commit drop as
  select id as tech_id from techs order by name limit 1;

-- Baseline: 8-10am Mountain on an otherwise empty day.
insert into bookings (tech_id, customer_name, phone, address_line, town, county,
                      arrival_window, priority, issue_summary)
select tech_id, 'Probe A', '+14065550000', '1 Test Street', 'Bozeman', 'Gallatin',
       tstzrange('2026-12-15 08:00:00-07', '2026-12-15 10:00:00-07', '[)'),
       'P2', 'baseline' from probe;

-- CASE 1 — same tech, 9-11am, overlaps by an hour. MUST be rejected, 23P01.
savepoint case1;
do $$
begin
  insert into bookings (tech_id, customer_name, phone, address_line, town, county,
                        arrival_window, priority, issue_summary)
  select tech_id, 'Probe B', '+14065550000', '1 Test Street', 'Bozeman', 'Gallatin',
         tstzrange('2026-12-15 09:00:00-07', '2026-12-15 11:00:00-07', '[)'),
         'P2', 'overlap' from probe;
  raise exception 'FAIL: the overlap was accepted — bookings_no_overlap is missing';
exception when exclusion_violation then
  raise notice 'PASS case 1: rejected with SQLSTATE % on bookings_no_overlap', sqlstate;
end $$;
rollback to case1;

-- CASE 2 — same tech, 10-12, starts exactly when the first ends. MUST be accepted:
-- the range is half-open, so back-to-back is not an overlap.
insert into bookings (tech_id, customer_name, phone, address_line, town, county,
                      arrival_window, priority, issue_summary)
select tech_id, 'Probe C', '+14065550000', '1 Test Street', 'Bozeman', 'Gallatin',
       tstzrange('2026-12-15 10:00:00-07', '2026-12-15 12:00:00-07', '[)'),
       'P2', 'adjacent' from probe;

-- CASE 3 — same tech, same 8-10 window, cancelled. MUST be accepted: the
-- constraint is filtered on status <> 'cancelled', so a cancellation frees the
-- window without deleting the history.
insert into bookings (tech_id, customer_name, phone, address_line, town, county,
                      arrival_window, priority, issue_summary, status)
select tech_id, 'Probe D', '+14065550000', '1 Test Street', 'Bozeman', 'Gallatin',
       tstzrange('2026-12-15 08:00:00-07', '2026-12-15 10:00:00-07', '[)'),
       'P2', 'cancelled overlap', 'cancelled' from probe;

-- CASE 4 — different tech, same 8-10 window. MUST be accepted: the constraint is
-- per tech, not global.
insert into bookings (tech_id, customer_name, phone, address_line, town, county,
                      arrival_window, priority, issue_summary)
select id, 'Probe E', '+14065550000', '1 Test Street', 'Bozeman', 'Gallatin',
       tstzrange('2026-12-15 08:00:00-07', '2026-12-15 10:00:00-07', '[)'),
       'P2', 'different tech' from techs order by name offset 1 limit 1;

rollback;
