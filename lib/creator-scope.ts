import { supabase } from '@/lib/supabase/client';

export type ManagerScope = {
  university: string | null;
  campaignManagerType: string | null;
};

export const UNIVERSITIES = [
  'Assumption University',
  'Khon Kaen University',
  'Chiang Mai University',
] as const;

// Real-world data is messy free text ("ABAC", "Assumption university",
// "Assumption University Suvarnabhumi Campus/..."), so university and
// program are detected by keyword rather than exact match.
const UNIVERSITY_KEYWORDS: Record<(typeof UNIVERSITIES)[number], string[]> = {
  'Assumption University': ['assumption', 'abac'],
  'Khon Kaen University': ['khon kaen', 'kku'],
  'Chiang Mai University': ['chiang mai', 'cmu'],
};

const DDI_MSME_KEYWORDS = [
  'ddi',
  'msme',
  'design and digital innovation',
  'digital design and innovation',
  'digital design innovation',
];

const toLowerText = (value: unknown): string => {
  if (typeof value === 'string') return value.toLowerCase();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).toLowerCase();
  return '';
};

const detectUniversityFromText = (text: unknown): string | null => {
  const t = toLowerText(text);
  if (!t) return null;

  for (const university of UNIVERSITIES) {
    if (UNIVERSITY_KEYWORDS[university].some((keyword) => t.includes(keyword))) {
      return university;
    }
  }

  return null;
};

const matchesDdiOrMsme = (text: unknown): boolean => {
  const t = toLowerText(text);
  if (!t) return false;
  return DDI_MSME_KEYWORDS.some((keyword) => t.includes(keyword));
};

// Creators are represented two ways in this app: onboarded `creator_profiles`
// rows (clean `university` + `faculty` columns) and pending `creator_signups`
// stubs (a single free-text `university_program` field). This checks both
// shapes since callers merge them into one list.
export const creatorMatchesManagerScope = (
  creator: Record<string, unknown>,
  scope: ManagerScope
): boolean => {
  if (!scope.university) {
    // Account predates this feature (no university set) — unscoped, sees everyone.
    return true;
  }

  const creatorUniversity =
    detectUniversityFromText(creator.university) ?? detectUniversityFromText(creator.university_program);

  if (creatorUniversity !== scope.university) {
    return false;
  }

  if (scope.university === 'Assumption University' && scope.campaignManagerType === 'DDI') {
    return matchesDdiOrMsme(creator.faculty) || matchesDdiOrMsme(creator.university_program);
  }

  return true;
};

export const getCurrentManagerScope = async (): Promise<ManagerScope> => {
  // Use getSession() rather than getUser(): getUser() can throw
  // AuthSessionMissingError on a fresh page load before the client finishes
  // restoring the session from storage, which would otherwise make every
  // caller's count silently fall back to 0.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user) {
    return { university: null, campaignManagerType: null };
  }

  const { data } = await supabase
    .from('users')
    .select('university, campaign_manager_type')
    .eq('id', user.id)
    .maybeSingle();

  return {
    university: (data?.university as string | null | undefined) ?? null,
    campaignManagerType: (data?.campaign_manager_type as string | null | undefined) ?? null,
  };
};

type SupabaseRow = Record<string, unknown>;

const toText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map(toText)
      .filter(Boolean)
      .join(', ');
  }
  return '';
};

const sanitizeSignupHandle = (h: string) => {
  const t = h.replace(/^[@-]+/, '').trim();
  const tiktokMatch = t.match(/tiktok\.com\/@([^?&/\s]+)/)?.[1];
  if (tiktokMatch) return tiktokMatch.toLowerCase();
  const igMatch = t.match(/instagram\.com\/([^?&/\s]+)/)?.[1];
  if (igMatch) return igMatch.replace(/\/$/, '').toLowerCase();
  if (t.includes(' ')) {
    const parts = t.split(/[\s,]+/).filter((w) => !['and', 'or', '&'].includes(w));
    return (parts[parts.length - 1] ?? '').replace(/^[@-]+/, '').toLowerCase();
  }
  return t.toLowerCase();
};

const isCampaignManagerSignupRow = (signup: SupabaseRow): boolean => {
  const roleText = [signup.signup_type, signup.role_label, signup.primary_creative_focus]
    .map(toText)
    .join(' ')
    .toLowerCase();
  return (
    roleText.includes('campaign-manager') ||
    roleText.includes('campaign manager') ||
    roleText.includes('campaign_manager')
  );
};

// Single source of truth for "how many creators can this manager see" — used
// by the sidebar badge, the dashboard stat card, and (by construction) the
// Onboarded Creators page, so the three numbers can't drift apart again.
export const getScopedCreatorCount = async (): Promise<number> => {
  const [profilesRes, signupsRes, cmIdsRes, managerScope] = await Promise.all([
    supabase
      .from('creator_profiles')
      .select('id, email, social_handle, creator_name, display_name, user_id, university, faculty'),
    supabase
      .from('creator_signups')
      .select(
        'email, tiktok_handle, instagram_handle, signup_type, role_label, primary_creative_focus, nickname, university_program'
      ),
    fetch('/api/campaign-manager-ids')
      .then((r) => r.json())
      .catch(() => ({ ids: [] })),
    getCurrentManagerScope(),
  ]);

  if (profilesRes.error) {
    console.error('Creator count fetch error:', profilesRes.error);
    return 0;
  }

  const campaignManagerIds = new Set<string>(cmIdsRes?.ids ?? []);
  const profiles = ((profilesRes.data ?? []) as SupabaseRow[])
    .filter((p) => !campaignManagerIds.has(String(p.user_id ?? '')))
    .filter((p) => creatorMatchesManagerScope(p, managerScope));
  const signups = ((signupsRes.data ?? []) as SupabaseRow[]).filter((s) =>
    creatorMatchesManagerScope(s, managerScope)
  );

  const profileEmails = new Set<string>();
  const profileHandles = new Set<string>();
  const profileNames = new Set<string>();
  for (const p of profiles) {
    const email = toText(p.email).trim().toLowerCase();
    const handle = toText(p.social_handle).replace(/^[@-]+/, '').trim().toLowerCase();
    const creatorName = toText(p.creator_name).trim().toLowerCase();
    const displayName = toText(p.display_name).trim().toLowerCase();
    if (email) profileEmails.add(email);
    if (handle) profileHandles.add(handle);
    if (creatorName) profileNames.add(creatorName);
    if (displayName) profileNames.add(displayName);
  }

  const seenSignupEmails = new Set<string>();
  let unmatchedCount = 0;
  for (const s of signups) {
    if (isCampaignManagerSignupRow(s)) continue;
    const email = toText(s.email).trim().toLowerCase();
    const tiktok = sanitizeSignupHandle(toText(s.tiktok_handle));
    const ig = sanitizeSignupHandle(toText(s.instagram_handle));
    const nickname = toText(s.nickname).trim().toLowerCase();
    if (email && profileEmails.has(email)) continue;
    if (tiktok && profileHandles.has(tiktok)) continue;
    if (ig && profileHandles.has(ig)) continue;
    if (nickname && profileNames.has(nickname)) continue;
    if (email && seenSignupEmails.has(email)) continue;
    if (email) seenSignupEmails.add(email);
    unmatchedCount++;
  }

  return profiles.length + unmatchedCount;
};
