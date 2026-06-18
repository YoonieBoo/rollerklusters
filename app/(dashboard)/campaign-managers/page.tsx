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

type CampaignManagerSignup = {
  id?: string | number | null;
  display_name?: string | null;
  email?: string | null;
  signup_type?: string | null;
  role_label?: string | null;
  location?: string | null;
  university_program?: string | null;
  year?: string | number | null;
  phone_number?: string | null;
  line_id?: string | null;
  primary_creative_focus?: unknown;
  experience_level?: string | null;
  contribution?: unknown;
  interested_content_types?: unknown;
  additional_notes?: unknown;
  status?: string | null;
  created_at?: string | null;
};

const CAMPAIGN_MANAGERS_PAGE_SIZE = 1000;
const CAMPAIGN_MANAGERS_REFRESH_INTERVAL_MS = 15000;

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

const isCampaignManagerSignup = (signup: CampaignManagerSignup) => {
  const roleText = [
    signup.signup_type,
    signup.role_label,
    signup.primary_creative_focus,
  ]
    .map(toText)
    .join(' ')
    .toLowerCase();

  return (
    roleText.includes('campaign-manager') ||
    roleText.includes('campaign manager')
  );
};

const groupSignupsByDate = (signups: CampaignManagerSignup[]) => {
  const groups: { label: string; rows: CampaignManagerSignup[] }[] = [];

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

const SignupDetail = ({ label, value }: { label: string; value: unknown }) => (
  <div className="min-w-0">
    <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 break-words text-sm text-foreground">{formatValue(value)}</p>
  </div>
);

const sortSignups = (
  firstSignup: CampaignManagerSignup,
  secondSignup: CampaignManagerSignup
) => {
  const firstCreatedAt = Date.parse(toText(firstSignup.created_at));
  const secondCreatedAt = Date.parse(toText(secondSignup.created_at));

  if (!Number.isNaN(firstCreatedAt) && !Number.isNaN(secondCreatedAt)) {
    return secondCreatedAt - firstCreatedAt;
  }

  return toText(secondSignup.created_at).localeCompare(toText(firstSignup.created_at));
};

const fetchAllCampaignManagerSignups = async () => {
  const signups: CampaignManagerSignup[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * CAMPAIGN_MANAGERS_PAGE_SIZE;
    const to = from + CAMPAIGN_MANAGERS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('creator_signups')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      return { data: null, error };
    }

    const pageRows = (data ?? []) as CampaignManagerSignup[];
    signups.push(...pageRows.filter(isCampaignManagerSignup));

    if (pageRows.length < CAMPAIGN_MANAGERS_PAGE_SIZE) {
      return {
        data: signups.sort(sortSignups),
        error: null,
      };
    }
  }
};

export default function CampaignManagersPage() {
  const [signups, setSignups] = useState<CampaignManagerSignup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const signupGroups = groupSignupsByDate(signups);

  useEffect(() => {
    let isMounted = true;

    const fetchSignups = async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true);
      }

      setErrorMessage(null);

      const { data, error } = await fetchAllCampaignManagerSignups();

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error('Supabase campaign manager signups fetch error:', error);
        setErrorMessage(error.message);

        if (showLoading) {
          setSignups([]);
        }
      } else {
        setSignups((data ?? []) as CampaignManagerSignup[]);
      }

      setIsLoading(false);
    };

    fetchSignups();

    const refreshVisibleSignups = () => {
      if (document.visibilityState === 'visible') {
        fetchSignups(false);
      }
    };

    const intervalId = window.setInterval(
      refreshVisibleSignups,
      CAMPAIGN_MANAGERS_REFRESH_INTERVAL_MS
    );
    window.addEventListener('focus', refreshVisibleSignups);
    document.addEventListener('visibilitychange', refreshVisibleSignups);

    const channel = supabase
      .channel('campaign-managers-page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'creator_signups' },
        () => {
          fetchSignups(false);
        }
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
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Campaign Managers</h1>
      </div>

      {isLoading ? (
        <Card className="gap-0 overflow-hidden border-border bg-card py-0">
          <div className="p-6 text-center">
            <p className="text-muted-foreground">Loading campaign managers...</p>
          </div>
        </Card>
      ) : errorMessage ? (
        <Card className="gap-0 overflow-hidden border-border bg-card py-0">
          <div className="p-6 text-center">
            <p className="text-red-500">Could not load campaign managers.</p>
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
                <div className="lg:hidden">
                  <div className="divide-y divide-border">
                    {group.rows.map((signup, index) => (
                      <div
                        key={
                          toText(signup.id) ||
                          `${signup.email ?? 'manager'}-${group.label}-${index}`
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
                          <SignupDetail label="Location" value={signup.location} />
                          <SignupDetail label="Program" value={signup.university_program} />
                          <SignupDetail label="Year" value={signup.year} />
                          <SignupDetail label="Phone" value={signup.phone_number} />
                          <SignupDetail label="Line ID" value={signup.line_id} />
                          <SignupDetail
                            label="Management Focus"
                            value={signup.primary_creative_focus}
                          />
                          <SignupDetail
                            label="Management Experience"
                            value={signup.experience_level}
                          />
                          <SignupDetail label="Contribution" value={signup.contribution} />
                          <SignupDetail
                            label="Tools / Content Types"
                            value={signup.interested_content_types}
                          />
                          <SignupDetail label="Status" value={formatLabel(signup.status)} />
                          <SignupDetail label="Notes" value={signup.additional_notes} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hidden overflow-x-auto lg:block">
                  <Table className="min-w-[1520px]">
                    <TableHeader className="bg-muted/60">
                      <TableRow className="h-10 hover:bg-muted/60">
                        <TableHead className="py-2">Name</TableHead>
                        <TableHead className="py-2">Email</TableHead>
                        <TableHead className="py-2">Role</TableHead>
                        <TableHead className="py-2">Location</TableHead>
                        <TableHead className="py-2">Program</TableHead>
                        <TableHead className="py-2">Year</TableHead>
                        <TableHead className="py-2">Phone</TableHead>
                        <TableHead className="py-2">Line ID</TableHead>
                        <TableHead className="py-2">Management Focus</TableHead>
                        <TableHead className="py-2">Management Experience</TableHead>
                        <TableHead className="py-2">Contribution</TableHead>
                        <TableHead className="py-2">Tools / Content Types</TableHead>
                        <TableHead className="py-2">Status</TableHead>
                        <TableHead className="py-2">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((signup, index) => (
                        <TableRow
                          key={
                            toText(signup.id) ||
                            `${signup.email ?? 'manager'}-${group.label}-${index}`
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
                            {formatValue(signup.role_label)}
                          </TableCell>
                          <TableCell className="py-2 text-muted-foreground">
                            {formatValue(signup.location)}
                          </TableCell>
                          <TableCell className="py-2 text-muted-foreground">
                            {formatValue(signup.university_program)}
                          </TableCell>
                          <TableCell className="py-2 text-muted-foreground">
                            {formatValue(signup.year)}
                          </TableCell>
                          <TableCell className="py-2 text-muted-foreground">
                            {formatValue(signup.phone_number)}
                          </TableCell>
                          <TableCell className="py-2 text-muted-foreground">
                            {formatValue(signup.line_id)}
                          </TableCell>
                          <TableCell className="max-w-64 whitespace-normal break-words py-2 text-muted-foreground">
                            {formatValue(signup.primary_creative_focus)}
                          </TableCell>
                          <TableCell className="max-w-72 whitespace-normal break-words py-2 text-muted-foreground">
                            {formatValue(signup.experience_level)}
                          </TableCell>
                          <TableCell className="max-w-64 whitespace-normal break-words py-2 text-muted-foreground">
                            {formatValue(signup.contribution)}
                          </TableCell>
                          <TableCell className="max-w-64 whitespace-normal break-words py-2 text-muted-foreground">
                            {formatValue(signup.interested_content_types)}
                          </TableCell>
                          <TableCell className="py-2 text-muted-foreground">
                            {formatLabel(signup.status)}
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
            <p className="text-muted-foreground">No campaign manager signups yet.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
