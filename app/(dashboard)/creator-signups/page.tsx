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
  location?: string | null;
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
  created_at?: string | null;
};

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

export default function CreatorSignupsPage() {
  const [signups, setSignups] = useState<CreatorSignup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchSignups = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from('creator_signups')
        .select('*')
        .order('created_at', { ascending: false });

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
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow className="h-10 hover:bg-muted/60">
                <TableHead className="py-2">Name</TableHead>
                <TableHead className="py-2">Email</TableHead>
                <TableHead className="py-2">Signup Type</TableHead>
                <TableHead className="py-2">Location</TableHead>
                <TableHead className="py-2">Line ID</TableHead>
                <TableHead className="py-2">Instagram</TableHead>
                <TableHead className="py-2">TikTok</TableHead>
                <TableHead className="py-2">Other Platforms</TableHead>
                <TableHead className="py-2">Creative Focus</TableHead>
                <TableHead className="py-2">Followers</TableHead>
                <TableHead className="py-2">Experience</TableHead>
                <TableHead className="py-2">Hours</TableHead>
                <TableHead className="py-2">Portfolio</TableHead>
                <TableHead className="py-2">Contribution</TableHead>
                <TableHead className="py-2">Content Types</TableHead>
                <TableHead className="py-2">Notes</TableHead>
                <TableHead className="py-2">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {signups.map((signup, index) => (
                <TableRow
                  key={toText(signup.id) || `${signup.email ?? 'signup'}-${index}`}
                  className="h-11 border-border hover:bg-muted/40"
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
                    {formatValue(signup.location)}
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
                  <TableCell className="max-w-48 py-2 text-muted-foreground">
                    <span className="block truncate">
                      {formatValue(signup.other_platforms)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-56 py-2 text-muted-foreground">
                    <span className="block truncate">
                      {formatValue(signup.primary_creative_focus)}
                    </span>
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
                  <TableCell className="max-w-56 py-2 text-muted-foreground">
                    <span className="block truncate">
                      {formatValue(signup.portfolio_links)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-56 py-2 text-muted-foreground">
                    <span className="block truncate">
                      {formatValue(signup.contribution)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-56 py-2 text-muted-foreground">
                    <span className="block truncate">
                      {formatValue(signup.interested_content_types)}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-56 py-2 text-muted-foreground">
                    <span className="block truncate">
                      {formatValue(signup.additional_notes)}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground">
                    {formatDate(signup.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-6 text-center">
            <p className="text-muted-foreground">No creator signups yet.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
