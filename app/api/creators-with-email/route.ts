import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAILS = new Set([
  'aungkhantbhonemyat09@gmail.com',
  'u6511158@au.edu',
  'u6732015@au.edu',
]);

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [
    { data: profiles, error: profilesError },
    { data: authData, error: authError },
    { data: signups },
  ] = await Promise.all([
    admin
      .from('creator_profiles')
      .select('id, display_name, creator_name, social_handle, user_id, content_categories, content_types'),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin
      .from('creator_signups')
      .select('email, display_name, instagram_handle, tiktok_handle'),
  ]);

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // Primary: email by user_id from auth.users
  const emailByUserId = new Map<string, string>();
  for (const user of authData?.users ?? []) {
    const email = user.email?.toLowerCase();
    if (email && !ADMIN_EMAILS.has(email)) {
      emailByUserId.set(user.id, email);
    }
  }

  // Fallback: email by handle/name from creator_signups
  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/^@/, '');
  const emailByIdentifier = new Map<string, string>();
  for (const signup of signups ?? []) {
    const email = norm(signup.email);
    if (!email || ADMIN_EMAILS.has(email)) continue;
    for (const field of [signup.instagram_handle, signup.tiktok_handle, signup.display_name]) {
      const key = norm(field);
      if (key) emailByIdentifier.set(key, email);
    }
  }

  const result = (profiles ?? [])
    .map((p) => {
      // Try auth.users first
      let email = emailByUserId.get(String(p.user_id ?? '')) ?? null;

      // Fall back to creator_signups match by social_handle / display_name / creator_name
      if (!email) {
        for (const field of [p.social_handle, p.display_name, p.creator_name]) {
          const key = norm(field);
          if (key && emailByIdentifier.has(key)) {
            email = emailByIdentifier.get(key)!;
            break;
          }
        }
      }

      return { ...p, email };
    })
    .filter((p) => p.email);

  return NextResponse.json(result);
}
