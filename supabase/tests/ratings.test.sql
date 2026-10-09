-- Checks record_match's ratings against the live schema. Leaves nothing behind: everything is rolled back.
-- Run it in the SQL editor, with `psql -f`, or through the Supabase MCP `execute_sql`. A failing check raises.
begin;

-- Five throwaway accounts (the auth trigger gives each a profile).
insert into auth.users (id, aud, role, email)
select ('00000000-0000-4000-8000-00000000000' || i)::uuid, 'authenticated', 'authenticated', 'rating-test-' || i || '@example.invalid'
from generate_series(1, 5) as i;

do $$
declare
  a uuid := '00000000-0000-4000-8000-000000000001';
  b uuid := '00000000-0000-4000-8000-000000000002';
  c uuid := '00000000-0000-4000-8000-000000000003';
  d uuid := '00000000-0000-4000-8000-000000000004';
  e uuid := '00000000-0000-4000-8000-000000000005';
  res jsonb;
  r public.ratings;
begin
  -- 1v1 between new players: K = 40, expected 0.5, so ±20.
  res := public.record_match('ayo', 'TEST', 0, now(), jsonb_build_array(
    jsonb_build_object('seat', 0, 'user_id', a, 'name', 'A', 'kind', 'human', 'result', 'won'),
    jsonb_build_object('seat', 1, 'user_id', b, 'name', 'B', 'kind', 'human', 'result', 'lost')));
  assert res -> 'ratings' = '[{"seat":0,"before":1200,"after":1220},{"seat":1,"before":1200,"after":1180}]'::jsonb, '1v1: ' || res;
  select * into r from public.ratings where user_id = a and game = 'ayo';
  assert (r.rating, r.rated_games, r.games, r.wins) = (1220, 1, 1, 1), '1v1 winner row';
  assert (select (rating_before, rating_after) = (1200, 1220) from public.match_players
          where match_id = (res ->> 'match_id')::uuid and seat = 0), '1v1 stored on match_players';
  -- Ratings are per game: A has no Whot rating yet.
  assert not exists (select 1 from public.ratings where user_id = a and game = 'whot'), 'per game';

  -- Rematch: the favourite (1220) wins again and gains less than 20.
  res := public.record_match('ayo', 'TEST', 1, now(), jsonb_build_array(
    jsonb_build_object('seat', 0, 'user_id', a, 'name', 'A', 'kind', 'human', 'result', 'won'),
    jsonb_build_object('seat', 1, 'user_id', b, 'name', 'B', 'kind', 'human', 'result', 'lost')));
  assert res -> 'ratings' = '[{"seat":0,"before":1220,"after":1238},{"seat":1,"before":1180,"after":1162}]'::jsonb, 'favourite: ' || res;

  -- A draw between equals changes nothing but still counts.
  res := public.record_match('ayo', 'TEST', 2, now(), jsonb_build_array(
    jsonb_build_object('seat', 0, 'user_id', c, 'name', 'C', 'kind', 'human', 'result', 'drawn'),
    jsonb_build_object('seat', 1, 'user_id', d, 'name', 'D', 'kind', 'human', 'result', 'drawn')));
  assert res -> 'ratings' = '[{"seat":0,"before":1200,"after":1200},{"seat":1,"before":1200,"after":1200}]'::jsonb, 'draw: ' || res;
  assert (select draws from public.ratings where user_id = c and game = 'ayo') = 1, 'draw counted';

  -- Against the computer only: totals move, the rating doesn't.
  res := public.record_match('whot', 'TEST', 0, now(), jsonb_build_array(
    jsonb_build_object('seat', 0, 'user_id', e, 'name', 'E', 'kind', 'human', 'result', 'won'),
    jsonb_build_object('seat', 1, 'user_id', null, 'name', 'Mama Put', 'kind', 'ai', 'result', 'lost')));
  assert res -> 'ratings' = '[]'::jsonb, 'vs computer: ' || res;
  select * into r from public.ratings where user_id = e and game = 'whot';
  assert (r.rating, r.rated_games, r.games, r.wins) = (1200, 0, 1, 1), 'vs computer row';

  -- Three rated players and a computer seat, one winner: +20 for the winner, -10 for each other human.
  res := public.record_match('whot', 'TEST', 1, now(), jsonb_build_array(
    jsonb_build_object('seat', 0, 'user_id', c, 'name', 'C', 'kind', 'human', 'result', 'lost'),
    jsonb_build_object('seat', 1, 'user_id', d, 'name', 'D', 'kind', 'human', 'result', 'won'),
    jsonb_build_object('seat', 2, 'user_id', null, 'name', 'Oga Tunde', 'kind', 'ai', 'result', 'lost'),
    jsonb_build_object('seat', 3, 'user_id', e, 'name', 'E', 'kind', 'human', 'result', 'lost')));
  assert res -> 'ratings' = '[{"seat":0,"before":1200,"after":1190},{"seat":1,"before":1200,"after":1220},{"seat":3,"before":1200,"after":1190}]'::jsonb, '4 seats: ' || res;

  -- A player who left comes last even if the computer won for them; the one who stayed gains.
  res := public.record_match('whot', 'TEST', 2, now(), jsonb_build_array(
    jsonb_build_object('seat', 0, 'user_id', a, 'name', 'A', 'kind', 'human', 'result', 'won', 'abandoned', true),
    jsonb_build_object('seat', 1, 'user_id', b, 'name', 'B', 'kind', 'human', 'result', 'lost')));
  assert res -> 'ratings' = '[{"seat":0,"before":1200,"after":1180},{"seat":1,"before":1200,"after":1220}]'::jsonb, 'abandoned: ' || res;
  -- The recorded result is what happened at the table.
  assert (select wins from public.ratings where user_id = a and game = 'whot') = 1, 'abandoned result kept';

  -- An account that no longer exists is saved as a guest, and the game still records.
  res := public.record_match('ayo', 'TEST', 3, now(), jsonb_build_array(
    jsonb_build_object('seat', 0, 'user_id', '00000000-0000-4000-8000-0000000000ff', 'name', 'Gone', 'kind', 'human', 'result', 'won'),
    jsonb_build_object('seat', 1, 'user_id', a, 'name', 'A', 'kind', 'human', 'result', 'lost')));
  assert res -> 'ratings' = '[]'::jsonb, 'deleted user: ' || res;
  assert (select user_id from public.match_players where match_id = (res ->> 'match_id')::uuid and seat = 0) is null, 'deleted user stored as guest';

  -- K drops to 20 after 20 rated games, and ratings never go below 100.
  assert public.elo_k(19) = 40 and public.elo_k(20) = 20, 'K';
  -- Equal ratings at 105: B (K=20) would drop 10 to 95 but stops at 100; A (K=40) gains 20.
  update public.ratings set rating = 105, rated_games = 30 where user_id = b and game = 'ayo';
  update public.ratings set rating = 105 where user_id = a and game = 'ayo';
  res := public.record_match('ayo', 'TEST', 4, now(), jsonb_build_array(
    jsonb_build_object('seat', 0, 'user_id', a, 'name', 'A', 'kind', 'human', 'result', 'won'),
    jsonb_build_object('seat', 1, 'user_id', b, 'name', 'B', 'kind', 'human', 'result', 'lost')));
  assert res -> 'ratings' = '[{"seat":0,"before":105,"after":125},{"seat":1,"before":105,"after":100}]'::jsonb, 'K and floor: ' || res;

  raise notice 'ratings tests passed';
end;
$$;

rollback;
