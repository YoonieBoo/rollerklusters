-- Supports connecting a creator's real LINE account so campaign invites can
-- be delivered there. line_id (already existed) is just the free-text
-- username a creator typed at signup — LINE's Messaging API can't send
-- anything to that, it needs the internal userId captured once a creator
-- adds the Official Account as a friend and sends back a one-time link
-- code (see the Ecosystem app's LINE webhook + Connect LINE UI).
alter table public.creator_profiles
  add column if not exists line_user_id text,
  add column if not exists line_link_code text;
