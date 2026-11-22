begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','race-a@test.invalid','{"display_name":"Alice"}'),
 ('20000000-0000-4000-8000-000000000002','race-b@test.invalid','{"display_name":"Bob"}'),
 ('30000000-0000-4000-8000-000000000003','race-outsider@test.invalid','{"display_name":"Outsider"}');
set local role service_role;
select public.record_race_round('{
 "id":"40000000-0000-4000-8000-000000000001","match_id":"50000000-0000-4000-8000-000000000001","round_number":1,"target_points":15,"room_code":"ABCDEF12","winner_user_id":"10000000-0000-4000-8000-000000000001",
 "entries":[{"user_id":"10000000-0000-4000-8000-000000000001","vehicle_id":"jeep","elapsed_ms":60000,"points":1},{"user_id":"20000000-0000-4000-8000-000000000002","vehicle_id":"gt3","elapsed_ms":60000,"points":0}]}'::jsonb);
-- Retry with a different request id but the same match/round is still one award.
select public.record_race_round('{
 "id":"40000000-0000-4000-8000-000000000099","match_id":"50000000-0000-4000-8000-000000000001","round_number":1,"target_points":15,"room_code":"ABCDEF12","winner_user_id":"10000000-0000-4000-8000-000000000001",
 "entries":[{"user_id":"10000000-0000-4000-8000-000000000001","vehicle_id":"jeep","elapsed_ms":60000,"points":1},{"user_id":"20000000-0000-4000-8000-000000000002","vehicle_id":"gt3","elapsed_ms":60000,"points":0}]}'::jsonb);
select public.record_race_round('{
 "id":"40000000-0000-4000-8000-000000000002","match_id":"50000000-0000-4000-8000-000000000001","round_number":2,"target_points":15,"room_code":"ABCDEF12","winner_user_id":null,
 "entries":[{"user_id":"10000000-0000-4000-8000-000000000001","vehicle_id":"jeep","elapsed_ms":null,"points":1},{"user_id":"20000000-0000-4000-8000-000000000002","vehicle_id":"gt3","elapsed_ms":null,"points":0}]}'::jsonb);
do $$ begin
  assert (select count(*) = 2 from public.race_rounds);
  assert (select count(*) = 2 and sum(points_awarded) = 1 from public.competition_results), 'One valid round awards exactly one point, no-finish rounds award none';
  assert (select count(*) = 0 from public.player_state where balance <> 0), 'Money never counts as competition points';
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
do $$ begin
  assert (select count(*) = 2 from public.race_rounds);
  begin
    perform public.record_race_round('{}'::jsonb); raise exception 'Client RPC must be forbidden';
  exception when insufficient_privilege then null; end;
  begin
    update public.race_rounds set winner_user_id = auth.uid(); raise exception 'Client winner mutation must be forbidden';
  exception when insufficient_privilege then null; end;
  begin
    update public.competition_results set points_awarded = 1 where user_id = auth.uid(); raise exception 'Client cannot award points';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub = '30000000-0000-4000-8000-000000000003';
do $$ begin assert (select count(*) = 0 from public.race_rounds), 'Other rooms/users cannot read private round results'; end $$;
rollback;
