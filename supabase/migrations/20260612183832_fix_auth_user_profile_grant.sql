-- Fix Supabase Auth login failures caused by database-side profile/claim logic.
--
-- The app must treat auth.users as the source of truth. public.users is a
-- profile/cache table and should never be required to exist before a user can
-- receive a Supabase Auth session.

-- Supabase Auth uses auth.users.role as the database/JWT role when granting a
-- session. App roles such as "admin" belong in public.users.role, not here.
-- If auth.users.role is blank or set to "admin", Auth can fail with:
-- "Database error granting user".
update auth.users
set role = 'authenticated'
where role is distinct from 'authenticated';

alter table auth.users
alter column role set default 'authenticated';

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  full_name text,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

alter table public.users add column if not exists email text;
alter table public.users add column if not exists name text;
alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists role text not null default 'admin';
alter table public.users add column if not exists created_at timestamptz not null default now();

insert into public.users (id, email, name, full_name, role, created_at)
select
  auth_users.id,
  auth_users.email,
  coalesce(
    auth_users.raw_user_meta_data->>'display_name',
    auth_users.raw_user_meta_data->>'full_name',
    auth_users.email
  ) as name,
  coalesce(
    auth_users.raw_user_meta_data->>'display_name',
    auth_users.raw_user_meta_data->>'full_name',
    auth_users.email
  ) as full_name,
  'admin' as role,
  coalesce(auth_users.created_at, now()) as created_at
from auth.users as auth_users
on conflict (id) do update
set
  email = excluded.email,
  name = coalesce(public.users.name, excluded.name),
  full_name = coalesce(public.users.full_name, excluded.full_name),
  role = coalesce(nullif(public.users.role, ''), excluded.role);

create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name, full_name, role, created_at)
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
    coalesce(new.created_at, now())
  )
  on conflict (id) do update
  set
    email = excluded.email,
    name = coalesce(public.users.name, excluded.name),
    full_name = coalesce(public.users.full_name, excluded.full_name),
    role = coalesce(nullif(public.users.role, ''), excluded.role);

  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_created on auth.users;

create trigger on_auth_user_profile_created
after insert on auth.users
for each row
execute function public.handle_auth_user_profile();

grant usage on schema public to supabase_auth_admin;
grant select, insert, update on table public.users to supabase_auth_admin;
grant execute on function public.handle_auth_user_profile() to supabase_auth_admin;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  user_role text;
begin
  select coalesce(nullif(users.role, ''), 'admin')
  into user_role
  from public.users
  where users.id = (event->>'user_id')::uuid;

  claims := coalesce(event->'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{user_role}', to_jsonb(coalesce(user_role, 'admin')), true);
  event := jsonb_set(event, '{claims}', claims, true);

  return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from anon;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated;
revoke execute on function public.custom_access_token_hook(jsonb) from public;
