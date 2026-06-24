import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase/server';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT ?? 'mailto:notifications@rollerkluster.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function buildInviteEmail({
  campaignName,
  clientName,
  briefUrl,
}: {
  campaignName: string;
  clientName: string;
  briefUrl: string;
}) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <div style="background:#1d4ed8;padding:28px 32px;">
      <p style="margin:0;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;">RollerKluster</p>
      <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:600;line-height:1.3;">You have a creator brief</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
        You've been invited to participate in the <strong>${campaignName}</strong> campaign${clientName ? ` for <strong>${clientName}</strong>` : ''}.
      </p>
      <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.6;">
        Open the creator brief to see the campaign goal, content direction, brand guidelines, and submission requirements.
      </p>
      <a href="${briefUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">Open Creator Brief</a>
      <p style="margin:28px 0 0;color:#9ca3af;font-size:13px;line-height:1.5;">
        Or copy this link:<br>
        <span style="color:#6b7280;word-break:break-all;">${briefUrl}</span>
      </p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #f1f5f9;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Sent via RollerKluster · You received this because you were invited to this campaign.</p>
    </div>
  </div>
</body>
</html>`;
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { campaignId, campaignName, clientName, emails, creators } = body as Record<string, unknown>;

  // Accept either a `creators` array (with ids) or a plain `emails` array
  const creatorList = Array.isArray(creators)
    ? (creators as { id: string; email: string }[])
    : null;
  const emailList: string[] = creatorList
    ? creatorList.map((c) => c.email)
    : Array.isArray(emails)
    ? (emails as string[])
    : [];

  if (!campaignId || emailList.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const resolvedCampaignName = String(campaignName ?? '');

  // Write engagement records to Supabase first — this works even without email configured.
  if (creatorList && creatorList.length > 0) {
    const rows = creatorList
      .filter((c) => c.id)
      .map((c) => ({
        campaign_id: String(campaignId),
        creator_id: c.id,
        status: 'matched',
        match_score: 82,
      }));

    if (rows.length > 0) {
      const { error: engagementError } = await supabaseAdmin
        .from('engagements')
        .upsert(rows, { onConflict: 'campaign_id,creator_id', ignoreDuplicates: true });

      if (engagementError) {
        console.warn('Could not write engagements to Supabase (table may not exist yet):', engagementError.message);
      }
    }

    // Send push notifications to each invited creator if VAPID is configured
    if (vapidPublicKey && vapidPrivateKey && creatorList.length > 0) {
      const creatorIds = creatorList.filter((c) => c.id).map((c) => c.id);
      const { data: subs } = await supabaseAdmin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .in('creator_id', creatorIds);

      if (subs && subs.length > 0) {
        const payload = JSON.stringify({
          title: 'You have a new campaign invite',
          body: resolvedCampaignName ? `You've been invited to: ${resolvedCampaignName}` : 'Open the app to view your invitation.',
          url: '/notifications',
        });

        const expiredEndpoints: string[] = [];
        await Promise.allSettled(
          subs.map(async (sub) => {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload
              );
            } catch (err) {
              const statusCode = (err as { statusCode?: number })?.statusCode;
              if (statusCode === 410 || statusCode === 404) expiredEndpoints.push(sub.endpoint);
            }
          })
        );
        if (expiredEndpoints.length > 0) {
          await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
        }
      }
    }
  }

  // Send emails if Resend is configured — optional, non-blocking for engagement writes above.
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Engagements were written; just skip email and return success.
    return NextResponse.json({ sent: 0, failed: 0, note: 'Invites recorded. Add RESEND_API_KEY to also send email notifications.' });
  }

  const briefUrl = `${getSiteUrl()}/creator-brief/${campaignId}`;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
  const resend = new Resend(apiKey);

  const results = await Promise.allSettled(
    emailList.map((email) =>
      resend.emails.send({
        from: `RollerKluster <${fromEmail}>`,
        to: email.trim(),
        subject: resolvedCampaignName ? `Creator brief: ${resolvedCampaignName}` : 'You have a creator brief',
        html: buildInviteEmail({
          campaignName: resolvedCampaignName,
          clientName: String(clientName ?? ''),
          briefUrl,
        }),
      })
    )
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  if (sent === 0) {
    const firstRejected = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    const message =
      firstRejected?.reason?.message ??
      firstRejected?.reason?.toString() ??
      'Failed to send emails';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ sent, failed });
}
