'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/lib/supabase/client';

type CreatorProfile = {
  id?: string | number | null;
  user_id?: string | null;
  email?: string | null;
  display_name?: string | null;
  creator_name?: string | null;
  social_handle?: string | null;
  platform?: string | null;
  faculty?: string | null;
  university_program?: string | null;
  manual_follower_count?: number | string | null;
  follower_count?: number | string | null;
  creator_rank?: string | number | null;
  verification_status?: string | null;
  onboarding_completed?: boolean | string | null;
  scholarship_student?: boolean | string | null;
  is_scholarship_student?: boolean | string | null;
  line_id?: string | null;
  content_categories?: unknown;
  content_types?: unknown;
  interested_content_types?: unknown;
  primary_creative_focus?: unknown;
  additional_notes?: unknown;
  created_at?: string | null;
  [key: string]: unknown;
};

type UserProfile = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  full_name?: string | null;
};

type CreatorSignup = {
  email?: string | null;
  display_name?: string | null;
  university_program?: string | null;
  instagram_handle?: string | null;
  tiktok_handle?: string | null;
  scholarship_student?: boolean | string | null;
  line_id?: string | null;
  interested_content_types?: unknown;
  primary_creative_focus?: unknown;
  additional_notes?: unknown;
};

const CREATORS_REFRESH_INTERVAL_MS = 15000;

const toText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean).join(', ');
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map(toText)
      .filter(Boolean)
      .join(', ');
  }

  return '';
};

const formatLabel = (value: unknown, fallback = 'N/A') => {
  const text = toText(value).trim();

  if (!text) {
    return fallback;
  }

  return text
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatFollowers = (creator: CreatorProfile) => {
  const value = creator.manual_follower_count ?? creator.follower_count;
  const text = toText(value).trim();

  if (!text) {
    return 'N/A';
  }

  const numericValue =
    typeof value === 'number' ? value : Number(text.replace(/,/g, ''));

  if (Number.isNaN(numericValue)) {
    return text;
  }

  return new Intl.NumberFormat().format(numericValue);
};

const formatScholarshipStudent = (creator: CreatorProfile) => {
  const value = creator.scholarship_student ?? creator.is_scholarship_student;

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  const text = toText(value).trim().toLowerCase();

  if (['true', 'yes', 'y'].includes(text)) {
    return 'Yes';
  }

  if (['false', 'no', 'n'].includes(text)) {
    return 'No';
  }

  return 'N/A';
};

const getScholarshipStudentValue = (signup: CreatorSignup) => {
  if (typeof signup.scholarship_student === 'boolean') {
    return signup.scholarship_student;
  }

  const text = toText(signup.scholarship_student).trim().toLowerCase();

  if (['true', 'yes', 'y'].includes(text)) {
    return true;
  }

  if (['false', 'no', 'n'].includes(text)) {
    return false;
  }

  const notes = toText(signup.additional_notes);
  const notesMatch = notes.match(/scholarship\s+student\s*:\s*(yes|no)\b/i);

  if (notesMatch) {
    return notesMatch[1].toLowerCase() === 'yes';
  }

  return null;
};

const formatDate = (date: string | null | undefined) => {
  if (!date) {
    return 'N/A';
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'N/A';
  }

  return parsedDate.getDate() + '/' + (parsedDate.getMonth() + 1) + '/' + parsedDate.getFullYear();
};

const getDateClusterLabel = (date: string | null | undefined) => {
  const formattedDate = formatDate(date);

  return formattedDate === 'N/A' ? 'Unknown signup date' : formattedDate;
};

const groupCreatorsBySignupDate = (creators: CreatorProfile[]) => {
  const groups: { label: string; rows: CreatorProfile[] }[] = [];

  creators.forEach((creator) => {
    const label = getDateClusterLabel(creator.created_at);
    const existingGroup = groups.find((group) => group.label === label);

    if (existingGroup) {
      existingGroup.rows.push(creator);
      return;
    }

    groups.push({ label, rows: [creator] });
  });

  return groups;
};

const getCreatorName = (creator: CreatorProfile) =>
  toText(creator.display_name).trim() ||
  toText(creator.creator_name).trim() ||
  toText(creator.social_handle).trim() ||
  'Unnamed creator';

const getFirstValue = (creator: CreatorProfile, keys: string[]) => {
  for (const key of keys) {
    const value = creator[key];

    if (toText(value).trim()) {
      return value;
    }
  }

  return null;
};

const getCreatorConsistency = (creator: CreatorProfile) =>
  formatLabel(
    getFirstValue(creator, [
      'consistency',
      'consistency_score',
      'consistencyScore',
      'posting_consistency',
      'postingConsistency',
      'content_consistency',
      'contentConsistency',
    ])
  );

const getCreatorInterest = (creator: CreatorProfile) =>
  formatLabel(
    getFirstValue(creator, [
      'interested_content_types',
      'interestedContentTypes',
      'content_categories',
      'contentCategories',
      'content_types',
      'contentTypes',
      'content_interests',
      'contentInterests',
      'interests',
      'interest',
      'primary_creative_focus',
      'primaryCreativeFocus',
    ])
  );

const getCreatorProgram = (creator: CreatorProfile) =>
  toText(
    getFirstValue(creator, [
      'faculty',
      'facultyName',
      'university_program',
      'universityProgram',
      'program',
      'major',
    ])
  ).trim() || 'N/A';

const CreatorMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 break-words text-sm font-medium text-foreground">{value}</p>
  </div>
);

const normalizeCreatorIdentifier = (value: unknown) =>
  toText(value).trim().toLowerCase().replace(/^@/, '');

const normalizeEmail = (value: unknown) => toText(value).trim().toLowerCase();

const fetchOptionalRows = async <T extends Record<string, unknown>>(
  tableName: string,
  orderColumn?: string
) => {
  let query = supabase.from(tableName).select('*');

  if (orderColumn) {
    query = query.order(orderColumn, { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    console.warn(`Optional ${tableName} fetch skipped:`, error.message);
    return [] as T[];
  }

  return (data ?? []) as T[];
};

const getSignupMatch = (
  creator: CreatorProfile,
  usersById: Map<string, UserProfile>,
  signupsByEmail: Map<string, CreatorSignup>,
  signupsByIdentifier: Map<string, CreatorSignup>
) => {
  const profileUser = usersById.get(toText(creator.user_id));
  const email = normalizeEmail(creator.email) || normalizeEmail(profileUser?.email);

  if (email) {
    const emailMatch = signupsByEmail.get(email);

    if (emailMatch) {
      return emailMatch;
    }
  }

  const identifiers = [
    creator.display_name,
    creator.creator_name,
    creator.social_handle,
    profileUser?.name,
    profileUser?.full_name,
  ];

  for (const identifier of identifiers) {
    const match = signupsByIdentifier.get(normalizeCreatorIdentifier(identifier));

    if (match) {
      return match;
    }
  }

  return null;
};

const enrichCreatorsWithSubmittedFields = (
  creators: CreatorProfile[],
  users: UserProfile[],
  signups: CreatorSignup[]
) => {
  const usersById = new Map(
    users
      .map((user) => [toText(user.id), user] as const)
      .filter(([id]) => id)
  );
  const signupsByEmail = new Map(
    signups
      .map((signup) => [normalizeEmail(signup.email), signup] as const)
      .filter(([email]) => email)
  );
  const signupsByIdentifier = new Map<string, CreatorSignup>();

  signups.forEach((signup) => {
    [
      signup.display_name,
      signup.instagram_handle,
      signup.tiktok_handle,
    ].forEach((identifier) => {
      const normalizedIdentifier = normalizeCreatorIdentifier(identifier);

      if (normalizedIdentifier && !signupsByIdentifier.has(normalizedIdentifier)) {
        signupsByIdentifier.set(normalizedIdentifier, signup);
      }
    });
  });

  return creators.map((creator) => {
    const signup = getSignupMatch(
      creator,
      usersById,
      signupsByEmail,
      signupsByIdentifier
    );
    const scholarshipStudent =
      creator.scholarship_student ??
      creator.is_scholarship_student ??
      (signup ? getScholarshipStudentValue(signup) : null);
    const universityProgram =
      toText(signup?.university_program).trim() ||
      toText(creator.university_program).trim() ||
      toText(creator.universityProgram).trim() ||
      toText(creator.program).trim() ||
      null;
    const faculty =
      toText(creator.faculty).trim() ||
      toText(creator.facultyName).trim() ||
      null;
    const interestedContentTypes =
      creator.content_categories ??
      creator.contentCategories ??
      creator.content_types ??
      creator.contentTypes ??
      creator.interested_content_types ??
      creator.interestedContentTypes ??
      signup?.interested_content_types ??
      signup?.primary_creative_focus ??
      null;

    return {
      ...creator,
      scholarship_student: scholarshipStudent,
      faculty,
      university_program: universityProgram,
      interested_content_types: interestedContentTypes,
    };
  });
};

export default function CreatorsPage() {
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const creatorGroups = groupCreatorsBySignupDate(creators);

  useEffect(() => {
    let isMounted = true;

    const fetchCreators = async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true);
      }

      setErrorMessage(null);

      const { data, error } = await supabase
        .from('creator_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      const [users, signups] = await Promise.all([
        fetchOptionalRows<UserProfile>('users'),
        fetchOptionalRows<CreatorSignup>('creator_signups', 'created_at'),
      ]);

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error('Supabase creator profiles fetch error:', error);
        setErrorMessage(error.message);

        if (showLoading) {
          setCreators([]);
        }
      } else {
        setCreators(
          enrichCreatorsWithSubmittedFields(
            (data ?? []) as CreatorProfile[],
            users,
            signups
          )
        );
      }

      setIsLoading(false);
    };

    fetchCreators();

    const refreshVisibleCreators = () => {
      if (document.visibilityState === 'visible') {
        fetchCreators(false);
      }
    };

    const intervalId = window.setInterval(
      refreshVisibleCreators,
      CREATORS_REFRESH_INTERVAL_MS
    );
    window.addEventListener('focus', refreshVisibleCreators);
    document.addEventListener('visibilitychange', refreshVisibleCreators);

    const channel = supabase
      .channel('creator-profiles-page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'creator_profiles' },
        () => {
          fetchCreators(false);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'creator_signups' },
        () => {
          fetchCreators(false);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        () => {
          fetchCreators(false);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshVisibleCreators);
      document.removeEventListener('visibilitychange', refreshVisibleCreators);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Onboarded Creators</h1>
      </div>

      {isLoading ? (
        <Card className="gap-0 overflow-hidden border-border bg-card py-0">
          <div className="p-6 text-center">
            <p className="text-muted-foreground">Loading creators...</p>
          </div>
        </Card>
      ) : errorMessage ? (
        <Card className="gap-0 overflow-hidden border-border bg-card py-0">
          <div className="p-6 text-center">
            <p className="text-red-500">Could not load creators.</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
          </div>
        </Card>
      ) : creators.length > 0 ? (
        <div className="space-y-6">
          {creatorGroups.map((group) => (
            <section key={group.label} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
              </div>

              <Card className="gap-0 overflow-hidden border-border bg-card py-0">
                <div className="md:hidden">
                  <div className="divide-y divide-border">
                    {group.rows.map((creator, index) => (
                      <div
                        key={
                          toText(creator.id) ||
                          `${creator.social_handle ?? 'creator'}-${group.label}-${index}`
                        }
                        className="space-y-4 px-4 py-4"
                      >
                        <div className="min-w-0">
                          <p className="break-words font-medium text-foreground">
                            {getCreatorName(creator)}
                          </p>
                          <p className="mt-1 break-words text-sm text-muted-foreground">
                            {toText(creator.social_handle).trim() || 'N/A'} ·{' '}
                            {formatLabel(creator.platform)}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <CreatorMetric
                            label="Followers"
                            value={formatFollowers(creator)}
                          />
                          <CreatorMetric
                            label="Rank"
                            value={formatLabel(creator.creator_rank)}
                          />
                          <CreatorMetric
                            label="Program"
                            value={getCreatorProgram(creator)}
                          />
                          <CreatorMetric
                            label="Consistency"
                            value={getCreatorConsistency(creator)}
                          />
                          <CreatorMetric
                            label="Interest"
                            value={getCreatorInterest(creator)}
                          />
                          <CreatorMetric
                            label="Scholarship"
                            value={formatScholarshipStudent(creator)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <Table className="min-w-[1160px]">
                    <TableHeader className="bg-muted/60">
                      <TableRow className="h-10 hover:bg-muted/60">
                        <TableHead className="py-2">Creator</TableHead>
                        <TableHead className="py-2">Platform</TableHead>
                        <TableHead className="py-2">Social handle</TableHead>
                        <TableHead className="py-2">Program</TableHead>
                        <TableHead className="py-2">Followers</TableHead>
                        <TableHead className="py-2">Rank</TableHead>
                        <TableHead className="py-2">Consistency</TableHead>
                        <TableHead className="py-2">Interest</TableHead>
                        <TableHead className="py-2">Scholarship Student</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((creator, index) => (
                          <TableRow
                            key={
                              toText(creator.id) ||
                              `${creator.social_handle ?? 'creator'}-${group.label}-${index}`
                            }
                            className="h-11 border-border hover:bg-muted/40"
                          >
                            <TableCell className="py-2 font-medium text-foreground">
                              {getCreatorName(creator)}
                            </TableCell>
                            <TableCell className="py-2 text-muted-foreground">
                              {formatLabel(creator.platform)}
                            </TableCell>
                            <TableCell className="py-2 text-muted-foreground">
                              {toText(creator.social_handle).trim() || 'N/A'}
                            </TableCell>
                            <TableCell className="max-w-56 whitespace-normal break-words py-2 text-muted-foreground">
                              {getCreatorProgram(creator)}
                            </TableCell>
                            <TableCell className="py-2 text-muted-foreground">
                              {formatFollowers(creator)}
                            </TableCell>
                            <TableCell className="py-2 text-muted-foreground">
                              {formatLabel(creator.creator_rank)}
                            </TableCell>
                            <TableCell className="py-2 text-muted-foreground">
                              {getCreatorConsistency(creator)}
                            </TableCell>
                            <TableCell className="max-w-56 whitespace-normal break-words py-2 text-muted-foreground">
                              {getCreatorInterest(creator)}
                            </TableCell>
                            <TableCell className="py-2 text-muted-foreground">
                              {formatScholarshipStudent(creator)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden border-border bg-card py-0">
          <div className="p-6 text-center">
            <p className="text-muted-foreground">No signed-up creators yet.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
