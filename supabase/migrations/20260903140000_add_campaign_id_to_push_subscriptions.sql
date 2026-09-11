-- app/api/push/subscribe/route.ts has always inserted a campaign_id when a
-- creator subscribes to campaign updates, and app/api/push/send/route.ts has
-- always filtered by it when a manager broadcasts a notification — but the
-- live push_subscriptions table never actually had this column, only
-- creator_id. Every subscribe attempt has been silently failing ever since,
-- which is why every campaign shows "No subscribers yet" even for campaigns
-- that have been active for weeks — there was never a way for a subscription
-- to actually save.
alter table public.push_subscriptions
  add column if not exists campaign_id uuid;
