import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

// Lets a campaign manager add a creator directly, without them going through
// the signup form first. creator_profiles.user_id is NOT NULL, so this
// creates (or reuses, if the email already has an account) a real auth user
// behind the scenes, then writes the profile linked to it. Runs server-side
// with the service role key — creating auth users isn't something a regular
// client session can do.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const creatorName = String(body.creatorName ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const platform = String(body.platform ?? '').trim();
  const socialHandle = String(body.socialHandle ?? '').trim();

  if (!creatorName || !email || !platform || !socialHandle) {
    return NextResponse.json(
      { error: 'Creator name, email, platform, and social handle are required' },
      { status: 400 }
    );
  }

  // Reuse an existing account if this email already has one (e.g. they
  // already signed up on Ecosystem, or submitted the Typeform once before).
  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  let userId = existingUser?.id as string | undefined;

  if (userId) {
    const { data: existingProfile } = await supabaseAdmin
      .from('creator_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingProfile) {
      return NextResponse.json(
        { error: 'This person already has a creator profile.' },
        { status: 409 }
      );
    }
  }

  if (!userId) {
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: creatorName,
        display_name: creatorName,
        role: 'creator',
      },
    });

    if (createError || !created?.user) {
      console.error('Manual creator account creation failed:', createError);
      return NextResponse.json(
        { error: createError?.message ?? 'Could not create an account for this creator' },
        { status: 500 }
      );
    }

    userId = created.user.id;
  }

  const followerCount = Number(body.followerCount);
  const contentCategories = String(body.contentCategories ?? '')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  const profileRow: Record<string, unknown> = {
    user_id: userId,
    creator_name: creatorName,
    email,
    platform,
    social_handle: socialHandle,
    creator_rank: 'Bronze I',
    verification_status: 'pending_review',
    onboarding_completed: true,
    university: body.university || null,
    faculty: body.faculty || null,
    bio: body.bio || null,
    location: body.location || null,
    phone_number: body.phoneNumber || null,
    line_id: body.lineId || null,
    is_scholarship_student: Boolean(body.scholarshipStudent),
    content_categories: contentCategories.length > 0 ? contentCategories : undefined,
  };

  if (Number.isFinite(followerCount) && followerCount > 0) {
    profileRow.follower_count = followerCount;
    profileRow.manual_follower_count = followerCount;
  }

  const cleanRow = Object.fromEntries(
    Object.entries(profileRow).filter(([, v]) => v !== null && v !== undefined && v !== '')
  );

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('creator_profiles')
    .insert(cleanRow)
    .select()
    .maybeSingle();

  if (profileError) {
    console.error('Manual creator profile insert error:', profileError);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ profile });
}
