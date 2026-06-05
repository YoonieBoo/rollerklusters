export type SupabaseRow = Record<string, unknown>;

const nameKeys = [
  'creator_name',
  'creatorName',
  'full_name',
  'fullName',
  'display_name',
  'displayName',
  'name',
  'username',
  'email',
];

const referenceKeys = [
  'creator_ref',
  'creator_reference',
  'creatorReference',
  'creator_id',
  'creatorId',
  'user_id',
  'userId',
];

const idKeys = ['id', 'user_id', 'userId', 'creator_id', 'creatorId', 'auth_user_id', 'authUserId'];

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const placeholderCreatorPattern = /^creator[-_\s]?\d+$/i;

export const toText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
};

const isPlaceholderReference = (value: string) =>
  uuidPattern.test(value) || placeholderCreatorPattern.test(value);

export const getProfileName = (profile: SupabaseRow | null | undefined) => {
  if (!profile) {
    return '';
  }

  for (const key of nameKeys) {
    const value = toText(profile[key]);

    if (value) {
      return value;
    }
  }

  return '';
};

export const getProfileIds = (profile: SupabaseRow) =>
  idKeys.map((key) => toText(profile[key])).filter(Boolean);

export const getSubmissionCreatorReference = (submission: SupabaseRow) => {
  for (const key of referenceKeys) {
    const value = toText(submission[key]);

    if (value) {
      return value;
    }
  }

  return '';
};

export const getSubmissionCreatorName = (
  submission: SupabaseRow,
  profile?: SupabaseRow | null
) => {
  for (const key of nameKeys) {
    const value = toText(submission[key]);

    if (value) {
      return value;
    }
  }

  const profileName = getProfileName(profile);

  if (profileName) {
    return profileName;
  }

  const reference = getSubmissionCreatorReference(submission);

  if (reference && !isPlaceholderReference(reference)) {
    return reference;
  }

  return 'Unknown creator';
};
