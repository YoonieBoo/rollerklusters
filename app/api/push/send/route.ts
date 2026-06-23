import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase/server';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:hello@rollerkluster.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function POST(request: NextRequest) {
  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json(
      {
        error:
          'Push notifications not configured. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to your .env.local file.',
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { campaignId, title, message, url } = body as Record<string, unknown>;

  if (!campaignId || !title) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data: subscriptions, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('campaign_id', String(campaignId));

  if (error) {
    console.error('Push send fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (subscriptions ?? []) as PushSubscriptionRow[];

  if (rows.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, expired: 0 });
  }

  const payload = JSON.stringify({
    title: String(title),
    body: String(message ?? ''),
    url: String(url ?? `/creator-brief/${campaignId}`),
  });

  const results = await Promise.allSettled(
    rows.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  const expiredEndpoints: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const statusCode = (result.reason as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        expiredEndpoints.push(rows[index].endpoint);
      }
    }
  });

  if (expiredEndpoints.length > 0) {
    await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .in('endpoint', expiredEndpoints);
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed =
    results.filter((r) => r.status === 'rejected').length - expiredEndpoints.length;

  return NextResponse.json({ sent, failed, expired: expiredEndpoints.length });
}
