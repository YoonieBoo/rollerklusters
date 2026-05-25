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
    .replace(/[•]/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');

export const createCreatorBriefPdf = async (brief: CreatorBriefDocument) => {
  const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 46;
  const topMargin = 46;
  const contentWidth = pageWidth - marginX * 2;
  const bottomMargin = 64;
  const black = '#111827';
  const dark = '#1f2937';
  const muted = '#667085';
  const blue = '#2563eb';
  const line = '#e6e8ee';
  const cardBorder = '#e4e7ec';
  const cardFill = '#f8fafc';
  let cursorY = topMargin;

  const setFont = (size: number, style: 'normal' | 'bold' = 'normal', color = black) => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    pdf.setTextColor(color);
  };

  const remainingPageHeight = () => pageHeight - bottomMargin - cursorY;
  const usablePageHeight = () => pageHeight - bottomMargin - topMargin;

  const ensureSpace = (heightNeeded: number) => {
    if (cursorY + heightNeeded <= pageHeight - bottomMargin) {
      return;
    }

    pdf.addPage();
    cursorY = topMargin;
  };

  const cleanPdfDisplayText = (text: string) =>
    cleanPdfText(text)
      .split(/\n+/)
      .map((lineText) => lineText.replace(/^\s*[-]+\s*/, '').trim())
      .filter(Boolean)
      .join('\n');

  const getWrappedLines = (
    text: string,
    width: number,
    options: {
      size?: number;
      style?: 'normal' | 'bold';
      color?: string;
    } = {}
  ) => {
    setFont(options.size ?? 10.2, options.style ?? 'normal', options.color ?? dark);

    return cleanPdfDisplayText(text || 'To be confirmed')
      .split(/\n+/)
      .flatMap((textLine) => pdf.splitTextToSize(textLine || ' ', width) as string[]);
  };

  const getContentParagraphs = (content: string | string[]) => {
    if (Array.isArray(content)) {
      const items = content.map((item) => cleanPdfDisplayText(item)).filter(Boolean);

      return items.length > 0 ? [items.join(', ')] : ['To be confirmed'];
    }

    const text = cleanPdfDisplayText(content).trim();

    return text ? text.split(/\n+/) : ['To be confirmed'];
  };

  const addFooter = () => {
    const pageCount = pdf.getNumberOfPages();

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      pdf.setPage(pageNumber);
      pdf.setDrawColor(line);
      pdf.line(marginX, pageHeight - 42, pageWidth - marginX, pageHeight - 42);
      setFont(8.5, 'normal', muted);
      pdf.text('Generated by RollerKluster', marginX, pageHeight - 25);

      if (pageCount > 1) {
        pdf.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - marginX, pageHeight - 25, {
          align: 'right',
        });
      }
    }
  };

  const drawHeader = () => {
    pdf.setFillColor('#ffffff');
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');

    setFont(9.5, 'bold', blue);
    pdf.text('ROLLERKLUSTER', marginX, cursorY);
    setFont(9.5, 'normal', muted);
    pdf.text('Creator Campaign Brief', marginX, cursorY + 16);
    cursorY += 48;

    const titleLines = getWrappedLines(brief.campaignName, contentWidth - 24, {
      size: 27,
      style: 'bold',
      color: black,
    });
    setFont(27, 'bold', black);
    titleLines.forEach((lineText) => {
      pdf.text(lineText, marginX, cursorY);
      cursorY += 32;
    });
    cursorY += 8;

    const summaryItems = [
      { label: 'Client', value: brief.clientName },
      { label: 'Campaign Timeline', value: brief.timeline },
    ];

    summaryItems.forEach((item) => {
      const label = `${item.label}:`;

      setFont(10.5, 'bold', dark);
      pdf.text(label, marginX, cursorY);
      setFont(10.5, 'normal', dark);
      pdf.text(cleanPdfDisplayText(item.value || 'To be confirmed'), marginX + pdf.getTextWidth(label) + 5, cursorY, {
        maxWidth: contentWidth - pdf.getTextWidth(label) - 5,
      });
      cursorY += 18;
    });

    cursorY += 18;
    pdf.setDrawColor(line);
    pdf.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 26;
  };

  const addGroupTitle = (title: string) => {
    setFont(12, 'bold', black);
    pdf.text(title, marginX, cursorY);
    cursorY += 20;
  };

  const measureFieldCardHeight = ({
    label,
    content,
    width,
  }: {
    label: string;
    content: string | string[];
    width: number;
  }) => {
    const bodyWidth = width - 44;
    const labelHeight = 13;
    const paragraphs = getContentParagraphs(content);
    const bodyHeight = paragraphs.reduce((total, paragraph) => {
      const lines = getWrappedLines(paragraph, bodyWidth, {
        size: 10.2,
        color: dark,
      });

      return total + lines.length * 14.5 + 5;
    }, 0);

    return Math.max(66, labelHeight + bodyHeight + 30);
  };

  const addFieldCard = ({
    label,
    content,
    x = marginX,
    width = contentWidth,
  }: {
    label: string;
    content: string | string[];
    x?: number;
    width?: number;
  }) => {
    const height = measureFieldCardHeight({ label, content, width });
    const maxCardHeight = pageHeight - topMargin - bottomMargin;

    if (height > maxCardHeight) {
      ensureSpace(110);

      const bodyX = x + 18;
      const bodyWidth = width - 44;
      const lineHeight = 14.5;
      let startY = cursorY;
      let textY = startY + 50;

      const startLongCardPage = (continued: boolean) => {
        startY = cursorY;
        textY = startY + 50;
        pdf.setFillColor(cardFill);
        pdf.setDrawColor(cardBorder);
        pdf.roundedRect(
          x,
          startY,
          width,
          pageHeight - bottomMargin - startY,
          8,
          8,
          'FD'
        );
        setFont(8.4, 'bold', blue);
        pdf.text(`${label.toUpperCase()}${continued ? ' (CONTINUED)' : ''}`, x + 16, startY + 27);
      };

      startLongCardPage(false);
      getContentParagraphs(content).forEach((paragraph) => {
        const lines = getWrappedLines(paragraph, bodyWidth, {
          size: 10.2,
          color: dark,
        });

        lines.forEach((lineText) => {
          if (textY + lineHeight > pageHeight - bottomMargin - 12) {
            pdf.addPage();
            cursorY = topMargin;
            startLongCardPage(true);
          }

          setFont(10.2, 'normal', dark);
          pdf.text(lineText, bodyX, textY);
          textY += lineHeight;
        });
        textY += 5;
      });

      cursorY = textY + 12;
      return;
    }

    ensureSpace(height + 12);

    const startY = cursorY;
    pdf.setFillColor(cardFill);
    pdf.setDrawColor(cardBorder);
    pdf.roundedRect(x, startY, width, height, 8, 8, 'FD');

    setFont(8.4, 'bold', blue);
    pdf.text(label.toUpperCase(), x + 16, startY + 27);

    const bodyX = x + 18;
    const bodyWidth = width - 44;
    let textY = startY + 50;
    const paragraphs = getContentParagraphs(content);

    paragraphs.forEach((paragraph) => {
      const lines = getWrappedLines(paragraph, bodyWidth, {
        size: 10.2,
        color: dark,
      });

      lines.forEach((lineText) => {
        setFont(10.2, 'normal', dark);
        pdf.text(lineText, bodyX, textY);
        textY += 14.5;
      });
      textY += 5;
    });

    cursorY = startY + height + 12;
  };

  const addFieldCards = (fields: Array<{ label: string; content: string | string[] }>) => {
    fields.forEach((field) => addFieldCard(field));
    cursorY += 8;
  };

  const ensureSectionStart = (heightNeeded: number) => {
    if (heightNeeded <= remainingPageHeight()) {
      return;
    }

    pdf.addPage();
    cursorY = topMargin;
  };

  const addFieldCardSection = (
    title: string,
    fields: Array<{ label: string; content: string | string[] }>
  ) => {
    const titleHeight = 20;
    const firstCardHeight =
      titleHeight +
      measureFieldCardHeight({
        label: fields[0].label,
        content: fields[0].content,
        width: contentWidth,
      }) +
      12;

    ensureSectionStart(firstCardHeight);
    addGroupTitle(title);
    addFieldCards(fields);
  };

  const addTwoColumnCards = (fields: Array<{ label: string; content: string | string[] }>) => {
    const gutter = 14;
    const columnWidth = (contentWidth - gutter) / 2;

    for (let index = 0; index < fields.length; index += 2) {
      const firstField = fields[index];
      const secondField = fields[index + 1];
      const firstHeight = measureFieldCardHeight({
        label: firstField.label,
        content: firstField.content,
        width: columnWidth,
      });
      const secondHeight = secondField
        ? measureFieldCardHeight({
            label: secondField.label,
            content: secondField.content,
            width: columnWidth,
          })
        : 0;
      const rowHeight = Math.max(firstHeight, secondHeight);
      const rowStartY = cursorY;

      if (rowHeight > pageHeight - topMargin - bottomMargin) {
        addFieldCard(firstField);

        if (secondField) {
          addFieldCard(secondField);
        }

        continue;
      }

      ensureSpace(rowHeight + 12);
      addFieldCard({ ...firstField, x: marginX, width: columnWidth });

      if (secondField) {
        const nextY = cursorY;
        cursorY = rowStartY;
        addFieldCard({ ...secondField, x: marginX + columnWidth + gutter, width: columnWidth });
        cursorY = Math.max(cursorY, nextY);
      }
    }

    cursorY += 8;
  };

  const measureTwoColumnCardsHeight = (
    fields: Array<{ label: string; content: string | string[] }>
  ) => {
    const gutter = 14;
    const columnWidth = (contentWidth - gutter) / 2;
    let totalHeight = 8;

    for (let index = 0; index < fields.length; index += 2) {
      const firstField = fields[index];
      const secondField = fields[index + 1];
      const firstHeight = measureFieldCardHeight({
        label: firstField.label,
        content: firstField.content,
        width: columnWidth,
      });
      const secondHeight = secondField
        ? measureFieldCardHeight({
            label: secondField.label,
            content: secondField.content,
            width: columnWidth,
          })
        : 0;

      totalHeight += Math.max(firstHeight, secondHeight) + 12;
    }

    return totalHeight;
  };

  const addTwoColumnCardSection = (
    title: string,
    fields: Array<{ label: string; content: string | string[] }>
  ) => {
    const titleHeight = 20;
    const gutter = 14;
    const columnWidth = (contentWidth - gutter) / 2;
    const firstRowHeight = Math.max(
      measureFieldCardHeight({
        label: fields[0].label,
        content: fields[0].content,
        width: columnWidth,
      }),
      fields[1]
        ? measureFieldCardHeight({
            label: fields[1].label,
            content: fields[1].content,
            width: columnWidth,
          })
        : 0
    );
    const fullSectionHeight = titleHeight + measureTwoColumnCardsHeight(fields);

    ensureSectionStart(
      fullSectionHeight <= usablePageHeight() ? fullSectionHeight : titleHeight + firstRowHeight + 12
    );
    addGroupTitle(title);
    addTwoColumnCards(fields);
  };

  const acceptanceCriteria = [
    ...brief.keyMessages.map((message) => `Key message: ${message}`),
    ...brief.brandRulesDo.map((rule) => `Do: ${rule}`),
    ...brief.brandRulesDont.map((rule) => `Don't: ${rule}`),
    brief.hashtags.length > 0 ? `Hashtags: ${brief.hashtags.join(' ')}` : '',
    brief.mentions.length > 0 ? `Mentions: ${brief.mentions.join(' ')}` : '',
    brief.callToAction ? `CTA: ${brief.callToAction}` : '',
  ].filter(Boolean);

  drawHeader();

  addFieldCardSection('Brief Overview', [
    { label: 'Campaign Goal', content: brief.campaignGoal },
    { label: 'Target Audience', content: brief.targetAudience },
    { label: 'Key Message', content: brief.keyMessages },
  ]);

  addFieldCardSection('Creator Direction', [
    { label: 'Content Direction / Themes', content: brief.contentDirection },
    { label: 'Platforms', content: brief.platforms },
    { label: 'Call To Action', content: brief.callToAction },
  ]);

  addTwoColumnCardSection('Brand Guidelines', [
    { label: 'Brand Do Rules', content: brief.brandRulesDo },
    { label: "Brand Don't Rules", content: brief.brandRulesDont },
  ]);

  addTwoColumnCardSection('Required Elements', [
    { label: 'Required Hashtags', content: brief.hashtags },
    { label: 'Required Mentions', content: brief.mentions },
  ]);

  addFieldCardSection('Approval & Acceptance Criteria', [
    { label: 'Approval Notes', content: brief.approvalNotes },
    { label: 'Acceptance Criteria', content: acceptanceCriteria },
  ]);

  addFieldCardSection('Timeline & Support', [
    { label: 'Submission Deadline', content: brief.submissionDeadline },
    { label: 'Campaign Timeline', content: brief.timeline },
    { label: 'Contact / Support', content: brief.contactSupport },
  ]);

  addFooter();
  return pdf.output('blob');
};

const sanitizeFileSegment = (value: string) => {
  const sanitizedValue = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitizedValue || 'RollerKluster';
};

export const downloadCreatorBriefPdf = async (brief: CreatorBriefDocument) => {
  const pdfBlob = await createCreatorBriefPdf(brief);
  const pdfUrl = URL.createObjectURL(pdfBlob);
  const element = document.createElement('a');
  const fileBaseName = sanitizeFileSegment(brief.campaignName);

  element.href = pdfUrl;
  element.download = `${fileBaseName}${/brief$/i.test(fileBaseName) ? '' : '-Brief'}.pdf`;
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(pdfUrl);
};
