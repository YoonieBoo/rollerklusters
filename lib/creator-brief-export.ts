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
  posterImageUrls: string[];
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

const formatCampaignDate = (date: string | null) => {
  if (!date) {
    return '';
  }

  const dateOnlyMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsedDate = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3])
      )
    : new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsedDate);
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

const buildTimeline = (campaign: SupabaseRow) => {
  const startDate = formatCampaignDate(
    getFirstText(campaign, ['campaign_start_date', 'start_date', 'start_at'])
  );
  const endDate = formatCampaignDate(
    getFirstText(campaign, ['campaign_end_date', 'end_date', 'end_at', 'deadline'])
  );

  if (startDate && endDate) {
    return `${startDate} – ${endDate}`;
  }

  if (startDate) {
    return `From ${startDate}`;
  }

  if (endDate) {
    return `Until ${endDate}`;
  }

  return 'Not set';
};

const buildAcceptanceCriteria = ({
  keyMessages,
  brandRulesDo,
  brandRulesDont,
  hashtags,
  mentions,
  callToAction,
}: {
  keyMessages: string[];
  brandRulesDo: string[];
  brandRulesDont: string[];
  hashtags: string[];
  mentions: string[];
  callToAction: string;
}) =>
  [
    keyMessages.length > 0 ? `Key message: ${keyMessages.join(', ')}` : '',
    brandRulesDo.length > 0 ? `Brand do rules: ${brandRulesDo.join(', ')}` : '',
    brandRulesDont.length > 0 ? `Brand don't rules: ${brandRulesDont.join(', ')}` : '',
    hashtags.length > 0 ? `Required hashtags: ${hashtags.join(', ')}` : '',
    mentions.length > 0 ? `Required mentions: ${mentions.join(', ')}` : '',
    callToAction ? `Call to action: ${callToAction}` : '',
  ]
    .filter(Boolean)
    .join('\n');

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
  const callToAction = toText(criteria?.cta ?? requiredElements.cta);
  const submissionDeadline =
    formatCampaignDate(
      getFirstText(brief, ['submission_deadline']) ||
        getFirstText(rawBrief, ['submission_deadline'])
    ) || 'Not set';
  const contactSupport =
    getFirstText(brief, ['contact_support']) ||
    getFirstText(rawBrief, ['contact_support']) ||
    'Not set';
  const approvalNotes = [
    keyMessages.length > 0 ? 'Include the key messages listed in this brief.' : '',
    brandRulesDo.length > 0 ? 'Follow all brand do rules.' : '',
    brandRulesDont.length > 0 ? 'Avoid all listed brand restrictions.' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    campaignId: toText(campaign.id),
    briefId: toText(brief.id),
    campaignName: toText(campaign.name) || 'Untitled campaign',
    clientName: toText(campaign.client_name) || toText(campaign.client) || 'Brand to be confirmed',
    timeline: buildTimeline(campaign),
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
    callToAction: callToAction || 'Not set',
    submissionDeadline,
    approvalNotes: approvalNotes || 'Not set',
    contactSupport,
    posterImageUrls: toTextList(brief.poster_image_urls ?? rawBrief.poster_image_urls),
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

type LoadedPosterImage = {
  dataUrl: string;
  width: number;
  height: number;
};

const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read image data.'));
      }
    };
    reader.onerror = () => reject(new Error('Unable to read image data.'));
    reader.readAsDataURL(blob);
  });

const loadImageElement = (source: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to load image.'));
    image.src = source;
  });

const loadPosterImageForPdf = async (url: string): Promise<LoadedPosterImage | null> => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  try {
    const response = await fetch(url, { mode: 'cors' });

    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();
    const source = await readBlobAsDataUrl(blob);
    const image = await loadImageElement(source);
    const canvas = document.createElement('canvas');
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    if (width <= 0 || height <= 0) {
      return null;
    }

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0, width, height);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      width,
      height,
    };
  } catch {
    return null;
  }
};

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
  const cardFill = '#fafbfc';
  const spaceXs = 5;
  const spaceSm = 8;
  const cardPaddingX = 16;
  const cardPaddingTop = 18;
  const cardLabelGap = 14;
  const cardGap = 10;
  const cardRadius = 2;
  const sectionGapBefore = 20;
  const sectionGapAfterTitle = 14;
  const bodyFontSize = 11.2;
  const bodyLineHeight = 16.2;
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
    setFont(options.size ?? bodyFontSize, options.style ?? 'normal', options.color ?? dark);

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
      setFont(9.5, 'normal', muted);
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

    setFont(10.5, 'bold', blue);
    pdf.text('ROLLERKLUSTER', marginX, cursorY);
    setFont(10.5, 'normal', muted);
    pdf.text('Creator Campaign Brief', marginX, cursorY + 17);
    cursorY += 60;

    const titleLines = getWrappedLines(brief.campaignName, contentWidth - 24, {
      size: 28,
      style: 'bold',
      color: black,
    });
    setFont(28, 'bold', black);
    titleLines.forEach((lineText) => {
      pdf.text(lineText, marginX, cursorY);
      cursorY += 32;
    });
    cursorY += 18;

    const summaryItems = [
      { label: 'Client', value: brief.clientName },
      { label: 'Campaign Timeline', value: brief.timeline },
    ];

    summaryItems.forEach((item) => {
      const label = `${item.label}:`;

      setFont(11.5, 'bold', dark);
      pdf.text(label, marginX, cursorY);
      const labelWidth = pdf.getTextWidth(label);
      const valueX = marginX + Math.max(labelWidth + 8, 128);
      setFont(11.5, 'normal', dark);
      pdf.text(cleanPdfDisplayText(item.value || 'To be confirmed'), valueX, cursorY, {
        maxWidth: pageWidth - marginX - valueX,
      });
      cursorY += 20;
    });

    cursorY += 20;
    pdf.setDrawColor(line);
    pdf.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 28;
  };

  const addGroupTitle = (title: string) => {
    cursorY += sectionGapBefore;
    setFont(13, 'bold', black);
    pdf.text(title, marginX, cursorY);
    cursorY += sectionGapAfterTitle;
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
    const bodyWidth = width - cardPaddingX * 2;
    const labelHeight = 13;
    const paragraphs = getContentParagraphs(content);
    const bodyHeight = paragraphs.reduce((total, paragraph) => {
      const lines = getWrappedLines(paragraph, bodyWidth, {
        size: bodyFontSize,
        color: dark,
      });

      return total + lines.length * bodyLineHeight + spaceXs;
    }, 0);

    return Math.max(56, cardPaddingTop + labelHeight + cardLabelGap + bodyHeight + spaceSm);
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

      const bodyX = x + cardPaddingX;
      const bodyWidth = width - cardPaddingX * 2;
      const lineHeight = bodyLineHeight;
      let startY = cursorY;
      let textY = startY + cardPaddingTop + 13 + cardLabelGap;

      const startLongCardPage = (continued: boolean) => {
        startY = cursorY;
        textY = startY + cardPaddingTop + 13 + cardLabelGap;
        pdf.setFillColor(cardFill);
        pdf.setDrawColor(cardBorder);
        pdf.roundedRect(
          x,
          startY,
          width,
          pageHeight - bottomMargin - startY,
          cardRadius,
          cardRadius,
          'FD'
        );
        setFont(9.4, 'bold', blue);
        pdf.text(
          `${label.toUpperCase()}${continued ? ' (CONTINUED)' : ''}`,
          x + cardPaddingX,
          startY + cardPaddingTop
        );
      };

      startLongCardPage(false);
      getContentParagraphs(content).forEach((paragraph) => {
        const lines = getWrappedLines(paragraph, bodyWidth, {
          size: bodyFontSize,
          color: dark,
        });

        lines.forEach((lineText) => {
          if (textY + lineHeight > pageHeight - bottomMargin - 12) {
            pdf.addPage();
            cursorY = topMargin;
            startLongCardPage(true);
          }

          setFont(bodyFontSize, 'normal', dark);
          pdf.text(lineText, bodyX, textY);
          textY += lineHeight;
        });
        textY += spaceXs;
      });

      cursorY = textY + 12;
      return;
    }

    ensureSpace(height + cardGap);

    const startY = cursorY;
    pdf.setFillColor(cardFill);
    pdf.setDrawColor(cardBorder);
    pdf.roundedRect(x, startY, width, height, cardRadius, cardRadius, 'FD');

    setFont(9.4, 'bold', blue);
    pdf.text(label.toUpperCase(), x + cardPaddingX, startY + cardPaddingTop);

    const bodyX = x + cardPaddingX;
    const bodyWidth = width - cardPaddingX * 2;
    let textY = startY + cardPaddingTop + 13 + cardLabelGap;
    const paragraphs = getContentParagraphs(content);

    paragraphs.forEach((paragraph) => {
      const lines = getWrappedLines(paragraph, bodyWidth, {
        size: bodyFontSize,
        color: dark,
      });

      lines.forEach((lineText) => {
        setFont(bodyFontSize, 'normal', dark);
        pdf.text(lineText, bodyX, textY);
        textY += bodyLineHeight;
      });
      textY += spaceXs;
    });

    cursorY = startY + height + cardGap;
  };

  const addFieldCards = (fields: Array<{ label: string; content: string | string[] }>) => {
    fields.forEach((field) => addFieldCard(field));
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
    const titleHeight = sectionGapBefore + 12 + sectionGapAfterTitle;
    const firstCardHeight =
      titleHeight +
      measureFieldCardHeight({
        label: fields[0].label,
        content: fields[0].content,
        width: contentWidth,
      }) +
      cardGap;

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

      ensureSpace(rowHeight + cardGap);
      addFieldCard({ ...firstField, x: marginX, width: columnWidth });

      if (secondField) {
        const nextY = cursorY;
        cursorY = rowStartY;
        addFieldCard({ ...secondField, x: marginX + columnWidth + gutter, width: columnWidth });
        cursorY = Math.max(cursorY, nextY);
      }
    }

  };

  const measureTwoColumnCardsHeight = (
    fields: Array<{ label: string; content: string | string[] }>
  ) => {
    const gutter = 14;
    const columnWidth = (contentWidth - gutter) / 2;
    let totalHeight = 0;

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

      totalHeight += Math.max(firstHeight, secondHeight) + cardGap;
    }

    return totalHeight;
  };

  const addTwoColumnCardSection = (
    title: string,
    fields: Array<{ label: string; content: string | string[] }>
  ) => {
    const titleHeight = sectionGapBefore + 12 + sectionGapAfterTitle;
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
      fullSectionHeight <= usablePageHeight()
        ? fullSectionHeight
        : titleHeight + firstRowHeight + cardGap
    );
    addGroupTitle(title);
    addTwoColumnCards(fields);
  };

  const addPosterImageSection = (images: LoadedPosterImage[]) => {
    if (images.length === 0) {
      return;
    }

    const imageGap = 14;
    const imageWidth = (contentWidth - imageGap) / 2;
    const imageMaxHeight = 190;
    const getDisplayHeight = (image: LoadedPosterImage) =>
      Math.min(imageMaxHeight, (image.height / image.width) * imageWidth);
    const firstRowHeight = Math.max(
      getDisplayHeight(images[0]),
      images[1] ? getDisplayHeight(images[1]) : 0
    );

    ensureSectionStart(sectionGapBefore + 12 + sectionGapAfterTitle + firstRowHeight + cardGap);
    addGroupTitle('Posters / Campaign Images');

    for (let index = 0; index < images.length; index += 2) {
      const firstImage = images[index];
      const secondImage = images[index + 1];
      const firstHeight = getDisplayHeight(firstImage);
      const secondHeight = secondImage ? getDisplayHeight(secondImage) : 0;
      const rowHeight = Math.max(firstHeight, secondHeight);

      ensureSpace(rowHeight + cardGap);
      pdf.setDrawColor(cardBorder);
      pdf.addImage(firstImage.dataUrl, 'PNG', marginX, cursorY, imageWidth, firstHeight);
      pdf.rect(marginX, cursorY, imageWidth, firstHeight);

      if (secondImage) {
        const secondX = marginX + imageWidth + imageGap;
        pdf.addImage(secondImage.dataUrl, 'PNG', secondX, cursorY, imageWidth, secondHeight);
        pdf.rect(secondX, cursorY, imageWidth, secondHeight);
      }

      cursorY += rowHeight + cardGap;
    }
  };

  const acceptanceCriteria =
    buildAcceptanceCriteria({
      keyMessages: brief.keyMessages,
      brandRulesDo: brief.brandRulesDo,
      brandRulesDont: brief.brandRulesDont,
      hashtags: brief.hashtags,
      mentions: brief.mentions,
      callToAction: brief.callToAction === 'Not set' ? '' : brief.callToAction,
    }) || 'Not set';

  const posterImages = (
    await Promise.all(brief.posterImageUrls.map((url) => loadPosterImageForPdf(url)))
  ).filter((image): image is LoadedPosterImage => image !== null);

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

  addPosterImageSection(posterImages);

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
