import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// Campaign managers who registered through this app's own /auth signup form
// (university + campaign manager type) never land in creator_signups — that
// table only holds the older Typeform submissions. university is only ever
// set by that /auth flow, so it's the reliable signal for "this is a
// campaign manager account." Runs server-side with the service role key
// because regular logged-in users don't have read access to these columns.
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, full_name, email, university, campaign_manager_type, created_at')
    .not('university', 'is', null);

  if (error) {
    console.error('campaign-manager-auth-signups fetch error:', error.message);
    return NextResponse.json({ rows: [] });
  }

  return NextResponse.json({ rows: data ?? [] });
}
