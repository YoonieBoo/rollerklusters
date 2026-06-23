-- Enable full replica identity so Supabase Realtime broadcasts every change
-- (insert, update, delete) on these tables, not just primary key diffs.
alter table if exists public.creator_signups replica identity full;
alter table if exists public.creator_profiles replica identity full;

-- Add both tables to the realtime publication.
-- Wrapped in a DO block so re-running the migration is safe
-- (the second run is a no-op rather than an error).
do $$
begin
  begin
    alter publication supabase_realtime add table public.creator_signups;
  exception when others then
    -- already in publication, ignore
    null;
  end;

  begin
    alter publication supabase_realtime add table public.creator_profiles;
  exception when others then
    null;
  end;
end $$;
