import { supabase } from '@/lib/supabase/client';

type SupabaseRow = Record<string, unknown>;

export type CreatorBriefDocument = {
  campaignId: string;
  briefId: string;
  campaignName: string;
  clientName: string;
  timeline: string;
  campaignGoal: string;
  targetAudience: string;
  contentDirection: string;
  platforms: string[];
  keyMessages: string[];
  brandRulesDo: string[];
  brandRulesDont: string[];
  hashtags: string[];
  mentions: string[];
  callToAction: string;
  submissionDeadline: string;
  approvalNotes: string;
  contactSupport: string;
  status: string;
  updatedAt: string | null;
};

export const toText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
};

export const toTextList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return [];
    }

    try {
      const parsedValue = JSON.parse(trimmedValue);

      if (Array.isArray(parsedValue)) {
        return parsedValue.map((item) => toText(item)).filter(Boolean);
      }
    } catch {
      return trimmedValue
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return [trimmedValue];
  }

  return [];
};

export const formatDate = (date: string | null) => {
  if (!date) {
    return 'To be confirmed';
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'To be confirmed';
  }

  return parsedDate.toLocaleDateString();
};

const getFirstText = (row: SupabaseRow | null | undefined, keys: string[]) => {
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

const getRawBriefObject = (brief: SupabaseRow | null | undefined) => {
  const rawBrief = toText(brief?.raw_brief);

  if (!rawBrief) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawBrief);

    return parsed && typeof parsed === 'object' ? (parsed as SupabaseRow) : {};
  } catch {
    return {};
  }
};

const getRequiredElements = (criteria: SupabaseRow | null | undefined) => {
  const value = criteria?.required_elements;

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as SupabaseRow;
  }

  return {};
};

const buildTimeline = (campaign: SupabaseRow, brief: SupabaseRow) => {
  const startDate = getFirstText(campaign, ['start_date', 'start_at', 'created_at']);
  const endDate = getFirstText(campaign, ['end_date', 'end_at', 'deadline']);
  const publishedDate = getFirstText(brief, ['published_at', 'updated_at']);

  if (startDate && endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
  }

  if (publishedDate) {
    return `Published ${formatDate(publishedDate)}`;
  }

  return 'Timeline to be confirmed';
};

export const buildCreatorBriefDocument = ({
  campaign,
  brief,
  criteria,
}: {
  campaign: SupabaseRow;
  brief: SupabaseRow;
  criteria: SupabaseRow | null;
}): CreatorBriefDocument => {
  const rawBrief = getRawBriefObject(brief);
  const rawCriteria = rawBrief.acceptance_criteria as SupabaseRow | undefined;
  const criteriaRequiredElements = getRequiredElements(criteria);
  const rawRequiredElements = getRequiredElements(rawCriteria);
  const requiredElements =
    Object.keys(criteriaRequiredElements).length > 0
      ? criteriaRequiredElements
      : rawRequiredElements;
  const brandRulesDo = toTextList(criteria?.brand_rules_do ?? rawCriteria?.brand_rules_do);
  const brandRulesDont = toTextList(criteria?.brand_rules_dont ?? rawCriteria?.brand_rules_dont);
  const keyMessages = toTextList(criteria?.key_messages ?? rawCriteria?.key_messages);
  const hashtags = toTextList(criteria?.hashtags ?? requiredElements.hashtags);
  const mentions = toTextList(criteria?.mentions ?? requiredElements.mentions);

  return {
    campaignId: toText(campaign.id),
    briefId: toText(brief.id),
    campaignName: toText(campaign.name) || 'Untitled campaign',
    clientName: toText(campaign.client_name) || toText(campaign.client) || 'Brand to be confirmed',
    timeline: buildTimeline(campaign, brief),
    campaignGoal:
      toText(brief.objective) ||
      toText(rawBrief.objective) ||
      'Campaign goal to be confirmed.',
    targetAudience:
      toText(brief.target_audience) ||
      toText(rawBrief.target_audience) ||
      'Target audience to be confirmed.',
    contentDirection:
      toText(brief.content_direction) ||
      toTextList(brief.content_direction).join('\n') ||
      toText(rawBrief.content_direction) ||
      toTextList(rawBrief.content_direction).join('\n') ||
      'Content direction to be confirmed.',
    platforms: toTextList(brief.platforms ?? rawBrief.platforms),
    keyMessages,
    brandRulesDo,
    brandRulesDont,
    hashtags,
    mentions,
    callToAction:
      toText(criteria?.cta ?? requiredElements.cta) ||
      'Call to action to be confirmed.',
    submissionDeadline:
      getFirstText(brief, ['submission_deadline', 'deadline', 'due_date']) ||
      getFirstText(campaign, ['submission_deadline', 'deadline', 'due_date', 'end_date']) ||
      'To be confirmed by the campaign manager.',
    approvalNotes:
      [
        keyMessages.length > 0 ? 'Include the key messages listed in this brief.' : '',
        brandRulesDo.length > 0 ? 'Follow all brand do rules.' : '',
        brandRulesDont.length > 0 ? 'Avoid all listed brand restrictions.' : '',
        'Submit content for review before posting unless your campaign manager says otherwise.',
      ]
        .filter(Boolean)
        .join(' '),
    contactSupport:
      getFirstText(campaign, ['contact', 'support_contact', 'manager_email']) ||
      'Contact your campaign manager for questions, approvals, or submission support.',
    status: toText(brief.status) || 'draft',
    updatedAt: toText(brief.updated_at) || null,
  };
};

export const getCreatorBriefExportData = async (campaignId: string) => {
  const [campaignResult, briefResult, criteriaResult] = await Promise.all([
    supabase.from('campaigns').select('*').eq('id', campaignId).maybeSingle(),
    supabase
      .from('briefs')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('acceptance_criteria')
      .select('*')
      .eq('campaign_id', campaignId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (campaignResult.error) {
    throw campaignResult.error;
  }

  if (briefResult.error) {
    throw briefResult.error;
  }

  if (criteriaResult.error && criteriaResult.error.code !== 'PGRST116') {
    throw criteriaResult.error;
  }

  if (!campaignResult.data) {
    throw new Error('Campaign not found');
  }

  if (!briefResult.data) {
    throw new Error('Brief not found');
  }

  return buildCreatorBriefDocument({
    campaign: campaignResult.data as SupabaseRow,
    brief: briefResult.data as SupabaseRow,
    criteria: (criteriaResult.data as SupabaseRow | null) ?? null,
  });
};

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

export const createCreatorBriefPdf = (brief: CreatorBriefDocument) => {
  const pageWidth = 595;
  const marginX = 48;
  const pageTop = 794;
  const bottomMargin = 54;
  const contentWidth = pageWidth - marginX * 2;
  const black: [number, number, number] = [0.08, 0.08, 0.08];
  const muted: [number, number, number] = [0.38, 0.38, 0.38];
  const blue: [number, number, number] = [0.10, 0.30, 0.70];
  const lightLine: [number, number, number] = [0.86, 0.88, 0.92];
  let cursorY = pageTop;
  let currentPage = '';
  const pages: string[] = [];

  const addRaw = (content: string) => {
    currentPage += `${content}\n`;
  };

  const addPdfText = (
    text: string,
    x: number,
    y: number,
    size = 10,
    bold = false,
    color: [number, number, number] = black
  ) => {
    addRaw(
      `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color.join(' ')} rg 1 0 0 1 ${x} ${y} Tm (${escapePdfText(text)}) Tj ET`
    );
  };

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
    addLine(marginX, 38, pageWidth - marginX);
    addPdfText('RollerKluster Creator Brief', marginX, 24, 8, false, muted);
    pages.push(currentPage);
  };

  const ensureSpace = (heightNeeded: number) => {
    if (cursorY - heightNeeded >= bottomMargin) {
      return;
    }

    finishPage();
    startPage();
  };

  const addWrapped = (
    text: string,
    options: {
      x?: number;
      maxCharacters?: number;
      size?: number;
      bold?: boolean;
      color?: [number, number, number];
      gap?: number;
      lineHeight?: number;
    } = {}
  ) => {
    const x = options.x ?? marginX;
    const size = options.size ?? 10;
    const lineHeight = options.lineHeight ?? Math.max(size + 5, 14);
    const lines = cleanPdfText(text)
      .split(/\n+/)
      .flatMap((line) => wrapPdfText(line, options.maxCharacters ?? 90));

    lines.forEach((line) => {
      ensureSpace(lineHeight + (options.gap ?? 8));
      addPdfText(line, x, cursorY, size, options.bold, options.color ?? black);
      cursorY -= lineHeight;
    });
    ensureSpace(options.gap ?? 8);
    cursorY -= options.gap ?? 8;
  };

  const addSection = (title: string, content: string | string[]) => {
    ensureSpace(50);
    addPdfText(title.toUpperCase(), marginX, cursorY, 10.5, true, blue);
    cursorY -= 13;
    addLine(marginX, cursorY, pageWidth - marginX);
    cursorY -= 18;

    if (Array.isArray(content)) {
      const items = content.length > 0 ? content : ['To be confirmed'];

      items.forEach((item) => {
        addWrapped(`- ${item}`, { maxCharacters: 86, size: 10, lineHeight: 14, gap: 2 });
      });
      cursorY -= 8;
      return;
    }

    addWrapped(content || 'To be confirmed', {
      maxCharacters: 90,
      size: 10,
      lineHeight: 15,
      gap: 12,
    });
  };

  startPage();
  addPdfText('ROLLERKLUSTER CREATOR BRIEF', marginX, cursorY, 10, true, blue);
  cursorY -= 30;
  addWrapped(brief.campaignName, {
    maxCharacters: 42,
    size: 25,
    bold: true,
    lineHeight: 30,
    gap: 12,
  });

  const metadata = [
    ['Brand / Client', brief.clientName],
    ['Campaign Timeline', brief.timeline],
    ['Updated', formatDate(brief.updatedAt)],
  ];
  const metaColumnWidth = contentWidth / metadata.length;

  metadata.forEach(([label, value], index) => {
    const x = marginX + metaColumnWidth * index;

    addPdfText(label.toUpperCase(), x, cursorY, 7.5, true, muted);
    addPdfText(value || 'To be confirmed', x, cursorY - 16, 9.5, false, black);
  });
  cursorY -= 44;
  addLine(marginX, cursorY, pageWidth - marginX);
  cursorY -= 32;

  addSection('Campaign Goal', brief.campaignGoal);
  addSection('Target Audience', brief.targetAudience);
  addSection('Content Direction', [
    brief.contentDirection,
    brief.platforms.length > 0 ? `Platforms: ${brief.platforms.join(', ')}` : '',
  ].filter(Boolean));
  addSection('Key Messages', brief.keyMessages);
  addSection('Brand Rules', [
    ...brief.brandRulesDo.map((rule) => `Do: ${rule}`),
    ...brief.brandRulesDont.map((rule) => `Do not: ${rule}`),
  ]);
  addSection('Hashtags & Mentions', [
    brief.hashtags.length > 0 ? `Hashtags: ${brief.hashtags.join(' ')}` : '',
    brief.mentions.length > 0 ? `Mentions: ${brief.mentions.join(' ')}` : '',
  ].filter(Boolean));
  addSection('Call To Action', brief.callToAction);
  addSection('Submission Deadline', brief.submissionDeadline);
  addSection('Approval Notes', brief.approvalNotes);
  addSection('Contact / Support', brief.contactSupport);

  finishPage();
  return buildPdfBlob(pages);
};

export const downloadCreatorBriefPdf = (brief: CreatorBriefDocument) => {
  const pdfBlob = createCreatorBriefPdf(brief);
  const pdfUrl = URL.createObjectURL(pdfBlob);
  const element = document.createElement('a');

  element.href = pdfUrl;
  element.download = `creator-brief-${brief.campaignName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.pdf`;
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(pdfUrl);
};
