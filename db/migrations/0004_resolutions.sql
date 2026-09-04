-- Resolution state for the two human work queues.
--
-- A plain, reversible toggle by decision: no operator attribution. The
-- dashboard sits behind one shared secret with no auth, so recording "who"
-- would be recording whoever typed a name; the timestamp is kept because
-- un-resolving and ordering need it, and because a resolved row should say
-- when. See DECISIONS.md "Dashboard writes".

alter table calls
  add column if not exists followup_resolved_at timestamptz;

alter table callback_requests
  add column if not exists resolved_at timestamptz;

-- Dispatch's queue query: open follow-ups only.
create index if not exists calls_followup_open_idx
  on calls (started_at desc)
  where needs_human_followup and followup_resolved_at is null;
