-- Ensure creator_signups can receive inserts from external sources
-- (e.g. Typeform/Google Forms webhooks using the anon/service key).
-- Also allow the dashboard (authenticated) to read all rows.

alter table public.creator_signups enable row level security;

-- External forms / webhooks can insert new signups
drop policy if exists "creator_signups_anon_insert" on public.creator_signups;
create policy "creator_signups_anon_insert"
  on public.creator_signups
  for insert
  to anon, authenticated
  with check (true);

-- Dashboard and invite system can read all rows
drop policy if exists "creator_signups_authenticated_select" on public.creator_signups;
create policy "creator_signups_authenticated_select"
  on public.creator_signups
  for select
  to anon, authenticated
  using (true);
