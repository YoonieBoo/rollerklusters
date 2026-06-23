import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Field extraction helpers
// ---------------------------------------------------------------------------

const norm = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const anyVal = (v: unknown): string => {
  if (Array.isArray(v)) return v.map((x) => String(x ?? '')).filter(Boolean).join(', ');
  return String(v ?? '').trim();
};

// Tally.so webhook: { data: { fields: [{ label, value, ... }] } }
function extractFromTally(body: Record<string, unknown>): Record<string, string> {
  const data = body.data as Record<string, unknown> | undefined;
  const fields = data?.fields as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(fields)) return {};
  const out: Record<string, string> = {};
  for (const f of fields) {
    const label = norm(f.label ?? f.key ?? '');
    if (!label) continue;
    // Tally checkbox/multi-select: value is array of { id, text }
    let val: string;
    if (Array.isArray(f.value)) {
      val = f.value
        .map((item: unknown) =>
          typeof item === 'object' && item !== null
            ? String((item as Record<string, unknown>).text ?? (item as Record<string, unknown>).label ?? item)
            : String(item ?? '')
        )
        .filter(Boolean)
        .join(', ');
    } else {
      val = anyVal(f.value);
    }
    out[label] = val;
  }
  return out;
}

// Generic flat JSON: { name: "...", email: "...", ... }
function extractFromFlat(body: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    out[norm(k)] = anyVal(v);
  }
  return out;
}

// Find first matching value by checking if any field label contains a pattern
function pick(fields: Record<string, string>, ...patterns: string[]): string {
  for (const pat of patterns) {
    for (const [label, value] of Object.entries(fields)) {
      if (label.includes(pat) && value) return value;
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Signup type inference
// ---------------------------------------------------------------------------

function inferSignupType(roleLabel: string): string {
  const lower = roleLabel.toLowerCase();
  if (lower.includes('campaign manager') || lower.includes('campaign-manager') || lower.includes('campaign_manager')) {
    return 'campaign-manager';
  }
  return 'creator';
}

// ---------------------------------------------------------------------------
// Email notification
// ---------------------------------------------------------------------------

function buildNotificationEmail(row: Record<string, unknown>): string {
  const fields = Object.entries(row).filter(([k]) =>
    !['id', 'created_at', 'status', 'signup_type'].includes(k)
  );
  const rows = fields
    .map(([k, v]) => {
      if (!v) return '';
      const label = k
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      return `<tr><td style="padding:6px 12px;font-weight:600;color:#374151;white-space:nowrap;vertical-align:top;">${label}</td><td style="padding:6px 12px;color:#111827;">${v}</td></tr>`;
    })
    .filter(Boolean)
    .join('');

  const title = String(row.role_label ?? 'New Signup');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:32px 16px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
    <div style="background:#1d4ed8;padding:24px 32px;">
      <p style="margin:0;color:#93c5fd;font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;">RollerKluster</p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:600;">${title}</h1>
    </div>
    <div style="padding:24px 0;">
      <table style="width:100%;border-collapse:collapse;">
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="padding:12px 32px;border-top:1px solid #f1f5f9;">
      <p style="margin:0;color:#9ca3af;font-size:12px;">Submitted via RollerKluster signup form</p>
    </div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Optional secret validation — set SIGNUP_WEBHOOK_SECRET in env to lock this down
  const secret = process.env.SIGNUP_WEBHOOK_SECRET;
  if (secret) {
    const provided =
      request.headers.get('x-webhook-secret') ??
      request.nextUrl.searchParams.get('secret');
    if (provided !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Detect and extract fields
  const isTally = !!(body.data && (body.data as Record<string, unknown>)?.fields);
  const fields = isTally ? extractFromTally(body) : extractFromFlat(body);

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No fields found in payload' }, { status: 400 });
  }

  // Map to creator_signups columns
  const displayName =
    pick(fields, 'name', 'full name', 'your name') ||
    pick(fields, 'first name');

  const email = pick(fields, 'email');

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const roleLabel =
    pick(fields, 'signup type', 'sign up type', 'type', 'role') ||
    pick(fields, 'form type', 'form name') ||
    (body.formName ? String(body.formName) : '') ||
    ((body.data as Record<string, unknown>)?.formName ? String((body.data as Record<string, unknown>).formName) : '') ||
    'Creator Sign Up';

  const signupType = inferSignupType(roleLabel);

  const managedBefore = pick(fields, 'managed a team', 'managed before', 'have you managed');

  const experienceRaw = pick(
    fields,
    'describe any experience',
    'experience managing',
    'experience',
    'describe'
  );
  // Prepend the boolean managed-before answer if present
  const experience = managedBefore
    ? `Managed people/events/projects: ${managedBefore}. Experience: ${experienceRaw}`
    : experienceRaw;

  const row: Record<string, unknown> = {
    signup_type: signupType,
    role_label: roleLabel,
    display_name: displayName || null,
    email: email.trim().toLowerCase(),
    location: pick(fields, 'location', 'city', 'province', 'country') || null,
    university_program:
      pick(fields, 'university program', 'program', 'faculty', 'major', 'degree', 'course') || null,
    year: pick(fields, 'year of study', 'year', 'academic year') || null,
    phone_number: pick(fields, 'phone number', 'phone', 'telephone', 'mobile', 'contact number') || null,
    line_id: pick(fields, 'line id', 'line account', 'line') || null,
    instagram_handle: pick(fields, 'instagram', 'ig handle', 'ig account') || null,
    tiktok_handle: pick(fields, 'tiktok', 'tt handle') || null,
    primary_creative_focus:
      pick(fields, 'creative focus', 'content focus', 'content category', 'primary focus', 'management focus') || null,
    experience_level: experience || null,
    contribution:
      pick(fields, 'willing to', 'are you willing', 'contribution', 'responsibilities', 'commitment') || null,
    interested_content_types:
      pick(fields, 'comfortable tool', 'tools', 'software', 'content type', 'interested content') || null,
    additional_notes:
      pick(fields, 'additional note', 'notes', 'anything else', 'other', 'comments') || null,
    other_platforms:
      pick(fields, 'other platform', 'other social', 'youtube', 'facebook') || null,
    follower_count: pick(fields, 'follower count', 'followers', 'follower') || null,
    status: 'pending_review',
  };

  // Remove null values to rely on DB defaults
  const cleanRow = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== ''));

  const { error: insertError } = await supabaseAdmin
    .from('creator_signups')
    .insert(cleanRow);

  if (insertError) {
    console.error('Signup insert error:', insertError);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Send admin notification email if Resend is configured
  const resendKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (resendKey && adminEmail) {
    try {
      const resend = new Resend(resendKey);
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
      await resend.emails.send({
        from: fromEmail,
        to: adminEmail,
        subject: roleLabel,
        html: buildNotificationEmail(cleanRow),
      });
    } catch (emailErr) {
      console.warn('Notification email failed (non-fatal):', emailErr);
    }
  }

  return NextResponse.json({ ok: true });
}
