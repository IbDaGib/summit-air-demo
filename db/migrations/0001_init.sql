-- Summit Air dispatch schema.
-- The EXCLUDE constraint is the point: double-booking a tech is impossible at the
-- database level, not merely unlikely in application code.

create extension if not exists btree_gist;

create type priority_tier as enum ('P0', 'P1', 'P2', 'P3');
create type county_name  as enum ('Gallatin', 'Park', 'Madison');

create table customers (
  id                     uuid primary key default gen_random_uuid(),
  phone                  text unique not null,
  name                   text not null,
  address_line           text not null,
  town                   text not null,
  county                 county_name not null,
  is_maintenance_member  boolean not null default false,
  vulnerable_occupant    boolean not null default false,
  access_notes           text,
  last_service_at        timestamptz,
  created_at             timestamptz not null default now()
);

create table techs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  home_county  county_name not null,
  skills       text[] not null default '{}',
  shift_start  time not null default '08:00',
  shift_end    time not null default '17:00',
  on_call      boolean not null default false
);

create table holidays (
  day   date primary key,
  label text not null
);

create table bookings (
  id              uuid primary key default gen_random_uuid(),
  tech_id         uuid not null references techs(id),
  customer_name   text not null,
  phone           text not null,
  address_line    text not null,
  town            text not null,
  county          county_name not null,
  arrival_window  tstzrange not null,
  priority        priority_tier not null,
  issue_summary   text not null,
  access_notes    text,
  status          text not null default 'confirmed',
  call_id         uuid,
  created_at      timestamptz not null default now(),

  -- One tech cannot hold two overlapping arrival windows. Cancelled rows are exempt
  -- so a cancellation frees the slot without deleting the history.
  constraint bookings_no_overlap
    exclude using gist (tech_id with =, arrival_window with &&)
    where (status <> 'cancelled')
);

create index bookings_window_idx on bookings using gist (arrival_window);

create table calls (
  id             uuid primary key default gen_random_uuid(),
  vapi_call_id   text unique,
  from_number    text,
  customer_id    uuid references customers(id),
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  -- Written incrementally during the call so a dropped call is never a lost lead.
  facts          jsonb,
  priority       priority_tier,
  outcome        text,
  transcript     text,
  summary        text,
  sentiment      text,
  tool_trace     jsonb,
  recording_url  text
);

create table callback_requests (
  id             uuid primary key default gen_random_uuid(),
  call_id        uuid references calls(id),
  customer_name  text,
  phone          text not null,
  reason         text not null,
  notes          text,
  resolved       boolean not null default false,
  created_at     timestamptz not null default now()
);

create table safety_incidents (
  id           uuid primary key default gen_random_uuid(),
  call_id      uuid references calls(id),
  hazard       text not null,
  town         text,
  phone        text,
  created_at   timestamptz not null default now()
);
