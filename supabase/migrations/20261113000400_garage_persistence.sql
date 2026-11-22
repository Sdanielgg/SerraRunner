begin;
alter table public.competition_results drop constraint competition_results_course_id_check;
alter table public.competition_results add constraint competition_results_course_id_check check(course_id in ('serra-circuit-v1','serra-circuit-race-v1','serra-circuit-race-v2','serra-circuit-race-v3'));
alter table public.competition_results drop constraint race_round_reference;
alter table public.competition_results add constraint race_round_reference check((match_id is null and round_number is null and points_awarded=0) or (match_id is not null and round_number>0 and course_id in ('serra-circuit-race-v1','serra-circuit-race-v2','serra-circuit-race-v3')));

-- Account-wide balance is the existing contract. Levels have never been
-- assigned a scope: new levels belong to a participant/match/vehicle.
create table public.competitions (
 id uuid primary key, room_code text not null check(room_code ~ '^[A-F0-9]{8}$'),
 host_user_id uuid not null references auth.users(id), target_points integer not null check(target_points between 1 and 15),
 phase text not null check(phase in ('countdown','results','garage','finished')),
 round_number integer not null check(round_number>0), active_round_id uuid not null,
 champion_user_id uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.competition_participants (
 competition_id uuid not null references public.competitions(id), user_id uuid not null references auth.users(id),
 vehicle_id text not null check(vehicle_id in ('jeep','crawler','rally','gt3')), points integer not null default 0 check(points>=0), active boolean not null default true,
 primary key(competition_id,user_id)
);
create table public.vehicle_upgrades (
 competition_id uuid not null, user_id uuid not null, vehicle_id text not null check(vehicle_id in ('jeep','crawler','rally','gt3')),
 engine smallint not null default 0 check(engine>=0), tank smallint not null default 0 check(tank>=0), air smallint not null default 0 check(air>=0),
 primary key(competition_id,user_id,vehicle_id), foreign key(competition_id,user_id) references public.competition_participants(competition_id,user_id)
);
create index competition_participant_history on public.competition_participants(user_id,competition_id);
create index vehicle_upgrade_history on public.vehicle_upgrades(user_id,competition_id);
create table public.upgrade_catalog (
 kind text primary key check(kind in ('engine','tank','air')), version integer not null,
 prices integer[] not null check(cardinality(prices)>0 and 0<all(prices)), effect_step numeric not null check(effect_step>0)
);
-- Mirrors upgradeRules; automated PostgreSQL checks enforce parity. Changes
-- require a new versioned migration and a compatible client/server deployment.
insert into public.upgrade_catalog values ('engine',1,array[40,70,110],0.10),('tank',1,array[30,60,100],0.25),('air',1,array[30,55,90],0.20);
create table public.money_movements (
 id uuid primary key, user_id uuid not null references auth.users(id), competition_id uuid references public.competitions(id), round_id uuid,
 vehicle_id text check(vehicle_id in ('jeep','crawler','rally','gt3')), kind text not null check(kind in ('coin','stunt','purchase')),
 amount integer not null check(amount<>0), operation_key text not null, balance_after bigint check(balance_after>=0),
 upgrade_kind text, expected_level integer, created_at timestamptz not null default now(), unique(user_id,operation_key),
 check((kind='purchase' and amount<0 and upgrade_kind in ('engine','tank','air') and expected_level>=0) or (kind in ('coin','stunt') and amount>0))
);
create index money_movements_history on public.money_movements(user_id,created_at desc);
create table public.profile_statistics (
 user_id uuid primary key references auth.users(id) on delete cascade,
 rounds bigint not null default 0, wins bigint not null default 0, finishes bigint not null default 0, recoveries bigint not null default 0,
 coins_earned bigint not null default 0, coins_spent bigint not null default 0, competitions_won bigint not null default 0,
 best_time_ms integer, check(rounds>=0 and wins>=0 and finishes>=0 and recoveries>=0 and coins_earned>=0 and coins_spent>=0 and competitions_won>=0)
);
alter table public.competition_results add column upgrade_levels jsonb not null default '{"engine":0,"tank":0,"air":0}'::jsonb;

-- Historic credits are recorded without touching balances a second time.
insert into public.money_movements(id,user_id,round_id,kind,amount,operation_key,created_at)
 select id,user_id,round_id,kind,amount,'reward:'||round_id||':'||event_key,created_at from public.economy_events;
insert into public.profile_statistics(user_id,rounds,wins,finishes,recoveries,coins_earned,best_time_ms,competitions_won)
 select u.id,
 (select count(*) from public.race_rounds r where u.id=any(r.participant_ids)),
 (select count(*) from public.race_rounds r where r.winner_user_id=u.id),
 (select count(*) from public.competition_results r where r.user_id=u.id and r.match_id is not null),
 coalesce((select sum(coalesce((e->>'recoveries')::integer,0)) from public.race_rounds r cross join lateral jsonb_array_elements(r.standings) e where e->>'user_id'=u.id::text),0),
 coalesce((select sum(amount) from public.economy_events e where e.user_id=u.id),0),
 (select min(elapsed_ms) from public.competition_results r where r.user_id=u.id and r.match_id is not null),
 (select count(*) from (select match_id from public.race_rounds r where r.winner_user_id=u.id group by match_id having count(*)>=max(target_points)) champions)
 from auth.users u;
create function public.initialize_profile_statistics() returns trigger language plpgsql security definer set search_path='' as $$
 begin insert into public.profile_statistics(user_id) values(new.id) on conflict do nothing; return new; end $$;
create trigger new_profile_statistics after insert on public.profiles for each row execute function public.initialize_profile_statistics();
revoke all on function public.initialize_profile_statistics() from public,anon,authenticated;

alter table public.competitions enable row level security;
alter table public.competition_participants enable row level security;
alter table public.vehicle_upgrades enable row level security;
alter table public.money_movements enable row level security;
alter table public.profile_statistics enable row level security;
alter table public.upgrade_catalog enable row level security;
revoke all on public.competitions,public.competition_participants,public.vehicle_upgrades,public.money_movements,public.profile_statistics,public.upgrade_catalog from public,anon,authenticated;
grant select on public.competitions,public.competition_participants,public.vehicle_upgrades,public.money_movements,public.profile_statistics,public.upgrade_catalog to authenticated;
grant all on public.competitions,public.competition_participants,public.vehicle_upgrades,public.money_movements,public.profile_statistics,public.upgrade_catalog to service_role;
create policy participant_read on public.competition_participants for select to authenticated using(user_id=(select auth.uid()));
create policy competition_read on public.competitions for select to authenticated using(exists(select 1 from public.competition_participants p where p.competition_id=id and p.user_id=(select auth.uid())));
create policy upgrades_read on public.vehicle_upgrades for select to authenticated using(user_id=(select auth.uid()));
create policy movements_read on public.money_movements for select to authenticated using(user_id=(select auth.uid()));
create policy statistics_read on public.profile_statistics for select to authenticated using(user_id=(select auth.uid()));
create policy catalog_read on public.upgrade_catalog for select to authenticated using(true);

create function public.garage_state(match_id uuid, target_user uuid, chosen_vehicle text) returns jsonb language plpgsql security definer set search_path='' as $$
declare levels jsonb; money bigint;
begin
 if not exists(select 1 from public.competition_participants where competition_id=match_id and user_id=target_user) then raise exception 'Not a participant'; end if;
 if chosen_vehicle not in ('jeep','crawler','rally','gt3') then raise exception 'Invalid vehicle'; end if;
 select jsonb_build_object('engine',engine,'tank',tank,'air',air) into levels from public.vehicle_upgrades where competition_id=match_id and user_id=target_user and vehicle_id=chosen_vehicle;
 select balance into money from public.player_state where user_id=target_user;
 return jsonb_build_object('balance',money,'levels',coalesce(levels,'{"engine":0,"tank":0,"air":0}'::jsonb));
end $$;

create function public.sync_race_competition(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare comp public.competitions; member jsonb; loadouts jsonb := '{}'::jsonb; mid uuid := (payload->>'match_id')::uuid; rn integer := (payload->>'round_number')::integer;
begin
 if jsonb_typeof(payload->'members') is distinct from 'array' or jsonb_array_length(payload->'members') not between 2 and 4 then raise exception 'Invalid members'; end if;
 if (select count(distinct e->>'user_id') from jsonb_array_elements(payload->'members') e)<>jsonb_array_length(payload->'members') then raise exception 'Duplicate participants'; end if;
 if not exists(select 1 from jsonb_array_elements(payload->'members') e where e->>'user_id'=payload->>'host_user_id') then raise exception 'Invalid host'; end if;
 insert into public.competitions(id,room_code,host_user_id,target_points,phase,round_number,active_round_id)
 select mid,payload->>'room_code',(payload->>'host_user_id')::uuid,(payload->>'target_points')::integer,'countdown',rn,(payload->>'round_id')::uuid
 where payload->>'phase'='countdown' and rn=1 on conflict do nothing;
 select * into strict comp from public.competitions where id=mid for update;
 if comp.room_code<>payload->>'room_code' or comp.target_points<>(payload->>'target_points')::integer then raise exception 'Competition mismatch'; end if;
 if payload->>'phase'='countdown' then
  if comp.champion_user_id is not null or not ((comp.phase='garage' and rn=comp.round_number+1) or (comp.phase='countdown' and rn=comp.round_number and comp.active_round_id=(payload->>'round_id')::uuid)) then raise exception 'Invalid round transition'; end if;
  if exists(select 1 from public.competition_participants where competition_id=mid) and
   ((select count(*) from public.competition_participants where competition_id=mid)<>jsonb_array_length(payload->'members') or exists(select 1 from public.competition_participants p where p.competition_id=mid and not exists(select 1 from jsonb_array_elements(payload->'members') m where m->>'user_id'=p.user_id::text))) then raise exception 'Participant roster changed'; end if;
  for member in select * from jsonb_array_elements(payload->'members') order by value->>'user_id' loop
   if rn>1 and not exists(select 1 from public.competition_participants where competition_id=mid and user_id=(member->>'user_id')::uuid) then raise exception 'Late participant'; end if;
   insert into public.competition_participants(competition_id,user_id,vehicle_id,active) values(mid,(member->>'user_id')::uuid,member->>'vehicle_id',coalesce((member->>'active')::boolean,true))
    on conflict(competition_id,user_id) do update set vehicle_id=excluded.vehicle_id,active=excluded.active;
   loadouts := loadouts || jsonb_build_object(member->>'user_id',public.garage_state(mid,(member->>'user_id')::uuid,member->>'vehicle_id'));
  end loop;
 elsif payload->>'phase'='garage' then
  if rn<>comp.round_number or comp.active_round_id<>(payload->>'round_id')::uuid or comp.phase not in ('results','garage') then raise exception 'Round not settled'; end if;
 elsif payload->>'phase'='finished' then
  if comp.phase not in ('garage','finished') then raise exception 'Not in garage'; end if;
 else raise exception 'Invalid phase'; end if;
 update public.competitions set phase=payload->>'phase',round_number=rn,active_round_id=(payload->>'round_id')::uuid,host_user_id=(payload->>'host_user_id')::uuid,updated_at=now() where id=mid;
 return loadouts;
end $$;

create function public.purchase_vehicle_upgrade(operation_id uuid, match_id uuid, target_user uuid, chosen_vehicle text, upgrade_type text, expected_level integer, catalog_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare comp public.competitions; prior public.money_movements; item public.upgrade_catalog; current_level integer; price integer; money bigint;
begin
 -- Same lock order as settlement: competition first, then account row.
 select * into strict comp from public.competitions where id=match_id for update;
 select * into prior from public.money_movements where id=operation_id;
 if found then
  if prior.user_id<>target_user or prior.competition_id<>match_id or prior.vehicle_id<>chosen_vehicle or prior.upgrade_kind<>upgrade_type or prior.expected_level<>expected_level then raise exception 'Operation identity mismatch'; end if;
  return public.garage_state(match_id,target_user,chosen_vehicle);
 end if;
 if comp.phase<>'garage' or comp.champion_user_id is not null then raise exception 'Purchases require the between-round garage'; end if;
 if not exists(select 1 from public.competition_participants where competition_id=match_id and user_id=target_user and active) then raise exception 'Not an active participant'; end if;
 select * into strict item from public.upgrade_catalog where kind=upgrade_type;
 if item.version<>catalog_version then raise exception 'Catalog version mismatch'; end if;
 insert into public.vehicle_upgrades(competition_id,user_id,vehicle_id) values(match_id,target_user,chosen_vehicle) on conflict do nothing;
 select case upgrade_type when 'engine' then engine when 'tank' then tank when 'air' then air end into current_level from public.vehicle_upgrades where competition_id=match_id and user_id=target_user and vehicle_id=chosen_vehicle for update;
 if current_level<>expected_level or current_level>=cardinality(item.prices) then raise exception 'Level changed or maximum reached'; end if;
 price := item.prices[current_level+1];
 select balance into strict money from public.player_state where user_id=target_user for update;
 if money<price then raise exception 'Insufficient balance'; end if;
 update public.player_state set balance=balance-price where user_id=target_user returning balance into money;
 update public.vehicle_upgrades set engine=engine+case when upgrade_type='engine' then 1 else 0 end,tank=tank+case when upgrade_type='tank' then 1 else 0 end,air=air+case when upgrade_type='air' then 1 else 0 end where competition_id=match_id and user_id=target_user and vehicle_id=chosen_vehicle;
 insert into public.money_movements(id,user_id,competition_id,vehicle_id,kind,amount,operation_key,balance_after,upgrade_kind,expected_level)
 values(operation_id,target_user,match_id,chosen_vehicle,'purchase',-price,'purchase:'||operation_id,money,upgrade_type,current_level);
 insert into public.profile_statistics(user_id) values(target_user) on conflict do nothing;
 update public.profile_statistics set coins_spent=coins_spent+price where user_id=target_user;
 return public.garage_state(match_id,target_user,chosen_vehicle);
end $$;

create function public.settle_competition_round(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare comp public.competitions; entry jsonb; rewards jsonb; chunk jsonb; uid uuid; money bigint; balances jsonb := '{}'::jsonb; won boolean; champ uuid; rid uuid := (payload->>'id')::uuid; mid uuid := (payload->>'match_id')::uuid;
begin
 select * into strict comp from public.competitions where id=mid for update;
 if exists(select 1 from public.race_rounds where match_id=mid and round_number=(payload->>'round_number')::integer) then
  select jsonb_object_agg(p.user_id,s.balance) into balances from public.competition_participants p join public.player_state s using(user_id) where p.competition_id=mid;
  return balances;
 end if;
 if comp.active_round_id<>rid or comp.round_number<>(payload->>'round_number')::integer or comp.phase<>'countdown' then raise exception 'Invalid settlement'; end if;
 if comp.room_code<>payload->>'room_code' or comp.target_points<>(payload->>'target_points')::integer then raise exception 'Competition mismatch'; end if;
 if jsonb_typeof(payload->'entries') is distinct from 'array' or jsonb_array_length(payload->'entries')<>(select count(*) from public.competition_participants where competition_id=mid) then raise exception 'Invalid participants'; end if;
 for entry in select * from jsonb_array_elements(payload->'entries') loop
  if not exists(select 1 from public.competition_participants where competition_id=mid and user_id=(entry->>'user_id')::uuid) then raise exception 'Not a participant'; end if;
  if not exists(select 1 from public.competition_participants where competition_id=mid and user_id=(entry->>'user_id')::uuid and vehicle_id=entry->>'vehicle_id') then raise exception 'Vehicle mismatch'; end if;
  if not exists(select 1 from public.competition_participants where competition_id=mid and user_id=(entry->>'user_id')::uuid and active=coalesce((entry->>'participated')::boolean,true)) then raise exception 'Participation mismatch'; end if;
  if not coalesce((entry->>'participated')::boolean,true) and (entry->>'elapsed_ms' is not null or jsonb_array_length(coalesce(entry->'rewards','[]'::jsonb))>0) then raise exception 'Inactive participant cannot finish or earn'; end if;
 end loop;
 -- Legacy routine validates finishes, deterministic winner, unique round and
 -- exactly one point in results. The entire call shares this transaction.
 if payload->>'course_id' is distinct from 'serra-circuit-race-v3' then raise exception 'Invalid upgraded course'; end if;
 -- Reuse the finish/point checks; change the temporary course inside the same
 -- transaction, so no v2 result from this round is ever externally visible.
 perform public.record_race_round(payload || '{"course_id":"serra-circuit-race-v2"}'::jsonb);
 for entry in select * from jsonb_array_elements(payload->'entries') order by value->>'user_id' loop
  uid := (entry->>'user_id')::uuid; won := uid=nullif(payload->>'winner_user_id','')::uuid;
  if coalesce((entry->>'recoveries')::integer,0) not between 0 and 10 then raise exception 'Invalid recoveries'; end if;
  rewards := coalesce(entry->'rewards','[]'::jsonb);
  if jsonb_typeof(rewards) is distinct from 'array' or exists(select 1 from jsonb_array_elements(rewards) r where (r->>'round_id')::uuid is distinct from rid) then raise exception 'Invalid rewards'; end if;
  if jsonb_array_length(rewards)>4096 or (select count(distinct r->>'event_key') from jsonb_array_elements(rewards) r)<>jsonb_array_length(rewards) then raise exception 'Invalid reward keys'; end if;
  select balance into strict money from public.player_state where user_id=uid for update;
  for chunk in select jsonb_agg(value order by ordinal) from jsonb_array_elements(rewards) with ordinality r(value,ordinal) group by (ordinal-1)/64 order by (ordinal-1)/64 loop
   money := public.credit_legacy_race_rewards(uid,chunk);
  end loop;
  insert into public.money_movements(id,user_id,competition_id,round_id,vehicle_id,kind,amount,operation_key,balance_after)
   select id,user_id,mid,round_id,entry->>'vehicle_id',kind,amount,'reward:'||round_id||':'||event_key,money from public.economy_events where user_id=uid and round_id=rid on conflict do nothing;
  update public.competition_participants set points=points+case when won then 1 else 0 end where competition_id=mid and user_id=uid;
  update public.competition_results set course_id='serra-circuit-race-v3',upgrade_levels=public.garage_state(mid,uid,entry->>'vehicle_id')->'levels' where match_id=mid and round_number=comp.round_number and user_id=uid;
  insert into public.profile_statistics(user_id) values(uid) on conflict do nothing;
  update public.profile_statistics set rounds=rounds+1,wins=wins+case when won then 1 else 0 end,finishes=finishes+case when entry->>'elapsed_ms' is not null then 1 else 0 end,
   recoveries=recoveries+coalesce((entry->>'recoveries')::integer,0),coins_earned=coins_earned+coalesce((select sum((r->>'amount')::integer) from jsonb_array_elements(rewards) r),0),
   best_time_ms=least(best_time_ms,(entry->>'elapsed_ms')::integer) where user_id=uid and coalesce((entry->>'participated')::boolean,true);
  balances := balances || jsonb_build_object(uid::text,money);
 end loop;
 select user_id into champ from public.competition_participants where competition_id=mid and points>=comp.target_points order by user_id limit 1;
 if champ is not null and comp.champion_user_id is null then update public.profile_statistics set competitions_won=competitions_won+1 where user_id=champ; end if;
 update public.competitions set phase='results',champion_user_id=champ,updated_at=now() where id=mid;
 return balances;
end $$;

-- New competitions must credit money only inside their round settlement.
alter function public.credit_race_rewards(uuid,jsonb) rename to credit_legacy_race_rewards;
create function public.credit_race_rewards(target_user uuid,credits jsonb) returns bigint language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from jsonb_array_elements(credits) c join public.competitions m on m.active_round_id=(c->>'round_id')::uuid)
 or exists(select 1 from jsonb_array_elements(credits) c join public.race_rounds r on r.id=(c->>'round_id')::uuid join public.competitions m on m.id=r.match_id) then raise exception 'Use atomic round settlement'; end if;
 return public.credit_legacy_race_rewards(target_user,credits);
end $$;
revoke all on function public.credit_legacy_race_rewards(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.credit_race_rewards(uuid,jsonb),public.garage_state(uuid,uuid,text),public.sync_race_competition(jsonb),public.purchase_vehicle_upgrade(uuid,uuid,uuid,text,text,integer,integer),public.settle_competition_round(jsonb) from public,anon,authenticated;
grant execute on function public.credit_race_rewards(uuid,jsonb),public.garage_state(uuid,uuid,text),public.sync_race_competition(jsonb),public.purchase_vehicle_upgrade(uuid,uuid,uuid,text,text,integer,integer),public.settle_competition_round(jsonb) to service_role;
commit;
