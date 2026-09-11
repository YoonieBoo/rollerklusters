-- 9 leftover test rows in public.users from RLS/manual-add verification
-- testing done during development. Their auth.users login half was already
-- deleted after each test, but the profile row was left behind, polluting
-- the live users table. Verified none of these ids are referenced by any
-- creator_profiles row before removing.
delete from public.users
where id in (
  '6cf0ebd8-3f37-4c1a-82a2-2bb017b80636', -- rls-test-cp3@example.com
  '1ef2086c-79c0-4cec-85bf-21de1393f62f', -- manual-add-test@example.com
  '3c78c798-2211-42b9-bed4-bc25f5319afc', -- rls-test-avatar@example.com
  'f75dcaba-b63f-471a-ab38-552aa95859ac', -- rls-test-temp@example.com
  '32f81833-fdce-4b75-8f9c-d96a6bfe43d0', -- rls-test-temp2@example.com
  '450a34da-a9f5-44f3-adb9-d15f42e2703a', -- rls-test-temp3@example.com
  '2bd73b4b-8563-40be-a489-b57f6ff73c92', -- recheck-add-test@example.com
  '56f9f39b-f470-45de-8192-78eb576cba2a', -- rls-test-cp@example.com
  '3d564d55-b285-4510-951d-7e21537fda3a'  -- rls-test-cp2@example.com
);
