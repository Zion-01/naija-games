-- Phase 4d: weekly leaderboards ("Oga of the Week").
--
-- A week runs from Monday 00:00 to the next Monday 00:00, Lagos time (WAT, no daylight saving). A player's points
-- for a week are the Elo they gained (or lost) in rated games that ended that week. Only games between players with
-- accounts are rated, so beating the computer never climbs the board, and everyone starts each Monday on 0.
-- Last week's number one is the "Oga of the Week". Nothing is stored: the board is worked out from match_players.

-- match_players is only readable by people who sat at that table, so this runs as the owner and returns totals only:
-- rank, nickname and the week's numbers, never who played whom. Anyone may call it (boards are public).
create function public.weekly_leaderboard(game text, weeks_ago integer default 0, max_rows integer default 50)
returns table (rank integer, user_id uuid, nickname text, points integer, games integer, wins integer)
language sql stable security definer set search_path = '' as $$
  with bounds as (
    select (date_trunc('week', now() at time zone 'Africa/Lagos')
            - make_interval(weeks => least(greatest(weekly_leaderboard.weeks_ago, 0), 52))) at time zone 'Africa/Lagos' as lo
  ),
  week as (
    select mp.user_id,
           sum(mp.rating_after - mp.rating_before)::integer as points,
           count(*)::integer as games,
           (count(*) filter (where mp.result = 'won'))::integer as wins
    from public.matches m
    join public.match_players mp on mp.match_id = m.id
    cross join bounds b
    where m.game = weekly_leaderboard.game
      and m.ended_at >= b.lo
      and m.ended_at < b.lo + interval '7 days'
      and mp.user_id is not null
      and mp.rating_after is not null
    group by mp.user_id
  ),
  ranked as (
    -- Ties on points go to whoever won more games; still tied, they share the rank.
    select (rank() over (order by w.points desc, w.wins desc))::integer as rank, w.user_id, p.nickname, w.points, w.games, w.wins
    from week w
    join public.profiles p on p.id = w.user_id
  )
  -- The top rows, plus the caller's own row wherever they are, so "you" can always be shown.
  select r.rank, r.user_id, r.nickname, r.points, r.games, r.wins
  from ranked r
  where r.rank <= least(greatest(weekly_leaderboard.max_rows, 1), 100)
     or r.user_id = (select auth.uid())
  order by r.rank, r.nickname;
$$;

revoke execute on function public.weekly_leaderboard(text, integer, integer) from public;
grant execute on function public.weekly_leaderboard(text, integer, integer) to anon, authenticated;

-- The all-time board reads ratings directly (public), ordered by rating within a game.
-- ratings_game_rating_idx (game, rating desc) already covers it. The weekly board scans one game's week of matches.
create index matches_game_ended_at_idx on public.matches (game, ended_at);
