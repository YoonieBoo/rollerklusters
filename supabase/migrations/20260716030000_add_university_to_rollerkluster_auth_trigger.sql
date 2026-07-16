-- The auth.users signup trigger that actually runs is
-- handle_rollerkluster_auth_user() / on_auth_user_created_rollerkluster —
-- created directly on the live database (shared with the ecosystem
-- platform), not the handle_auth_user_profile() trigger from the
-- 20260612183832 migration, which is no longer wired to any trigger.
--
-- It never carried university/campaign_manager_type, so those fields were
-- silently dropped on every signup even though the client sent them
-- correctly in auth signup metadata. This adds them, preserving every
-- other column and the existing role-default/coalesce behavior untouched.
create or replace function public.handle_rollerkluster_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  users_id_type text;
  profile_name text;
  profile_role text;
  profile_provider text;
  profile_avatar text;
  profile_rank text;
  profile_university text;
  profile_campaign_manager_type text;
begin
  select data_type into users_id_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'users'
    and column_name = 'id';

  profile_name := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email, 'User');
  profile_role := case
    when new.raw_user_meta_data->>'role' in ('creator', 'brand', 'admin') then new.raw_user_meta_data->>'role'
    else 'brand'
  end;
  profile_provider := coalesce(new.raw_app_meta_data->>'provider', 'email');
  profile_avatar := coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture');
  profile_rank := coalesce(new.raw_user_meta_data->>'creator_rank', 'Bronze I');
  profile_university := new.raw_user_meta_data->>'university';
  profile_campaign_manager_type := new.raw_user_meta_data->>'campaign_manager_type';

  if users_id_type = 'uuid' then
    insert into public.users (
      id, name, email, full_name, avatar_url, role, provider, creator_rank,
      university, campaign_manager_type, created_at, updated_at
    )
    values (
      new.id, profile_name, new.email, profile_name, profile_avatar, profile_role, profile_provider, profile_rank,
      profile_university, profile_campaign_manager_type, now(), now()
    )
    on conflict (id) do update set
      name = excluded.name,
      email = excluded.email,
      full_name = excluded.full_name,
      avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url),
      role = excluded.role,
      provider = excluded.provider,
      creator_rank = coalesce(public.users.creator_rank, excluded.creator_rank),
      university = coalesce(public.users.university, excluded.university),
      campaign_manager_type = coalesce(public.users.campaign_manager_type, excluded.campaign_manager_type),
      updated_at = now();
  else
    insert into public.users (
      id, name, email, full_name, avatar_url, role, provider, creator_rank,
      university, campaign_manager_type, created_at, updated_at
    )
    values (
      new.id::text, profile_name, new.email, profile_name, profile_avatar, profile_role, profile_provider, profile_rank,
      profile_university, profile_campaign_manager_type, now(), now()
    )
    on conflict (id) do update set
      name = excluded.name,
      email = excluded.email,
      full_name = excluded.full_name,
      avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url),
      role = excluded.role,
      provider = excluded.provider,
      creator_rank = coalesce(public.users.creator_rank, excluded.creator_rank),
      university = coalesce(public.users.university, excluded.university),
      campaign_manager_type = coalesce(public.users.campaign_manager_type, excluded.campaign_manager_type),
      updated_at = now();
  end if;

  return new;
end;
$function$;

-- Clean up the diagnostic view from the previous migration.
drop view if exists public._debug_auth_users_triggers;
