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
import { creatorMatchesManagerScope, getCurrentManagerScope, type ManagerScope } from '@/lib/creator-scope';

type CreatorSignup = {
  id?: string | number | null;
  display_name?: string | null;
  email?: string | null;
  signup_type?: string | null;
  role_label?: string | null;
  location?: string | null;
  nickname?: string | null;
  university_program?: string | null;
  year?: string | number | null;
  scholarship_student?: boolean | null;
  phone_number?: string | null;
  line_id?: string | null;
  instagram_handle?: string | null;
  tiktok_handle?: string | null;
  other_platforms?: unknown;
  primary_creative_focus?: unknown;
  follower_count?: string | number | null;
  experience_level?: string | null;
  hours_available?: string | number | null;
  portfolio_links?: unknown;
  contribution?: unknown;
  interested_content_types?: unknown;
  additional_notes?: unknown;
  status?: string | null;
  created_at?: string | null;
};

const SIGNUPS_PAGE_SIZE = 1000;
const SIGNUPS_REFRESH_INTERVAL_MS = 15000;

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

const formatValue = (value: unknown) => toText(value).trim() || 'N/A';

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

const formatFollowers = (value: string | number | null | undefined) => {
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

const groupSignupsByDate = (signups: CreatorSignup[]) => {
  const groups: { label: string; rows: CreatorSignup[] }[] = [];

  signups.forEach((signup) => {
    const label = getDateClusterLabel(signup.created_at);
    const existingGroup = groups.find((group) => group.label === label);

    if (existingGroup) {
      existingGroup.rows.push(signup);
      return;
    }

    groups.push({ label, rows: [signup] });
  });

  return groups;
};

const formatScholarshipStudent = (signup: CreatorSignup) => {
  if (typeof signup.scholarship_student === 'boolean') {
    return signup.scholarship_student ? 'Yes' : 'No';
  }

  const notes = toText(signup.additional_notes);
  const notesMatch = notes.match(/scholarship\s+student\s*:\s*(yes|no)\b/i);

  if (notesMatch) {
    return formatLabel(notesMatch[1]);
  }

  return 'N/A';
};

const SignupDetail = ({ label, value }: { label: string; value: unknown }) => (
  <div className="min-w-0">
    <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 break-words text-sm text-foreground">{formatValue(value)}</p>
  </div>
);

const sortSignups = (firstSignup: CreatorSignup, secondSignup: CreatorSignup) => {
  const firstCreatedAt = Date.parse(toText(firstSignup.created_at));
  const secondCreatedAt = Date.parse(toText(secondSignup.created_at));

  if (!Number.isNaN(firstCreatedAt) && !Number.isNaN(secondCreatedAt)) {
    return secondCreatedAt - firstCreatedAt;
  }

  return toText(secondSignup.created_at).localeCompare(toText(firstSignup.created_at));
};

const fetchAllCreatorSignups = async () => {
  const signups: CreatorSignup[] = [];

  // Fetch direct form signups (paginated)
  for (let page = 0; ; page += 1) {
    const from = page * SIGNUPS_PAGE_SIZE;
    const to = from + SIGNUPS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('creator_signups')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return { data: null, error };
    }

    const pageRows = (data ?? []) as CreatorSignup[];
    signups.push(...pageRows);

    if (pageRows.length < SIGNUPS_PAGE_SIZE) {
      break;
    }
  }

  // Also fetch auth-based creator profiles that aren't in creator_signups
  const { data: profileData } = await supabase
    .from('creator_signup_profile_sources')
    .select('*');

  if (profileData) {
    const seenEmails = new Set(signups.map((s) => (s.email ?? '').toLowerCase()));
    for (const row of profileData as CreatorSignup[]) {
      const email = (row.email ?? '').toLowerCase();
      if (!email || seenEmails.has(email)) continue;
      seenEmails.add(email);
      signups.push(row);
    }
  }

  return {
    data: signups.sort(sortSignups),
    error: null,
  };
};

export default function CreatorSignupsPage() {
  const [signups, setSignups] = useState<CreatorSignup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const signupGroups = groupSignupsByDate(signups);

  useEffect(() => {
    let isMounted = true;
    let managerScope: ManagerScope = { university: null, campaignManagerType: null };

    const fetchSignups = async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true);
      }

      setErrorMessage(null);

      const { data, error } = await fetchAllCreatorSignups();

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error('Supabase creator signups fetch error:', error);
        setErrorMessage(error.message);

        if (showLoading) {
          setSignups([]);
        }
      } else {
        const scoped = ((data ?? []) as CreatorSignup[]).filter((signup) =>
          creatorMatchesManagerScope(signup, managerScope)
        );
        setSignups(scoped);
      }

      setIsLoading(false);
    };

    const init = async () => {
      managerScope = await getCurrentManagerScope();
      await fetchSignups();
    };

    init();

    const refreshVisibleSignups = () => {
      if (document.visibilityState === 'visible') {
        fetchSignups(false);
      }
    };

    const intervalId = window.setInterval(refreshVisibleSignups, SIGNUPS_REFRESH_INTERVAL_MS);
    window.addEventListener('focus', refreshVisibleSignups);
    document.addEventListener('visibilitychange', refreshVisibleSignups);

    const channel = supabase
      .channel('creator-signups-page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'creator_signups' },
        () => { fetchSignups(false); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'creator_profiles' },
        () => { fetchSignups(false); }
      )
      .subscribe();

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshVisibleSignups);
      document.removeEventListener('visibilitychange', refreshVisibleSignups);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Creator Signups</h1>
        {!isLoading && !errorMessage && (
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-700 px-2.5 text-sm font-semibold leading-none text-white tabular-nums">
            {signups.length.toLocaleString()}
          </span>
        )}
      </div>

      {isLoading ? (
        <Card className="gap-0 overflow-hidden border-border bg-card py-0">
          <div className="p-6 text-center">
            <p className="text-muted-foreground">Loading signups...</p>
          </div>
        </Card>
      ) : errorMessage ? (
        <Card className="gap-0 overflow-hidden border-border bg-card py-0">
          <div className="p-6 text-center">
            <p className="text-red-500">Could not load signups.</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
          </div>
        </Card>
      ) : signups.length > 0 ? (
        <div className="space-y-6">
          {signupGroups.map((group) => (
            <section key={group.label} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
              </div>

              <Card className="gap-0 overflow-hidden border-border bg-card py-0">
                <div className="md:hidden">
                  <div className="divide-y divide-border">
                    {group.rows.map((signup, index) => (
                      <div
                        key={
                          toText(signup.id) ||
                          `${signup.email ?? 'signup'}-${group.label}-${index}`
                        }
                        className="space-y-4 px-4 py-4"
                      >
                        <div className="min-w-0">
                          <p className="break-words font-medium text-foreground">
                            {formatValue(signup.display_name)}
                          </p>
                          <p className="mt-1 break-all text-sm text-muted-foreground">
                            {formatValue(signup.email)}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <SignupDetail label="Role" value={signup.role_label} />
                          <SignupDetail label="Nickname" value={signup.nickname} />
                          <SignupDetail label="Program" value={signup.university_program} />
                          <SignupDetail label="Year" value={signup.year} />
                          <SignupDetail
                            label="Scholarship Student"
                            value={formatScholarshipStudent(signup)}
                          />
                          <SignupDetail label="Phone" value={signup.phone_number} />
                          <SignupDetail label="Line ID" value={signup.line_id} />
                          <SignupDetail label="Instagram" value={signup.instagram_handle} />
                          <SignupDetail
                            label="Other Platforms"
                            value={signup.other_platforms}
                          />
                          <SignupDetail
                            label="Creative Focus"
                            value={signup.primary_creative_focus}
                          />
                          <SignupDetail
                            label="Followers"
                            value={formatFollowers(signup.follower_count)}
                          />
                          <SignupDetail label="Experience" value={signup.experience_level} />
                          <SignupDetail label="Hours" value={signup.hours_available} />
                          <SignupDetail label="Portfolio" value={signup.portfolio_links} />
                          <SignupDetail label="Contribution" value={signup.contribution} />
                          <SignupDetail
                            label="Content Types"
                            value={signup.interested_content_types}
                          />
                          <SignupDetail label="Notes" value={signup.additional_notes} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <Table className="min-w-[2280px]">
                    <TableHeader className="bg-muted/60">
                      <TableRow className="h-10 hover:bg-muted/60">
                        <TableHead className="py-2">Name</TableHead>
                        <TableHead className="py-2">Email</TableHead>
                        <TableHead className="py-2">Signup Type</TableHead>
                        <TableHead className="py-2">Role</TableHead>
                        <TableHead className="py-2">Nickname</TableHead>
                        <TableHead className="py-2">Program</TableHead>
                        <TableHead className="py-2">Year</TableHead>
                        <TableHead className="py-2">Scholarship Student</TableHead>
                        <TableHead className="py-2">Phone</TableHead>
                        <TableHead className="py-2">Line ID</TableHead>
                        <TableHead className="py-2">Instagram</TableHead>
                        <TableHead className="py-2">Other Platforms</TableHead>
                        <TableHead className="py-2">Creative Focus</TableHead>
                        <TableHead className="py-2">Followers</TableHead>
                        <TableHead className="py-2">Experience</TableHead>
                        <TableHead className="py-2">Hours</TableHead>
                        <TableHead className="py-2">Portfolio</TableHead>
                        <TableHead className="py-2">Contribution</TableHead>
                        <TableHead className="py-2">Content Types</TableHead>
                        <TableHead className="py-2">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                    {group.rows.map((signup, index) => (
                      <TableRow
                        key={
                          toText(signup.id) ||
                          `${signup.email ?? 'signup'}-${group.label}-${index}`
                        }
                        className="border-border align-top hover:bg-muted/40"
                      >
                      <TableCell className="py-2 font-medium text-foreground">
                        {formatValue(signup.display_name)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatValue(signup.email)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatLabel(signup.signup_type)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatValue(signup.role_label)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatValue(signup.nickname)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatValue(signup.university_program)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatValue(signup.year)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatScholarshipStudent(signup)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatValue(signup.phone_number)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatValue(signup.line_id)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatValue(signup.instagram_handle)}
                      </TableCell>
                      <TableCell className="max-w-56 whitespace-normal break-words py-2 text-muted-foreground">
                        {formatValue(signup.other_platforms)}
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal break-words py-2 text-muted-foreground">
                        {formatValue(signup.primary_creative_focus)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatFollowers(signup.follower_count)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatLabel(signup.experience_level)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {formatValue(signup.hours_available)}
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal break-words py-2 text-muted-foreground">
                        {formatValue(signup.portfolio_links)}
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal break-words py-2 text-muted-foreground">
                        {formatValue(signup.contribution)}
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal break-words py-2 text-muted-foreground">
                        {formatValue(signup.interested_content_types)}
                      </TableCell>
                      <TableCell className="max-w-64 whitespace-normal break-words py-2 text-muted-foreground">
                        {formatValue(signup.additional_notes)}
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
            <p className="text-muted-foreground">No creator signups yet.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
