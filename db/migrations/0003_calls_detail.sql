-- Columns the dispatch ticket needs that 0001 did not anticipate.
--
-- priority_result stores the whole PriorityResult, not just the tier, so the
-- ticket can show *why* a call was tiered the way it was. The tier is decided
-- once, by policy, during the call — persisting the reason alongside it means
-- nothing has to re-derive it later.

alter table calls
  add column if not exists ended_reason        text,
  add column if not exists duration_seconds    integer,
  add column if not exists cost_usd            numeric(10, 4),
  add column if not exists requested           text,
  add column if not exists tech_notes          text,
  add column if not exists needs_human_followup boolean not null default false,
  add column if not exists followup_reason     text,
  add column if not exists priority_result     jsonb,
  add column if not exists town                text,
  add column if not exists county              county_name;

-- The call list is polled every few seconds and always sorts newest first.
create index if not exists calls_started_at_desc_idx on calls (started_at desc);

-- Dispatch's real working query: what still needs a human.
create index if not exists calls_followup_idx
  on calls (needs_human_followup, started_at desc)
  where needs_human_followup;
