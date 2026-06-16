insert into public.creator_signups (
  signup_type,
  role_label,
  display_name,
  email,
  location,
  university_program,
  year,
  phone_number,
  line_id,
  primary_creative_focus,
  experience_level,
  contribution,
  interested_content_types,
  additional_notes,
  status,
  created_at
)
select
  'campaign-manager',
  'Campaign Manager Sign Up',
  'Phyu Hnin Khaing(Laura)',
  'phyuhninkhaing107@gmail.com',
  'Samut Prakan, Thailand',
  'BBA',
  '1',
  '+66823328081',
  '32015117',
  'Campaign manager',
  'While I was in High School, I was in a management team that had to manage some campaign in school',
  'Follow up with team members',
  'Google Sheets',
  'None',
  'pending_review',
  '2026-06-15 15:04:00+00'::timestamptz
where not exists (
  select 1
  from public.creator_signups
  where lower(email) = lower('phyuhninkhaing107@gmail.com')
);
