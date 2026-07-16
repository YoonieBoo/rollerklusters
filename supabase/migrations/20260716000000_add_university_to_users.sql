-- Capture which university (and, for Assumption University, which kind of
-- campaign manager) an account belongs to. This is the first step toward
-- scoping campaign managers per university instead of every account seeing
-- every creator/campaign platform-wide.

alter table public.users add column if not exists university text;
alter table public.users add column if not exists campaign_manager_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_university_check'
  ) then
    alter table public.users add constraint users_university_check
      check (
        university is null
        or university in ('Assumption University', 'Khon Kaen University', 'Chiang Mai University')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_campaign_manager_type_check'
  ) then
    alter table public.users add constraint users_campaign_manager_type_check
      check (campaign_manager_type is null or campaign_manager_type in ('General', 'DDI'));
  end if;
end $$;

-- Keep the signup trigger in sync so university/campaign_manager_type
-- submitted at signup (via auth user metadata) land on the profile row.
create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id, email, name, full_name, role, university, campaign_manager_type, created_at
  )
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.email
    ),
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.email
    ),
    'admin',
    new.raw_user_meta_data->>'university',
    new.raw_user_meta_data->>'campaign_manager_type',
    coalesce(new.created_at, now())
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(public.users.name, excluded.name),
    full_name = coalesce(public.users.full_name, excluded.full_name),
    role = coalesce(nullif(public.users.role, ''), excluded.role),
    university = coalesce(public.users.university, excluded.university),
    campaign_manager_type = coalesce(public.users.campaign_manager_type, excluded.campaign_manager_type);

  return new;
end;
$$;
