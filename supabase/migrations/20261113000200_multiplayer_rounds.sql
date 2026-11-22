begin;
alter table public.competition_results drop constraint competition_results_course_id_check;
alter table public.competition_results add constraint competition_results_course_id_check check (course_id in ('serra-circuit-v1', 'serra-circuit-race-v1'));
alter table public.competition_results add column match_id uuid;
alter table public.competition_results add column round_number integer;
alter table public.competition_results add column points_awarded smallint not null default 0 check (points_awarded in (0,1));
alter table public.competition_results add constraint race_round_reference check (
  (match_id is null and round_number is null and points_awarded = 0) or
  (match_id is not null and round_number > 0 and course_id = 'serra-circuit-race-v1'));
create unique index race_result_once on public.competition_results(match_id,round_number,user_id);
create unique index race_one_winner on public.competition_results(match_id,round_number) where points_awarded = 1;

create table public.race_rounds (
  id uuid primary key,
  match_id uuid not null,
  round_number integer not null check (round_number > 0),
  target_points integer not null check (target_points between 1 and 15),
  room_code text not null check (room_code ~ '^[A-F0-9]{8}$'),
  winner_user_id uuid references auth.users(id),
  participant_ids uuid[] not null check (cardinality(participant_ids) between 2 and 4),
  standings jsonb not null check (jsonb_typeof(standings) = 'array'),
  created_at timestamptz not null default now(),
  unique(match_id,round_number)
);
alter table public.race_rounds enable row level security;
revoke all on public.race_rounds from public,anon,authenticated;
grant select on public.race_rounds to authenticated;
grant all on public.race_rounds to service_role;
create policy own_race_rounds on public.race_rounds for select to authenticated using ((select auth.uid()) = any(participant_ids));

-- One transaction records the round and awards at most one point. Retrying the
-- same match/round never inserts results again, and never touches player money.
create function public.record_race_round(payload jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare
  entry jsonb;
  ids uuid[];
  winner uuid := nullif(payload->>'winner_user_id','')::uuid;
  expected_winner uuid;
  inserted integer;
begin
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
      values (gen_random_uuid(),(entry->>'user_id')::uuid,'serra-circuit-race-v1',entry->>'vehicle_id',(entry->>'elapsed_ms')::integer,payload->>'room_code',(payload->>'match_id')::uuid,(payload->>'round_number')::integer,
        case when (entry->>'user_id')::uuid = winner then 1 else 0 end);
    end if;
  end loop;
end;
$$;
revoke all on function public.record_race_round(jsonb) from public,anon,authenticated;
grant execute on function public.record_race_round(jsonb) to service_role;
commit;
