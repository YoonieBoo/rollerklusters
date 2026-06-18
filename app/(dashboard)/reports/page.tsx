'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  ExternalLink,
  FileDown,
  Play,
} from 'lucide-react';

type SupabaseRow = Record<string, unknown>;

type SupabaseError = {
  message: string;
  code?: string;
};

type CampaignReportView = {
  id: string;
  campaignId: string;
  campaignName: string;
  clientName: string;
  status: string;
  summary: string;
  deliveredContent: string;
  pendingIssues: string;
  keyNotes: string;
  finalText: string;
  approvedCount: number;
  rejectedCount: number;
  submissionsCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  raw: SupabaseRow | null;
};

type CreatorSubmissionView = {
  id: string;
  creator: string;
  platform: string;
  link: string;
  status: string;
  submittedAt: string | null;
  views: string;
  likes: string;
  previewKind: 'image' | 'video' | 'link';
};

type PdfLine = {
  text: string;
  size?: number;
  bold?: boolean;
  color?: [number, number, number];
  gap?: number;
};

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

const getFirstText = (row: SupabaseRow | null, keys: string[]) => {
  if (!row) {
    return '';
  }

  for (const key of keys) {
    const value = toText(row[key]);

    if (value) {
      return value;
    }
  }

  return '';
};

const getReviewStatus = (row: SupabaseRow) =>
  typeof row.approved === 'boolean'
    ? row.approved
      ? 'approved'
      : 'rejected'
    : toText(row.status).toLowerCase();

const getSubmissionCreator = (submission: SupabaseRow) =>
  toText(submission.creator_ref) ||
  toText(submission.creator_name) ||
  toText(submission.creator_reference) ||
  toText(submission.creatorReference) ||
  'Unknown creator';

const getSubmissionLink = (submission: SupabaseRow) => toText(submission.submission_link);

const getSubmissionPlatform = (link: string) => {
  const normalizedLink = link.toLowerCase();

  if (normalizedLink.includes('tiktok')) {
    return 'TikTok';
  }

  if (normalizedLink.includes('instagram')) {
    return 'Instagram';
  }

  if (normalizedLink.includes('youtube') || normalizedLink.includes('youtu.be')) {
    return 'YouTube';
  }

  return 'Social';
};

const getPreviewKind = (link: string): CreatorSubmissionView['previewKind'] => {
  const normalizedLink = link.toLowerCase();

  if (/\.(png|jpe?g|webp|gif)(\?.*)?$/.test(normalizedLink)) {
    return 'image';
  }

  if (/\.(mp4|webm|mov)(\?.*)?$/.test(normalizedLink)) {
    return 'video';
  }

  return 'link';
};

const getMetricText = (row: SupabaseRow, keys: string[]) => {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === 'number') {
      return Intl.NumberFormat('en', { notation: 'compact' }).format(value);
    }

    const textValue = toText(value);

    if (textValue) {
      return textValue;
    }
  }

  return 'Not added';
};

const getStatusStyles = (status: string) => {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === 'approved') {
    return 'border-green-500/25 bg-green-500/10 text-green-500';
  }

  if (normalizedStatus === 'rejected') {
    return 'border-red-500/25 bg-red-500/10 text-red-500';
  }

  return 'border-yellow-500/25 bg-yellow-500/10 text-yellow-500';
};

const getStatusLabel = (status: string) => {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === 'approved') {
    return 'Approved';
  }

  if (normalizedStatus === 'rejected') {
    return 'Rejected';
  }

  return 'Pending';
};

const isMissingRelationError = (error: SupabaseError | null) =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  error?.message?.toLowerCase().includes('could not find the table');

const cleanPdfText = (text: string) =>
  text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[•]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');

const escapePdfText = (text: string) =>
  cleanPdfText(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const wrapPdfText = (text: string, maxCharacters: number) => {
  const words = cleanPdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxCharacters && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      return;
    }

    currentLine = nextLine;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
};

const buildPdfBlob = (pages: string[]) => {
  const encoder = new TextEncoder();
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  const pageObjectNumbers: number[] = [];

  pages.forEach((pageContent) => {
    const contentObjectNumber = objects.length + 1;
    const pageObjectNumber = objects.length + 2;
    const contentLength = encoder.encode(pageContent).length;

    objects.push(`<< /Length ${contentLength} >>\nstream\n${pageContent}\nendstream`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    );
    pageObjectNumbers.push(pageObjectNumber);
  });

  objects[1] =
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((objectNumber) => `${objectNumber} 0 R`).join(' ')}] /Count ${pageObjectNumbers.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
};

const createCampaignReportPdf = ({
  report,
  submissions,
  pendingCount,
  totalCreators,
  campaignStatus,
}: {
  report: CampaignReportView;
  submissions: CreatorSubmissionView[];
  pendingCount: number;
  totalCreators: number;
  campaignStatus: string;
}) => {
  const pageWidth = 595;
  const marginX = 48;
  const bottomMargin = 56;
  let cursorY = 790;
  let currentPage = '';
  const pages: string[] = [];

  const addRaw = (content: string) => {
    currentPage += `${content}\n`;
  };

  const startPage = () => {
    currentPage = '';
    cursorY = 790;
    addRaw('1 1 1 rg 0 0 595 842 re f');
    addPdfText('RollerKluster Campaign Report', 48, 806, 12, true, [0.08, 0.08, 0.08]);
    addPdfText(formatDate(new Date().toISOString()), 470, 806, 9, false, [0.42, 0.42, 0.42]);
    addRaw(`0.90 0.90 0.90 RG ${marginX} 784 m ${pageWidth - marginX} 784 l S`);
    cursorY = 748;
  };

  const finishPage = () => {
    addPdfText('Generated by RollerKluster Operations Platform', marginX, 28, 8, false, [
      0.48,
      0.48,
      0.48,
    ]);
    pages.push(currentPage);
  };

  const ensureSpace = (heightNeeded: number) => {
    if (cursorY - heightNeeded >= bottomMargin) {
      return;
    }

    finishPage();
    startPage();
  };

  function addPdfText(
    text: string,
    x: number,
    y: number,
    size = 10,
    bold = false,
    color: [number, number, number] = [0.12, 0.12, 0.12]
  ) {
    addRaw(
      `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color.join(' ')} rg 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`
    );
  }

  const addWrapped = (
    text: string,
    options: Omit<PdfLine, 'text'> & { maxCharacters?: number } = {}
  ) => {
    const size = options.size ?? 10;
    const lineHeight = Math.max(size + 5, 13);
    const lines = cleanPdfText(text)
      .split(/\n+/)
      .flatMap((line) => wrapPdfText(line, options.maxCharacters ?? 84));

    ensureSpace(lines.length * lineHeight + (options.gap ?? 8));
    lines.forEach((line) => {
      addPdfText(line, marginX, cursorY, size, options.bold, options.color);
      cursorY -= lineHeight;
    });
    cursorY -= options.gap ?? 8;
  };

  const addSectionTitle = (title: string) => {
    ensureSpace(34);
    addPdfText(title, marginX, cursorY, 14, true, [0.08, 0.08, 0.08]);
    cursorY -= 14;
    addRaw(`0.86 0.86 0.86 RG ${marginX} ${cursorY} m ${pageWidth - marginX} ${cursorY} l S`);
    cursorY -= 18;
  };

  const addSummaryRow = (items: Array<{ label: string; value: string }>) => {
    ensureSpace(70);
    const columnWidth = (pageWidth - marginX * 2) / items.length;

    addRaw(`0.86 0.86 0.86 RG ${marginX} ${cursorY} m ${pageWidth - marginX} ${cursorY} l S`);
    items.forEach((item, index) => {
      const x = marginX + columnWidth * index;

      addPdfText(item.label, x, cursorY - 20, 8, false, [0.45, 0.45, 0.45]);
      addPdfText(item.value, x, cursorY - 42, 14, true, [0.08, 0.08, 0.08]);

      if (index > 0) {
        addRaw(`0.90 0.90 0.90 RG ${x - 12} ${cursorY - 52} m ${x - 12} ${cursorY - 10} l S`);
      }
    });
    addRaw(`0.86 0.86 0.86 RG ${marginX} ${cursorY - 62} m ${pageWidth - marginX} ${cursorY - 62} l S`);
    cursorY -= 86;
  };

  startPage();
  addWrapped(report.campaignName, {
    size: 24,
    bold: true,
    color: [0.06, 0.06, 0.06],
    maxCharacters: 34,
    gap: 4,
  });
  addWrapped(`${report.clientName} - ${campaignStatus.replace(/_/g, ' ')}`, {
    size: 11,
    color: [0.42, 0.42, 0.42],
    gap: 18,
  });

  addSectionTitle('Performance summary');
  addSummaryRow([
    { label: 'Submissions', value: String(report.submissionsCount) },
    { label: 'Approved', value: String(report.approvedCount) },
    { label: 'Changes', value: String(report.rejectedCount) },
    { label: 'Pending', value: String(pendingCount) },
    { label: 'Creators', value: String(totalCreators) },
  ]);

  addSectionTitle('Final summary');
  addWrapped(`Campaign result: ${report.summary || 'No campaign result has been added yet.'}`);
  addWrapped(`Key notes: ${report.keyNotes || 'No key notes have been added yet.'}`);
  addWrapped(`Issues: ${report.pendingIssues || 'No issues reported.'}`);

  addSectionTitle('Approved creator content');
  if (submissions.length === 0) {
    addWrapped('No approved creator content yet.', { color: [0.65, 0.65, 0.65] });
  } else {
    submissions.forEach((submission, index) => {
      ensureSpace(78);
      addPdfText(`${index + 1}. ${submission.creator}`, marginX, cursorY, 12, true, [
        0.08,
        0.08,
        0.08,
      ]);
      addPdfText(
        `${submission.platform} - ${getStatusLabel(submission.status)} - ${formatDate(submission.submittedAt)}`,
        marginX,
        cursorY - 17,
        9,
        false,
        [0.42, 0.42, 0.42]
      );
      addPdfText(
        `Views: ${submission.views}    Likes: ${submission.likes}`,
        marginX,
        cursorY - 32,
        9,
        false,
        [0.28, 0.28, 0.28]
      );
      addWrapped(submission.link || 'No content link provided', {
        size: 8,
        color: [0.48, 0.62, 1],
        maxCharacters: 95,
        gap: 8,
      });
    });
  }

  finishPage();
  return buildPdfBlob(pages);
};

export default function ReportsPage() {
  const [campaigns, setCampaigns] = useState<SupabaseRow[]>([]);
  const [briefs, setBriefs] = useState<SupabaseRow[]>([]);
  const [submissions, setSubmissions] = useState<SupabaseRow[]>([]);
  const [reviews, setReviews] = useState<SupabaseRow[]>([]);
  const [reports, setReports] = useState<SupabaseRow[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [isCampaignLocked, setIsCampaignLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const fetchReports = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const queryCampaignId =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('campaign')
        : null;
    setIsCampaignLocked(Boolean(queryCampaignId));

    const [campaignsResult, reportsResult, briefsResult, submissionsResult, reviewsResult] =
      await Promise.all([
        supabase.from('campaigns').select('*'),
        supabase.from('reports').select('*'),
        supabase.from('briefs').select('*'),
        supabase.from('submissions').select('*'),
        supabase.from('reviews').select('*'),
      ]);

    const submissionsMissing = isMissingRelationError(submissionsResult.error);
    const reviewsMissing = isMissingRelationError(reviewsResult.error);
    const fetchError =
      campaignsResult.error ||
      reportsResult.error ||
      briefsResult.error ||
      (submissionsMissing ? null : submissionsResult.error) ||
      (reviewsMissing ? null : reviewsResult.error);

    if (fetchError) {
      setErrorMessage(fetchError.message);
      setCampaigns([]);
      setReports([]);
      setBriefs([]);
      setSubmissions([]);
      setReviews([]);
      setIsLoading(false);
      return;
    }

    const campaignRows = (campaignsResult.data ?? []) as SupabaseRow[];

    setCampaigns(campaignRows);
    setReports((reportsResult.data ?? []) as SupabaseRow[]);
    setBriefs((briefsResult.data ?? []) as SupabaseRow[]);
    setSubmissions(submissionsMissing ? [] : ((submissionsResult.data ?? []) as SupabaseRow[]));
    setReviews(reviewsMissing ? [] : ((reviewsResult.data ?? []) as SupabaseRow[]));
    setSelectedCampaignId((currentCampaignId) => {
      if (queryCampaignId && campaignRows.some((campaign) => toText(campaign.id) === queryCampaignId)) {
        return queryCampaignId;
      }

      if (currentCampaignId) {
        return currentCampaignId;
      }

      return toText(campaignRows[0]?.id);
    });
    setIsLoading(false);
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const campaignReports = useMemo(() => {
    const latestReportsByCampaignId = new Map<string, SupabaseRow>();
    reports
      .slice()
      .sort((firstReport, secondReport) => {
        const firstDate = toDateValue(firstReport.updated_at ?? firstReport.created_at);
        const secondDate = toDateValue(secondReport.updated_at ?? secondReport.created_at);
        const firstTime = firstDate ? new Date(firstDate).getTime() : 0;
        const secondTime = secondDate ? new Date(secondDate).getTime() : 0;

        return secondTime - firstTime;
      })
      .forEach((report) => {
        const campaignId = toText(report.campaign_id);

        if (campaignId && !latestReportsByCampaignId.has(campaignId)) {
          latestReportsByCampaignId.set(campaignId, report);
        }
      });

    const briefsByCampaignId = new Map(
      briefs.map((brief) => [toText(brief.campaign_id), brief])
    );
    const submissionsByCampaignId = new Map<string, SupabaseRow[]>();
    submissions.forEach((submission) => {
      const campaignId = toText(submission.campaign_id);

      if (!submissionsByCampaignId.has(campaignId)) {
        submissionsByCampaignId.set(campaignId, []);
      }

      submissionsByCampaignId.get(campaignId)?.push(submission);
    });

    const reviewsBySubmissionId = new Map<string, SupabaseRow[]>();
    reviews.forEach((review) => {
      const submissionId = toText(review.submission_id);

      if (!reviewsBySubmissionId.has(submissionId)) {
        reviewsBySubmissionId.set(submissionId, []);
      }

      reviewsBySubmissionId.get(submissionId)?.push(review);
    });

    return campaigns.map((campaign): CampaignReportView => {
      const campaignId = toText(campaign.id);
      const report = latestReportsByCampaignId.get(campaignId) ?? null;
      const campaignSubmissions = submissionsByCampaignId.get(campaignId) ?? [];
      const campaignBrief = briefsByCampaignId.get(campaignId);
      const reviewedSubmissions = campaignSubmissions.map((submission) => {
        const latestReview = (reviewsBySubmissionId.get(toText(submission.id)) ?? [])
          .slice()
          .sort((firstReview, secondReview) => {
            const firstDate = toDateValue(
              firstReview.reviewed_at ?? firstReview.updated_at ?? firstReview.created_at
            );
            const secondDate = toDateValue(
              secondReview.reviewed_at ?? secondReview.updated_at ?? secondReview.created_at
            );
            const firstTime = firstDate ? new Date(firstDate).getTime() : 0;
            const secondTime = secondDate ? new Date(secondDate).getTime() : 0;

            return secondTime - firstTime;
          })[0];

        return {
          submission,
          status: getReviewStatus(latestReview ?? {}) || getReviewStatus(submission),
          feedback: toText(latestReview?.feedback_notes),
        };
      });
      const approvedSubmissions = reviewedSubmissions.filter(
        (submission) => submission.status === 'approved'
      );
      const rejectedSubmissions = reviewedSubmissions.filter(
        (submission) => submission.status === 'rejected'
      );
      const generatedSummary = [
        `Campaign: ${toText(campaign.name) || 'Untitled campaign'}`,
        `Client: ${toText(campaign.client_name) || toText(campaign.client) || 'N/A'}`,
        `Campaign status: ${toText(campaign.status) || 'draft'}`,
        `Brief status: ${toText(campaignBrief?.status) || (campaignBrief ? 'linked' : 'missing')}`,
        `Submissions: ${campaignSubmissions.length}`,
        `Approved: ${approvedSubmissions.length}`,
        `Rejected: ${rejectedSubmissions.length}`,
      ].join('\n');
      const generatedApprovedContent =
        approvedSubmissions
          .map(({ submission }) => {
            const link = getSubmissionLink(submission);

            return `${getSubmissionCreator(submission)}${link ? ` - ${link}` : ''}`;
          })
          .join('\n') || 'No approved content yet';
      const generatedPendingIssues =
        rejectedSubmissions
          .map(({ submission, feedback }) => {
            const note = feedback ? `: ${feedback}` : '';

            return `${getSubmissionCreator(submission)}${note}`;
          })
          .join('\n') || 'No rejected or pending issues';

      return {
        id: toText(report?.id),
        campaignId,
        campaignName: toText(campaign.name) || 'Untitled campaign',
        clientName: toText(campaign.client_name) || toText(campaign.client) || 'N/A',
        status: toText(report?.status) || 'draft',
        summary: getFirstText(report, ['campaign_summary']) || generatedSummary,
        deliveredContent: getFirstText(report, ['delivered_content']) || generatedApprovedContent,
        pendingIssues:
          getFirstText(report, ['pending_issues']) || generatedPendingIssues,
        keyNotes:
          getFirstText(report, ['key_notes']) ||
          'Add final notes and observations for this campaign.',
        finalText:
          getFirstText(report, ['final_text']) ||
          `${generatedSummary}\n\nDelivered content:\n${generatedApprovedContent}\n\nPending issues:\n${generatedPendingIssues}`,
        approvedCount: approvedSubmissions.length,
        rejectedCount: rejectedSubmissions.length,
        submissionsCount: campaignSubmissions.length,
        createdAt: toDateValue(report?.created_at),
        updatedAt: toDateValue(report?.updated_at),
        raw: report,
      };
    });
  }, [briefs, campaigns, reports, reviews, submissions]);

  const selectedReport = campaignReports.find(
    (report) => report.campaignId === selectedCampaignId
  );
  const selectedCampaign = campaigns.find(
    (campaign) => toText(campaign.id) === selectedCampaignId
  );
  const selectedSubmissions = useMemo(() => {
    const reviewsBySubmissionId = new Map<string, SupabaseRow[]>();
    reviews.forEach((review) => {
      const submissionId = toText(review.submission_id);

      if (!reviewsBySubmissionId.has(submissionId)) {
        reviewsBySubmissionId.set(submissionId, []);
      }

      reviewsBySubmissionId.get(submissionId)?.push(review);
    });

    return submissions
      .filter((submission) => toText(submission.campaign_id) === selectedCampaignId)
      .map((submission): CreatorSubmissionView => {
        const submissionId = toText(submission.id);
        const link = getSubmissionLink(submission);
        const latestReview = (reviewsBySubmissionId.get(submissionId) ?? [])
          .slice()
          .sort((firstReview, secondReview) => {
            const firstDate = toDateValue(firstReview.reviewed_at ?? firstReview.created_at);
            const secondDate = toDateValue(secondReview.reviewed_at ?? secondReview.created_at);
            const firstTime = firstDate ? new Date(firstDate).getTime() : 0;
            const secondTime = secondDate ? new Date(secondDate).getTime() : 0;

            return secondTime - firstTime;
          })[0];
        const status =
          getReviewStatus(latestReview ?? {}) ||
          getReviewStatus(submission) ||
          'pending';

        return {
          id: submissionId,
          creator: getSubmissionCreator(submission),
          platform: getSubmissionPlatform(link),
          link,
          status,
          submittedAt: toDateValue(submission.submitted_at),
          views: getMetricText(submission, ['views', 'view_count', 'total_views']),
          likes: getMetricText(submission, ['likes', 'like_count', 'total_likes']),
          previewKind: getPreviewKind(link),
        };
      });
  }, [reviews, selectedCampaignId, submissions]);
  const pendingCount = selectedSubmissions.filter(
    (submission) => !['approved', 'rejected'].includes(submission.status)
  ).length;
  const totalCreators = new Set(
    selectedSubmissions.map((submission) => submission.creator.toLowerCase())
  ).size;
  const approvedSubmissions = selectedSubmissions.filter(
    (submission) => submission.status === 'approved'
  );
  const campaignStatus = toText(selectedCampaign?.status) || selectedReport?.status || 'draft';

  const handleExportPdf = async () => {
    if (!selectedReport) {
      return;
    }

    setIsExportingPdf(true);
    setExportError(null);

    try {
      const pdfBlob = createCampaignReportPdf({
        report: selectedReport,
        submissions: approvedSubmissions,
        pendingCount,
        totalCreators,
        campaignStatus,
      });
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const element = document.createElement('a');
      element.href = pdfUrl;
      element.download = `campaign-report-${selectedReport.campaignName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}.pdf`;
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      URL.revokeObjectURL(pdfUrl);
    } catch (error) {
      console.error('PDF export error:', error);
      setExportError('Unable to export PDF. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Campaign Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A clean final recap of campaign performance and approved creator content
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {!isCampaignLocked && (
            <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
              <SelectTrigger className="h-9 w-full bg-card border-border sm:w-64">
                <SelectValue placeholder="Choose campaign" />
              </SelectTrigger>
              <SelectContent>
                {campaignReports.map((report) => (
                  <SelectItem key={report.campaignId} value={report.campaignId}>
                    {report.campaignName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            className="h-9 gap-2"
            onClick={handleExportPdf}
            disabled={!selectedReport || isExportingPdf}
          >
            <FileDown size={16} />
            {isExportingPdf ? 'Exporting...' : 'Export PDF'}
          </Button>
        </div>
      </div>

      {exportError && (
        <p className="text-sm text-red-500">{exportError}</p>
      )}

      {isLoading && (
        <div className="rounded-lg border border-border bg-card/35 p-6 text-center">
          <p className="text-sm text-muted-foreground">Loading reports...</p>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-lg border border-border bg-card/35 p-6 text-center">
          <p className="text-red-500 mb-2">Unable to load reports</p>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
        </div>
      )}

      {!isLoading && !errorMessage && campaignReports.length === 0 && (
        <div className="rounded-lg border border-border bg-card/35 p-6 text-center">
          <p className="text-muted-foreground mb-2">No campaigns found</p>
          <p className="text-sm text-muted-foreground">
            Create a campaign before generating campaign reports.
          </p>
        </div>
      )}

      {!isLoading && !errorMessage && selectedReport && (
        <div className="space-y-7 rounded-xl border border-border bg-card/25 px-6 py-6">
          <section className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Campaign</p>
                <h2 className="mt-1 text-3xl font-semibold">{selectedReport.campaignName}</h2>
              </div>
              <Badge className={`${getStatusStyles(campaignStatus)} border`}>
                {campaignStatus.replace(/_/g, ' ')}
              </Badge>
            </div>
            <div className="grid gap-4 border-y border-border py-4 text-sm md:grid-cols-3">
              <div>
                <p className="text-muted-foreground">Brand / Company</p>
                <p className="mt-1 font-medium">{selectedReport.clientName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Campaign status</p>
                <p className="mt-1 font-medium capitalize">{campaignStatus.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Last updated</p>
                <p className="mt-1 font-medium">{formatDate(selectedReport.updatedAt)}</p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="text-lg font-semibold">Performance Summary</h3>
              <p className="text-sm text-muted-foreground">
                The campaign result at a glance.
              </p>
            </div>
            <div className="grid gap-0 overflow-hidden rounded-lg border border-border md:grid-cols-5">
              {[
                ['Total submissions', selectedReport.submissionsCount],
                ['Approved', selectedReport.approvedCount],
                ['Changes requested', selectedReport.rejectedCount],
                ['Pending', pendingCount],
                ['Creators', totalCreators],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="border-b border-border px-4 py-3 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
                >
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Creator Content Summary</h3>
                <p className="text-sm text-muted-foreground">
                  Approved content included in the final campaign recap.
                </p>
              </div>
            </div>

            {approvedSubmissions.length > 0 ? (
              <div className="divide-y divide-border rounded-lg border border-border">
                {approvedSubmissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="grid gap-4 px-4 py-4 transition hover:bg-muted/20 md:grid-cols-[96px_1fr_auto]"
                  >
                    <div className="relative flex h-20 w-24 items-center justify-center overflow-hidden rounded-md bg-muted/40">
                      {submission.previewKind === 'image' ? (
                        <img
                          src={submission.link}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : submission.previewKind === 'video' ? (
                        <video
                          src={submission.link}
                          className="h-full w-full object-cover"
                          muted
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Play size={16} fill="currentColor" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{submission.creator}</p>
                        <Badge variant="outline">{submission.platform}</Badge>
                        <Badge className={`${getStatusStyles(submission.status)} border`}>
                          {getStatusLabel(submission.status)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Submitted {formatDate(submission.submittedAt)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Views: {submission.views} · Likes: {submission.likes}
                      </p>
                    </div>

                    <div className="flex items-center md:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        asChild
                        disabled={!submission.link}
                      >
                        <a
                          href={submission.link || undefined}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Preview content <ExternalLink size={14} />
                        </a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border p-6 text-center">
                <p className="text-muted-foreground">No approved creator content yet.</p>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Final Summary</h3>
              <p className="text-sm text-muted-foreground">
                A short recap of campaign result, notes, and issues.
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <div>
                <p className="text-sm font-medium">Campaign result</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                  {selectedReport.summary || 'No campaign result has been added yet.'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Key notes</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                  {selectedReport.keyNotes || 'No key notes have been added yet.'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium">Issues</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                  {selectedReport.pendingIssues || 'No issues reported.'}
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
