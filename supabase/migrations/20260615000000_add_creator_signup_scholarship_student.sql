alter table public.creator_signups
  add column if not exists scholarship_student boolean;
