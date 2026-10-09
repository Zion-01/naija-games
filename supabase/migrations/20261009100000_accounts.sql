-- Phase 4a: accounts and saved online results.
-- Players sign in anonymously first (a guest), then can link Google or a phone number and keep their history.
-- Only the game server writes results, through record_match() with the secret key.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null default 'Guest' check (char_length(nickname) between 1 and 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Nicknames show up at the table and (later) on leaderboards, so anyone may read them.
create policy "Profiles are public" on public.profiles
  for select to anon, authenticated using (true);

create policy "Players edit their own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Only the nickname is editable by players.
revoke update on public.profiles from anon, authenticated;
grant update (nickname) on public.profiles to authenticated;

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Every new auth user (anonymous ones included) gets a profile.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'nickname', '')), 16);
begin
  insert into public.profiles (id, nickname) values (new.id, coalesce(nullif(name, ''), 'Guest'));
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('whot', 'ayo')),
  room_code text not null,
  round integer not null,
  started_at timestamptz not null,
  ended_at timestamptz not null default now()
);

create table public.match_players (
  match_id uuid not null references public.matches (id) on delete cascade,
  seat smallint not null check (seat between 0 and 3),
  -- null for computer seats and for players without an account.
  user_id uuid references public.profiles (id) on delete set null,
  name text not null,
  kind text not null check (kind in ('human', 'ai')),
  result text not null check (result in ('won', 'lost', 'drawn')),
  -- The player left and the computer finished the game for them.
  abandoned boolean not null default false,
  primary key (match_id, seat)
);

create index match_players_user_id_idx on public.match_players (user_id);
create index matches_ended_at_idx on public.matches (ended_at desc);

alter table public.matches enable row level security;
alter table public.match_players enable row level security;

-- Players see the games they sat in, including the other seats at those tables.
create schema if not exists private;

create function private.played_in(match uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.match_players mp
    where mp.match_id = match and mp.user_id = (select auth.uid())
  );
$$;

grant usage on schema private to authenticated;
revoke execute on function private.played_in(uuid) from public, anon;
grant execute on function private.played_in(uuid) to authenticated;

create policy "Players see their own games" on public.matches
  for select to authenticated using (private.played_in(id));

create policy "Players see who they played" on public.match_players
  for select to authenticated using (private.played_in(match_id));

-- Called by the game server (secret key) when a game ends. One transaction per game.
create function public.record_match(
  game text,
  room_code text,
  round integer,
  started_at timestamptz,
  players jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  match_id uuid;
begin
  insert into public.matches (game, room_code, round, started_at)
  values (game, room_code, round, started_at)
  returning id into match_id;

  insert into public.match_players (match_id, seat, user_id, name, kind, result, abandoned)
  select match_id, p.seat, p.user_id, p.name, p.kind, p.result, coalesce(p.abandoned, false)
  from jsonb_to_recordset(players)
    as p(seat smallint, user_id uuid, name text, kind text, result text, abandoned boolean);

  return match_id;
end;
$$;

revoke execute on function public.record_match(text, text, integer, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.record_match(text, text, integer, timestamptz, jsonb) to service_role;
