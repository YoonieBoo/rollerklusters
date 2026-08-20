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

const sanitizeHandle = (h: string): string => {
  const trimmed = h.replace(/^[@-]+/, '').trim();
  if (!trimmed) return '';
  const tiktokMatch = trimmed.match(/tiktok\.com\/@([^?&/\s]+)/);
  if (tiktokMatch) return tiktokMatch[1];
  const igMatch = trimmed.match(/instagram\.com\/([^?&/\s]+)/);
  if (igMatch) return igMatch[1].replace(/\/$/, '');
  if (trimmed.includes(' ')) {
    const fillers = new Set(['and', 'or', '&', 'also']);
    const parts = trimmed
      .split(/[\s,]+/)
      .map((w) => w.replace(/^[@-]+/, '').trim())
      .filter((w) => w && !fillers.has(w.toLowerCase()));
    return parts[parts.length - 1] ?? '';
  }
  return trimmed;
};

// Signup forms are full of literal placeholder text ("-", "n/a", "none")
// for handles/names the creator left blank. Treating those as real
// identifiers caused unrelated creators who both left a field blank to
// falsely "match" each other and silently disappear from the list/count —
// this guard is the fix.
const PLACEHOLDER_IDENTIFIER_VALUES = new Set(['-', '--', 'n/a', 'na', 'none', 'null', 'nil', '.', '']);

const normalizeCreatorIdentifier = (value: unknown): string => {
  const normalized = toText(value).trim().toLowerCase().replace(/^@/, '');
  return PLACEHOLDER_IDENTIFIER_VALUES.has(normalized) ? '' : normalized;
};

const normalizeEmail = (value: unknown): string => toText(value).trim().toLowerCase();

const isCampaignManagerSignup = (signup: SupabaseRow): boolean => {
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

const getScholarshipStudentValue = (signup: SupabaseRow): boolean | null => {
  if (typeof signup.scholarship_student === 'boolean') return signup.scholarship_student;
  const text = toText(signup.scholarship_student).trim().toLowerCase();
  if (['true', 'yes', 'y'].includes(text)) return true;
  if (['false', 'no', 'n'].includes(text)) return false;
  const notes = toText(signup.additional_notes);
  const notesMatch = notes.match(/scholarship\s+student\s*:\s*(yes|no)\b/i);
  if (notesMatch) return notesMatch[1].toLowerCase() === 'yes';
  return null;
};

const getSignupMatch = (
  creator: SupabaseRow,
  usersById: Map<string, SupabaseRow>,
  signupsByEmail: Map<string, SupabaseRow>,
  signupsByIdentifier: Map<string, SupabaseRow>
): SupabaseRow | null => {
  const profileUser = usersById.get(toText(creator.user_id));
  const email = normalizeEmail(creator.email) || normalizeEmail(profileUser?.email);

  if (email) {
    const emailMatch = signupsByEmail.get(email);
    if (emailMatch) return emailMatch;
  }

  const identifiers = [
    creator.display_name,
    creator.creator_name,
    creator.social_handle,
    profileUser?.name,
    profileUser?.full_name,
  ];

  for (const identifier of identifiers) {
    const normalized = normalizeCreatorIdentifier(identifier);
    if (!normalized) continue;
    const match = signupsByIdentifier.get(normalized);
    if (match) return match;
  }

  return null;
};

// The single canonical merge of onboarded creator_profiles + pending
// creator_signups into one deduped, scope-filtered list. Every UI surface
// that shows creators or a creator count (sidebar badge, dashboard stat,
// Onboarded Creators list, PDF export) must derive from this — two
// independently written versions of this logic drifted apart before and
// produced different numbers for the same manager.
const mergeCreatorsWithSignups = (
  profiles: SupabaseRow[],
  users: SupabaseRow[],
  signups: SupabaseRow[]
): SupabaseRow[] => {
  const usersById = new Map(
    users.map((user) => [toText(user.id), user] as const).filter(([id]) => id)
  );
  const signupsByEmail = new Map(
    signups.map((signup) => [normalizeEmail(signup.email), signup] as const).filter(([email]) => email)
  );
  const signupsByIdentifier = new Map<string, SupabaseRow>();

  signups.forEach((signup) => {
    const rawHandles = [signup.instagram_handle, signup.tiktok_handle];
    const sanitizedHandles = rawHandles.map((h) => sanitizeHandle(toText(h).trim()));
    const identifiers = [signup.display_name, signup.nickname, ...rawHandles, ...sanitizedHandles];
    identifiers.forEach((identifier) => {
      const normalized = normalizeCreatorIdentifier(identifier);
      if (normalized && !signupsByIdentifier.has(normalized)) {
        signupsByIdentifier.set(normalized, signup);
      }
    });
  });

  const matchedSignupEmails = new Set<string>();
  const matchedSignupHandles = new Set<string>();

  const enriched: SupabaseRow[] = profiles.map((creator) => {
    const signup = getSignupMatch(creator, usersById, signupsByEmail, signupsByIdentifier);

    if (signup) {
      if (signup.email) matchedSignupEmails.add(normalizeEmail(signup.email));
      [signup.display_name, signup.instagram_handle, signup.tiktok_handle].forEach((id) => {
        const n = normalizeCreatorIdentifier(id);
        if (n) matchedSignupHandles.add(n);
      });
    }

    const scholarshipStudent =
      creator.scholarship_student ??
      creator.is_scholarship_student ??
      (signup ? getScholarshipStudentValue(signup) : null);
    const universityProgram =
      toText(signup?.university_program).trim() || toText(creator.university_program).trim() || null;
    const faculty = toText(creator.faculty).trim() || null;
    const interestedContentTypes =
      creator.content_categories ??
      creator.content_types ??
      creator.interested_content_types ??
      signup?.interested_content_types ??
      signup?.primary_creative_focus ??
      null;
    const profileUser = usersById.get(toText(creator.user_id));

    return {
      ...creator,
      scholarship_student: scholarshipStudent,
      faculty,
      university_program: universityProgram,
      interested_content_types: interestedContentTypes,
      tiktok_handle: toText(creator.tiktok_handle).trim() || toText(signup?.tiktok_handle).trim() || null,
      instagram_handle:
        toText(creator.instagram_handle).trim() || toText(signup?.instagram_handle).trim() || null,
      avatar_url: profileUser?.avatar_url ?? null,
    };
  });

  const seenSignupEmails = new Set<string>();
  const unmatchedSignups = signups.filter((signup) => {
    if (isCampaignManagerSignup(signup)) return false;
    const email = normalizeEmail(signup.email);
    if (email && matchedSignupEmails.has(email)) return false;
    const handles = [signup.display_name, signup.instagram_handle, signup.tiktok_handle].map(
      normalizeCreatorIdentifier
    );
    if (handles.some((h) => h && matchedSignupHandles.has(h))) return false;
    if (email) {
      if (seenSignupEmails.has(email)) return false;
      seenSignupEmails.add(email);
    }
    return true;
  });

  const signupProfiles: SupabaseRow[] = unmatchedSignups.map((signup) => ({
    id: undefined,
    user_id: null,
    email: signup.email,
    display_name: signup.display_name,
    tiktok_handle: toText(signup.tiktok_handle).trim() || null,
    instagram_handle: toText(signup.instagram_handle).trim() || null,
    social_handle: toText(signup.tiktok_handle).trim() || toText(signup.instagram_handle).trim() || null,
    platform: toText(signup.tiktok_handle).trim()
      ? 'TikTok'
      : toText(signup.instagram_handle).trim()
      ? 'Instagram'
      : null,
    faculty: null,
    university_program: toText(signup.university_program).trim() || null,
    manual_follower_count: signup.follower_count ?? null,
    follower_count: signup.follower_count ?? null,
    creator_rank: null,
    verification_status: 'pending_onboarding',
    onboarding_completed: false,
    scholarship_student: getScholarshipStudentValue(signup),
    is_scholarship_student: null,
    line_id: signup.line_id,
    content_categories: null,
    content_types: null,
    interested_content_types: signup.interested_content_types ?? signup.primary_creative_focus ?? null,
    primary_creative_focus: signup.primary_creative_focus ?? null,
    additional_notes: signup.additional_notes,
    created_at: signup.created_at ?? null,
  }));

  const merged = [...enriched, ...signupProfiles];
  merged.sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at as string).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at as string).getTime() : 0;
    return bTime - aTime;
  });
  return merged;
};

const fetchAllRows = async (tableName: string, orderColumn?: string): Promise<SupabaseRow[]> => {
  let query = supabase.from(tableName).select('*');
  if (orderColumn) {
    query = query.order(orderColumn, { ascending: false });
  }
  const { data, error } = await query;
  if (error) {
    console.warn(`Optional ${tableName} fetch skipped:`, error.message);
    return [];
  }
  return (data ?? []) as SupabaseRow[];
};

// Single source of truth for "which creators can this manager see" — used
// by the Onboarded Creators list, its PDF export, the sidebar badge, and
// the dashboard stat card, so the numbers can't drift apart again.
export const getScopedCreators = async (): Promise<SupabaseRow[]> => {
  // On a cold page load the Supabase client can still be restoring the
  // session from storage when this fires. Querying before that finishes
  // sends the request as anon, which RLS answers with a legitimate, non-error
  // empty array — not a catchable failure — silently zeroing every count
  // derived from this function. Awaiting the session first (getSession()
  // blocks until restoration completes) makes sure the queries below always
  // carry the real auth token.
  await supabase.auth.getSession();

  const [profilesResult, users, signups, cmIdsRes, managerScope] = await Promise.all([
    supabase.from('creator_profiles').select('*').order('created_at', { ascending: false }),
    fetchAllRows('users'),
    fetchAllRows('creator_signups', 'created_at'),
    fetch('/api/campaign-manager-ids')
      .then((r) => r.json())
      .catch(() => ({ ids: [] })),
    getCurrentManagerScope(),
  ]);

  if (profilesResult.error) {
    console.error('Creator profiles fetch error:', profilesResult.error);
    return [];
  }

  const campaignManagerIds = new Set<string>(cmIdsRes?.ids ?? []);
  const creatorOnly = ((profilesResult.data ?? []) as SupabaseRow[]).filter(
    (p) => !campaignManagerIds.has(String(p.user_id ?? ''))
  );

  const merged = mergeCreatorsWithSignups(creatorOnly, users, signups);
  return merged.filter((creator) => creatorMatchesManagerScope(creator, managerScope));
};

export const getScopedCreatorCount = async (): Promise<number> => (await getScopedCreators()).length;
