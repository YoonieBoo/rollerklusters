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

type CreatorProfileForScoring = {
  platform?: string | null;
  content_categories?: unknown;
  content_types?: unknown;
  interested_content_types?: unknown;
  is_scholarship_student?: boolean | null;
  scholarship_student?: boolean | null;
  follower_count?: number | string | null;
  manual_follower_count?: number | string | null;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return toStringArray(parsed);
    } catch {
      return [value];
    }
  }
  return [];
};

// Replaces what used to be a hardcoded match_score: 82 for every invite,
// regardless of creator or campaign. Scores 0-100 from concrete signals
// already in the data — platform fit, content-category overlap with the
// brief, scholarship targeting, and follower reach — rather than pretending
// to have real AI-driven matching intelligence that doesn't exist yet.
const computeMatchScore = (
  creator: CreatorProfileForScoring,
  brief: { objective?: string | null; target_audience?: string | null; content_direction?: string | null; platforms?: unknown } | null,
  campaignName: string
): number => {
  let score = 0;

  // Platform fit — 30 pts
  const briefPlatforms = toStringArray(brief?.platforms).map((p) => p.toLowerCase());
  if (briefPlatforms.length > 0) {
    if (creator.platform && briefPlatforms.includes(creator.platform.toLowerCase())) {
      score += 30;
    }
  } else {
    score += 15; // no platform requirement specified — can't penalize
  }

  // Content-category overlap with the brief text — up to 30 pts
  const briefText = [brief?.objective, brief?.target_audience, brief?.content_direction]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const categories = [
    ...toStringArray(creator.content_categories),
    ...toStringArray(creator.content_types),
    ...toStringArray(creator.interested_content_types),
  ];
  if (briefText && categories.length > 0) {
    const matches = new Set(categories.filter((c) => briefText.includes(c.toLowerCase())));
    score += Math.min(30, matches.size * 10);
  } else {
    score += 10; // nothing to compare against — baseline credit
  }

  // Scholarship targeting — some campaigns are explicitly for/against
  // scholarship students (encoded in the campaign name) — 20 pts
  const nameLower = campaignName.toLowerCase();
  const isScholarshipStudent = creator.scholarship_student ?? creator.is_scholarship_student ?? null;
  if (nameLower.includes('non-scholarship')) {
    score += isScholarshipStudent === false ? 20 : isScholarshipStudent === null ? 10 : 0;
  } else if (nameLower.includes('scholarship')) {
    score += isScholarshipStudent === true ? 20 : isScholarshipStudent === null ? 10 : 0;
  } else {
    score += 20; // campaign doesn't target by scholarship status
  }

  // Follower reach — up to 20 pts
  const followers = Number(creator.manual_follower_count ?? creator.follower_count ?? 0) || 0;
  if (followers >= 50000) score += 20;
  else if (followers >= 10000) score += 15;
  else if (followers >= 1000) score += 10;
  else score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
};

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

  const { campaignId, campaignName, clientName, emails, creators, accessToken } = body as Record<string, unknown>;

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

  // For each creator with a real user ID, call the ecosystem invite API.
  // That route handles engagement insert + push notification in one place.
  // Fall back to direct insert + webpush if the ecosystem call fails.
  if (creatorList && creatorList.length > 0) {
    const creatorsWithId = creatorList.filter((c) => c.id);

    const [{ data: briefRow }, { data: profileRows }] = await Promise.all([
      supabaseAdmin
        .from('briefs')
        .select('objective, target_audience, content_direction, platforms')
        .eq('campaign_id', String(campaignId))
        .maybeSingle(),
      supabaseAdmin
        .from('creator_profiles')
        .select(
          'user_id, platform, content_categories, content_types, interested_content_types, is_scholarship_student, scholarship_student, follower_count, manual_follower_count'
        )
        .in('user_id', creatorsWithId.map((c) => c.id)),
    ]);

    const profileByUserId = new Map((profileRows ?? []).map((row) => [String(row.user_id), row]));

    await Promise.allSettled(
      creatorsWithId.map(async (creator) => {
        const profile = profileByUserId.get(creator.id) ?? {};
        const matchScore = computeMatchScore(profile, briefRow ?? null, resolvedCampaignName);

        // Prefer the ecosystem API so push notification fires correctly
        if (accessToken) {
          try {
            const ecoRes = await fetch('https://rollerkluster-ecosystem.vercel.app/api/engagements/invite', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                campaignId: String(campaignId),
                creatorId: creator.id,
                matchScore,
              }),
            });
            if (ecoRes.ok) return; // ecosystem handled it — done
            const errText = await ecoRes.text().catch(() => '');
            console.warn(`Ecosystem invite API returned ${ecoRes.status} for creator ${creator.id}:`, errText);
          } catch (err) {
            console.warn('Ecosystem invite API unreachable, falling back:', err);
          }
        }

        // Fallback: insert engagement directly + send push via webpush
        const { error: engagementError } = await supabaseAdmin
          .from('engagements')
          .upsert(
            { campaign_id: String(campaignId), creator_id: creator.id, status: 'matched', match_score: matchScore },
            { onConflict: 'campaign_id,creator_id', ignoreDuplicates: true }
          );
        if (engagementError) {
          console.warn('Fallback engagement insert failed:', engagementError.message);
        }

        if (vapidPublicKey && vapidPrivateKey) {
          const { data: subs } = await supabaseAdmin
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('creator_id', creator.id);

          const pushPayload = JSON.stringify({
            title: 'You have a new campaign invite',
            body: resolvedCampaignName ? `You've been invited to: ${resolvedCampaignName}` : 'Open the app to view your invitation.',
            url: '/notifications',
          });

          const expiredEndpoints: string[] = [];
          await Promise.allSettled(
            (subs ?? []).map(async (sub) => {
              try {
                await webpush.sendNotification(
                  { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                  pushPayload
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
      })
    );
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
