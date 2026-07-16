-- Temporary diagnostic view to inspect all triggers on auth.users.
-- Will be dropped by a follow-up migration once the investigation is done.
create or replace view public._debug_auth_users_triggers as
select
  t.tgname as trigger_name,
  p.proname as function_name,
  pg_get_triggerdef(t.oid) as trigger_definition,
  pg_get_functiondef(p.oid) as function_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;

grant select on public._debug_auth_users_triggers to service_role;
