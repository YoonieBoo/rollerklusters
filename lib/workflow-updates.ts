import type { SupabaseClient } from '@supabase/supabase-js';

export type SupabaseRow = Record<string, unknown>;

export type WorkflowUpdate = {
  id: string;
  title: string;
  message: string;
  campaignId: string;
  workflow: 'brief' | 'review';
  createdAt: string | null;
};

export const workflowUpdateStorageKey = 'rollerkluster-read-notifications';

export const toText = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
};

export const formatWorkflowUpdateDate = (date: string | null) => {
  if (!date) {
    return '';
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return parsedDate.toLocaleDateString();
};

export const getWorkflowUpdateDestination = (update: WorkflowUpdate) => {
  if (!update.campaignId) {
    return '';
  }

  return update.workflow === 'brief'
    ? `/briefs?campaign=${encodeURIComponent(update.campaignId)}`
    : `/reviews?campaign=${encodeURIComponent(update.campaignId)}`;
};

export const fetchWorkflowUpdates = async (supabase: SupabaseClient) => {
  const [campaignsResult, briefsResult, submissionsResult, reviewsResult] =
    await Promise.all([
      supabase.from('campaigns').select('id, name, status, updated_at'),
      supabase.from('briefs').select('id, campaign_id, updated_at'),
      supabase
        .from('submissions')
        .select('id, campaign_id, creator_ref, status, submitted_at'),
      supabase.from('reviews').select('id, submission_id, approved, feedback_notes, reviewed_at'),
    ]);

  const fetchError =
    campaignsResult.error ||
    briefsResult.error ||
    submissionsResult.error ||
    reviewsResult.error;

  if (fetchError) {
    throw fetchError;
  }

  const campaigns = (campaignsResult.data ?? []) as SupabaseRow[];
  const briefs = (briefsResult.data ?? []) as SupabaseRow[];
  const submissions = (submissionsResult.data ?? []) as SupabaseRow[];
  const reviews = (reviewsResult.data ?? []) as SupabaseRow[];
  const campaignsById = new Map(campaigns.map((campaign) => [toText(campaign.id), campaign]));
  const briefCampaignIds = new Set(briefs.map((brief) => toText(brief.campaign_id)));
  const reviewedSubmissionIds = new Set(reviews.map((review) => toText(review.submission_id)));
  const updates: WorkflowUpdate[] = [];

  campaigns
    .filter((campaign) => !briefCampaignIds.has(toText(campaign.id)))
    .forEach((campaign) => {
      const campaignId = toText(campaign.id);

      if (!campaignId) {
        return;
      }

      updates.push({
        id: `brief-missing-${campaignId}`,
        title: 'Brief needed',
        message: `${toText(campaign.name) || 'Untitled campaign'} needs a campaign brief.`,
        campaignId,
        workflow: 'brief',
        createdAt: toText(campaign.updated_at) || null,
      });
    });

  submissions
    .filter((submission) => {
      const status = toText(submission.status);

      return !['approved', 'rejected'].includes(status) && !reviewedSubmissionIds.has(toText(submission.id));
    })
    .forEach((submission) => {
      const campaignId = toText(submission.campaign_id);
      const campaign = campaignsById.get(campaignId);

      if (!campaignId) {
        return;
      }

      updates.push({
        id: `submission-pending-${toText(submission.id)}`,
        title: 'Submission ready for review',
        message: `${toText(submission.creator_ref) || 'A creator'} submitted content for ${toText(campaign?.name) || 'a campaign'}.`,
        campaignId,
        workflow: 'review',
        createdAt: toText(submission.submitted_at) || null,
      });
    });

  reviews
    .filter((review) => review.approved === false)
    .forEach((review) => {
      const submission = submissions.find(
        (item) => toText(item.id) === toText(review.submission_id)
      );
      const campaignId = toText(submission?.campaign_id);
      const campaign = campaignsById.get(campaignId);

      if (!campaignId) {
        return;
      }

      updates.push({
        id: `review-rejected-${toText(review.id)}`,
        title: 'Changes requested',
        message: `${toText(submission?.creator_ref) || 'A creator'} needs updates for ${toText(campaign?.name) || 'a campaign'}.`,
        campaignId,
        workflow: 'review',
        createdAt: toText(review.reviewed_at) || null,
      });
    });

  return updates
    .sort((firstUpdate, secondUpdate) => {
      const firstTime = firstUpdate.createdAt
        ? new Date(firstUpdate.createdAt).getTime()
        : 0;
      const secondTime = secondUpdate.createdAt
        ? new Date(secondUpdate.createdAt).getTime()
        : 0;

      return secondTime - firstTime;
    })
    .slice(0, 20);
};
