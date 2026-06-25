import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CM_ROLE_PATTERNS = ['campaign_manager', 'campaign-manager', 'campaign manager'];

function isCampaignManagerLabel(label: unknown) {
  if (!label) return false;
  const s = String(label).toLowerCase().trim();
  return CM_ROLE_PATTERNS.some((p) => s.includes(p));
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return NextResponse.json({ ids: [] });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Source 1: public.users with role = 'campaign_manager'
  const { data: publicUsers } = await admin
    .from('users')
    .select('id')
    .eq('role', 'campaign_manager');

  const ids = new Set<string>(
    (publicUsers ?? []).map((row: { id: string }) => String(row.id))
  );

  // Source 2: creator_signups where role_label indicates campaign manager
  const { data: signups } = await admin
    .from('creator_signups')
    .select('email, role_label');

  const cmEmails = new Set<string>();
  for (const row of signups ?? []) {
    if (isCampaignManagerLabel(row.role_label)) {
      const email = String(row.email ?? '').trim().toLowerCase();
      if (email) cmEmails.add(email);
    }
  }

  // Match those emails to auth.users to get their user IDs
  if (cmEmails.size > 0) {
    const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    for (const user of authData?.users ?? []) {
      const email = user.email?.toLowerCase() ?? '';
      if (cmEmails.has(email)) {
        ids.add(user.id);
      }
    }
  }

  return NextResponse.json({ ids: Array.from(ids) });
}
