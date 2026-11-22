-- Run after migrations in an isolated Supabase test project. All data rolls back.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001', 'rls-a@test.invalid', '{"display_name":"Alice","vehicle_color":"#AABBCC","balance":99999,"statistics":{"wins":99}}'),
 ('10000000-0000-4000-8000-000000000002', 'rls-b@test.invalid', '{"display_name":"Bob","vehicle_color":"invalid"}');

do $$ begin
  assert (select vehicle_color = '#aabbcc' from public.profiles where id = '10000000-0000-4000-8000-000000000001');
  assert (select vehicle_color = '#526a59' from public.profiles where id = '10000000-0000-4000-8000-000000000002');
  assert (select balance = 0 and statistics = '{}'::jsonb from public.player_state where user_id = '10000000-0000-4000-8000-000000000001');
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
do $$ declare affected integer; begin
  assert (select count(*) = 1 from public.profiles), 'RLS must hide other profiles';
  update public.profiles set display_name = 'Alice Updated', vehicle_color = '#112233' where id = auth.uid();
  assert (select display_name = 'Alice Updated' from public.profiles where id = auth.uid());
  update public.profiles set display_name = 'Stolen' where id = '10000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  assert affected = 0, 'Another user profile cannot be edited';
  begin
    update public.profiles set id = '10000000-0000-4000-8000-000000000002' where id = auth.uid();
    raise exception 'Changing profile identity must fail';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set created_at = now() where id = auth.uid();
    raise exception 'Changing profile timestamps must fail';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set vehicle_color = 'red' where id = auth.uid();
    raise exception 'Invalid color must fail';
  exception when check_violation then null; end;
  begin
    update public.profiles set display_name = 'x' where id = auth.uid();
    raise exception 'Invalid name must fail';
  exception when check_violation then null; end;
  begin
    update public.player_state set balance = 999999, upgrades = '{"engine":99}', statistics = '{"wins":99}' where user_id = auth.uid();
    raise exception 'Protected state cannot be written';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.competition_results(id,user_id,course_id,vehicle_id,elapsed_ms,room_code) values ('20000000-0000-4000-8000-000000000001',auth.uid(),'serra-circuit-v1','gt3',1,'ABCDEF12');
    raise exception 'Client cannot forge results';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.profiles where id = auth.uid();
    raise exception 'Client cannot delete profiles';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role service_role;
insert into public.competition_results(id,user_id,course_id,vehicle_id,elapsed_ms,room_code) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','serra-circuit-v1','gt3',60000,'ABCDEF12'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','serra-circuit-v1','jeep',65000,'ABCDEF12');
reset role;
set local role authenticated;
do $$ begin
  assert (select count(*) = 1 from public.competition_results), 'Results must be scoped to the owner';
  begin
    update public.competition_results set elapsed_ms = 1 where user_id = auth.uid();
    raise exception 'Client cannot rewrite results';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.profiles;
    raise exception 'Anonymous profiles access must fail';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.competition_results;
    raise exception 'Anonymous results access must fail';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
