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
  display_name?: string | null;
  creator_name?: string | null;
  social_handle?: string | null;
  platform?: string | null;
  manual_follower_count?: number | string | null;
  follower_count?: number | string | null;
  creator_rank?: string | number | null;
  verification_status?: string | null;
  onboarding_completed?: boolean | string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

const CREATORS_REFRESH_INTERVAL_MS = 15000;
const HIDDEN_CREATOR_HANDLES = new Set([
  'yoonie',
  '_yoonieeee',
  'nanisherewithme',
  'aeiou',
]);

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

const formatNumberValue = (value: unknown) => {
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

const getCreatorVideoCount = (creator: CreatorProfile) =>
  formatNumberValue(
    getFirstValue(creator, [
      'video_count',
      'videoCount',
      'video_counts',
      'videoCounts',
      'videos_count',
      'videosCount',
      'total_videos',
      'totalVideos',
      'content_count',
      'contentCount',
      'post_count',
      'postCount',
      'posts_count',
      'postsCount',
    ])
  );

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

const isVisibleCreator = (creator: CreatorProfile) =>
  !HIDDEN_CREATOR_HANDLES.has(normalizeCreatorIdentifier(creator.display_name)) &&
  !HIDDEN_CREATOR_HANDLES.has(normalizeCreatorIdentifier(creator.social_handle));

const withoutFirstAustinProtocolCreator = (creators: CreatorProfile[]) => {
  let hasRemovedCreator = false;

  return creators.filter((creator) => {
    const isAustinProtocol =
      normalizeCreatorIdentifier(creator.display_name) === 'austin_protocol' ||
      normalizeCreatorIdentifier(creator.social_handle) === 'austin_protocol';

    if (isAustinProtocol && !hasRemovedCreator) {
      hasRemovedCreator = true;
      return false;
    }

    return true;
  });
};

export default function CreatorsPage() {
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
          withoutFirstAustinProtocolCreator(
            ((data ?? []) as CreatorProfile[]).filter(isVisibleCreator)
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
          <>
            <div className="divide-y divide-border md:hidden">
              {creators.map((creator, index) => (
                <div
                  key={toText(creator.id) || `${creator.social_handle ?? 'creator'}-${index}`}
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
                    <CreatorMetric label="Followers" value={formatFollowers(creator)} />
                    <CreatorMetric label="Rank" value={formatLabel(creator.creator_rank)} />
                    <CreatorMetric
                      label="Consistency"
                      value={getCreatorConsistency(creator)}
                    />
                    <CreatorMetric
                      label="Videos"
                      value={getCreatorVideoCount(creator)}
                    />
                  </div>
                  <CreatorMetric label="Signed up" value={formatDate(creator.created_at)} />
                </div>
              ))}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow className="h-10 hover:bg-muted/60">
                    <TableHead className="py-2">Creator</TableHead>
                    <TableHead className="py-2">Platform</TableHead>
                    <TableHead className="py-2">Social handle</TableHead>
                    <TableHead className="py-2">Followers</TableHead>
                    <TableHead className="py-2">Rank</TableHead>
                    <TableHead className="py-2">Consistency</TableHead>
                    <TableHead className="py-2">Video Count</TableHead>
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
                      <TableCell className="py-2 text-muted-foreground">
                        {getCreatorConsistency(creator)}
                      </TableCell>
                      <TableCell className="py-2 text-muted-foreground">
                        {getCreatorVideoCount(creator)}
                      </TableCell>
                      <TableCell className="py-2 text-sm text-muted-foreground">
                        {formatDate(creator.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="p-6 text-center">
            <p className="text-muted-foreground">No signed-up creators yet.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
