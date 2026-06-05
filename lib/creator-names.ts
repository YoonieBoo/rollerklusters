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

const subtitleKeys = [
  'handle',
  'username',
  'email',
  'niche',
  'category',
  'platform',
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

const getNestedRow = (row: SupabaseRow, key: string) => {
  const value = row[key];

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as SupabaseRow;
  }

  return null;
};

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

export const getProfileSubtitle = (profile: SupabaseRow | null | undefined) => {
  if (!profile) {
    return '';
  }

  for (const key of subtitleKeys) {
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

export const getCreatorDisplayName = (submission: SupabaseRow) => {
  const creator = getNestedRow(submission, 'creator');
  const profile = getNestedRow(submission, 'profile');
  const user = getNestedRow(submission, 'user');

  return (
    getProfileName(creator) ||
    getProfileName(profile) ||
    getProfileName(user) ||
    'Unknown Creator'
  );
};

export const getCreatorSubtitle = (submission: SupabaseRow) => {
  const creator = getNestedRow(submission, 'creator');
  const profile = getNestedRow(submission, 'profile');
  const user = getNestedRow(submission, 'user');

  return (
    getProfileSubtitle(creator) ||
    getProfileSubtitle(profile) ||
    getProfileSubtitle(user) ||
    ''
  );
};

export const isCreatorReferenceOnly = (value: string) =>
  Boolean(value) && isPlaceholderReference(value);
