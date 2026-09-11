-- The same real student ("Kate", TikTok handle katehtetthuya, Architecture
-- faculty) was onboarded twice under two different accounts, ~5 weeks
-- apart. Account A (c792602d..., created 2026-06-19) has 3 matched
-- engagements and no submissions. Account B (68eb9e5d..., created
-- 2026-07-26) has 1 matched engagement plus 2 real approved TikTok
-- submissions. Consolidating onto Account B since it has actual delivered
-- content, without losing Account A's other campaign history.

-- 1. Move Account A's 2 non-overlapping engagements onto Account B.
update public.engagements
set creator_id = '68eb9e5d-b5d0-4dd3-a77a-1a54cd15f4ce'
where id in (
  'cf70465f-09ee-464e-9fcf-f4cd17c90fab', -- Capture AU (Non-Scholarships)
  'ae6c6ad0-daa3-454f-8ccc-84b914982e81'  -- Capture AU (For Scholarships Students)
);

-- 2. Account A also has an engagement for "Hidden Gems @ AU (For
-- Scholarship students)" that duplicates one Account B already has —
-- drop the duplicate rather than moving it.
delete from public.engagements
where id = '368e200b-9533-491d-8bce-5695af33ba14';

-- 3. Remove Account A's now-empty creator profile.
delete from public.creator_profiles
where id = '5493c4e2-25d7-4700-b9a5-adc76dfeffd0';

-- 4. Remove Account A's profile row and login entirely.
delete from public.users
where id = 'c792602d-be0f-48d6-910e-7aa7caff6565';
