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

  const [{ data: profiles, error: profilesError }, { data: authData, error: authError }] =
    await Promise.all([
      admin
        .from('creator_profiles')
        .select('id, display_name, creator_name, social_handle, user_id, content_categories, content_types, interested_content_types, primary_creative_focus'),
      admin.auth.admin.listUsers({ perPage: 1000 }),
    ]);

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  const emailByUserId = new Map<string, string>();
  for (const user of authData?.users ?? []) {
    const email = user.email?.toLowerCase();
    if (email && !ADMIN_EMAILS.has(email)) {
      emailByUserId.set(user.id, email);
    }
  }

  const result = (profiles ?? [])
    .map((p) => ({ ...p, email: emailByUserId.get(String(p.user_id ?? '')) ?? null }))
    .filter((p) => p.email);

  return NextResponse.json(result);
}
