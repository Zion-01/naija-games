-- Checks add_daily_counts. Runs in a transaction and rolls back, so it leaves nothing behind.
begin;

do $$
declare
  today date := (now() at time zone 'Africa/Lagos')::date;
  v bigint;
begin
  perform public.add_daily_counts('[{"metric":"game.started","game":"whot","value":2,"op":"sum"},
                                    {"metric":"players.peak","game":"","value":5,"op":"max"}]');
  perform public.add_daily_counts('[{"metric":"game.started","game":"whot","value":3,"op":"sum"},
                                    {"metric":"players.peak","value":4,"op":"max"}]');

  select value into v from public.daily_counts where day = today and metric = 'game.started' and game = 'whot';
  assert v = 5, format('sums add up, got %s', v);
  select value into v from public.daily_counts where day = today and metric = 'players.peak' and game = '';
  assert v = 5, format('peaks keep the max, got %s', v);

  begin
    perform public.add_daily_counts('[{"metric":"Bad Metric!","game":"","value":1,"op":"sum"}]');
    assert false, 'bad metric names are refused';
  exception when check_violation then null;
  end;

  -- Players can't call it.
  assert not has_function_privilege('anon', 'public.add_daily_counts(jsonb)', 'execute'), 'anon cannot add counts';
  assert not has_function_privilege('authenticated', 'public.add_daily_counts(jsonb)', 'execute'), 'players cannot add counts';
  raise notice 'daily_counts tests passed';
end $$;

rollback;
