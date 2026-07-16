'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BarChart3,
  CheckCircle2,
  FileText,
  FolderOpen,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { getScopedCreatorCount } from '@/lib/creator-scope';
import { Card } from '@/components/ui/card';
import { LoadingDots } from '@/components/ui/loading-dots';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type SupabaseRow = Record<string, unknown>;

type DashboardCampaign = {
  id: string;
  name: string;
  clientName: string;
  status: string;
  briefStatus: string;
  approvalStatus: string;
  submissionsCount: number;
  submissionsReviewed: number;
  updatedAt: string | null;
};

type DashboardActivity = {
  id: string;
  description: string;
  campaign: string;
  timestamp: string | null;
};

type DashboardData = {
  campaigns: SupabaseRow[];
  briefs: SupabaseRow[];
  acceptanceCriteria: SupabaseRow[];
  submissions: SupabaseRow[];
  reviews: SupabaseRow[];
  reports: SupabaseRow[];
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, { bg: string; text: string }> = {
    active: { bg: 'bg-green-500/10', text: 'text-green-500' },
    draft: { bg: 'bg-yellow-500/10', text: 'text-yellow-500' },
    completed: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
    'on-hold': { bg: 'bg-red-500/10', text: 'text-red-500' },
    'in-review': { bg: 'bg-purple-500/10', text: 'text-purple-500' },
    approved: { bg: 'bg-green-500/10', text: 'text-green-500' },
    published: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
    missing: { bg: 'bg-red-500/10', text: 'text-red-500' },
    pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-500' },
  };

  const style = styles[status] || styles.draft;
  return (
    <Badge className={`${style.bg} ${style.text} border-0`}>
      {status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
    </Badge>
  );
};

interface MetricCardProps {
  icon: ReactNode;
  label: [string, string];
  value: number;
  href: string;
}

const MetricCard = ({ icon, label, value, href }: MetricCardProps) => (
  <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
    <Card className="h-full cursor-pointer p-5 bg-card hover:bg-blue-50/60 transition-colors border-border">
    <div className="flex min-h-28 flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase leading-5 tracking-wide text-muted-foreground">
          <span className="block">{label[0]}</span>
          <span className="block">{label[1]}</span>
        </p>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-primary">
          {icon}
        </div>
      </div>
      <p className="text-3xl font-semibold leading-none text-foreground">{value}</p>
    </div>
    </Card>
  </Link>
);

const toText = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value && typeof value === 'object' && 'content' in value) {
    return toText((value as { content?: unknown }).content);
  }

  return '';
};

const hasValue = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0;
  }

  return toText(value).trim() !== '';
};

const toDateValue = (value: unknown) => {
  const textValue = toText(value);

  if (!textValue) {
    return null;
  }

  const date = new Date(textValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return textValue;
};

const formatDate = (date: string | null) => {
  if (!date) {
    return 'N/A';
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'N/A';
  }

  return parsedDate.getDate() + '/' + (parsedDate.getMonth() + 1) + '/' + parsedDate.getFullYear();
};

const formatTimestamp = (date: string | null) => {
  if (!date) {
    return 'N/A';
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'N/A';
  }

  return `${formatDate(date)} ${parsedDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const isCompleteBrief = (brief: SupabaseRow, criteria?: SupabaseRow) => {
  const status = toText(brief.status).toLowerCase();

  if (['approved', 'published', 'completed'].includes(status)) {
    return true;
  }

  if (status === 'draft' || status === 'in-review') {
    return false;
  }

  if (!('status' in brief)) {
    return true;
  }

  return (
    hasValue(brief.objective) ||
    hasValue(brief.target_audience) ||
    hasValue(brief.content_direction) ||
    hasValue(brief.platforms) ||
    hasValue(criteria?.key_messages) ||
    hasValue(criteria?.required_elements)
  );
};

const getBriefStatus = (brief?: SupabaseRow, criteria?: SupabaseRow) => {
  if (!brief) {
    return 'missing';
  }

  if (isCompleteBrief(brief, criteria)) {
    return 'completed';
  }

  return toText(brief.status) || 'draft';
};

const isMissingRelationError = (error: { code?: string; message?: string } | null) =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  error?.message?.toLowerCase().includes('could not find the table');

const getReviewStatus = (row: SupabaseRow) =>
  typeof row.approved === 'boolean'
    ? row.approved
      ? 'approved'
      : 'rejected'
    : toText(row.status).toLowerCase();

const isReviewed = (row: SupabaseRow) => {
  const status = getReviewStatus(row);

  return (
    Boolean(toDateValue(row.reviewed_at)) || ['approved', 'rejected', 'completed'].includes(status)
  );
};

const isApproved = (row: SupabaseRow) => getReviewStatus(row) === 'approved';

const ONBOARDED_CREATORS_COUNT_REFRESH_INTERVAL_MS = 15000;

export default function DashboardPage() {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    campaigns: [],
    briefs: [],
    acceptanceCriteria: [],
    submissions: [],
    reviews: [],
    reports: [],
  });
  const [onboardedCreatorsCount, setOnboardedCreatorsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchUserName = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        if (isMounted) {
          setUserName(null);
        }
        return;
      }

      const metadataName =
        toText(user.user_metadata?.display_name) ||
        toText(user.user_metadata?.full_name);

      const { data } = await supabase
        .from('users')
        .select('name, full_name')
        .eq('id', user.id)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      const profile = data as SupabaseRow | null;
      setUserName(
        toText(profile?.name) ||
          toText(profile?.full_name) ||
          metadataName ||
          user.email?.split('@')[0] ||
          null
      );
    };

    fetchUserName();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      const [
        campaignsResult,
        briefsResult,
        acceptanceCriteriaResult,
        submissionsResult,
        reviewsResult,
        reportsResult,
      ] = await Promise.all([
        supabase.from('campaigns').select('*'),
        supabase.from('briefs').select('*'),
        supabase.from('acceptance_criteria').select('*'),
        supabase.from('submissions').select('*'),
        supabase.from('reviews').select('*'),
        supabase.from('reports').select('*'),
      ]);

      const acceptanceCriteriaMissing = isMissingRelationError(acceptanceCriteriaResult.error);
      const submissionsMissing = isMissingRelationError(submissionsResult.error);
      const reviewsMissing = isMissingRelationError(reviewsResult.error);
      const reportsMissing = isMissingRelationError(reportsResult.error);
      const fetchError =
        campaignsResult.error ||
        briefsResult.error ||
        (acceptanceCriteriaMissing ? null : acceptanceCriteriaResult.error) ||
        (submissionsMissing ? null : submissionsResult.error) ||
        (reviewsMissing ? null : reviewsResult.error) ||
        (reportsMissing ? null : reportsResult.error);

      if (fetchError) {
        setErrorMessage(fetchError.message);
        setDashboardData({
          campaigns: [],
          briefs: [],
          acceptanceCriteria: [],
          submissions: [],
          reviews: [],
          reports: [],
        });
        setIsLoading(false);
        return;
      }

      setDashboardData({
        campaigns: (campaignsResult.data ?? []) as SupabaseRow[],
        briefs: (briefsResult.data ?? []) as SupabaseRow[],
        acceptanceCriteria: acceptanceCriteriaMissing
          ? []
          : ((acceptanceCriteriaResult.data ?? []) as SupabaseRow[]),
        submissions: submissionsMissing ? [] : ((submissionsResult.data ?? []) as SupabaseRow[]),
        reviews: reviewsMissing ? [] : ((reviewsResult.data ?? []) as SupabaseRow[]),
        reports: reportsMissing ? [] : ((reportsResult.data ?? []) as SupabaseRow[]),
      });
      setIsLoading(false);
    };

    fetchDashboardData();

    const fetchOnboardedCreatorsCount = () => {
      getScopedCreatorCount()
        .then(setOnboardedCreatorsCount)
        .catch((error) => {
          // Keep the last known-good count rather than dropping to 0 on a
          // transient fetch failure — the interval below will retry.
          console.error('Onboarded creators count fetch issue:', error);
        });
    };

    fetchOnboardedCreatorsCount();
    const creatorCountIntervalId = window.setInterval(
      fetchOnboardedCreatorsCount,
      ONBOARDED_CREATORS_COUNT_REFRESH_INTERVAL_MS
    );

    return () => {
      window.clearInterval(creatorCountIntervalId);
    };
  }, []);

  const {
    recentCampaigns,
    recentActivity,
    activeCampaignsCount,
    completedBriefsCount,
    reviewedSubmissionsCount,
    approvedItemsCount,
  } = useMemo(() => {
    const campaignNames = new Map(
      dashboardData.campaigns.map((campaign) => [
        toText(campaign.id),
        toText(campaign.name) || 'Untitled campaign',
      ])
    );

    const submissionsById = new Map(
      dashboardData.submissions.map((submission) => [toText(submission.id), submission])
    );
    const latestReviewBySubmissionId = new Map<string, SupabaseRow>();
    dashboardData.reviews
      .slice()
      .sort((firstReview, secondReview) => {
        const firstDate = toDateValue(
          firstReview.reviewed_at
        );
        const secondDate = toDateValue(
          secondReview.reviewed_at
        );
        const firstTime = firstDate ? new Date(firstDate).getTime() : 0;
        const secondTime = secondDate ? new Date(secondDate).getTime() : 0;

        return secondTime - firstTime;
      })
      .forEach((review) => {
        const submissionId = toText(review.submission_id);

        if (submissionId && !latestReviewBySubmissionId.has(submissionId)) {
          latestReviewBySubmissionId.set(submissionId, review);
        }
      });

    const criteriaByBriefId = new Map(
      dashboardData.acceptanceCriteria.map((criteria) => [
        toText(criteria.brief_id),
        criteria,
      ])
    );
    const criteriaByCampaignId = new Map(
      dashboardData.acceptanceCriteria.map((criteria) => [
        toText(criteria.campaign_id),
        criteria,
      ])
    );

    const briefsByCampaignId = new Map<string, SupabaseRow>();
    dashboardData.briefs
      .slice()
      .sort((firstBrief, secondBrief) => {
        const firstDate = toDateValue(firstBrief.updated_at ?? firstBrief.created_at);
        const secondDate = toDateValue(secondBrief.updated_at ?? secondBrief.created_at);
        const firstTime = firstDate ? new Date(firstDate).getTime() : 0;
        const secondTime = secondDate ? new Date(secondDate).getTime() : 0;

        return secondTime - firstTime;
      })
      .forEach((brief) => {
        const campaignId = toText(brief.campaign_id);

        if (campaignId && !briefsByCampaignId.has(campaignId)) {
          briefsByCampaignId.set(campaignId, brief);
        }
      });

    const submissionsByCampaignId = new Map<string, SupabaseRow[]>();
    dashboardData.submissions.forEach((submission) => {
      const campaignId = toText(submission.campaign_id);

      if (!submissionsByCampaignId.has(campaignId)) {
        submissionsByCampaignId.set(campaignId, []);
      }

      submissionsByCampaignId.get(campaignId)?.push(submission);
    });

    const reviewsByCampaignId = new Map<string, SupabaseRow[]>();
    dashboardData.reviews.forEach((review) => {
      const submission = submissionsById.get(toText(review.submission_id));
      const campaignId = toText(review.campaign_id) || toText(submission?.campaign_id);

      if (!reviewsByCampaignId.has(campaignId)) {
        reviewsByCampaignId.set(campaignId, []);
      }

      reviewsByCampaignId.get(campaignId)?.push(review);
    });

    const reportsByCampaignId = new Map<string, SupabaseRow[]>();
    dashboardData.reports.forEach((report) => {
      const campaignId = toText(report.campaign_id);

      if (!reportsByCampaignId.has(campaignId)) {
        reportsByCampaignId.set(campaignId, []);
      }

      reportsByCampaignId.get(campaignId)?.push(report);
    });

    const campaignsForTable = dashboardData.campaigns
      .map((campaign): DashboardCampaign => {
        const campaignId = toText(campaign.id);
        const campaignSubmissions = submissionsByCampaignId.get(campaignId) ?? [];
        const campaignReviews = reviewsByCampaignId.get(campaignId) ?? [];
        const campaignBrief = briefsByCampaignId.get(campaignId);
        const campaignCriteria = campaignBrief
          ? criteriaByBriefId.get(toText(campaignBrief.id)) ??
            criteriaByCampaignId.get(campaignId)
          : criteriaByCampaignId.get(campaignId);

        const latestCampaignReviews = campaignSubmissions
          .map((submission) => latestReviewBySubmissionId.get(toText(submission.id)))
          .filter(Boolean) as SupabaseRow[];
        const reviewedCount = campaignSubmissions.filter((submission) => {
          const latestReview = latestReviewBySubmissionId.get(toText(submission.id));

          return latestReview ? isReviewed(latestReview) : isReviewed(submission);
        }).length;
        const approvedCount = campaignSubmissions.filter((submission) => {
          const latestReview = latestReviewBySubmissionId.get(toText(submission.id));

          return latestReview ? isApproved(latestReview) : isApproved(submission);
        }).length;
        const approvalStatus =
          campaignSubmissions.length === 0 && campaignReviews.length === 0
            ? 'pending'
            : approvedCount > 0 && approvedCount === campaignSubmissions.length
            ? 'approved'
            : reviewedCount > 0 || latestCampaignReviews.length > 0
            ? 'in-review'
            : 'pending';

        return {
          id: campaignId,
          name: toText(campaign.name) || 'Untitled campaign',
          clientName: toText(campaign.client_name) || toText(campaign.client) || 'N/A',
          status: toText(campaign.status) || 'draft',
          briefStatus: getBriefStatus(campaignBrief, campaignCriteria),
          approvalStatus,
          submissionsCount: campaignSubmissions.length,
          submissionsReviewed: reviewedCount,
          updatedAt: toDateValue(campaign.updated_at ?? campaign.created_at),
        };
      })
      .sort((firstCampaign, secondCampaign) => {
        const firstDate = firstCampaign.updatedAt
          ? new Date(firstCampaign.updatedAt).getTime()
          : 0;
        const secondDate = secondCampaign.updatedAt
          ? new Date(secondCampaign.updatedAt).getTime()
          : 0;

        return secondDate - firstDate;
      });

    const completedBriefs = dashboardData.briefs.filter((brief) => {
      const campaignId = toText(brief.campaign_id);
      const criteria =
        criteriaByBriefId.get(toText(brief.id)) ?? criteriaByCampaignId.get(campaignId);

      return getBriefStatus(brief, criteria) === 'completed';
    }).length;

    const reviewedSubmissions = dashboardData.submissions.filter((submission) => {
      const latestReview = latestReviewBySubmissionId.get(toText(submission.id));

      return latestReview ? isReviewed(latestReview) : isReviewed(submission);
    }).length;
    const approvedSubmissions = dashboardData.submissions.filter((submission) => {
      const latestReview = latestReviewBySubmissionId.get(toText(submission.id));

      return latestReview ? isApproved(latestReview) : isApproved(submission);
    }).length;
    const activities: DashboardActivity[] = [
      ...dashboardData.campaigns.map((campaign) => ({
        id: `campaign-${toText(campaign.id)}`,
        description: `Campaign ${toText(campaign.status) || 'updated'}`,
        campaign: toText(campaign.name) || 'Untitled campaign',
        timestamp: toDateValue(campaign.updated_at ?? campaign.created_at),
      })),
      ...dashboardData.reviews.map((review) => {
        const submission = submissionsById.get(toText(review.submission_id));
        const campaignId = toText(submission?.campaign_id);
        const reviewStatus = getReviewStatus(review);

        return {
          id: `review-${toText(review.id)}`,
          description: `Submission ${reviewStatus || 'reviewed'}`,
          campaign: campaignNames.get(campaignId) ?? 'Unknown campaign',
          timestamp: toDateValue(review.reviewed_at),
        };
      }),
      ...dashboardData.reports.map((report) => ({
        id: `report-${toText(report.id)}`,
        description: `Report ${toText(report.status) || 'updated'}`,
        campaign: campaignNames.get(toText(report.campaign_id)) ?? 'Unknown campaign',
        timestamp: toDateValue(report.updated_at ?? report.created_at),
      })),
    ]
      .filter((activity) => activity.timestamp)
      .sort((firstActivity, secondActivity) => {
        const firstDate = firstActivity.timestamp
          ? new Date(firstActivity.timestamp).getTime()
          : 0;
        const secondDate = secondActivity.timestamp
          ? new Date(secondActivity.timestamp).getTime()
          : 0;

        return secondDate - firstDate;
      })
      .slice(0, 5);

    return {
      recentCampaigns: campaignsForTable.slice(0, 5),
      recentActivity: activities,
      activeCampaignsCount: dashboardData.campaigns.filter(
        (campaign) => toText(campaign.status) === 'active'
      ).length,
      completedBriefsCount: completedBriefs,
      reviewedSubmissionsCount: reviewedSubmissions,
      approvedItemsCount: approvedSubmissions,
    };
  }, [dashboardData]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome{userName ? ` ${userName}` : ''}! Here&apos;s an overview of the campaigns and activities.
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          icon={<Users size={24} />}
          label={['Onboarded', 'Creators']}
          value={onboardedCreatorsCount}
          href="/creators"
        />
        <MetricCard
          icon={<FolderOpen size={24} />}
          label={['Active', 'Campaigns']}
          value={activeCampaignsCount}
          href="/campaigns"
        />
        <MetricCard
          icon={<CheckCircle2 size={24} />}
          label={['Briefs', 'Completed']}
          value={completedBriefsCount}
          href="/briefs"
        />
        <MetricCard
          icon={<BarChart3 size={24} />}
          label={['Submissions', 'Reviewed']}
          value={reviewedSubmissionsCount}
          href="/reviews"
        />
        <MetricCard
          icon={<FileText size={24} />}
          label={['Approved', 'Content']}
          value={approvedItemsCount}
          href="/reports"
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <LoadingDots text="Loading dashboard..." />
        </div>
      )}

      {errorMessage && (
        <Card className="p-6 text-center bg-card border-border">
          <p className="text-red-500 mb-2">Unable to load dashboard</p>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
        </Card>
      )}

      {/* Recent campaigns */}
      {!isLoading && !errorMessage && (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-foreground mb-1">
              Recent Campaigns
            </h2>
            <p className="text-sm text-muted-foreground">
              Your active campaigns at a glance
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => router.push('/campaigns?create=1')}>
            + Create Campaign
          </Button>
        </div>

        <Card className="gap-0 border-border bg-card overflow-hidden py-0">
          {recentCampaigns.length > 0 ? (
            <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader className="bg-muted/60">
                <TableRow className="h-10 hover:bg-muted/60">
                  <TableHead className="py-2">Campaign Name</TableHead>
                  <TableHead className="py-2">Client</TableHead>
                  <TableHead className="py-2">Status</TableHead>
                  <TableHead className="py-2">Brief</TableHead>
                  <TableHead className="py-2">Review Status</TableHead>
                  <TableHead className="py-2">Submissions</TableHead>
                  <TableHead className="py-2">Last Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentCampaigns.map((campaign) => (
                  <TableRow
                    key={campaign.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open ${campaign.name}`}
                    className="cursor-pointer hover:bg-muted/50 border-border"
                    onClick={() => router.push(`/campaigns/${campaign.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        router.push(`/campaigns/${campaign.id}`);
                      }
                    }}
                  >
                    <TableCell className="font-medium text-foreground">
                      {campaign.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {campaign.clientName}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={campaign.briefStatus} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={campaign.approvalStatus} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {campaign.submissionsReviewed}/{campaign.submissionsCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(campaign.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-muted-foreground mb-2">No campaigns found</p>
              <p className="text-sm text-muted-foreground">
                Campaigns will appear here once they exist in the database
              </p>
            </div>
          )}
        </Card>
      </div>
      )}

      {/* Recent activity */}
      {!isLoading && !errorMessage && (
      <div>
        <h2 className="text-xl font-bold text-foreground mb-4">Recent Activity</h2>
        <div className="space-y-3">
          {recentActivity.length > 0 ? (
            recentActivity.map((activity) => (
            <Card
              key={activity.id}
              className="p-4 bg-card border-border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {activity.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activity.campaign} • {formatTimestamp(activity.timestamp)}
                  </p>
                </div>
              </div>
            </Card>
            ))
          ) : (
            <Card className="p-6 text-center bg-card border-border">
              <p className="text-muted-foreground mb-2">No recent activity</p>
              <p className="text-sm text-muted-foreground">
                Activity will appear here as campaigns, reviews, and reports are updated
              </p>
            </Card>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
