begin;
alter table public.competition_results drop constraint competition_results_course_id_check;
alter table public.competition_results add constraint competition_results_course_id_check check (course_id in ('serra-circuit-v1','serra-circuit-race-v1','serra-circuit-race-v2'));
alter table public.competition_results drop constraint race_round_reference;
alter table public.competition_results add constraint race_round_reference check (
  (match_id is null and round_number is null and points_awarded = 0) or
  (match_id is not null and round_number > 0 and course_id in ('serra-circuit-race-v1','serra-circuit-race-v2')));

create table public.economy_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  round_id uuid not null,
  event_key text not null check (char_length(event_key) between 1 and 80),
  kind text not null check (kind in ('coin','stunt')),
  amount integer not null check (amount between 1 and 10000),
  created_at timestamptz not null default now(),
  unique(round_id,user_id,event_key)
);
alter table public.economy_events enable row level security;
revoke all on public.economy_events from public,anon,authenticated;
grant select on public.economy_events to authenticated;
grant all on public.economy_events to service_role;
create policy own_economy_events on public.economy_events for select to authenticated using ((select auth.uid()) = user_id);

create function public.credit_race_rewards(target_user uuid, credits jsonb) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  credit jsonb; current_balance bigint; inserted integer; delta bigint := 0;
begin
  if jsonb_typeof(credits) is distinct from 'array' or jsonb_array_length(credits) > 64 then raise exception 'Invalid credits'; end if;
  select balance into current_balance from public.player_state where user_id = target_user for update;
  if not found then raise exception 'Player state missing'; end if;
  for credit in select * from jsonb_array_elements(credits) loop
    insert into public.economy_events(id,user_id,round_id,event_key,kind,amount)
      values ((credit->>'id')::uuid,target_user,(credit->>'round_id')::uuid,credit->>'event_key',credit->>'kind',(credit->>'amount')::integer)
      on conflict (round_id,user_id,event_key) do nothing;
    get diagnostics inserted = row_count;
    if inserted = 1 then delta := delta + (credit->>'amount')::integer; end if;
  end loop;
  update public.player_state set balance = balance + delta where user_id = target_user returning balance into current_balance;
  return current_balance;
end;
$$;
revoke all on function public.credit_race_rewards(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.credit_race_rewards(uuid,jsonb) to service_role;

-- Keep historic v1 results intact. Only new economy rounds select v2.
create or replace function public.record_race_round(payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare
  entry jsonb; ids uuid[]; winner uuid := nullif(payload->>'winner_user_id','')::uuid;
  expected_winner uuid; inserted integer;
  course text := coalesce(payload->>'course_id','serra-circuit-race-v1');
begin
  if course not in ('serra-circuit-race-v1','serra-circuit-race-v2') then raise exception 'Invalid course'; end if;
  if jsonb_typeof(payload->'entries') is distinct from 'array' then raise exception 'Invalid entries'; end if;
  select array_agg((e->>'user_id')::uuid) into ids from jsonb_array_elements(payload->'entries') e;
  if cardinality(ids) not between 2 and 4 or (select count(distinct id) from unnest(ids) id) <> cardinality(ids) then raise exception 'Invalid participants'; end if;
  select (e->>'user_id')::uuid into expected_winner from jsonb_array_elements(payload->'entries') e
    where e->>'elapsed_ms' is not null order by (e->>'elapsed_ms')::integer, (e->>'user_id') collate "C" limit 1;
  if winner is distinct from expected_winner then raise exception 'Winner must have the first valid finish'; end if;
  insert into public.race_rounds(id,match_id,round_number,target_points,room_code,winner_user_id,participant_ids,standings)
    values ((payload->>'id')::uuid,(payload->>'match_id')::uuid,(payload->>'round_number')::integer,(payload->>'target_points')::integer,payload->>'room_code',winner,ids,payload->'entries')
    on conflict (match_id,round_number) do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return; end if;
  for entry in select * from jsonb_array_elements(payload->'entries') loop
    if entry->>'elapsed_ms' is not null then
      insert into public.competition_results(id,user_id,course_id,vehicle_id,elapsed_ms,room_code,match_id,round_number,points_awarded)
        values (gen_random_uuid(),(entry->>'user_id')::uuid,course,entry->>'vehicle_id',(entry->>'elapsed_ms')::integer,payload->>'room_code',(payload->>'match_id')::uuid,(payload->>'round_number')::integer,
          case when (entry->>'user_id')::uuid = winner then 1 else 0 end);
    end if;
  end loop;
end;
$$;
revoke all on function public.record_race_round(jsonb) from public,anon,authenticated;
grant execute on function public.record_race_round(jsonb) to service_role;
commit;
