-- Atomic replacement of the seeded demo schedule.
--
-- Why this exists: PostgREST gives one transaction per request, so a seed that
-- deletes its old rows in one request and inserts the new ones in another has a
-- window where a crash leaves the demo schedule empty or half-rebuilt. Doing both
-- inside a function makes the swap a single transaction — it either replaces the
-- whole schedule or leaves the previous one exactly as it was.
--
-- This is plain PL/pgSQL and has no Supabase dependency; only the way the seed
-- *calls* it (PostgREST rpc) is Supabase-specific. On plain Postgres the same
-- function is callable with `select * from replace_seed_schedule($1)`.

-- The seed owns exactly one range of booking ids: db/seed.ts mints them as
-- 'b0040000-0000-4000-8000-<counter>'. Bookings made by a real call get
-- gen_random_uuid() and will not land in that range, so they are never touched.
create or replace function replace_seed_schedule(p_bookings jsonb)
  returns table (written integer, skipped integer, pruned integer)
  language plpgsql
as $$
declare
  -- Inclusive bounds of the seed-owned id namespace.
  lo constant uuid := 'b0040000-0000-4000-8000-000000000000';
  hi constant uuid := 'b0040000-0000-4000-8000-ffffffffffff';
  v_written integer := 0;
  v_skipped integer := 0;
  v_pruned  integer := 0;
  r record;
begin
  -- One transaction from here to the end of the function.
  with gone as (
    delete from bookings where id between lo and hi returning 1
  )
  select count(*) into v_pruned from gone;

  for r in
    select *
    from jsonb_to_recordset(p_bookings) as x(
      id            uuid,
      tech_id       uuid,
      customer_name text,
      phone         text,
      address_line  text,
      town          text,
      county        text,
      arrival_window text,
      priority      text,
      issue_summary text,
      access_notes  text,
      status        text
    )
  loop
    if r.id is null or r.id not between lo and hi then
      raise exception 'refusing to write booking id % — outside the seed-owned range', r.id;
    end if;
    -- A sub-transaction per row: if a booking made by a real call already holds
    -- this window, skip that one row instead of losing the whole schedule.
    begin
      insert into bookings (id, tech_id, customer_name, phone, address_line, town,
                            county, arrival_window, priority, issue_summary,
                            access_notes, status)
      values (r.id, r.tech_id, r.customer_name, r.phone, r.address_line, r.town,
              r.county::county_name, r.arrival_window::tstzrange,
              r.priority::priority_tier, r.issue_summary, r.access_notes,
              coalesce(r.status, 'confirmed'));
      v_written := v_written + 1;
    exception when exclusion_violation then
      v_skipped := v_skipped + 1;
    end;
  end loop;

  return query select v_written, v_skipped, v_pruned;
end
$$;

comment on function replace_seed_schedule(jsonb) is
  'Replaces the seeded demo schedule in one transaction. Rows whose arrival window '
  'is already held by a real booking are skipped, not fatal. Returns counts of '
  'written, skipped and pruned rows.';

-- This function can wipe the demo schedule, so it must not be reachable by the
-- anon key. Postgres grants EXECUTE to PUBLIC by default; take it back.
revoke execute on function replace_seed_schedule(jsonb) from public;

do $$
begin
  -- Present on Supabase; absent on plain Postgres, where the owner connects
  -- directly and already has execute.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function replace_seed_schedule(jsonb) to service_role;
  end if;
end
$$;
