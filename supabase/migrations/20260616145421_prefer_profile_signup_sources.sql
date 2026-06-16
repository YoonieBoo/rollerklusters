drop view if exists public.creator_signup_profile_sources;

create view public.creator_signup_profile_sources as
select
  profile.id::text as id,
  'profile'::text as signup_type,
  'Creator Profile Sign Up'::text as role_label,
  coalesce(
    nullif(profile.display_name, ''),
    nullif(profile.creator_name, ''),
    nullif(public_user.name, ''),
    nullif(public_user.full_name, ''),
    nullif(auth_user.raw_user_meta_data->>'display_name', ''),
    nullif(auth_user.raw_user_meta_data->>'full_name', ''),
    auth_user.email
  ) as display_name,
  auth_user.email,
  profile.location,
  profile.nickname,
  concat_ws(' / ', nullif(profile.university, ''), nullif(profile.faculty, '')) as university_program,
  null::text as year,
  profile.is_scholarship_student as scholarship_student,
  profile.phone_number,
  profile.line_id,
  null::text as instagram_handle,
  null::text as tiktok_handle,
  profile.social_profile_url as other_platforms,
  coalesce(profile.creative_focus, array_to_string(profile.content_categories, ', ')) as primary_creative_focus,
  coalesce(profile.follower_count, profile.manual_follower_count, profile.detected_follower_count) as follower_count,
  profile.experience_level,
  profile.hours_available,
  profile.portfolio_links,
  profile.contribution,
  profile.content_types as interested_content_types,
  profile.additional_notes,
  coalesce(profile.verification_status, 'pending_review') as status,
  least(profile.created_at, auth_user.created_at) as created_at
from public.creator_profiles profile
join auth.users auth_user
  on auth_user.id = profile.user_id
left join public.users public_user
  on public_user.email = auth_user.email
where lower(auth_user.email) not in (
  'aungkhantbhonemyat09@gmail.com',
  'u6511158@au.edu',
  'u6732015@au.edu'
)
union all
select
  'email-campaign-manager-phyuhninkhaing107'::text as id,
  'campaign-manager'::text as signup_type,
  'Campaign Manager Sign Up'::text as role_label,
  'Phyu Hnin Khaing(Laura)'::text as display_name,
  'phyuhninkhaing107@gmail.com'::text as email,
  'Samut Prakan, Thailand'::text as location,
  null::text as nickname,
  'BBA'::text as university_program,
  '1'::text as year,
  null::boolean as scholarship_student,
  '+66823328081'::text as phone_number,
  '32015117'::text as line_id,
  null::text as instagram_handle,
  null::text as tiktok_handle,
  null::text as other_platforms,
  'Campaign manager'::text as primary_creative_focus,
  null::integer as follower_count,
  'Managed a high school campaign team'::text as experience_level,
  null::integer as hours_available,
  null::text as portfolio_links,
  'Follow up with team members'::text as contribution,
  'Google Sheets'::text as interested_content_types,
  'Managed people/events/projects: Yes. Experience: While I was in High School, I was in a management team that had to manage some campaign in school. Additional Notes: None'::text as additional_notes,
  'pending_review'::text as status,
  '2026-06-15 15:04:00+00'::timestamptz as created_at
where not exists (
  select 1
  from public.creator_signups signup
  where lower(signup.email) = lower('phyuhninkhaing107@gmail.com')
);

revoke all on public.creator_signup_profile_sources from public;
revoke all on public.creator_signup_profile_sources from anon;
grant select on public.creator_signup_profile_sources to authenticated;
