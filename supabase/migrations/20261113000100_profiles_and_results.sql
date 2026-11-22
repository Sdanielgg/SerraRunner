begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 20 and display_name = btrim(display_name) and display_name !~ '[[:cntrl:]]'),
  vehicle_color text not null default '#526a59' check (vehicle_color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

-- Protected game data is separated from the editable profile. There is no
-- client INSERT/UPDATE/DELETE grant, even for a user's own row.
create table public.player_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  upgrades jsonb not null default '{}'::jsonb check (jsonb_typeof(upgrades) = 'object'),
  statistics jsonb not null default '{}'::jsonb check (jsonb_typeof(statistics) = 'object')
);

create table public.competition_results (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null check (course_id = 'serra-circuit-v1'),
  vehicle_id text not null check (vehicle_id in ('jeep','crawler','rally','gt3')),
  elapsed_ms integer not null check (elapsed_ms > 0 and elapsed_ms <= 600000),
  room_code text not null check (room_code ~ '^[A-F0-9]{8}$'),
  created_at timestamptz not null default now()
);
create index competition_results_user_created on public.competition_results(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.player_state enable row level security;
alter table public.competition_results enable row level security;

revoke all on public.profiles, public.player_state, public.competition_results from public, anon, authenticated;
grant select on public.profiles, public.player_state, public.competition_results to authenticated;
grant update (display_name, vehicle_color) on public.profiles to authenticated;
grant all on public.profiles, public.player_state, public.competition_results to service_role;

create policy own_profile_read on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy own_profile_edit on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy own_state_read on public.player_state for select to authenticated using ((select auth.uid()) = user_id);
create policy own_results_read on public.competition_results for select to authenticated using ((select auth.uid()) = user_id);

create function public.create_player_profile() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  player_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', 'Condutor'));
  player_color text := coalesce(new.raw_user_meta_data ->> 'vehicle_color', '#526a59');
begin
  if char_length(player_name) not between 2 and 20 or player_name ~ '[[:cntrl:]]' then player_name := 'Condutor'; end if;
  if player_color !~ '^#[0-9a-fA-F]{6}$' then player_color := '#526a59'; end if;
  insert into public.profiles(id, display_name, vehicle_color) values (new.id, player_name, lower(player_color));
  insert into public.player_state(user_id) values (new.id);
  return new;
end;
$$;
revoke all on function public.create_player_profile() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_player_profile();

-- Existing Supabase users receive defaults without overwriting auth identities.
insert into public.profiles(id, display_name, vehicle_color)
select id,
  case when char_length(btrim(coalesce(raw_user_meta_data ->> 'display_name', ''))) between 2 and 20 and coalesce(raw_user_meta_data ->> 'display_name', '') !~ '[[:cntrl:]]' then btrim(raw_user_meta_data ->> 'display_name') else 'Condutor' end,
  case when coalesce(raw_user_meta_data ->> 'vehicle_color', '') ~ '^#[0-9a-fA-F]{6}$' then lower(raw_user_meta_data ->> 'vehicle_color') else '#526a59' end
from auth.users on conflict (id) do nothing;
insert into public.player_state(user_id) select id from auth.users on conflict (user_id) do nothing;

commit;
