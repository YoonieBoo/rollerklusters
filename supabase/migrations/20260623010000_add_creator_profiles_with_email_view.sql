-- SECURITY DEFINER function runs as postgres (not the caller),
-- so it can join auth.users even from the authenticated role.
create or replace function public.get_creator_profiles_with_email()
returns json
language sql
security definer
set search_path = public
as $$
  select coalesce(
    json_agg(
      json_build_object(
        'id',                      p.id::text,
        'display_name',            p.display_name,
        'creator_name',            p.creator_name,
        'social_handle',           p.social_handle,
        'user_id',                 p.user_id::text,
        'content_categories',      p.content_categories,
        'content_types',           p.content_types,
        'interested_content_types', p.interested_content_types,
        'primary_creative_focus',  p.primary_creative_focus,
        'email',                   u.email
      )
    ),
    '[]'::json
  )
  from public.creator_profiles p
  join auth.users u on u.id = p.user_id
  where lower(u.email) not in (
    'aungkhantbhonemyat09@gmail.com',
    'u6511158@au.edu',
    'u6732015@au.edu'
  );
$$;

grant execute on function public.get_creator_profiles_with_email() to authenticated;
