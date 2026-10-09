-- Checks weekly_leaderboard against the live schema. Leaves nothing behind: everything is rolled back.
-- Run it in the SQL editor, with `psql -f`, or through the Supabase MCP `execute_sql`. A failing check raises.
begin;

-- Four throwaway accounts (the auth trigger gives each a profile).
insert into auth.users (id, aud, role, email)
select ('00000000-0000-4000-8000-00000000010' || i)::uuid, 'authenticated', 'authenticated', 'board-test-' || i || '@example.invalid'
from generate_series(1, 4) as i;
update public.profiles set nickname = 'Board ' || right(id::text, 1)
where id::text like '00000000-0000-4000-8000-00000000010_';

do $$
declare
  a uuid := '00000000-0000-4000-8000-000000000101';
  b uuid := '00000000-0000-4000-8000-000000000102';
  c uuid := '00000000-0000-4000-8000-000000000103';
  d uuid := '00000000-0000-4000-8000-000000000104';
  got text[];
  ra integer; rb integer; rc integer; rd integer;
  n integer;
begin
  -- Only these test accounts are looked at, so real games on the project don't affect the checks.
  create temp table mine on commit drop as select unnest(array[a, b, c, d]) as id;

  -- This week, Ayo: A beats B twice (+20, +18), C and D draw (0 each).
  perform public.record_match('ayo', 'BRDT', 0, now(), jsonb_build_array(
    jsonb_build_object('seat', 0, 'user_id', a, 'name', 'A', 'kind', 'human', 'result', 'won'),
    jsonb_build_object('seat', 1, 'user_id', b, 'name', 'B', 'kind', 'human', 'result', 'lost')));
  perform public.record_match('ayo', 'BRDT', 1, now(), jsonb_build_array(
    jsonb_build_object('seat', 0, 'user_id', a, 'name', 'A', 'kind', 'human', 'result', 'won'),
    jsonb_build_object('seat', 1, 'user_id', b, 'name', 'B', 'kind', 'human', 'result', 'lost')));
  perform public.record_match('ayo', 'BRDT', 2, now(), jsonb_build_array(
    jsonb_build_object('seat', 0, 'user_id', c, 'name', 'C', 'kind', 'human', 'result', 'drawn'),
    jsonb_build_object('seat', 1, 'user_id', d, 'name', 'D', 'kind', 'human', 'result', 'drawn')));
  -- Beating the computer is never rated, so it never reaches the board.
  perform public.record_match('ayo', 'BRDT', 3, now(), jsonb_build_array(
    jsonb_build_object('seat', 0, 'user_id', d, 'name', 'D', 'kind', 'human', 'result', 'won'),
    jsonb_build_object('seat', 1, 'user_id', null, 'name', 'Mama Put', 'kind', 'ai', 'result', 'lost')));

  -- Ranks are global (real players may be on the board too), so compare the test accounts with each other.
  select array_agg(format('%s:%s:%s/%s', l.nickname, l.points, l.wins, l.games) order by l.rank, l.nickname) into got
  from public.weekly_leaderboard('ayo', 0, 100) l where l.user_id in (select id from mine);
  assert got = array['Board 1:38:2/2', 'Board 3:0:0/1', 'Board 4:0:0/1', 'Board 2:-38:0/2'], 'this week: ' || got::text;
  select max(l.rank) filter (where l.user_id = a), max(l.rank) filter (where l.user_id = b),
         max(l.rank) filter (where l.user_id = c), max(l.rank) filter (where l.user_id = d)
  into ra, rb, rc, rd
  from public.weekly_leaderboard('ayo', 0, 100) l;
  -- C and D tie on points and wins, so they share a rank.
  assert ra < rc and rc = rd and rd < rb, format('ranks: %s %s %s %s', ra, rb, rc, rd);

  -- Ratings are per game: none of this is on the Whot board.
  assert not exists (select 1 from public.weekly_leaderboard('whot') l where l.user_id in (select id from mine)), 'per game';

  -- Move A's and B's games into last week: they leave this week's board and make A last week's Oga.
  update public.matches set ended_at = now() - interval '7 days'
  where room_code = 'BRDT' and round in (0, 1) and id in (select match_id from public.match_players where user_id = a);
  assert not exists (select 1 from public.weekly_leaderboard('ayo') l where l.user_id in (a, b)), 'moved out of this week';
  select array_agg(format('%s:%s', l.nickname, l.points) order by l.rank) into got
  from public.weekly_leaderboard('ayo', 1, 100) l where l.user_id in (select id from mine);
  assert got = array['Board 1:38', 'Board 2:-38'], 'last week: ' || got::text;

  -- max_rows cuts the board, but the caller always sees their own row.
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.weekly_leaderboard('ayo', 1, 1) l where l.user_id = b;
  assert n = 1, 'own row shown beyond max_rows';
  select count(*) into n from public.weekly_leaderboard('ayo', 1, 1) l where l.user_id not in (a, b) and l.rank > 1;
  assert n = 0, 'other rows past max_rows hidden';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Players can call it but can't read match_players rows of games they weren't in.
set local role anon;
select count(*) from public.weekly_leaderboard('ayo');
reset role;

rollback;
