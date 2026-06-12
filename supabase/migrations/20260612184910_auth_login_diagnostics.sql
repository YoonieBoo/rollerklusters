-- Optional diagnostics for Supabase SQL Editor.
-- These queries help verify the cause of "Database error granting user".

select
  id,
  email,
  role,
  email_confirmed_at,
  created_at
from auth.users
where role is distinct from 'authenticated'
order by created_at desc;

select
  auth_users.id,
  auth_users.email,
  auth_users.role as auth_database_role,
  public_users.role as app_role,
  public_users.name,
  public_users.full_name
from auth.users as auth_users
left join public.users as public_users on public_users.id = auth_users.id
order by auth_users.created_at desc;
