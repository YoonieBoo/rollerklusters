import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceKey) {
    return NextResponse.json({ ids: [] });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data } = await admin
    .from('users')
    .select('id')
    .eq('role', 'campaign_manager');

  const ids = (data ?? []).map((row: { id: string }) => String(row.id));
  return NextResponse.json({ ids });
}
