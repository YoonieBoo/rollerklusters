-- One more leftover test account found while auditing orphaned rows:
-- "Codex Auth Smoke" (codex-auth-smoke+...@example.com), created
-- 2026-06-16 — an automated auth smoke-test artifact, not a real person,
-- with no linked creator_profiles/engagements/submissions. Removing both
-- its profile row and its login entirely.
delete from public.users
where id = '35f3b100-d486-4a18-b287-c9e3583085c8';

delete from auth.users
where id = '35f3b100-d486-4a18-b287-c9e3583085c8';
