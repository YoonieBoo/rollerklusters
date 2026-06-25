'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CheckCircle2, ExternalLink, FileDown, FileText, Play, Search, XCircle } from 'lucide-react';
import {
  downloadCampaignReportPdf,
  getCampaignReportExportData,
} from '@/lib/report-export';
import {
  getProfileIds,
  getSubmissionCreatorName,
  getSubmissionCreatorReference,
} from '@/lib/creator-names';

type SupabaseRow = Record<string, unknown>;

type ReviewSubmission = {
  id: string;
  campaignId: string;
  campaignName: string;
  clientName: string;
  creatorReference: string;
  submissionLink: string;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  feedback: string;
  note: string;
};

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, { bg: string; text: string }> = {
    pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-500' },
    'in-review': { bg: 'bg-blue-500/10', text: 'text-blue-500' },
    approved: { bg: 'bg-green-500/10', text: 'text-green-500' },
    rejected: { bg: 'bg-red-500/10', text: 'text-red-500' },
    changes_requested: { bg: 'bg-red-500/10', text: 'text-red-500' },
    pending_review: { bg: 'bg-yellow-500/10', text: 'text-yellow-500' },
  };
  const labels: Record<string, string> = {
    pending: 'Pending Review',
    pending_review: 'Pending Review',
    'in-review': 'In Review',
    approved: 'Approved',
    rejected: 'Changes Requested',
    changes_requested: 'Changes Requested',
  };
  const style = styles[status] || styles.pending;
  return (
    <Badge className={`${style.bg} ${style.text} border-0`}>
      {labels[status] || status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}
    </Badge>
  );
};

const toText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const toDateValue = (value: unknown) => {
  const textValue = toText(value);
  if (!textValue) return null;
  const date = new Date(textValue);
  if (Number.isNaN(date.getTime())) return null;
  return textValue;
};

const formatDate = (date: string | null) => {
  if (!date) return 'N/A';
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return 'N/A';
  return parsedDate.getDate() + '/' + (parsedDate.getMonth() + 1) + '/' + parsedDate.getFullYear();
};

const getReviewTimestamp = (review: SupabaseRow) => toDateValue(review.reviewed_at);

const sortByReviewTimestamp = (firstReview: SupabaseRow, secondReview: SupabaseRow) => {
  const firstTimestamp = getReviewTimestamp(firstReview);
  const secondTimestamp = getReviewTimestamp(secondReview);
  return (secondTimestamp ? new Date(secondTimestamp).getTime() : 0) - (firstTimestamp ? new Date(firstTimestamp).getTime() : 0);
};

const getReviewStatus = (review: SupabaseRow) => {
  if (typeof review.approved === 'boolean') return review.approved ? 'approved' : 'rejected';
  return '';
};

const getYouTubeThumbnailUrl = (link: string) => {
  try {
    const url = new URL(link);
    let videoId = '';
    if (url.hostname.includes('youtu.be')) videoId = url.pathname.replace('/', '');
    if (url.hostname.includes('youtube.com')) videoId = url.searchParams.get('v') ?? '';
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
  } catch { return ''; }
};

const getPreviewKind = (link: string) => {
  const n = link.toLowerCase();
  if (/\.(png|jpe?g|webp|gif)(\?.*)?$/.test(n)) return 'image';
  if (/\.(mp4|webm|mov)(\?.*)?$/.test(n)) return 'video';
  try {
    const url = new URL(link);
    if (url.hostname.includes('youtu') ) return 'youtube';
  } catch { /* noop */ }
  return 'link';
};

const getSubmissionPlatform = (link: string) => {
  const n = link.toLowerCase();
  if (n.includes('tiktok')) return 'TikTok';
  if (n.includes('instagram')) return 'Instagram';
  if (n.includes('youtube') || n.includes('youtu.be')) return 'YouTube';
  if (n.includes('linkedin')) return 'LinkedIn';
  return 'Submission';
};

const getLinkHost = (link: string) => {
  try { return new URL(link).hostname.replace(/^www\./, ''); } catch { return ''; }
};

export default function ReviewsTabContent({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<SupabaseRow[]>([]);
  const [submissions, setSubmissions] = useState<SupabaseRow[]>([]);
  const [reviews, setReviews] = useState<SupabaseRow[]>([]);
  const [creatorProfiles, setCreatorProfiles] = useState<SupabaseRow[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<'approve' | 'reject' | null>(null);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [reviewToast, setReviewToast] = useState<string | null>(null);

  const fetchReviewData = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const [campaignsResult, submissionsResult, reviewsResult, usersResult, creatorProfilesResult] = await Promise.all([
      supabase.from('campaigns').select('id, name, client_name'),
      supabase.from('submissions').select('*').order('submitted_at', { ascending: false }),
      supabase.from('reviews').select('id, submission_id, approved, feedback_notes, reviewed_at'),
      supabase.from('users').select('*'),
      supabase.from('creator_profiles').select('*'),
    ]);

    if (submissionsResult.error) {
      setErrorMessage(submissionsResult.error.message);
      setCampaigns([]);
      setSubmissions([]);
      setReviews([]);
      setCreatorProfiles([]);
      setIsLoading(false);
      return;
    }

    const campaignRows = campaignsResult.error ? [] : ((campaignsResult.data ?? []) as SupabaseRow[]);
    const submissionRows = (submissionsResult.data ?? []) as SupabaseRow[];
    const reviewRows = reviewsResult.error ? [] : ((reviewsResult.data ?? []) as SupabaseRow[]);
    const profileRows = [
      ...(usersResult.error ? [] : ((usersResult.data ?? []) as SupabaseRow[])),
      ...(creatorProfilesResult.error ? [] : ((creatorProfilesResult.data ?? []) as SupabaseRow[])),
    ];

    setCampaigns(campaignRows);
    setSubmissions(submissionRows);
    setReviews(reviewRows);
    setCreatorProfiles(profileRows);
    setSelectedSubmissionId((currentId) => {
      if (currentId && submissionRows.some((s) => toText(s.id) === currentId)) return currentId;
      const match = submissionRows.find((s) => toText(s.campaign_id) === campaignId);
      return toText(match?.id ?? submissionRows[0]?.id ?? '');
    });
    setIsLoading(false);
  };

  useEffect(() => {
    fetchReviewData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const normalizedSubmissions = useMemo(() => {
    const campaignsById = new Map(campaigns.map((c) => [toText(c.id), c]));
    const creatorProfilesById = new Map<string, SupabaseRow>();
    creatorProfiles.forEach((profile) => {
      getProfileIds(profile).forEach((id) => creatorProfilesById.set(id, profile));
    });
    const reviewsBySubmissionId = new Map<string, SupabaseRow[]>();
    reviews.forEach((review) => {
      const sid = toText(review.submission_id);
      if (!reviewsBySubmissionId.has(sid)) reviewsBySubmissionId.set(sid, []);
      reviewsBySubmissionId.get(sid)?.push(review);
    });
    return submissions.map((submission): ReviewSubmission => {
      const submissionId = toText(submission.id);
      const cId = toText(submission.campaign_id);
      const campaign = campaignsById.get(cId);
      const submissionReviews = reviewsBySubmissionId.get(submissionId) ?? [];
      const latestReview = [...submissionReviews].sort(sortByReviewTimestamp)[0];
      const latestStatus = getReviewStatus(latestReview ?? {});
      const reviewedAt = getReviewTimestamp(latestReview ?? {});
      const creatorReference = getSubmissionCreatorReference(submission);
      const creatorProfile = creatorReference ? creatorProfilesById.get(creatorReference) : null;
      return {
        id: submissionId,
        campaignId: cId,
        campaignName: toText(campaign?.name) || 'Untitled campaign',
        clientName: toText(campaign?.client_name) || toText(campaign?.client) || 'N/A',
        creatorReference: getSubmissionCreatorName(submission, creatorProfile),
        submissionLink: toText(submission.submission_link),
        status: latestStatus || toText(submission.status) || (reviewedAt ? 'in-review' : 'pending'),
        submittedAt: toDateValue(submission.submitted_at),
        reviewedAt,
        feedback: toText(latestReview?.feedback_notes),
        note: toText(submission.note),
      };
    });
  }, [campaigns, submissions, reviews, creatorProfiles]);

  // Only show submissions for this campaign
  const campaignSubmissions = normalizedSubmissions.filter((s) => s.campaignId === campaignId);

  const filteredSubmissions = campaignSubmissions.filter((submission) => {
    const matchesStatus = statusFilter === 'all' || submission.status === statusFilter;
    const searchText = [submission.creatorReference, submission.campaignName, getSubmissionPlatform(submission.submissionLink), submission.status].join(' ').toLowerCase();
    return matchesStatus && searchText.includes(searchQuery.toLowerCase());
  });

  const pendingReviewCount = campaignSubmissions.filter((s) => !['approved', 'rejected'].includes(s.status)).length;
  const selectedSubmission = normalizedSubmissions.find((s) => s.id === selectedSubmissionId);
  const selectedPlatform = selectedSubmission ? getSubmissionPlatform(selectedSubmission.submissionLink) : 'Submission';
  const selectedPreviewKind = selectedSubmission ? getPreviewKind(selectedSubmission.submissionLink) : 'link';
  const selectedYouTubeThumbnailUrl = selectedSubmission ? getYouTubeThumbnailUrl(selectedSubmission.submissionLink) : '';
  const selectedLinkHost = selectedSubmission ? getLinkHost(selectedSubmission.submissionLink) : '';
  const selectedSubmissionStatus = selectedSubmission?.status ?? 'pending';
  const isSelectedApproved = selectedSubmissionStatus === 'approved';
  const isSelectedChangesRequested = selectedSubmissionStatus === 'rejected' || selectedSubmissionStatus === 'changes_requested';
  const canReviewSelectedSubmission = Boolean(selectedSubmission) && !isSelectedApproved && !isSelectedChangesRequested;

  useEffect(() => {
    if (!reviewToast) return;
    const timeout = window.setTimeout(() => setReviewToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [reviewToast]);

  const handleSubmitReview = async (decision: 'approve' | 'reject') => {
    setFormError(null);
    setReviewDecision(decision);
    if (!selectedSubmission) { setFormError('Please select a submission'); return; }
    if (decision === 'reject' && !feedbackNotes.trim()) { setFormError('Tell the creator what needs to change before requesting changes'); return; }
    const reviewStatus = decision === 'approve' ? 'approved' : 'rejected';
    const reviewedAt = new Date().toISOString();
    setIsSaving(true);
    const reviewResult = await supabase.from('reviews').insert({ submission_id: selectedSubmission.id, approved: reviewStatus === 'approved', feedback_notes: feedbackNotes.trim(), reviewed_at: reviewedAt });
    if (reviewResult.error) { setFormError(reviewResult.error.message); setIsSaving(false); return; }
    const submissionUpdateResult = await supabase.from('submissions').update({ status: reviewStatus }).eq('id', selectedSubmission.id);
    if (submissionUpdateResult.error) { setFormError(submissionUpdateResult.error.message); setIsSaving(false); return; }
    const createdReview: SupabaseRow = { id: `local-${selectedSubmission.id}-${reviewedAt}`, submission_id: selectedSubmission.id, approved: reviewStatus === 'approved', feedback_notes: feedbackNotes.trim(), reviewed_at: reviewedAt };
    setSubmissions((current) => current.map((s) => toText(s.id) === selectedSubmission.id ? { ...s, status: reviewStatus } : s));
    setReviews((current) => [createdReview, ...current]);
    await fetchReviewData();
    setReviewDecision(null);
    setFeedbackNotes('');
    setIsSaving(false);
    setReviewToast(reviewStatus === 'approved' ? 'Submission approved' : 'Feedback sent to creator');
  };

  const handleViewReport = () => {
    if (!selectedSubmission) return;
    router.push(`/reports?campaign=${encodeURIComponent(selectedSubmission.campaignId)}`);
  };

  const handleExportReport = async () => {
    if (!selectedSubmission) return;
    setIsExportingReport(true);
    setFormError(null);
    try {
      const reportData = await getCampaignReportExportData(selectedSubmission.campaignId);
      downloadCampaignReportPdf(reportData);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to export report. Please try again.');
    } finally {
      setIsExportingReport(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <p className="text-sm text-muted-foreground">
          {pendingReviewCount} pending review{pendingReviewCount === 1 ? '' : 's'}
        </p>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-end">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-full bg-card md:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Changes Requested</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
        <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search creators..." className="h-9 bg-card pl-9" />
      </div>

      {isLoading && (
        <Card className="p-6 text-center bg-card border-border">
          <p className="text-muted-foreground">Loading submissions...</p>
        </Card>
      )}

      {errorMessage && (
        <Card className="p-6 text-center bg-card border-border">
          <p className="text-red-500 mb-2">Unable to load submissions</p>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
        </Card>
      )}

      {!isLoading && !errorMessage && campaignSubmissions.length === 0 && (
        <Card className="p-6 text-center bg-card border-border">
          <p className="text-muted-foreground mb-2">No submissions yet</p>
          <p className="text-sm text-muted-foreground">Creator submissions will appear here once they are submitted.</p>
        </Card>
      )}

      {!isLoading && !errorMessage && campaignSubmissions.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card/30">
          <div className="overflow-x-auto">
            <Table className="min-w-[580px]">
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-muted/40">
                  <TableHead>Creator</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Submission Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Preview</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubmissions.length > 0 ? (
                  filteredSubmissions.map((submission) => {
                    const platform = getSubmissionPlatform(submission.submissionLink);
                    const previewKind = getPreviewKind(submission.submissionLink);
                    return (
                      <TableRow key={submission.id} className="cursor-pointer border-border hover:bg-muted/35"
                        onClick={() => { setSelectedSubmissionId(submission.id); setReviewDecision(null); setFeedbackNotes(''); setFormError(null); setDetailOpen(true); }}>
                        <TableCell><p className="font-medium text-foreground">{submission.creatorReference}</p></TableCell>
                        <TableCell><Badge variant="outline">{platform}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(submission.submittedAt)}</TableCell>
                        <TableCell><StatusBadge status={submission.status} /></TableCell>
                        <TableCell>
                          <div className="flex h-12 w-16 items-center justify-center overflow-hidden rounded-md border border-border bg-background/60">
                            {previewKind === 'image' ? <img src={submission.submissionLink} alt="" className="h-full w-full object-cover" /> : <Play size={16} className="text-muted-foreground" />}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">No submissions match your filters.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Sheet open={detailOpen && Boolean(selectedSubmission)} onOpenChange={setDetailOpen}>
        <SheetContent className="w-full overflow-y-auto border-border bg-background sm:max-w-2xl">
          {selectedSubmission && (
            <>
              <SheetHeader className="border-b border-border px-5 py-4">
                <div className="flex items-start justify-between gap-4 pr-8">
                  <div>
                    <SheetTitle>{selectedSubmission.creatorReference}</SheetTitle>
                    <SheetDescription>{selectedPlatform} • {formatDate(selectedSubmission.submittedAt)}</SheetDescription>
                  </div>
                  <StatusBadge status={selectedSubmission.status} />
                </div>
              </SheetHeader>
              <div className="space-y-4 px-5 py-4">
                <a href={selectedSubmission.submissionLink || undefined} target="_blank" rel="noreferrer"
                  className={`group block overflow-hidden rounded-2xl border border-border bg-card/50 transition ${selectedSubmission.submissionLink ? 'hover:border-primary/40 hover:bg-muted/30' : 'pointer-events-none opacity-70'}`}>
                  <div className="grid gap-0 sm:grid-cols-[15rem_1fr] sm:items-stretch">
                    <div className="relative aspect-video overflow-hidden bg-muted sm:aspect-auto sm:h-full sm:min-h-40">
                      {selectedPreviewKind === 'image' ? (
                        <img src={selectedSubmission.submissionLink} alt="" className="h-full w-full object-cover" />
                      ) : selectedPreviewKind === 'youtube' && selectedYouTubeThumbnailUrl ? (
                        <img src={selectedYouTubeThumbnailUrl} alt="" className="h-full w-full object-cover" />
                      ) : selectedPreviewKind === 'video' ? (
                        <video src={selectedSubmission.submissionLink} className="h-full w-full bg-black object-cover" muted playsInline />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-blue-50 text-primary"><Play size={30} fill="currentColor" /></div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-100 transition group-hover:bg-black/20">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-primary shadow-sm"><Play size={20} fill="currentColor" /></span>
                      </div>
                    </div>
                    <div className="min-w-0 p-4">
                      <p className="text-sm font-medium text-muted-foreground">{selectedLinkHost || selectedPlatform}</p>
                      <p className="mt-1 text-lg font-semibold">{selectedSubmission.submissionLink ? `${selectedPlatform} preview` : 'No content link provided'}</p>
                      <p className="mt-2 break-all text-sm text-muted-foreground">{selectedSubmission.submissionLink || 'Waiting for a creator link'}</p>
                      {selectedSubmission.submissionLink && (
                        <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm">Open content <ExternalLink size={14} /></span>
                      )}
                    </div>
                  </div>
                </a>
                <div className="border-t border-border pt-4">
                  <p className="text-sm font-medium">Notes</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{selectedSubmission.note || 'None'}</p>
                </div>
                <div className="space-y-3 border-t border-border pt-4">
                  {canReviewSelectedSubmission && (
                    <>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button onClick={() => handleSubmitReview('approve')} className="flex-1 gap-2 bg-green-600 text-white hover:bg-green-700" disabled={isSaving}>
                          <CheckCircle2 size={18} />
                          {isSaving && reviewDecision === 'approve' ? 'Approving...' : 'Approve'}
                        </Button>
                        <Button variant="outline" onClick={() => { if (reviewDecision !== 'reject') { setReviewDecision('reject'); setFormError(null); return; } handleSubmitReview('reject'); }} className="flex-1 gap-2" disabled={isSaving}>
                          <XCircle size={18} />
                          {isSaving && reviewDecision === 'reject' ? 'Sending...' : 'Request Changes'}
                        </Button>
                      </div>
                      {reviewDecision === 'reject' && (
                        <Textarea placeholder="What should change?" value={feedbackNotes} onChange={(e) => setFeedbackNotes(e.target.value)} className="min-h-24 bg-card" disabled={isSaving} />
                      )}
                    </>
                  )}
                  {isSelectedApproved && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm text-green-700">
                        <CheckCircle2 size={17} /><span className="font-medium">Approved. Report actions are ready.</span>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Button variant="outline" className="flex-1 gap-2" onClick={handleViewReport} disabled={isExportingReport}>
                          <FileText size={17} />View Report
                        </Button>
                        <Button className="flex-1 gap-2" onClick={handleExportReport} disabled={isExportingReport}>
                          <FileDown size={17} />{isExportingReport ? 'Exporting...' : 'Export PDF'}
                        </Button>
                      </div>
                    </div>
                  )}
                  {isSelectedChangesRequested && (
                    <div className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700">
                      <XCircle size={17} /><span className="font-medium">Waiting for creator resubmission</span>
                    </div>
                  )}
                  {formError && (
                    <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                      <p className="text-sm text-red-500">{formError}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {reviewToast && (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-border bg-card px-4 py-3 text-sm text-green-500 shadow-lg">
          {reviewToast}
        </div>
      )}
    </div>
  );
}
