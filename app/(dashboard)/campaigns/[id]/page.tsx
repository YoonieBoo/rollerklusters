'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileDown,
  FileText,
  Mail,
  MessageSquareText,
  Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  downloadCampaignReportPdf,
  getCampaignReportExportData,
  toText,
} from '@/lib/report-export';
import BriefTabContent from './_tabs/BriefTabContent';
import ReviewsTabContent from './_tabs/ReviewsTabContent';
import InvitesTabContent from './_tabs/InvitesTabContent';

type SupabaseRow = Record<string, unknown>;

type EngagementRow = {
  id: string;
  campaign_id: string;
  creator_id: string;
  status: string;
  match_score: number | null;
  created_at: string | null;
};

type CampaignDetail = {
  id: string;
  name: string;
  clientName: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
};

const StatusBadge = ({ status, label }: { status: string; label?: string }) => {
  const styles: Record<string, string> = {
    active: 'bg-green-500/10 text-green-600',
    draft: 'bg-yellow-500/10 text-yellow-600',
    completed: 'bg-blue-500/10 text-blue-600',
    ready_for_review: 'bg-blue-500/10 text-blue-700',
    approved: 'bg-green-500/10 text-green-600',
    published: 'bg-blue-500/10 text-blue-600',
    rejected: 'bg-red-500/10 text-red-600',
    missing: 'bg-red-500/10 text-red-600',
    pending: 'bg-yellow-500/10 text-yellow-600',
    // engagement statuses
    matched: 'bg-yellow-500/10 text-yellow-600',
    accepted: 'bg-green-500/10 text-green-600',
    declined: 'bg-red-500/10 text-red-600',
    in_discussion: 'bg-blue-500/10 text-blue-600',
  };

  return (
    <Badge className={`${styles[status] || styles.draft} border-0`}>
      {label ?? status.replace(/[_-]/g, ' ')}
    </Badge>
  );
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

const getBriefStatus = (brief: SupabaseRow | null) => {
  if (!brief) {
    return 'missing';
  }

  return toText(brief.status) || 'completed';
};

const getLatestReviewStatus = (submissionId: string, reviews: SupabaseRow[]) => {
  const latestReview = reviews
    .filter((review) => toText(review.submission_id) === submissionId)
    .sort((firstReview, secondReview) => {
      const firstTime = new Date(toText(firstReview.reviewed_at)).getTime() || 0;
      const secondTime = new Date(toText(secondReview.reviewed_at)).getTime() || 0;

      return secondTime - firstTime;
    })[0];

  if (typeof latestReview?.approved === 'boolean') {
    return latestReview.approved ? 'approved' : 'rejected';
  }

  return '';
};

const engagementStatusLabels: Record<string, string> = {
  matched: 'Pending creator response',
  accepted: 'Accepted by creator',
  declined: 'Declined by creator',
  in_discussion: 'In discussion',
  active: 'Active',
  completed: 'Completed',
};

const getEngagementLabel = (status: string) =>
  engagementStatusLabels[status] ?? status.replace(/[_-]/g, ' ');

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') ?? 'overview';
  const campaignId = params.id as string;
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [brief, setBrief] = useState<SupabaseRow | null>(null);
  const [submissions, setSubmissions] = useState<SupabaseRow[]>([]);
  const [reviews, setReviews] = useState<SupabaseRow[]>([]);
  const [reports, setReports] = useState<SupabaseRow[]>([]);
  const [engagements, setEngagements] = useState<EngagementRow[]>([]);
  const [creatorNameById, setCreatorNameById] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchCampaignDetail = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const [campaignResult, briefResult, submissionsResult, reviewsResult, reportsResult, engagementsResult] =
      await Promise.all([
        supabase
          .from('campaigns')
          .select('id, name, client_name, status, created_at, updated_at')
          .eq('id', campaignId)
          .maybeSingle(),
        supabase.from('briefs').select('*').eq('campaign_id', campaignId).maybeSingle(),
        supabase
          .from('submissions')
          .select('id, campaign_id, creator_ref, submission_link, submitted_at, status')
          .eq('campaign_id', campaignId)
          .order('submitted_at', { ascending: false }),
        supabase.from('reviews').select('id, submission_id, approved, feedback_notes, reviewed_at'),
        supabase
          .from('reports')
          .select('*')
          .eq('campaign_id', campaignId)
          .order('updated_at', { ascending: false }),
        supabase
          .from('engagements')
          .select('id, campaign_id, creator_id, status, match_score, created_at')
          .eq('campaign_id', campaignId)
          .order('created_at', { ascending: false }),
      ]);

    const fetchError =
      campaignResult.error ||
      briefResult.error ||
      submissionsResult.error ||
      reviewsResult.error ||
      reportsResult.error ||
      engagementsResult.error;

    if (fetchError) {
      console.error('Supabase campaign detail fetch error:', fetchError);
      setErrorMessage(fetchError.message);
      setCampaign(null);
      setIsLoading(false);
      return;
    }

    if (!campaignResult.data) {
      setCampaign(null);
      setIsLoading(false);
      return;
    }

    const campaignRow = campaignResult.data as SupabaseRow;

    setCampaign({
      id: toText(campaignRow.id),
      name: toText(campaignRow.name) || 'Untitled campaign',
      clientName: toText(campaignRow.client_name) || 'N/A',
      status: toText(campaignRow.status) || 'draft',
      createdAt: toText(campaignRow.created_at) || null,
      updatedAt: toText(campaignRow.updated_at) || null,
    });
    setBrief((briefResult.data ?? null) as SupabaseRow | null);
    setSubmissions((submissionsResult.data ?? []) as SupabaseRow[]);
    setReviews((reviewsResult.data ?? []) as SupabaseRow[]);
    setReports((reportsResult.data ?? []) as SupabaseRow[]);

    const fetchedEngagements = (engagementsResult.data ?? []) as EngagementRow[];
    setEngagements(fetchedEngagements);

    // Fetch creator names for all engaged creator IDs
    const creatorIds = fetchedEngagements.map((e) => e.creator_id).filter(Boolean);
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('creator_profiles')
        .select('user_id, display_name, creator_name, social_handle')
        .in('user_id', creatorIds);
      const nameMap = new Map<string, string>();
      for (const p of profiles ?? []) {
        const name =
          toText(p.display_name).trim() ||
          toText(p.creator_name).trim() ||
          toText(p.social_handle).trim() ||
          'Unknown creator';
        nameMap.set(toText(p.user_id), name);
      }
      setCreatorNameById(nameMap);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchCampaignDetail();

    // Re-fetch when a creator accepts or declines
    const channel = supabase
      .channel(`campaign-engagements-${campaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'engagements', filter: `campaign_id=eq.${campaignId}` },
        () => fetchCampaignDetail()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  const acceptedEngagements = useMemo(() => engagements.filter((e) => e.status === 'accepted' || e.status === 'active' || e.status === 'completed'), [engagements]);
  const pendingEngagements = useMemo(() => engagements.filter((e) => e.status === 'matched' || e.status === 'in_discussion'), [engagements]);
  const declinedEngagements = useMemo(() => engagements.filter((e) => e.status === 'declined'), [engagements]);

  const reviewedCount = useMemo(
    () =>
      submissions.filter((submission) =>
        ['approved', 'rejected'].includes(
          getLatestReviewStatus(toText(submission.id), reviews) ||
            toText(submission.status)
        )
      ).length,
    [reviews, submissions]
  );
  const approvedCount = useMemo(
    () =>
      submissions.filter(
        (submission) =>
          (getLatestReviewStatus(toText(submission.id), reviews) ||
            toText(submission.status)) === 'approved'
      ).length,
    [reviews, submissions]
  );

  const handleExportReport = async () => {
    setIsExporting(true);
    setErrorMessage(null);

    try {
      const reportData = await getCampaignReportExportData(campaignId);
      downloadCampaignReportPdf(reportData);
    } catch (error) {
      console.error('Campaign detail report export error:', error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to export campaign report. Please try again.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Loading campaign...</p>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-muted-foreground mb-4">Campaign not found</p>
        <Link href="/campaigns">
          <Button variant="outline">Back to Campaigns</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit gap-2"
          onClick={() => router.push('/campaigns')}
        >
          <ArrowLeft size={16} />
          Back to Campaigns
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => router.push(`/reports?campaign=${encodeURIComponent(campaign.id)}`)}
          >
            <FileText size={16} />
            View Report
          </Button>
          <Button className="gap-2" onClick={handleExportReport} disabled={isExporting}>
            <FileDown size={16} />
            {isExporting ? 'Exporting...' : 'Export PDF'}
          </Button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-sm text-red-600">{errorMessage}</p>
        </div>
      )}

      <section className="border-b border-border pb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{campaign.clientName}</p>
            <h1 className="mt-1 text-3xl font-semibold text-foreground">
              {campaign.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Created {formatDate(campaign.createdAt)} · Updated {formatDate(campaign.updatedAt)}
            </p>
          </div>
          <StatusBadge status={campaign.status} />
        </div>
      </section>

      <section className="grid overflow-hidden rounded-lg border border-border bg-card md:grid-cols-4">
        <div className="border-b border-border px-5 py-4 md:border-b-0 md:border-r">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 size={16} className="text-blue-700" />
            Brief
          </div>
          <p className="mt-2 text-xl font-semibold capitalize">
            {getBriefStatus(brief).replace(/_/g, ' ')}
          </p>
        </div>
        <div className="border-b border-border px-5 py-4 md:border-b-0 md:border-r">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail size={16} className="text-blue-700" />
            Invites
          </div>
          <p className="mt-2 text-xl font-semibold">
            {acceptedEngagements.length}/{engagements.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">creators accepted</p>
        </div>
        <div className="border-b border-border px-5 py-4 md:border-b-0 md:border-r">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquareText size={16} className="text-blue-700" />
            Reviews
          </div>
          <p className="mt-2 text-xl font-semibold">
            {reviewedCount}/{submissions.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">submissions reviewed</p>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 size={16} className="text-green-600" />
            Approved Content
          </div>
          <p className="mt-2 text-xl font-semibold">{approvedCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">approved submissions</p>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={(v) => router.push(`?tab=${v}`)} className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="brief">Brief</TabsTrigger>
          <TabsTrigger value="invites">
            Invites
            {engagements.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {engagements.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <section className="rounded-lg border border-border bg-card px-5 py-4">
            <div className="grid gap-5 text-sm md:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Campaign status</p>
                <p className="mt-1 font-medium capitalize">{campaign.status.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Brief status</p>
                <p className="mt-1 font-medium capitalize">{getBriefStatus(brief).replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Submissions</p>
                <p className="mt-1 font-medium">{submissions.length}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Reports</p>
                <p className="mt-1 font-medium">{reports.length > 0 ? 'Available' : 'Not created'}</p>
              </div>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="brief" className="mt-4">
          <BriefTabContent campaignId={campaignId} />
        </TabsContent>

        <TabsContent value="invites" className="mt-4 space-y-4">
          <InvitesTabContent campaignId={campaignId} />

          {engagements.length > 0 && (
            <section className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 text-sm">
                <span className="flex items-center gap-1.5 font-medium text-green-600">
                  <CheckCircle2 size={14} />
                  {acceptedEngagements.length} accepted
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock3 size={14} />
                  {pendingEngagements.length} pending
                </span>
                <span className="flex items-center gap-1.5 text-red-500">
                  <Users size={14} />
                  {declinedEngagements.length} declined
                </span>
              </div>
              <div className="divide-y divide-border">
                {engagements.map((eng) => {
                  const name = creatorNameById.get(eng.creator_id) ?? 'Unknown creator';
                  const statusLabel = getEngagementLabel(eng.status);
                  return (
                    <div key={eng.id} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div>
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">
                          Invited {eng.created_at ? formatDate(eng.created_at) : 'recently'}
                        </p>
                      </div>
                      <StatusBadge status={eng.status} label={statusLabel} />
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          <ReviewsTabContent campaignId={campaignId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
