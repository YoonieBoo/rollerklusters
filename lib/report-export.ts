import { supabase } from '@/lib/supabase/client';

export type SupabaseRow = Record<string, unknown>;

export type CampaignReportView = {
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

export type CreatorSubmissionView = {
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

export const toText = (value: unknown): string => {
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

export const toDateValue = (value: unknown) => {
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

export const formatDate = (date: string | null) => {
  if (!date) {
    return 'N/A';
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'N/A';
  }

  return parsedDate.getDate() + '/' + (parsedDate.getMonth() + 1) + '/' + parsedDate.getFullYear();
};

export const getFirstText = (row: SupabaseRow | null, keys: string[]) => {
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

export const getReviewStatus = (row: SupabaseRow) =>
  typeof row.approved === 'boolean'
    ? row.approved
      ? 'approved'
      : 'rejected'
    : toText(row.status).toLowerCase();

export const getSubmissionCreator = (submission: SupabaseRow) =>
  toText(submission.creator_ref) ||
  toText(submission.creator_name) ||
  toText(submission.creator_reference) ||
  toText(submission.creatorReference) ||
  'Unknown creator';

export const getSubmissionLink = (submission: SupabaseRow) => toText(submission.submission_link);

export const getSubmissionPlatform = (link: string) => {
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

export const getPreviewKind = (link: string): CreatorSubmissionView['previewKind'] => {
  const normalizedLink = link.toLowerCase();

  if (/\.(png|jpe?g|webp|gif)(\?.*)?$/.test(normalizedLink)) {
    return 'image';
  }

  if (/\.(mp4|webm|mov)(\?.*)?$/.test(normalizedLink)) {
    return 'video';
  }

  return 'link';
};

export const getMetricText = (row: SupabaseRow, keys: string[]) => {
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

export const getStatusLabel = (status: string) => {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === 'approved') {
    return 'Approved';
  }

  if (normalizedStatus === 'rejected') {
    return 'Rejected';
  }

  return 'Pending';
};

const sortByNewestDate = (firstRow: SupabaseRow, secondRow: SupabaseRow) => {
  const firstDate = toDateValue(firstRow.updated_at ?? firstRow.created_at ?? firstRow.reviewed_at);
  const secondDate = toDateValue(secondRow.updated_at ?? secondRow.created_at ?? secondRow.reviewed_at);
  const firstTime = firstDate ? new Date(firstDate).getTime() : 0;
  const secondTime = secondDate ? new Date(secondDate).getTime() : 0;

  return secondTime - firstTime;
};

const getReviewedSubmissions = (submissions: SupabaseRow[], reviews: SupabaseRow[]) => {
  const reviewsBySubmissionId = new Map<string, SupabaseRow[]>();

  reviews.forEach((review) => {
    const submissionId = toText(review.submission_id);

    if (!reviewsBySubmissionId.has(submissionId)) {
      reviewsBySubmissionId.set(submissionId, []);
    }

    reviewsBySubmissionId.get(submissionId)?.push(review);
  });

  return submissions.map((submission) => {
    const latestReview = (reviewsBySubmissionId.get(toText(submission.id)) ?? [])
      .slice()
      .sort(sortByNewestDate)[0];

    return {
      submission,
      status: getReviewStatus(latestReview ?? {}) || getReviewStatus(submission) || 'pending',
      feedback: toText(latestReview?.feedback_notes),
    };
  });
};

export const buildCampaignReportView = ({
  campaign,
  report,
  brief,
  submissions,
  reviews,
}: {
  campaign: SupabaseRow;
  report: SupabaseRow | null;
  brief?: SupabaseRow;
  submissions: SupabaseRow[];
  reviews: SupabaseRow[];
}): CampaignReportView => {
  const campaignId = toText(campaign.id);
  const reviewedSubmissions = getReviewedSubmissions(submissions, reviews);
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
    `Brief status: ${toText(brief?.status) || (brief ? 'linked' : 'missing')}`,
    `Submissions: ${submissions.length}`,
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
    pendingIssues: getFirstText(report, ['pending_issues']) || generatedPendingIssues,
    keyNotes:
      getFirstText(report, ['key_notes']) ||
      'Add final notes and observations for this campaign.',
    finalText:
      getFirstText(report, ['final_text']) ||
      `${generatedSummary}\n\nDelivered content:\n${generatedApprovedContent}\n\nPending issues:\n${generatedPendingIssues}`,
    approvedCount: approvedSubmissions.length,
    rejectedCount: rejectedSubmissions.length,
    submissionsCount: submissions.length,
    createdAt: toDateValue(report?.created_at),
    updatedAt: toDateValue(report?.updated_at ?? campaign.updated_at),
    raw: report,
  };
};

export const buildCreatorSubmissionViews = (
  campaignId: string,
  submissions: SupabaseRow[],
  reviews: SupabaseRow[]
) =>
  getReviewedSubmissions(
    submissions.filter((submission) => toText(submission.campaign_id) === campaignId),
    reviews
  ).map(({ submission, status }): CreatorSubmissionView => {
    const link = getSubmissionLink(submission);

    return {
      id: toText(submission.id),
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

export const createCampaignReportPdf = ({
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
  const marginX = 44;
  const pageTop = 794;
  const bottomMargin = 54;
  const contentWidth = pageWidth - marginX * 2;
  const black: [number, number, number] = [0.08, 0.08, 0.08];
  const muted: [number, number, number] = [0.36, 0.36, 0.36];
  const lightLine: [number, number, number] = [0.86, 0.86, 0.86];
  let cursorY = pageTop;
  let currentPage = '';
  const pages: string[] = [];

  const addRaw = (content: string) => {
    currentPage += `${content}\n`;
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

  const addLine = (
    x1: number,
    y: number,
    x2: number,
    color: [number, number, number] = lightLine
  ) => {
    addRaw(`${color.join(' ')} RG ${x1} ${y} m ${x2} ${y} l S`);
  };

  const startPage = () => {
    currentPage = '';
    cursorY = pageTop;
    addRaw('1 1 1 rg 0 0 595 842 re f');
  };

  const finishPage = () => {
    addLine(marginX, 38, pageWidth - marginX, [0.90, 0.90, 0.90]);
    addPdfText('RollerKluster Campaign Report', marginX, 24, 8, false, [0.46, 0.46, 0.46]);
    pages.push(currentPage);
  };

  const ensureSpace = (heightNeeded: number) => {
    if (cursorY - heightNeeded >= bottomMargin) {
      return;
    }

    finishPage();
    startPage();
  };

  const addWrappedAt = (
    text: string,
    x: number,
    maxCharacters: number,
    options: {
      size?: number;
      bold?: boolean;
      color?: [number, number, number];
      gap?: number;
      lineHeight?: number;
    } = {}
  ) => {
    const size = options.size ?? 10;
    const lineHeight = options.lineHeight ?? Math.max(size + 5, 13);
    const lines = cleanPdfText(text)
      .split(/\n+/)
      .flatMap((line) => wrapPdfText(line, maxCharacters));

    lines.forEach((line) => {
      ensureSpace(lineHeight + (options.gap ?? 8));
      addPdfText(line, x, cursorY, size, options.bold, options.color);
      cursorY -= lineHeight;
    });
    ensureSpace(options.gap ?? 8);
    cursorY -= options.gap ?? 8;
  };

  const addSectionHeading = (title: string) => {
    ensureSpace(38);
    addPdfText(title.toUpperCase(), marginX, cursorY, 11, true, black);
    cursorY -= 13;
    addLine(marginX, cursorY, pageWidth - marginX);
    cursorY -= 20;
  };

  const addHeader = () => {
    addPdfText('ROLLERKLUSTER CAMPAIGN REPORT', marginX, cursorY, 10, true, black);
    cursorY -= 30;
    addWrappedAt(report.campaignName, marginX, 48, {
      size: 25,
      bold: true,
      color: black,
      lineHeight: 30,
      gap: 12,
    });

    const generatedDate = formatDate(new Date().toISOString());
    const metadata = [
      ['Client', report.clientName],
      ['Status', campaignStatus.replace(/_/g, ' ') || report.status || 'draft'],
      ['Generated', generatedDate],
    ];
    const metaColumnWidth = contentWidth / metadata.length;

    ensureSpace(42);
    metadata.forEach(([label, value], index) => {
      const x = marginX + metaColumnWidth * index;

      addPdfText(label.toUpperCase(), x, cursorY, 7.5, true, muted);
      addPdfText(value || 'N/A', x, cursorY - 16, 10, false, black);
    });
    cursorY -= 42;
    addLine(marginX, cursorY, pageWidth - marginX);
    cursorY -= 34;
  };

  const addStatsRow = (items: Array<{ label: string; value: string }>) => {
    ensureSpace(58);
    const columnWidth = contentWidth / items.length;

    addLine(marginX, cursorY, pageWidth - marginX);
    items.forEach((item, index) => {
      const x = marginX + columnWidth * index;

      addPdfText(item.value, x, cursorY - 22, 18, true, black);
      addPdfText(item.label.toUpperCase(), x, cursorY - 39, 7.2, true, muted);

      if (index > 0) {
        addRaw(`0.91 0.91 0.91 RG ${x - 12} ${cursorY - 48} m ${x - 12} ${cursorY - 12} l S`);
      }
    });
    addLine(marginX, cursorY - 56, pageWidth - marginX);
    cursorY -= 86;
  };

  const addApprovedContentTable = () => {
    const columns = [
      { label: 'Creator', x: marginX, width: 116, characters: 18 },
      { label: 'Platform', x: marginX + 126, width: 68, characters: 11 },
      { label: 'Submission Date', x: marginX + 204, width: 86, characters: 15 },
      { label: 'Content Link', x: marginX + 300, width: 142, characters: 24 },
      { label: 'Status', x: marginX + 452, width: 55, characters: 10 },
    ];

    const addTableHeader = () => {
      ensureSpace(34);
      addRaw(`0.97 0.97 0.97 rg ${marginX} ${cursorY - 22} ${contentWidth} 28 re f`);
      columns.forEach((column) => {
        addPdfText(column.label.toUpperCase(), column.x, cursorY - 16, 7.4, true, muted);
      });
      cursorY -= 34;
    };

    const getContentLinkLabel = (submission: CreatorSubmissionView) => {
      if (!submission.link) {
        return 'No link provided';
      }

      const platform = submission.platform.toLowerCase();

      if (platform.includes('tiktok')) {
        return 'TikTok Submission';
      }

      if (platform.includes('instagram')) {
        return 'Instagram Submission';
      }

      if (platform.includes('youtube')) {
        return 'YouTube Submission';
      }

      return 'View Content';
    };

    const addLinkLabel = (text: string, x: number, y: number, maxWidth: number) => {
      const linkColor: [number, number, number] = [0.16, 0.32, 0.58];
      const label = wrapPdfText(text, 22)[0] || 'View Content';
      const underlineWidth = Math.min(label.length * 4.2, maxWidth);

      addPdfText(label, x, y, 8.5, false, linkColor);
      addLine(x, y - 3, x + underlineWidth, linkColor);
    };

    addTableHeader();

    if (submissions.length === 0) {
      ensureSpace(30);
      addPdfText('No approved content yet.', marginX, cursorY, 10, false, muted);
      cursorY -= 30;
      return;
    }

    submissions.forEach((submission) => {
      const rowHeight = 40;

      if (cursorY - (rowHeight + 8) < bottomMargin) {
        finishPage();
        startPage();
        addPdfText('APPROVED CONTENT', marginX, cursorY, 11, true, black);
        cursorY -= 22;
        addTableHeader();
      }

      addLine(marginX, cursorY, pageWidth - marginX, [0.91, 0.91, 0.91]);

      const rowTop = cursorY - 18;
      const rowValues = [
        wrapPdfText(submission.creator, columns[0].characters)[0] || '',
        wrapPdfText(submission.platform, columns[1].characters)[0] || '',
        formatDate(submission.submittedAt),
        '',
        getStatusLabel(submission.status),
      ];

      addPdfText(rowValues[0], columns[0].x, rowTop, 9, false, black);
      addPdfText(rowValues[1], columns[1].x, rowTop, 9, false, black);
      addPdfText(rowValues[2], columns[2].x, rowTop, 9, false, black);
      addLinkLabel(getContentLinkLabel(submission), columns[3].x, rowTop, columns[3].width - 8);
      addPdfText(rowValues[4], columns[4].x, rowTop, 9, false, black);
      cursorY -= rowHeight;
    });
    addLine(marginX, cursorY, pageWidth - marginX, [0.91, 0.91, 0.91]);
    cursorY -= 18;
  };

  const reportSummary = getFirstText(report.raw, ['campaign_summary']);
  const keyNotes = getFirstText(report.raw, ['key_notes']);
  const finalNotes = [
    reportSummary ||
      `This report summarizes approved creator content and review progress for ${report.campaignName}.`,
    keyNotes,
  ]
    .map((text) => cleanPdfText(text).trim())
    .filter(Boolean)
    .join('\n\n');

  startPage();
  addHeader();

  addSectionHeading('Performance Overview');
  addStatsRow([
    { label: 'Total submissions', value: String(report.submissionsCount) },
    { label: 'Approved content', value: String(report.approvedCount) },
    { label: 'Pending reviews', value: String(pendingCount) },
    { label: 'Changes requested', value: String(report.rejectedCount) },
    { label: 'Total creators', value: String(totalCreators) },
  ]);

  addSectionHeading('Approved Content');
  addApprovedContentTable();

  addSectionHeading('Final Notes');
  addWrappedAt(finalNotes || 'No final notes have been added yet.', marginX, 92, {
    size: 10,
    color: black,
    lineHeight: 15,
    gap: 0,
  });

  finishPage();
  return buildPdfBlob(pages);
};

export const downloadCampaignReportPdf = ({
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
  const pdfBlob = createCampaignReportPdf({
    report,
    submissions,
    pendingCount,
    totalCreators,
    campaignStatus,
  });
  const pdfUrl = URL.createObjectURL(pdfBlob);
  const element = document.createElement('a');

  element.href = pdfUrl;
  element.download = `campaign-report-${report.campaignName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.pdf`;
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(pdfUrl);
};

export const getCampaignReportExportData = async (campaignId: string) => {
  const [campaignResult, reportsResult, briefsResult, submissionsResult, reviewsResult] =
    await Promise.all([
      supabase.from('campaigns').select('*').eq('id', campaignId).maybeSingle(),
      supabase
        .from('reports')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('updated_at', { ascending: false }),
      supabase.from('briefs').select('*').eq('campaign_id', campaignId).maybeSingle(),
      supabase.from('submissions').select('*').eq('campaign_id', campaignId),
      supabase.from('reviews').select('*'),
    ]);

  const fetchError =
    campaignResult.error ||
    reportsResult.error ||
    briefsResult.error ||
    submissionsResult.error ||
    reviewsResult.error;

  if (fetchError) {
    throw fetchError;
  }

  if (!campaignResult.data) {
    throw new Error('Campaign not found');
  }

  const campaign = campaignResult.data as SupabaseRow;
  const report = ((reportsResult.data ?? []) as SupabaseRow[])[0] ?? null;
  const submissions = (submissionsResult.data ?? []) as SupabaseRow[];
  const reviews = (reviewsResult.data ?? []) as SupabaseRow[];
  const reportView = buildCampaignReportView({
    campaign,
    report,
    brief: (briefsResult.data ?? undefined) as SupabaseRow | undefined,
    submissions,
    reviews,
  });
  const submissionViews = buildCreatorSubmissionViews(campaignId, submissions, reviews);
  const approvedSubmissions = submissionViews.filter(
    (submission) => submission.status === 'approved'
  );
  const pendingCount = submissionViews.filter(
    (submission) => !['approved', 'rejected'].includes(submission.status)
  ).length;
  const totalCreators = new Set(
    submissionViews.map((submission) => submission.creator.toLowerCase())
  ).size;
  const campaignStatus = toText(campaign.status) || reportView.status || 'draft';

  return {
    report: reportView,
    submissions: approvedSubmissions,
    pendingCount,
    totalCreators,
    campaignStatus,
  };
};
