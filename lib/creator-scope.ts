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
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
