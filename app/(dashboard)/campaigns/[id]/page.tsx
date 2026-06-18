'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileDown,
  FileText,
  MessageSquareText,
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

type SupabaseRow = Record<string, unknown>;

type CampaignDetail = {
  id: string;
  name: string;
  clientName: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
};

const StatusBadge = ({ status }: { status: string }) => {
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
  };

  return (
    <Badge className={`${styles[status] || styles.draft} border-0 capitalize`}>
      {status.replace(/[_-]/g, ' ')}
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

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [brief, setBrief] = useState<SupabaseRow | null>(null);
  const [submissions, setSubmissions] = useState<SupabaseRow[]>([]);
  const [reviews, setReviews] = useState<SupabaseRow[]>([]);
  const [reports, setReports] = useState<SupabaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchCampaignDetail = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const [campaignResult, briefResult, submissionsResult, reviewsResult, reportsResult] =
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
      ]);

    const fetchError =
      campaignResult.error ||
      briefResult.error ||
      submissionsResult.error ||
      reviewsResult.error ||
      reportsResult.error;

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
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCampaignDetail();
  }, [campaignId]);

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
            onClick={() => router.push(`/reviews?campaign=${encodeURIComponent(campaign.id)}`)}
          >
            <MessageSquareText size={16} />
            Review Submissions
          </Button>
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

      <section className="grid overflow-hidden rounded-lg border border-border bg-card md:grid-cols-3">
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

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="brief">Brief</TabsTrigger>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
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
          <section className="rounded-lg border border-border bg-card px-5 py-4">
            {brief ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Campaign Brief</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {getBriefStatus(brief).replace(/_/g, ' ')}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => router.push(`/briefs?campaign=${encodeURIComponent(campaign.id)}`)}
                  >
                    Open Brief
                  </Button>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Objective</p>
                    <p className="mt-2 text-sm">{toText(brief.objective) || 'Not added'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Audience</p>
                    <p className="mt-2 text-sm">{toText(brief.target_audience) || 'Not added'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Direction</p>
                    <p className="mt-2 text-sm">{toText(brief.content_direction) || 'Not added'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <p className="mb-4 text-sm text-muted-foreground">No brief created yet</p>
                <Button onClick={() => router.push(`/briefs?campaign=${encodeURIComponent(campaign.id)}`)}>
                  Create Brief
                </Button>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="submissions" className="mt-4">
          <section className="overflow-hidden rounded-lg border border-border bg-card">
            {submissions.length > 0 ? (
              <div className="divide-y divide-border">
                {submissions.map((submission) => {
                  const status =
                    getLatestReviewStatus(toText(submission.id), reviews) ||
                    toText(submission.status) ||
                    'pending';

                  return (
                    <div key={toText(submission.id)} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium">{toText(submission.creator_ref) || 'Unknown creator'}</p>
                        <a
                          href={toText(submission.submission_link) || undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block truncate text-sm text-primary hover:underline"
                        >
                          {toText(submission.submission_link) || 'No content link'}
                        </a>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Submitted {formatDate(toText(submission.submitted_at) || null)}
                        </p>
                      </div>
                      <StatusBadge status={status} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-sm text-muted-foreground">No submissions yet</p>
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
