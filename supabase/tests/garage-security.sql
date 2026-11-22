begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','garage-a@test.invalid','{"display_name":"Alice"}'),
 ('20000000-0000-4000-8000-000000000002','garage-b@test.invalid','{"display_name":"Bob"}'),
 ('30000000-0000-4000-8000-000000000003','garage-c@test.invalid','{"display_name":"Outsider"}');
set local role service_role;
select public.sync_race_competition('{
 "match_id":"40000000-0000-4000-8000-000000000001","round_id":"50000000-0000-4000-8000-000000000001","round_number":1,"room_code":"ABCDEF12","host_user_id":"10000000-0000-4000-8000-000000000001","target_points":15,"phase":"countdown",
 "members":[{"user_id":"10000000-0000-4000-8000-000000000001","vehicle_id":"jeep"},{"user_id":"20000000-0000-4000-8000-000000000002","vehicle_id":"crawler"}]}');
do $$ begin
 begin
  perform public.purchase_vehicle_upgrade('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','jeep','engine',0,1);
  raise exception using errcode='XX001',message='Purchase outside garage accepted';
 exception when raise_exception then null; end;
end $$;
select public.settle_competition_round('{
 "id":"50000000-0000-4000-8000-000000000001","match_id":"40000000-0000-4000-8000-000000000001","round_number":1,"target_points":15,"room_code":"ABCDEF12","course_id":"serra-circuit-race-v3","winner_user_id":"10000000-0000-4000-8000-000000000001",
 "entries":[{"user_id":"10000000-0000-4000-8000-000000000001","name":"Alice","vehicle_id":"jeep","elapsed_ms":50000,"recoveries":1,"rewards":[{"id":"70000000-0000-4000-8000-000000000001","round_id":"50000000-0000-4000-8000-000000000001","event_key":"jump:1","kind":"stunt","amount":75}]},
 {"user_id":"20000000-0000-4000-8000-000000000002","name":"Bob","vehicle_id":"crawler","elapsed_ms":null,"recoveries":0,"rewards":[]}]}');
-- A retry with a different request id must not replay points, money or stats.
select public.settle_competition_round('{"id":"50000000-0000-4000-8000-000000000099","match_id":"40000000-0000-4000-8000-000000000001","round_number":1}');
do $$ begin
 assert (select balance=75 from public.player_state where user_id='10000000-0000-4000-8000-000000000001');
 assert (select points=1 from public.competition_participants where user_id='10000000-0000-4000-8000-000000000001');
 assert (select rounds=1 and wins=1 and finishes=1 and recoveries=1 and coins_earned=75 from public.profile_statistics where user_id='10000000-0000-4000-8000-000000000001');
 assert (select rounds=1 and finishes=0 and wins=0 from public.profile_statistics where user_id='20000000-0000-4000-8000-000000000002');
 assert (select count(*)=1 from public.money_movements);
 assert (select course_id='serra-circuit-race-v3' from public.competition_results);
end $$;
select public.sync_race_competition('{
 "match_id":"40000000-0000-4000-8000-000000000001","round_id":"50000000-0000-4000-8000-000000000001","round_number":1,"room_code":"ABCDEF12","host_user_id":"10000000-0000-4000-8000-000000000001","target_points":15,"phase":"garage",
 "members":[{"user_id":"10000000-0000-4000-8000-000000000001","vehicle_id":"jeep"},{"user_id":"20000000-0000-4000-8000-000000000002","vehicle_id":"crawler"}]}');
select public.purchase_vehicle_upgrade('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','jeep','engine',0,1);
select public.purchase_vehicle_upgrade('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','jeep','engine',0,1);
do $$ begin
 assert (select balance=35 from public.player_state where user_id='10000000-0000-4000-8000-000000000001'), 'One debit per operation';
 assert (select engine=1 from public.vehicle_upgrades where vehicle_id='jeep'), 'One level per operation';
 assert (select coins_spent=40 from public.profile_statistics where user_id='10000000-0000-4000-8000-000000000001');
 begin
  perform public.purchase_vehicle_upgrade('60000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','jeep','engine',0,1);
  raise exception using errcode='XX001',message='Stale concurrent level accepted';
 exception when raise_exception then null; end;
 begin
  perform public.purchase_vehicle_upgrade('60000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','jeep','engine',1,1);
  raise exception using errcode='XX001',message='Insufficient balance accepted';
 exception when raise_exception then null; end;
 begin
  perform public.purchase_vehicle_upgrade('60000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','jeep','air',0,1);
  raise exception using errcode='XX001',message='Outsider accepted';
 exception when raise_exception then null; end;
 assert (public.garage_state('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','rally')->'levels'->>'engine')::integer=0,'Levels are vehicle-specific';
 assert (select balance=35 from public.player_state where user_id='10000000-0000-4000-8000-000000000001');
 begin
  update public.player_state set balance=2000 where user_id='10000000-0000-4000-8000-000000000001';
  perform public.purchase_vehicle_upgrade('60000000-0000-4000-8000-000000000010','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','jeep','engine',1,1);
  perform public.purchase_vehicle_upgrade('60000000-0000-4000-8000-000000000011','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','jeep','engine',2,1);
  begin
   perform public.purchase_vehicle_upgrade('60000000-0000-4000-8000-000000000012','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','jeep','engine',3,1);
   raise exception using errcode='XX001',message='Maximum exceeded';
  exception when raise_exception then null; end;
  assert (select engine=3 from public.vehicle_upgrades where vehicle_id='jeep');
  raise exception using errcode='ZZ001',message='Rollback isolated maximum-level test';
 exception when sqlstate 'ZZ001' then null; end;
 assert (select balance=35 from public.player_state where user_id='10000000-0000-4000-8000-000000000001');
end $$;
-- Invalid reward in the second round rolls back round, result, points, balance
-- and statistics, even though the finish checks execute before the reward.
select public.sync_race_competition('{
 "match_id":"40000000-0000-4000-8000-000000000001","round_id":"50000000-0000-4000-8000-000000000002","round_number":2,"room_code":"ABCDEF12","host_user_id":"10000000-0000-4000-8000-000000000001","target_points":15,"phase":"countdown",
 "members":[{"user_id":"10000000-0000-4000-8000-000000000001","vehicle_id":"jeep"},{"user_id":"20000000-0000-4000-8000-000000000002","vehicle_id":"crawler"}]}');
do $$ begin
 begin
  perform public.settle_competition_round('{
   "id":"50000000-0000-4000-8000-000000000002","match_id":"40000000-0000-4000-8000-000000000001","round_number":2,"target_points":15,"room_code":"ABCDEF12","course_id":"serra-circuit-race-v3","winner_user_id":"10000000-0000-4000-8000-000000000001",
   "entries":[{"user_id":"10000000-0000-4000-8000-000000000001","name":"Alice","vehicle_id":"jeep","elapsed_ms":51000,"recoveries":0,"rewards":[{"id":"70000000-0000-4000-8000-000000000002","round_id":"50000000-0000-4000-8000-000000000002","event_key":"coin:1","kind":"coin","amount":10}]},
   {"user_id":"20000000-0000-4000-8000-000000000002","name":"Bob","vehicle_id":"crawler","elapsed_ms":null,"recoveries":0,"rewards":[{"id":"70000000-0000-4000-8000-000000000003","round_id":"50000000-0000-4000-8000-000000000002","event_key":"bad","kind":"coin","amount":-10}]}]}');
  raise exception using errcode='XX001',message='Invalid settlement accepted';
 exception when check_violation then null; end;
 assert (select count(*)=1 from public.race_rounds);
 assert (select points=1 from public.competition_participants where user_id='10000000-0000-4000-8000-000000000001');
 assert (select balance=35 from public.player_state where user_id='10000000-0000-4000-8000-000000000001');
 assert (select rounds=1 from public.profile_statistics where user_id='10000000-0000-4000-8000-000000000001');
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-4000-8000-000000000001';
do $$ begin
 assert (select count(*)=1 from public.competitions);
 assert (select count(*)=1 from public.vehicle_upgrades);
 assert (select count(*)=2 from public.money_movements);
 begin update public.vehicle_upgrades set engine=99; raise exception using errcode='XX001',message='Client levels write'; exception when insufficient_privilege then null; end;
 begin update public.profile_statistics set wins=99; raise exception using errcode='XX001',message='Client stats write'; exception when insufficient_privilege then null; end;
 begin update public.competition_participants set points=99; raise exception using errcode='XX001',message='Client points write'; exception when insufficient_privilege then null; end;
 begin perform public.purchase_vehicle_upgrade(gen_random_uuid(),'40000000-0000-4000-8000-000000000001',auth.uid(),'jeep','engine',1,1); raise exception using errcode='XX001',message='Client purchase RPC'; exception when insufficient_privilege then null; end;
 begin perform public.settle_competition_round('{}'); raise exception using errcode='XX001',message='Client settlement RPC'; exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub='30000000-0000-4000-8000-000000000003';
do $$ begin
 assert (select count(*)=0 from public.competitions);
 assert (select count(*)=0 from public.competition_participants);
 assert (select count(*)=0 from public.vehicle_upgrades);
 assert (select count(*)=0 from public.money_movements);
 assert (select count(*)=1 from public.profile_statistics), 'Only own statistics';
end $$;
reset role;
set local role service_role;
select public.sync_race_competition('{
 "match_id":"40000000-0000-4000-8000-000000000002","round_id":"50000000-0000-4000-8000-000000000003","round_number":1,"room_code":"ABCDEF12","host_user_id":"10000000-0000-4000-8000-000000000001","target_points":1,"phase":"countdown",
 "members":[{"user_id":"10000000-0000-4000-8000-000000000001","vehicle_id":"jeep"},{"user_id":"20000000-0000-4000-8000-000000000002","vehicle_id":"crawler"}]}');
select public.settle_competition_round('{
 "id":"50000000-0000-4000-8000-000000000003","match_id":"40000000-0000-4000-8000-000000000002","round_number":1,"target_points":1,"room_code":"ABCDEF12","course_id":"serra-circuit-race-v3","winner_user_id":"20000000-0000-4000-8000-000000000002",
 "entries":[{"user_id":"10000000-0000-4000-8000-000000000001","name":"Alice","vehicle_id":"jeep","elapsed_ms":null,"recoveries":0},
 {"user_id":"20000000-0000-4000-8000-000000000002","name":"Bob","vehicle_id":"crawler","elapsed_ms":50000,"recoveries":0}]}');
select public.settle_competition_round('{"id":"50000000-0000-4000-8000-000000000003","match_id":"40000000-0000-4000-8000-000000000002","round_number":1}');
do $$ begin
 assert (select competitions_won=1 and wins=1 from public.profile_statistics where user_id='20000000-0000-4000-8000-000000000002'), 'Champion counted once';
 assert (select balance=35 from public.player_state where user_id='10000000-0000-4000-8000-000000000001'), 'Account balance survives competitions';
 assert (public.garage_state('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','jeep')->'levels'->>'engine')::integer=0, 'Levels reset in another competition';
end $$;
rollback;
