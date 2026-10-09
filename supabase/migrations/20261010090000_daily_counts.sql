-- Phase 5c: privacy-friendly gameplay analytics.
--
-- Daily totals only (games started and finished, quick-match outcomes, emotes, peak players online), counted by the
-- game server and flushed here about once a minute. There are no user ids, room codes, IPs or anything else that
-- points at a person: a row is just "on this Lagos day, this many of that happened".

create table public.daily_counts (
  day date not null,
  metric text not null check (metric ~ '^[a-z_.]{1,40}$'),
  -- 'whot', 'ayo', or '' for metrics across both games.
  game text not null default '' check (game in ('', 'whot', 'ayo')),
  value bigint not null default 0 check (value >= 0),
  primary key (day, metric, game)
);

comment on table public.daily_counts is 'Anonymous daily gameplay totals from the game server (no personal data).';

-- Only the game server (secret key, which bypasses RLS) reads or writes this. No policies: players can't see it.
alter table public.daily_counts enable row level security;

-- Adds a batch of counts for today (Lagos time). Each item is {metric, game, value, op}: op 'sum' adds the value,
-- op 'max' keeps the larger of the stored and given value (for peaks like players online).
create function public.add_daily_counts(counts jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  today date := (now() at time zone 'Africa/Lagos')::date;
  item jsonb;
  amount bigint;
begin
  if jsonb_typeof(counts) <> 'array' then
    raise exception 'counts must be an array';
  end if;
  for item in select * from jsonb_array_elements(counts) loop
    amount := greatest((item->>'value')::bigint, 0);
    if item->>'op' = 'max' then
      insert into public.daily_counts as d (day, metric, game, value)
      values (today, item->>'metric', coalesce(item->>'game', ''), amount)
      on conflict (day, metric, game) do update set value = greatest(d.value, excluded.value);
    else
      insert into public.daily_counts as d (day, metric, game, value)
      values (today, item->>'metric', coalesce(item->>'game', ''), amount)
      on conflict (day, metric, game) do update set value = d.value + excluded.value;
    end if;
  end loop;
end;
$$;

revoke execute on function public.add_daily_counts(jsonb) from public, anon, authenticated;
