-- Track which campaign manager created each campaign, so managers can tell
-- which campaigns belong to whom. Denormalized as plain text (matching this
-- table's existing client_name pattern) rather than a foreign key, since the
-- display use case never needs a join back to users.
alter table public.campaigns
  add column if not exists created_by_name text,
  add column if not exists created_by_email text;
