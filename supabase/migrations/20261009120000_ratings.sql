-- Phase 4b: Elo ratings per game, updated inside record_match so concurrent games can't lose updates.
--
-- Rated players are the human seats with an account. Ratings only move between them: games against computer
-- seats count towards the totals but never change a rating (no farming the computer). With n rated players,
-- each pair is scored like a 1v1 and each player's change is K/(n-1) × Σ(actual − expected).
-- Placement: won and drawn (a shared Whot win, or an Ayo draw) beat lost, and a player who left (abandoned)
-- comes last, so nobody loses rating to a quitter. K is 40 for a player's first 20 rated games, then 20.

create table public.ratings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  game text not null check (game in ('whot', 'ayo')),
  rating integer not null default 1200,
  -- Games against other rated players (these set K).
  rated_games integer not null default 0,
  -- All online games, computer opponents included.
  games integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);

create index ratings_game_rating_idx on public.ratings (game, rating desc);

alter table public.ratings enable row level security;

-- Ratings are public: they go on leaderboards and are used for matchmaking.
create policy "Ratings are public" on public.ratings
  for select to anon, authenticated using (true);

alter table public.match_players
  add column rating_before integer,
  add column rating_after integer;

-- K-factor and the expected score, kept separate so they can be checked on their own.
create function public.elo_k(rated_games integer) returns integer
language sql immutable set search_path = '' as $$
  select case when rated_games < 20 then 40 else 20 end;
$$;

create function public.elo_expected(rating integer, opponent integer) returns double precision
language sql immutable set search_path = '' as $$
  select 1.0 / (1.0 + power(10.0, (opponent - rating) / 400.0));
$$;

revoke execute on function public.elo_k(integer) from public, anon, authenticated;
revoke execute on function public.elo_expected(integer, integer) from public, anon, authenticated;

-- Returns the match id and the rating change of each rated seat (an empty list when the game wasn't rated).
drop function public.record_match(text, text, integer, timestamptz, jsonb);

create function public.record_match(
  game text,
  room_code text,
  round integer,
  started_at timestamptz,
  players jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  new_match_id uuid;
  changes jsonb;
begin
  insert into public.matches (game, room_code, round, started_at)
  values (record_match.game, record_match.room_code, record_match.round, record_match.started_at)
  returning id into new_match_id;

  -- A user deleted while their token was still valid plays on as a guest.
  insert into public.match_players (match_id, seat, user_id, name, kind, result, abandoned)
  select new_match_id, p.seat, pr.id, p.name, p.kind, p.result, coalesce(p.abandoned, false)
  from jsonb_to_recordset(players)
    as p(seat smallint, user_id uuid, name text, kind text, result text, abandoned boolean)
  left join public.profiles pr on pr.id = p.user_id;

  -- One row per account at the table, locked in a fixed order so two games ending together can't deadlock.
  insert into public.ratings (user_id, game)
  select distinct mp.user_id, record_match.game
  from public.match_players mp
  where mp.match_id = new_match_id and mp.user_id is not null
  on conflict do nothing;

  perform 1 from public.ratings r
  where r.game = record_match.game
    and r.user_id in (select mp.user_id from public.match_players mp where mp.match_id = new_match_id)
  order by r.user_id
  for update;

  -- Rated seats: humans with an account, each account once. Their new ratings go in `changes`.
  with rated as (
    select mp.seat, r.rating, r.rated_games,
           case when mp.abandoned then 0 when mp.result = 'lost' then 1 else 2 end as place
    from public.match_players mp
    join public.ratings r on r.user_id = mp.user_id and r.game = record_match.game
    where mp.match_id = new_match_id
      and mp.kind = 'human'
      and (select count(*) from public.match_players dup
           where dup.match_id = mp.match_id and dup.user_id = mp.user_id) = 1
  ),
  n as (select count(*)::integer as n from rated),
  deltas as (
    select a.seat, a.rating as before,
           greatest(100, a.rating + round(
             public.elo_k(a.rated_games)::double precision / ((select n from n) - 1) *
             sum((case when a.place > b.place then 1.0 when a.place = b.place then 0.5 else 0.0 end)
                 - public.elo_expected(a.rating, b.rating))
           )::integer) as after
    from rated a
    join rated b on b.seat <> a.seat
    group by a.seat, a.rating, a.rated_games
  )
  select coalesce(jsonb_agg(jsonb_build_object('seat', d.seat, 'before', d.before, 'after', d.after) order by d.seat), '[]'::jsonb)
  into changes
  from deltas d;

  -- A pair join needs two rated seats; with fewer, `changes` is empty and no rating moves.
  update public.match_players mp
  set rating_before = c.before, rating_after = c.after
  from jsonb_to_recordset(changes) as c(seat smallint, before integer, after integer)
  where mp.match_id = new_match_id and mp.seat = c.seat;

  -- Totals for every account at the table (once per account); rating and rated_games only for rated seats.
  update public.ratings r
  set rating = coalesce(c.after, r.rating),
      rated_games = r.rated_games + (c.seat is not null)::integer,
      games = r.games + 1,
      wins = r.wins + (mp.result = 'won')::integer,
      losses = r.losses + (mp.result = 'lost')::integer,
      draws = r.draws + (mp.result = 'drawn')::integer,
      updated_at = now()
  from public.match_players mp
  left join jsonb_to_recordset(changes) as c(seat smallint, before integer, after integer) on c.seat = mp.seat
  where mp.match_id = new_match_id
    and r.user_id = mp.user_id
    and r.game = record_match.game
    and mp.seat = (select min(x.seat) from public.match_players x
                   where x.match_id = mp.match_id and x.user_id = mp.user_id);

  return jsonb_build_object('match_id', new_match_id, 'ratings', changes);
end;
$$;

revoke execute on function public.record_match(text, text, integer, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.record_match(text, text, integer, timestamptz, jsonb) to service_role;
