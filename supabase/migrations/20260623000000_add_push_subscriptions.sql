create table if not exists push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now() not null,
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists push_subscriptions_campaign_id_idx
  on push_subscriptions (campaign_id);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions_insert" on push_subscriptions
  for insert with check (true);

create policy "push_subscriptions_select" on push_subscriptions
  for select using (true);

create policy "push_subscriptions_delete" on push_subscriptions
  for delete using (true);
