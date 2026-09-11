-- The Kate duplicate merge (20260903024049) removed Account A's
-- public.users profile row but missed removing its auth.users login,
-- leaving it newly orphaned. Completing that cleanup here.
delete from auth.users
where id = 'c792602d-be0f-48d6-910e-7aa7caff6565';
