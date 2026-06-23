import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

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
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Email service not configured. Add RESEND_API_KEY to your .env.local file.' },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { campaignId, campaignName, clientName, emails } = body as Record<string, unknown>;

  if (
    !campaignId ||
    !campaignName ||
    !Array.isArray(emails) ||
    emails.length === 0
  ) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const briefUrl = `${getSiteUrl()}/creator-brief/${campaignId}`;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
  const resend = new Resend(apiKey);

  const results = await Promise.allSettled(
    (emails as string[]).map((email) =>
      resend.emails.send({
        from: `RollerKluster <${fromEmail}>`,
        to: email.trim(),
        subject: `Creator brief: ${campaignName}`,
        html: buildInviteEmail({
          campaignName: String(campaignName),
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
