-- Correction: both Hidden Gems @ AU campaigns were created by Ke Ke, not
-- Alurra (which was the correct attribution for the two Capture AU
-- campaigns, left unchanged here).
update public.campaigns
set created_by_name = 'Ke Ke',
    created_by_email = null
where id in (
  '29962192-7650-4e93-a92e-8845b056c1a4', -- Hidden Gems @ AU (For Scholarship students)
  '2b78c863-6e6b-44f4-8e2d-2108edd9aa73'  -- Hidden Gems @ AU (For non-scholarship students)
);
