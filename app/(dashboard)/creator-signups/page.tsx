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
const HIDDEN_SIGNUP_IDS = new Set(['f6f0a00b-094e-4921-b50d-14d6ff6a5fbe']);
const HIDDEN_SIGNUP_EMAILS = new Set(['nangnommaung@gmail.com']);

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

  return parsedDate.toLocaleDateString();
};

const shouldShowSignup = (signup: CreatorSignup) =>
  !HIDDEN_SIGNUP_IDS.has(toText(signup.id)) &&
  !HIDDEN_SIGNUP_EMAILS.has(toText(signup.email).trim().toLowerCase());

const fetchAllCreatorSignups = async () => {
  const signups: CreatorSignup[] = [];

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
    signups.push(...pageRows.filter(shouldShowSignup));

    if (pageRows.length < SIGNUPS_PAGE_SIZE) {
      return { data: signups, error: null };
    }
  }
};

export default function CreatorSignupsPage() {
  const [signups, setSignups] = useState<CreatorSignup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchSignups = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      const { data, error } = await fetchAllCreatorSignups();

      if (error) {
        console.error('Supabase creator signups fetch error:', error);
        setErrorMessage(error.message);
        setSignups([]);
      } else {
        setSignups((data ?? []) as CreatorSignup[]);
      }

      setIsLoading(false);
    };

    fetchSignups();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Creator Signups</h1>
        <p className="text-sm text-muted-foreground">
          Review raw creator applications submitted from the public website.
        </p>
      </div>

      <Card className="gap-0 overflow-hidden border-border bg-card py-0">
        {isLoading ? (
          <div className="p-6 text-center">
            <p className="text-muted-foreground">Loading signups...</p>
          </div>
        ) : errorMessage ? (
          <div className="p-6 text-center">
            <p className="text-red-500">Could not load signups.</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
          </div>
        ) : signups.length > 0 ? (
          <div className="overflow-x-auto">
            <Table className="min-w-[2200px]">
              <TableHeader className="bg-muted/60">
                <TableRow className="h-10 hover:bg-muted/60">
                  <TableHead className="py-2">Name</TableHead>
                  <TableHead className="py-2">Email</TableHead>
                  <TableHead className="py-2">Signup Type</TableHead>
                  <TableHead className="py-2">Role</TableHead>
                  <TableHead className="py-2">Location</TableHead>
                  <TableHead className="py-2">Nickname</TableHead>
                  <TableHead className="py-2">Program</TableHead>
                  <TableHead className="py-2">Year</TableHead>
                  <TableHead className="py-2">Phone</TableHead>
                  <TableHead className="py-2">Line ID</TableHead>
                  <TableHead className="py-2">Instagram</TableHead>
                  <TableHead className="py-2">TikTok</TableHead>
                  <TableHead className="py-2">Other Platforms</TableHead>
                  <TableHead className="py-2">Creative Focus</TableHead>
                  <TableHead className="py-2">Followers</TableHead>
                  <TableHead className="py-2">Experience</TableHead>
                  <TableHead className="py-2">Hours</TableHead>
                  <TableHead className="py-2">Contribution</TableHead>
                  <TableHead className="py-2">Content Types</TableHead>
                  <TableHead className="py-2">Notes</TableHead>
                  <TableHead className="py-2">Status</TableHead>
                  <TableHead className="py-2">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signups.map((signup, index) => (
                  <TableRow
                    key={toText(signup.id) || `${signup.email ?? 'signup'}-${index}`}
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
                    {formatValue(signup.location)}
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
                    {formatValue(signup.phone_number)}
                  </TableCell>
                  <TableCell className="py-2 text-muted-foreground">
                    {formatValue(signup.line_id)}
                  </TableCell>
                  <TableCell className="py-2 text-muted-foreground">
                    {formatValue(signup.instagram_handle)}
                  </TableCell>
                  <TableCell className="py-2 text-muted-foreground">
                    {formatValue(signup.tiktok_handle)}
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
                    {formatValue(signup.contribution)}
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal break-words py-2 text-muted-foreground">
                    {formatValue(signup.interested_content_types)}
                  </TableCell>
                  <TableCell className="max-w-64 whitespace-normal break-words py-2 text-muted-foreground">
                    {formatValue(signup.additional_notes)}
                  </TableCell>
                  <TableCell className="py-2 text-muted-foreground">
                    {formatLabel(signup.status)}
                  </TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground">
                    {formatDate(signup.created_at)}
                  </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-6 text-center">
            <p className="text-muted-foreground">No creator signups yet.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
