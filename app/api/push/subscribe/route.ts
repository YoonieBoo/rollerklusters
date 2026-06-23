import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { campaignId, subscription } = body as Record<string, unknown>;
  const sub = subscription as Record<string, unknown> | null | undefined;
  const keys = sub?.keys as Record<string, unknown> | null | undefined;

  if (!campaignId || !sub?.endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .upsert(
      {
        campaign_id: String(campaignId),
        endpoint: String(sub.endpoint),
        p256dh: String(keys.p256dh),
        auth: String(keys.auth),
      },
      { onConflict: 'endpoint' }
    );

  if (error) {
    console.error('Push subscribe error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { endpoint } = body as Record<string, unknown>;

  if (!endpoint) {
    return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', String(endpoint));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
