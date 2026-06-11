'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
  display_name?: string | null;
  social_handle?: string | null;
  platform?: string | null;
  manual_follower_count?: number | string | null;
  follower_count?: number | string | null;
  creator_rank?: string | number | null;
  verification_status?: string | null;
  onboarding_completed?: boolean | string | null;
  created_at?: string | null;
};

const toText = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
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

const getCreatorName = (creator: CreatorProfile) =>
  toText(creator.display_name).trim() ||
  toText(creator.social_handle).trim() ||
  'Unnamed creator';

const StatusBadge = ({ status }: { status: string | null | undefined }) => {
  const normalizedStatus = toText(status).trim().toLowerCase() || 'unknown';
  const styles: Record<string, string> = {
    approved: 'bg-green-500/10 text-green-600',
    verified: 'bg-green-500/10 text-green-600',
    active: 'bg-green-500/10 text-green-600',
    pending: 'bg-yellow-500/10 text-yellow-600',
    unverified: 'bg-yellow-500/10 text-yellow-600',
    rejected: 'bg-red-500/10 text-red-600',
    suspended: 'bg-red-500/10 text-red-600',
    unknown: 'bg-slate-500/10 text-slate-600',
  };

  return (
    <Badge className={`${styles[normalizedStatus] ?? styles.unknown} border-0`}>
      {formatLabel(normalizedStatus, 'Unknown')}
    </Badge>
  );
};

const OnboardingBadge = ({
  completed,
}: {
  completed: boolean | string | null | undefined;
}) => {
  const isCompleted =
    completed === true || toText(completed).trim().toLowerCase() === 'true';

  return (
    <Badge
      className={`border-0 ${
        isCompleted
          ? 'bg-green-500/10 text-green-600'
          : 'bg-yellow-500/10 text-yellow-600'
      }`}
    >
      {isCompleted ? 'Completed' : 'Incomplete'}
    </Badge>
  );
};

export default function CreatorsPage() {
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchCreators = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      const { data, error } = await supabase
        .from('creator_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase creator profiles fetch error:', error);
        setErrorMessage(error.message);
        setCreators([]);
      } else {
        setCreators((data ?? []) as CreatorProfile[]);
      }

      setIsLoading(false);
    };

    fetchCreators();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Creators</h1>
        <p className="text-sm text-muted-foreground">
          View creators who signed up from RollerKluster.
        </p>
      </div>

      <Card className="gap-0 overflow-hidden border-border bg-card py-0">
        {isLoading ? (
          <div className="p-6 text-center">
            <p className="text-muted-foreground">Loading creators...</p>
          </div>
        ) : errorMessage ? (
          <div className="p-6 text-center">
            <p className="text-red-500">Could not load creators.</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
          </div>
        ) : creators.length > 0 ? (
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow className="h-10 hover:bg-muted/60">
                <TableHead className="py-2">Creator</TableHead>
                <TableHead className="py-2">Platform</TableHead>
                <TableHead className="py-2">Social handle</TableHead>
                <TableHead className="py-2">Followers</TableHead>
                <TableHead className="py-2">Rank</TableHead>
                <TableHead className="py-2">Status</TableHead>
                <TableHead className="py-2">Onboarding</TableHead>
                <TableHead className="py-2">Signed up date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creators.map((creator, index) => (
                <TableRow
                  key={toText(creator.id) || `${creator.social_handle ?? 'creator'}-${index}`}
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
                  <TableCell className="py-2 text-muted-foreground">
                    {formatFollowers(creator)}
                  </TableCell>
                  <TableCell className="py-2 text-muted-foreground">
                    {formatLabel(creator.creator_rank)}
                  </TableCell>
                  <TableCell className="py-2">
                    <StatusBadge status={creator.verification_status} />
                  </TableCell>
                  <TableCell className="py-2">
                    <OnboardingBadge completed={creator.onboarding_completed} />
                  </TableCell>
                  <TableCell className="py-2 text-sm text-muted-foreground">
                    {formatDate(creator.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="p-6 text-center">
            <p className="text-muted-foreground">No signed-up creators yet.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
