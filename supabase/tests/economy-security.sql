begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','money-a@test.invalid','{"display_name":"Alice"}'),
 ('20000000-0000-4000-8000-000000000002','money-b@test.invalid','{"display_name":"Bob"}');
set local role service_role;
select public.credit_race_rewards('10000000-0000-4000-8000-000000000001','[
 {"id":"30000000-0000-4000-8000-000000000001","round_id":"40000000-0000-4000-8000-000000000001","event_key":"coin:coin-0","kind":"coin","amount":10},
 {"id":"30000000-0000-4000-8000-000000000002","round_id":"40000000-0000-4000-8000-000000000001","event_key":"jump:1","kind":"stunt","amount":75}]');
select public.credit_race_rewards('10000000-0000-4000-8000-000000000001','[
 {"id":"30000000-0000-4000-8000-000000000099","round_id":"40000000-0000-4000-8000-000000000001","event_key":"coin:coin-0","kind":"coin","amount":10}]');
do $$ begin
 assert (select balance=85 from public.player_state where user_id='10000000-0000-4000-8000-000000000001'), 'Retries cannot duplicate money';
 assert (select count(*)=2 from public.economy_events);
 assert (select count(*)=0 from public.competition_results), 'Money does not create competition points';
 begin
  perform public.credit_race_rewards('10000000-0000-4000-8000-000000000001','[
   {"id":"30000000-0000-4000-8000-000000000003","round_id":"40000000-0000-4000-8000-000000000001","event_key":"coin:second","kind":"coin","amount":10},
   {"id":"30000000-0000-4000-8000-000000000004","round_id":"40000000-0000-4000-8000-000000000001","event_key":"bad","kind":"coin","amount":-1}]');
  raise exception 'Invalid batch must fail';
 exception when check_violation then null; end;
 assert (select balance=85 from public.player_state where user_id='10000000-0000-4000-8000-000000000001'), 'Invalid batch rolls back all its credits';
end $$;
select public.record_race_round('{
 "id":"40000000-0000-4000-8000-000000000002","match_id":"50000000-0000-4000-8000-000000000001","round_number":1,"target_points":15,"room_code":"AABBCCDD",
 "course_id":"serra-circuit-race-v2","winner_user_id":"10000000-0000-4000-8000-000000000001","entries":[
 {"user_id":"10000000-0000-4000-8000-000000000001","name":"Alice","vehicle_id":"jeep","elapsed_ms":50000,"points":1,"recoveries":0},
 {"user_id":"20000000-0000-4000-8000-000000000002","name":"Bob","vehicle_id":"crawler","elapsed_ms":null,"points":0,"recoveries":0}]}');
do $$ begin
 assert (select count(*)=1 from public.competition_results where course_id='serra-circuit-race-v2' and points_awarded=1), 'New economic rounds have a separate course identity';
 assert (select balance=85 from public.player_state where user_id='10000000-0000-4000-8000-000000000001'), 'Race points do not change money';
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
do $$ begin
 assert (select count(*)=2 from public.economy_events);
 begin
  perform public.credit_race_rewards(auth.uid(),'[]'); raise exception 'Client cannot call credit RPC';
 exception when insufficient_privilege then null; end;
 begin
  update public.player_state set balance=999999 where user_id=auth.uid(); raise exception 'Client cannot set balance';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.economy_events where user_id=auth.uid(); raise exception 'Client cannot delete deduplication records';
 exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub = '20000000-0000-4000-8000-000000000002';
do $$ begin assert (select count(*)=0 from public.economy_events), 'Economy ledger is private to its owner'; end $$;
rollback;
