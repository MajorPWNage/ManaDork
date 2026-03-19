-- ManaBoard starter schema
-- Strategy:
-- 1) Keep a fast room-level JSON snapshot for the live tracker.
-- 2) Keep an append-only event table for auditing, undo, analytics, and future match history.
-- 3) Use Presence channels for online / connected indicators.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  room_name text not null default 'Commander Pod',
  format text not null default 'commander',
  starting_life integer not null default 40,
  status text not null default 'active',
  owner_user_id uuid,
  game_state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_room_code_idx on public.rooms (room_code);
create index if not exists rooms_updated_at_idx on public.rooms (updated_at desc);

create table if not exists public.room_seats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  seat_index integer not null check (seat_index between 0 and 7),
  player_name text not null,
  user_id uuid,
  color text,
  avatar_url text,
  background_url text,
  commander_one_name text,
  commander_two_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_id, seat_index)
);

create table if not exists public.room_events (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  actor_user_id uuid,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists room_events_room_id_created_at_idx on public.room_events (room_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger rooms_set_updated_at
before update on public.rooms
for each row
execute function public.set_updated_at();

create trigger room_seats_set_updated_at
before update on public.room_seats
for each row
execute function public.set_updated_at();

alter table public.rooms enable row level security;
alter table public.room_seats enable row level security;
alter table public.room_events enable row level security;

-- Starter policies. Tighten these in production.
create policy "rooms are readable by everyone"
on public.rooms for select
using (true);

create policy "rooms are insertable by everyone"
on public.rooms for insert
with check (true);

create policy "rooms are updatable by everyone"
on public.rooms for update
using (true)
with check (true);

create policy "room seats readable by everyone"
on public.room_seats for select
using (true);

create policy "room seats writeable by everyone"
on public.room_seats for all
using (true)
with check (true);

create policy "room events readable by everyone"
on public.room_events for select
using (true);

create policy "room events insertable by everyone"
on public.room_events for insert
with check (true);

alter publication supabase_realtime add table public.rooms;
