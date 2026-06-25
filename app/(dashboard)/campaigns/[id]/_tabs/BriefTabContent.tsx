'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  downloadCreatorBriefPdf,
} from '@/lib/creator-brief-export';
import type { CreatorBriefDocument } from '@/lib/creator-brief-export';

type SupabaseRow = Record<string, unknown>;

type CampaignRow = SupabaseRow & {
  id?: string;
  name?: string | null;
};

type BriefView = {
  id: string;
  campaignId: string;
  campaignName: string;
  objective: string;
  targetAudience: string;
  contentDirection: string;
  platforms: string[];
  keyMessages: string[];
  brandRulesDo: string[];
  brandRulesDont: string[];
  hashtags: string[];
  mentions: string[];
  cta: string;
  submissionDeadline: string;
  contactSupport: string;
  posterImageUrls: string[];
  status: string | null;
  completionPercentage: number | null;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type BriefToast = {
  message: string;
  type: 'success' | 'error';
  showReviewsAction?: boolean;
};

const toText = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const toTextList = (value: unknown) => {
  if (Array.isArray(value)) return value.map((item) => toText(item)).filter(Boolean);
  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (!trimmedValue) return [];
    try {
      const parsedValue = JSON.parse(trimmedValue);
      if (Array.isArray(parsedValue)) return parsedValue.map((item) => toText(item)).filter(Boolean);
    } catch {
      return trimmedValue.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
    }
    return [trimmedValue];
  }
  return [];
};

const withSingleInput = (items: string[]) => (items.length > 0 ? items : ['']);

const cleanTextList = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);

const parseRawBrief = (value: unknown) => {
  const textValue = toText(value);
  if (!textValue) return {};
  try {
    const parsedValue = JSON.parse(textValue);
    return parsedValue && typeof parsedValue === 'object' ? (parsedValue as SupabaseRow) : {};
  } catch {
    return {};
  }
};

const getObjectValue = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as SupabaseRow) : {};

const toNumberValue = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const textValue = toText(value);
  const numberValue = Number(textValue);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const getMissingColumnName = (message: string) => {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" of relation/i,
    /column "([^"]+)" does not exist/i,
    /record "new" has no field "([^"]+)"/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
};

const isMissingRelationError = (error: { code?: string; message?: string } | null) =>
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  error?.message?.toLowerCase().includes('could not find the table');

const saveWithOptionalColumns = async <T extends SupabaseRow>(
  tableName: string,
  payload: T,
  operation: (payload: T) => Promise<{
    data: SupabaseRow[] | SupabaseRow | null;
    error: { message: string; code?: string } | null;
  }>
) => {
  let nextPayload = { ...payload } as T;
  const removedColumns: string[] = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const result = await operation(nextPayload);
    if (!result.error) return { ...result, removedColumns };
    const missingColumn = getMissingColumnName(result.error.message);
    if (!missingColumn || !(missingColumn in nextPayload)) return { ...result, removedColumns };
    const { [missingColumn]: _removed, ...trimmedPayload } = nextPayload;
    nextPayload = trimmedPayload as T;
    removedColumns.push(`${tableName}.${missingColumn}`);
  }
  return { data: null, error: { message: `Unable to save ${tableName}: too many schema retries` }, removedColumns };
};

const formatDate = (date: string | null) => {
  if (!date) return 'N/A';
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return 'N/A';
  return parsedDate.getDate() + '/' + (parsedDate.getMonth() + 1) + '/' + parsedDate.getFullYear();
};

const formatCampaignDate = (date: string | null) => {
  if (!date) return '';
  const dateOnlyMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsedDate = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return '';
  return parsedDate.getDate() + '/' + (parsedDate.getMonth() + 1) + '/' + parsedDate.getFullYear();
};

const buildCampaignTimeline = (campaign: CampaignRow | undefined) => {
  const startDate = formatCampaignDate(toText(campaign?.campaign_start_date) || null);
  const endDate = formatCampaignDate(toText(campaign?.campaign_end_date) || null);
  if (startDate && endDate) return `${startDate} – ${endDate}`;
  if (startDate) return `From ${startDate}`;
  if (endDate) return `Until ${endDate}`;
  return 'Not set';
};

const posterBucketName = 'brief-posters';
const posterUploadErrorMessage = 'Please upload a PNG, JPG, JPEG, or WebP image under 5MB.';
const acceptedPosterMimeTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

const getPosterStoragePath = (url: string) => {
  const bucketPath = `/storage/v1/object/public/${posterBucketName}/`;
  const pathStart = url.indexOf(bucketPath);
  if (pathStart === -1) return '';
  return decodeURIComponent(url.slice(pathStart + bucketPath.length));
};

export default function BriefTabContent({ campaignId }: { campaignId: string }) {
  const firstBriefSectionRef = useRef<HTMLElement | null>(null);
  const posterFileInputRef = useRef<HTMLInputElement | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [briefs, setBriefs] = useState<BriefView[]>([]);
  // campaignId prop is used directly — no dropdown selection in tab context
  const selectedCampaignId = campaignId;
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingBrief, setIsExportingBrief] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<BriefToast | null>(null);
  const [showPublishSuccess, setShowPublishSuccess] = useState(false);
  const [objective, setObjective] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [contentDirection, setContentDirection] = useState('');
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [keyMessages, setKeyMessages] = useState<string[]>(['']);
  const [brandRulesDo, setBrandRulesDo] = useState<string[]>(['']);
  const [brandRulesDont, setBrandRulesDont] = useState<string[]>(['']);
  const [hashtags, setHashtags] = useState<string[]>(['']);
  const [mentions, setMentions] = useState<string[]>(['']);
  const [cta, setCta] = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [contactSupport, setContactSupport] = useState('');
  const [posterImageUrls, setPosterImageUrls] = useState<string[]>([]);
  const [posterUploadError, setPosterUploadError] = useState<string | null>(null);
  const [isUploadingPosters, setIsUploadingPosters] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [editingPublishedBrief, setEditingPublishedBrief] = useState(false);
  const [publishedCampaignIds, setPublishedCampaignIds] = useState<string[]>([]);

  const platformOptions = ['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Twitter', 'Facebook'];

  const fetchBriefData = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const [campaignsResult, briefsResult, criteriaResult] = await Promise.all([
      supabase.from('campaigns').select('*'),
      supabase.from('briefs').select('*'),
      supabase.from('acceptance_criteria').select('*'),
    ]);

    const criteriaTableMissing = isMissingRelationError(criteriaResult.error);
    const fetchError =
      campaignsResult.error ||
      briefsResult.error ||
      (criteriaTableMissing ? null : criteriaResult.error);

    if (fetchError) {
      setErrorMessage(fetchError.message);
      setCampaigns([]);
      setBriefs([]);
      setIsLoading(false);
      return;
    }

    const campaignRows = (campaignsResult.data ?? []) as CampaignRow[];
    const briefRows = (briefsResult.data ?? []) as SupabaseRow[];
    const criteriaRows = criteriaTableMissing ? [] : ((criteriaResult.data ?? []) as SupabaseRow[]);

    const campaignNames = new Map(
      campaignRows.map((campaign) => [toText(campaign.id), toText(campaign.name) || 'Untitled campaign'])
    );
    const criteriaByBriefId = new Map(criteriaRows.map((c) => [toText(c.brief_id), c]));
    const criteriaByCampaignId = new Map(criteriaRows.map((c) => [toText(c.campaign_id), c]));

    const normalizedBriefs = briefRows
      .map((brief) => {
        const briefId = toText(brief.id);
        const cId = toText(brief.campaign_id);
        const rawBrief = parseRawBrief(brief.raw_brief);
        const rawCriteria = getObjectValue(rawBrief.acceptance_criteria);
        const rawRequiredElements = getObjectValue(rawCriteria.required_elements);
        const criteria = criteriaByBriefId.get(briefId) ?? criteriaByCampaignId.get(cId) ?? {};
        const requiredElements = { ...rawRequiredElements, ...getObjectValue(criteria.required_elements) };
        return {
          id: briefId,
          campaignId: cId,
          campaignName: campaignNames.get(cId) ?? 'Untitled campaign',
          objective: toText(brief.objective) || toText(rawBrief.objective) || toText(rawBrief.goal),
          targetAudience: toText(brief.target_audience) || toText(rawBrief.target_audience) || toText(rawBrief.audience),
          contentDirection: toTextList(brief.content_direction).join('\n') || toTextList(rawBrief.content_direction).join('\n') || toText(rawBrief.content_direction),
          platforms: toTextList(brief.platforms).length ? toTextList(brief.platforms) : toTextList(rawBrief.platforms),
          keyMessages: toTextList(criteria.key_messages).length ? toTextList(criteria.key_messages) : toTextList(rawCriteria.key_messages),
          brandRulesDo: toTextList(criteria.brand_rules_do).length ? toTextList(criteria.brand_rules_do) : toTextList(rawCriteria.brand_rules_do),
          brandRulesDont: toTextList(criteria.brand_rules_dont).length ? toTextList(criteria.brand_rules_dont) : toTextList(rawCriteria.brand_rules_dont),
          hashtags: toTextList(criteria.hashtags ?? requiredElements.hashtags),
          mentions: toTextList(criteria.mentions ?? requiredElements.mentions),
          cta: toText(criteria.cta ?? requiredElements.cta),
          submissionDeadline: toText(brief.submission_deadline) || toText(rawBrief.submission_deadline) || '',
          contactSupport: toText(brief.contact_support) || toText(rawBrief.contact_support) || '',
          posterImageUrls: toTextList(brief.poster_image_urls).length ? toTextList(brief.poster_image_urls) : toTextList(rawBrief.poster_image_urls),
          status: toText(brief.status) || toText(rawBrief.status) || null,
          completionPercentage: toNumberValue(brief.completion_percentage ?? rawBrief.completion_percentage),
          publishedAt: toText(brief.published_at ?? rawBrief.published_at) || null,
          createdAt: toText(brief.created_at) || null,
          updatedAt: toText(brief.updated_at) || null,
        };
      })
      .sort((a, b) => {
        const aDate = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bDate = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bDate - aDate;
      });

    setCampaigns(campaignRows);
    setBriefs(normalizedBriefs);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchBriefData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId);
  const selectedBrief = briefs.find((brief) => brief.campaignId === selectedCampaignId);
  const creatorBriefUrl = selectedCampaignId ? `/creator-brief/${encodeURIComponent(selectedCampaignId)}` : '';

  useEffect(() => {
    setObjective(selectedBrief?.objective ?? '');
    setTargetAudience(selectedBrief?.targetAudience ?? '');
    setContentDirection(selectedBrief?.contentDirection ?? '');
    setPlatforms(selectedBrief?.platforms ?? []);
    setKeyMessages(withSingleInput(selectedBrief?.keyMessages ?? []));
    setBrandRulesDo(withSingleInput(selectedBrief?.brandRulesDo ?? []));
    setBrandRulesDont(withSingleInput(selectedBrief?.brandRulesDont ?? []));
    setHashtags(withSingleInput(selectedBrief?.hashtags ?? []));
    setMentions(withSingleInput(selectedBrief?.mentions ?? []));
    setCta(selectedBrief?.cta ?? '');
    setSubmissionDeadline(selectedBrief?.submissionDeadline ?? '');
    setContactSupport(selectedBrief?.contactSupport ?? '');
    setPosterImageUrls(selectedBrief?.posterImageUrls ?? []);
    setPosterUploadError(null);
    setSaveError(null);
    setActiveStep(0);
    setEditingPublishedBrief(false);
  }, [campaignId, selectedBrief]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleArrayUpdate = (index: number, value: string, setter: (value: string[]) => void, array: string[]) => {
    const newArray = [...array];
    newArray[index] = value;
    setter(newArray);
  };

  const addArrayInput = (setter: (value: string[]) => void, array: string[]) => {
    setter([...array, '']);
  };

  const showToast = (nextToast: BriefToast) => setToast(nextToast);

  const persistPosterImageUrls = async (nextPosterImageUrls: string[]) => {
    if (!selectedBrief?.id) return;
    const updateResult = await saveWithOptionalColumns('briefs', { poster_image_urls: nextPosterImageUrls, updated_at: new Date().toISOString() }, async (payload) =>
      supabase.from('briefs').update(payload).eq('id', selectedBrief.id).select('id').maybeSingle()
    );
    if (updateResult.error) throw updateResult.error;
  };

  const handlePosterUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPosterUploadError(null);
    const selectedFiles = Array.from(files);
    const availableSlots = 5 - posterImageUrls.length;
    if (availableSlots <= 0 || selectedFiles.length > availableSlots || selectedFiles.some((f) => !acceptedPosterMimeTypes.has(f.type) || f.size > 5 * 1024 * 1024)) {
      setPosterUploadError(posterUploadErrorMessage);
      return;
    }
    setIsUploadingPosters(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of selectedFiles) {
        const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
        const uniqueId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const filePath = `${selectedCampaignId || 'unassigned'}/${uniqueId}.${extension}`;
        const uploadResult = await supabase.storage.from(posterBucketName).upload(filePath, file, { cacheControl: '3600', upsert: false });
        if (uploadResult.error) throw uploadResult.error;
        const { data } = supabase.storage.from(posterBucketName).getPublicUrl(filePath);
        uploadedUrls.push(data.publicUrl);
      }
      const nextPosterImageUrls = [...posterImageUrls, ...uploadedUrls];
      setPosterImageUrls(nextPosterImageUrls);
      await persistPosterImageUrls(nextPosterImageUrls);
    } catch (error) {
      console.error('Poster upload error:', error);
      setPosterUploadError(error instanceof Error ? error.message : 'Unable to upload image. Please try again.');
    } finally {
      setIsUploadingPosters(false);
      if (posterFileInputRef.current) posterFileInputRef.current.value = '';
    }
  };

  const handleRemovePosterImage = async (url: string) => {
    setPosterUploadError(null);
    const nextPosterImageUrls = posterImageUrls.filter((imageUrl) => imageUrl !== url);
    setPosterImageUrls(nextPosterImageUrls);
    try {
      await persistPosterImageUrls(nextPosterImageUrls);
      const storagePath = getPosterStoragePath(url);
      if (storagePath) await supabase.storage.from(posterBucketName).remove([storagePath]);
    } catch (error) {
      console.error('Poster remove error:', error);
      setPosterUploadError('Unable to remove image. Please try again.');
      setPosterImageUrls(posterImageUrls);
    }
  };

  const handleSaveFailure = (label: string, error: { message: string; code?: string } | null) => {
    const message = error?.message ?? 'Unable to save brief';
    console.error(label, error);
    setSaveError(message);
    showToast({ message, type: 'error' });
    setIsSaving(false);
  };

  const handleViewCreatorBrief = () => {
    if (!creatorBriefUrl) return;
    window.open(creatorBriefUrl, '_blank', 'noopener,noreferrer');
  };

  const getCurrentOrSavedText = (currentValue: string, savedValue?: string) => currentValue.trim() || savedValue?.trim() || '';
  const getCurrentOrSavedList = (currentValues: string[], savedValues?: string[]) => {
    const currentCleanValues = cleanTextList(currentValues);
    return currentCleanValues.length > 0 ? currentCleanValues : savedValues ?? [];
  };

  const buildCurrentCreatorBriefDocument = (): CreatorBriefDocument => {
    const keyMessageValues = getCurrentOrSavedList(keyMessages, selectedBrief?.keyMessages);
    const brandRulesDoValues = getCurrentOrSavedList(brandRulesDo, selectedBrief?.brandRulesDo);
    const brandRulesDontValues = getCurrentOrSavedList(brandRulesDont, selectedBrief?.brandRulesDont);
    const hashtagValues = getCurrentOrSavedList(hashtags, selectedBrief?.hashtags);
    const mentionValues = getCurrentOrSavedList(mentions, selectedBrief?.mentions);
    const submissionDeadlineValue = getCurrentOrSavedText(submissionDeadline, selectedBrief?.submissionDeadline);
    const contactSupportValue = getCurrentOrSavedText(contactSupport, selectedBrief?.contactSupport);
    const campaignName = selectedBrief?.campaignName || toText(selectedCampaign?.name) || 'Untitled campaign';
    const generatedApprovalNotes = [
      keyMessageValues.length > 0 ? 'Include the key messages listed in this brief.' : '',
      brandRulesDoValues.length > 0 ? 'Follow all brand do rules.' : '',
      brandRulesDontValues.length > 0 ? 'Avoid all listed brand restrictions.' : '',
    ].filter(Boolean).join(' ');
    return {
      campaignId: selectedCampaignId,
      briefId: selectedBrief?.id ?? '',
      campaignName,
      clientName: toText(selectedCampaign?.client_name) || toText(selectedCampaign?.client) || 'Brand to be confirmed',
      timeline: buildCampaignTimeline(selectedCampaign),
      campaignGoal: getCurrentOrSavedText(objective, selectedBrief?.objective),
      targetAudience: getCurrentOrSavedText(targetAudience, selectedBrief?.targetAudience),
      contentDirection: getCurrentOrSavedText(contentDirection, selectedBrief?.contentDirection),
      platforms: platforms.length > 0 ? platforms : selectedBrief?.platforms ?? [],
      keyMessages: keyMessageValues,
      brandRulesDo: brandRulesDoValues,
      brandRulesDont: brandRulesDontValues,
      hashtags: hashtagValues,
      mentions: mentionValues,
      callToAction: getCurrentOrSavedText(cta, selectedBrief?.cta),
      submissionDeadline: formatCampaignDate(submissionDeadlineValue || null) || 'Not set',
      approvalNotes: generatedApprovalNotes || 'Not set',
      contactSupport: contactSupportValue || 'Not set',
      posterImageUrls,
      status: selectedBrief?.status ?? 'draft',
      updatedAt: selectedBrief?.updatedAt ?? new Date().toISOString(),
    };
  };

  const handleExportCreatorBrief = async () => {
    if (!selectedCampaignId) { setSaveError('Campaign not found'); return; }
    if (!isBriefCompleted) { setSaveError('Complete all required brief sections before downloading.'); return; }
    setIsExportingBrief(true);
    setSaveError(null);
    try {
      const creatorBrief = buildCurrentCreatorBriefDocument();
      await downloadCreatorBriefPdf(creatorBrief);
    } catch (error) {
      console.error('Creator brief export error:', error);
      const message = 'Could not generate PDF. Please try again.';
      setSaveError(message);
      showToast({ message, type: 'error' });
    } finally {
      setIsExportingBrief(false);
    }
  };

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const requiredFieldsValidation = useMemo(() => ({
    objective: getCurrentOrSavedText(objective, selectedBrief?.objective) !== '',
    targetAudience: getCurrentOrSavedText(targetAudience, selectedBrief?.targetAudience) !== '',
    contentDirection: getCurrentOrSavedText(contentDirection, selectedBrief?.contentDirection) !== '',
    platforms: (platforms.length > 0 ? platforms : selectedBrief?.platforms ?? []).length > 0,
    keyMessages: getCurrentOrSavedList(keyMessages, selectedBrief?.keyMessages).length > 0,
    brandRulesDo: getCurrentOrSavedList(brandRulesDo, selectedBrief?.brandRulesDo).length > 0,
    brandRulesDont: getCurrentOrSavedList(brandRulesDont, selectedBrief?.brandRulesDont).length > 0,
    hashtags: getCurrentOrSavedList(hashtags, selectedBrief?.hashtags).length > 0,
    mentions: getCurrentOrSavedList(mentions, selectedBrief?.mentions).length > 0,
    cta: getCurrentOrSavedText(cta, selectedBrief?.cta) !== '',
    submissionDeadline: getCurrentOrSavedText(submissionDeadline, selectedBrief?.submissionDeadline) !== '',
    posterImages: (posterImageUrls.length > 0 ? posterImageUrls : selectedBrief?.posterImageUrls ?? []).length > 0,
  }), [brandRulesDo, brandRulesDont, contentDirection, cta, hashtags, keyMessages, mentions, objective, platforms, posterImageUrls, selectedBrief, submissionDeadline, targetAudience]);

  const briefComplete = Object.values(requiredFieldsValidation).every(Boolean);
  const savedBriefFieldsValidation = useMemo(() => ({
    objective: (selectedBrief?.objective ?? '').trim() !== '',
    targetAudience: (selectedBrief?.targetAudience ?? '').trim() !== '',
    contentDirection: (selectedBrief?.contentDirection ?? '').trim() !== '',
    platforms: (selectedBrief?.platforms ?? []).length > 0,
    keyMessages: (selectedBrief?.keyMessages ?? []).some((msg) => msg.trim() !== ''),
    brandRulesDo: (selectedBrief?.brandRulesDo ?? []).some((rule) => rule.trim() !== ''),
    brandRulesDont: (selectedBrief?.brandRulesDont ?? []).some((rule) => rule.trim() !== ''),
    hashtags: (selectedBrief?.hashtags ?? []).some((tag) => tag.trim() !== ''),
    mentions: (selectedBrief?.mentions ?? []).some((mention) => mention.trim() !== ''),
    cta: (selectedBrief?.cta ?? '').trim() !== '',
    submissionDeadline: (selectedBrief?.submissionDeadline ?? '').trim() !== '',
    posterImages: (selectedBrief?.posterImageUrls ?? []).length > 0,
  }), [selectedBrief]);

  const savedBriefComplete = Object.values(savedBriefFieldsValidation).every(Boolean);
  const selectedBriefStatus = (selectedBrief?.status ?? '').toLowerCase().trim();
  const selectedCampaignStatus = toText(selectedCampaign?.status).toLowerCase().trim();
  const savedCompletionPercentage = selectedBrief?.completionPercentage ?? 0;
  const publishActionTriggered = showPublishSuccess || publishedCampaignIds.includes(selectedCampaignId);
  const databaseIndicatesBriefCompleted =
    ['published', 'approved', 'ready_for_review'].includes(selectedBriefStatus) ||
    selectedCampaignStatus === 'ready_for_review' ||
    savedCompletionPercentage >= 100 ||
    Boolean(selectedBrief?.publishedAt);
  const isBriefCompleted = Boolean(selectedCampaignId) && briefComplete;
  const showPublishedOverview = isBriefCompleted && !editingPublishedBrief;

  const criteriaFields = [
    { label: 'Campaign goal', complete: requiredFieldsValidation.objective },
    { label: 'Target audience', complete: requiredFieldsValidation.targetAudience },
    { label: 'Content direction', complete: requiredFieldsValidation.contentDirection },
    { label: 'Platforms', complete: requiredFieldsValidation.platforms },
    { label: 'Key message', complete: requiredFieldsValidation.keyMessages },
    { label: 'Brand do rules', complete: requiredFieldsValidation.brandRulesDo },
    { label: 'Brand don’t rules', complete: requiredFieldsValidation.brandRulesDont },
    { label: 'Hashtags', complete: requiredFieldsValidation.hashtags },
    { label: 'Mentions', complete: requiredFieldsValidation.mentions },
    { label: 'Call to action', complete: requiredFieldsValidation.cta },
    { label: 'Submission deadline', complete: requiredFieldsValidation.submissionDeadline },
    { label: 'Posters / Campaign Images', complete: requiredFieldsValidation.posterImages },
  ];

  const completedCount = criteriaFields.filter((f) => f.complete).length;
  const completionPercentage = Math.round((completedCount / criteriaFields.length) * 100);
  const displayedCompletedCount = isBriefCompleted ? criteriaFields.length : completedCount;
  const displayedCompletionPercentage = isBriefCompleted ? 100 : completionPercentage;
  const overviewObjective = getCurrentOrSavedText(objective, selectedBrief?.objective);
  const overviewTargetAudience = getCurrentOrSavedText(targetAudience, selectedBrief?.targetAudience);
  const overviewContentDirection = getCurrentOrSavedText(contentDirection, selectedBrief?.contentDirection);
  const overviewPlatforms = platforms.length > 0 ? platforms : selectedBrief?.platforms ?? [];
  const remainingFields = criteriaFields.filter((field) => !field.complete);
  const remainingLabels = remainingFields.map((field) => field.label);

  const briefSteps = [
    { title: 'Step 1 — Campaign Goal', question: 'What is the main goal of this campaign?', helper: 'Write the outcome your team wants creators to help achieve.', complete: objective.trim() !== '' },
    { title: 'Step 2 — Target Audience', question: 'Who are you trying to reach?', helper: 'Describe the people this campaign should speak to.', complete: targetAudience.trim() !== '' },
    { title: 'Step 3 — Content Direction', question: 'What should the creator content feel like?', helper: 'Give creators a simple direction for tone, story, and style.', complete: contentDirection.trim() !== '' },
    { title: 'Step 4 — Platforms', question: 'Where should creators post?', helper: 'Pick the channels that matter for this campaign.', complete: platforms.length > 0 },
    {
      title: 'Step 5 — Approval Notes',
      question: 'What does approved content need to include?',
      helper: 'Add the simple rules reviewers should check before approving content.',
      complete: keyMessages.some((msg) => msg.trim() !== '') && brandRulesDo.some((r) => r.trim() !== '') && brandRulesDont.some((r) => r.trim() !== '') && hashtags.some((t) => t.trim() !== '') && mentions.some((m) => m.trim() !== '') && cta.trim() !== '' && submissionDeadline.trim() !== '' && posterImageUrls.length > 0,
    },
  ];

  const activeBriefStep = briefSteps[activeStep] ?? briefSteps[0];
  const nextIncompleteStepIndex = briefSteps.findIndex((step) => !step.complete);
  const nextActionLabel = nextIncompleteStepIndex === -1 ? 'Ready to publish' : `Next section: ${briefSteps[nextIncompleteStepIndex].title.replace(/^Step \d+ — /, '')}`;
  const currentStepComplete = activeBriefStep?.complete ?? false;
  const canGoBack = activeStep > 0;
  const canGoNext = activeStep < briefSteps.length - 1;
  const isFinalStep = activeStep === briefSteps.length - 1;
  const canPublishFromCurrentStep = isFinalStep && briefComplete;

  void [savedBriefComplete, databaseIndicatesBriefCompleted, publishActionTriggered];

  const validateBrief = (requireComplete: boolean) => {
    if (!selectedCampaignId) return 'Campaign not found';
    if (requireComplete && !briefComplete) return `Missing before publish: ${remainingLabels.join(', ')}`;
    return null;
  };

  const saveBrief = async (status: 'draft' | 'published') => {
    const validationError = validateBrief(status === 'published');
    if (validationError) {
      setSaveError(validationError);
      showToast({ message: validationError, type: 'error' });
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    setToast(null);

    const now = new Date().toISOString();
    const keyMessageValues = cleanTextList(keyMessages);
    const brandRulesDoValues = cleanTextList(brandRulesDo);
    const brandRulesDontValues = cleanTextList(brandRulesDont);
    const hashtagValues = cleanTextList(hashtags);
    const mentionValues = cleanTextList(mentions);
    const nextCompletionPercentage = status === 'published' ? 100 : completionPercentage;
    const nextPublishedAt = status === 'published' ? now : selectedBrief?.publishedAt;
    const briefPayload = {
      campaign_id: selectedCampaignId,
      raw_brief: JSON.stringify({ campaign_id: selectedCampaignId, objective: objective.trim(), goal: objective.trim(), target_audience: targetAudience.trim(), audience: targetAudience.trim(), content_direction: contentDirection.trim(), platforms, submission_deadline: submissionDeadline || null, contact_support: contactSupport.trim(), poster_image_urls: posterImageUrls, status, completion_percentage: nextCompletionPercentage, published_at: nextPublishedAt }),
      objective: objective.trim(),
      goal: objective.trim(),
      target_audience: targetAudience.trim(),
      audience: targetAudience.trim(),
      content_direction: contentDirection.trim(),
      platforms,
      submission_deadline: submissionDeadline || null,
      contact_support: contactSupport.trim(),
      poster_image_urls: posterImageUrls,
      status,
      completion_percentage: nextCompletionPercentage,
      published_at: nextPublishedAt,
      approval_notes: keyMessageValues.length > 0 ? `Creators must include: ${keyMessageValues.join(', ')}` : '',
      updated_at: now,
    };

    let savedBrief: SupabaseRow | null = null;
    const existingBriefId = selectedBrief?.id;

    if (existingBriefId) {
      const updateResult = await saveWithOptionalColumns('briefs', briefPayload, async (payload) =>
        supabase.from('briefs').update(payload).eq('id', existingBriefId).select('*').maybeSingle()
      );
      if (updateResult.error) { handleSaveFailure('Supabase brief update error:', updateResult.error); return; }
      savedBrief = (updateResult.data as SupabaseRow | null) ?? null;
    } else {
      const latestBriefResult = await supabase.from('briefs').select('*').eq('campaign_id', selectedCampaignId).limit(1).maybeSingle();
      if (latestBriefResult.error) { handleSaveFailure('Supabase latest brief fetch error:', latestBriefResult.error); return; }
      const latestBriefId = toText(latestBriefResult.data?.id);
      if (latestBriefId) {
        const updateResult = await saveWithOptionalColumns('briefs', briefPayload, async (payload) =>
          supabase.from('briefs').update(payload).eq('id', latestBriefId).select('*').maybeSingle()
        );
        if (updateResult.error) { handleSaveFailure('Supabase brief update existing campaign brief error:', updateResult.error); return; }
        savedBrief = (updateResult.data as SupabaseRow | null) ?? null;
      } else {
        const insertResult = await saveWithOptionalColumns('briefs', briefPayload, async (payload) =>
          supabase.from('briefs').insert(payload).select('*').maybeSingle()
        );
        if (insertResult.error) { handleSaveFailure('Supabase brief insert error:', insertResult.error); return; }
        savedBrief = (insertResult.data as SupabaseRow | null) ?? null;
      }
    }

    const savedBriefId = toText(savedBrief?.id) || existingBriefId;
    const criteriaPayload = {
      campaign_id: selectedCampaignId,
      brief_id: savedBriefId,
      key_messages: keyMessageValues,
      brand_rules_do: brandRulesDoValues,
      brand_rules_dont: brandRulesDontValues,
      hashtags: hashtagValues,
      mentions: mentionValues,
      cta: cta.trim(),
      required_elements: { hashtags: hashtagValues, mentions: mentionValues, cta: cta.trim() },
      updated_at: now,
    };

    if (savedBriefId) {
      const existingCriteriaResult = await supabase.from('acceptance_criteria').select('*').or(`brief_id.eq.${savedBriefId},campaign_id.eq.${selectedCampaignId}`).limit(1).maybeSingle();
      if (existingCriteriaResult.error && !isMissingRelationError(existingCriteriaResult.error)) {
        handleSaveFailure('Supabase acceptance criteria fetch error:', existingCriteriaResult.error);
        return;
      }
      if (!isMissingRelationError(existingCriteriaResult.error)) {
        const existingCriteriaId = toText(existingCriteriaResult.data?.id);
        const criteriaResult = existingCriteriaId
          ? await saveWithOptionalColumns('acceptance_criteria', criteriaPayload, async (payload) =>
              supabase.from('acceptance_criteria').update(payload).eq('id', existingCriteriaId).select('*').maybeSingle()
            )
          : await saveWithOptionalColumns('acceptance_criteria', criteriaPayload, async (payload) =>
              supabase.from('acceptance_criteria').insert(payload).select('*').maybeSingle()
            );
        if (criteriaResult.error && !isMissingRelationError(criteriaResult.error)) {
          handleSaveFailure('Supabase acceptance criteria save error:', criteriaResult.error);
          return;
        }
      }
    }

    if (status === 'published' && selectedCampaign && 'status' in selectedCampaign) {
      const campaignStatusResult = await saveWithOptionalColumns('campaigns', { status: 'ready_for_review', updated_at: now }, async (payload) =>
        supabase.from('campaigns').update(payload).eq('id', selectedCampaignId).select('id').maybeSingle()
      );
      if (campaignStatusResult.error) { handleSaveFailure('Supabase campaign ready_for_review update error:', campaignStatusResult.error); return; }
    }

    await fetchBriefData();
    if (status === 'published') {
      setPublishedCampaignIds((ids) => ids.includes(selectedCampaignId) ? ids : [...ids, selectedCampaignId]);
      setEditingPublishedBrief(false);
      setShowPublishSuccess(true);
    } else {
      showToast({ message: 'Draft saved', type: 'success' });
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-4">
      {isLoading && <p className="text-sm text-muted-foreground">Loading brief...</p>}

      {!isLoading && errorMessage && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-sm text-red-500">Unable to load brief</p>
          <p className="mt-1 text-xs text-muted-foreground">{errorMessage}</p>
        </div>
      )}

      {!isLoading && !errorMessage && selectedCampaign && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
          <main ref={firstBriefSectionRef} className="rounded-xl bg-card/35 px-5 py-5 shadow-sm scroll-mt-6 md:px-6 md:py-6">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {selectedBrief ? `Last saved ${formatDate(selectedBrief.updatedAt ?? selectedBrief.createdAt)}` : 'New brief'}
                </p>
                <h2 className="mt-0.5 text-xl font-semibold">
                  {selectedBrief?.campaignName ?? toText(selectedCampaign.name) ?? 'Untitled campaign'}
                </h2>
              </div>
              <div className="flex flex-col items-start gap-3 md:items-end">
                {!showPublishedOverview && (
                  <>
                    <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground" disabled={isSaving} onClick={() => saveBrief('draft')}>
                      {isSaving ? 'Saving...' : 'Save draft'}
                    </Button>
                    <div className="flex items-center gap-1.5">
                      {briefSteps.map((step, index) => (
                        <button key={step.title} type="button" onClick={() => setActiveStep(index)} className={`h-2.5 rounded-full transition-all ${index === activeStep ? 'w-8 bg-primary' : step.complete ? 'w-2.5 bg-green-500' : 'w-2.5 bg-muted'}`} aria-label={`Open ${step.title}`} />
                      ))}
                    </div>
                  </>
                )}
                {showPublishedOverview && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingPublishedBrief(true)}>Edit Brief</Button>
                )}
                {isBriefCompleted && !showPublishedOverview && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="button" variant="outline" size="sm" onClick={handleViewCreatorBrief}>View Creator Brief</Button>
                    <Button type="button" size="sm" disabled={isExportingBrief || !isBriefCompleted} onClick={handleExportCreatorBrief}>
                      {isExportingBrief ? 'Generating...' : 'Download Brief PDF'}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {showPublishedOverview ? (
              <section className="max-w-4xl">
                <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3">
                  <p className="text-sm font-medium text-green-700">Brief published</p>
                  <p className="mt-1 text-sm text-green-700/80">This campaign brief is complete. You can view the creator-facing document, export it as a PDF, or edit the brief if campaign details changed.</p>
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-border bg-background/50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Campaign</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{selectedBrief?.campaignName || toText(selectedCampaign.name) || 'Untitled campaign'}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last updated</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{formatDate(selectedBrief?.updatedAt ?? selectedBrief?.createdAt ?? null)}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Completion</p>
                    <p className="mt-2 text-sm font-medium text-foreground">{displayedCompletedCount} of {criteriaFields.length} sections complete</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-5 md:grid-cols-2">
                  <div><p className="text-sm font-medium">Campaign goal</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{overviewObjective || 'Not added'}</p></div>
                  <div><p className="text-sm font-medium">Target audience</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{overviewTargetAudience || 'Not added'}</p></div>
                  <div><p className="text-sm font-medium">Content direction</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{overviewContentDirection || 'Not added'}</p></div>
                  <div><p className="text-sm font-medium">Platforms</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{overviewPlatforms.length ? overviewPlatforms.join(', ') : 'Not added'}</p></div>
                </div>
                <div className="mt-6 border-t border-border/60 pt-5">
                  <p className="text-sm font-medium">Creator brief actions</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button type="button" onClick={handleViewCreatorBrief}>View Creator Brief</Button>
                    <Button type="button" variant="outline" disabled={isExportingBrief || !isBriefCompleted} onClick={handleExportCreatorBrief}>{isExportingBrief ? 'Generating...' : 'Download Brief PDF'}</Button>
                    <Button type="button" variant="ghost" onClick={() => setEditingPublishedBrief(true)}>Edit Brief</Button>
                  </div>
                  {saveError && <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2"><p className="text-sm text-red-500">{saveError}</p></div>}
                </div>
              </section>
            ) : (
              <section className="max-w-3xl">
                <p className="text-sm font-medium text-muted-foreground">{activeBriefStep.title}</p>
                <h3 className="mt-2 text-xl font-semibold tracking-normal">{activeBriefStep.question}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{activeBriefStep.helper}</p>

                <div className="mt-5">
                  {activeStep === 0 && <Textarea placeholder="Example: Launch awareness for our summer creator campaign and drive more people to try the product." value={objective} onChange={(e) => setObjective(e.target.value)} className="min-h-32 resize-none border-border bg-background/50 text-base leading-7" />}
                  {activeStep === 1 && <Textarea placeholder="Example: Young women aged 18-25 in Bangkok who follow beauty, lifestyle, and campus creators." value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} className="min-h-32 resize-none border-border bg-background/50 text-base leading-7" />}
                  {activeStep === 2 && <Textarea placeholder="Example: Keep it casual, honest, and creator-led. Show real routines, quick demos, and personal opinions." value={contentDirection} onChange={(e) => setContentDirection(e.target.value)} className="min-h-32 resize-none border-border bg-background/50 text-base leading-7" />}
                  {activeStep === 3 && (
                    <div className="flex max-w-2xl flex-wrap gap-2">
                      {platformOptions.map((platform) => (
                        <Button key={platform} type="button" size="sm" variant={platforms.includes(platform) ? 'default' : 'outline'} className="h-9 rounded-full px-4 text-sm" onClick={() => setPlatforms(platforms.includes(platform) ? platforms.filter((p) => p !== platform) : [...platforms, platform])}>{platform}</Button>
                      ))}
                    </div>
                  )}
                  {activeStep === 4 && (
                    <div className="grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Key message</label>
                        {keyMessages.map((msg, idx) => <Input key={idx} placeholder="What creators must say" value={msg} onChange={(e) => handleArrayUpdate(idx, e.target.value, setKeyMessages, keyMessages)} className="bg-background/50" />)}
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground" onClick={() => addArrayInput(setKeyMessages, keyMessages)}>+ add another</Button>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Brand do rules</label>
                        {brandRulesDo.map((rule, idx) => <Input key={idx} placeholder="What creators should do" value={rule} onChange={(e) => handleArrayUpdate(idx, e.target.value, setBrandRulesDo, brandRulesDo)} className="bg-background/50" />)}
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground" onClick={() => addArrayInput(setBrandRulesDo, brandRulesDo)}>+ add another</Button>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Brand don&apos;t rules</label>
                        {brandRulesDont.map((rule, idx) => <Input key={idx} placeholder="What creators should avoid" value={rule} onChange={(e) => handleArrayUpdate(idx, e.target.value, setBrandRulesDont, brandRulesDont)} className="bg-background/50" />)}
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground" onClick={() => addArrayInput(setBrandRulesDont, brandRulesDont)}>+ add another</Button>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Hashtags</label>
                        {hashtags.map((tag, idx) => <Input key={idx} placeholder="#campaign" value={tag} onChange={(e) => handleArrayUpdate(idx, e.target.value, setHashtags, hashtags)} className="bg-background/50" />)}
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground" onClick={() => addArrayInput(setHashtags, hashtags)}>+ add another</Button>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Mentions</label>
                        {mentions.map((mention, idx) => <Input key={idx} placeholder="@brand" value={mention} onChange={(e) => handleArrayUpdate(idx, e.target.value, setMentions, mentions)} className="bg-background/50" />)}
                        <Button type="button" variant="ghost" size="sm" className="h-8 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground" onClick={() => addArrayInput(setMentions, mentions)}>+ add another</Button>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Call to action</label>
                        <Input placeholder="Example: Tap the link in bio" value={cta} onChange={(e) => setCta(e.target.value)} className="bg-background/50" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Submission Deadline</label>
                        <Input type="date" value={submissionDeadline} onChange={(e) => setSubmissionDeadline(e.target.value)} className="bg-background/50" />
                        <p className="text-xs text-muted-foreground">When should creators submit their draft content for review?</p>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium">Contact / Support</label>
                        <Textarea placeholder="Example: yoonie@rollerkluster.com or your campaign manager's name" value={contactSupport} onChange={(e) => setContactSupport(e.target.value)} className="min-h-24 resize-none bg-background/50" />
                        <p className="text-xs text-muted-foreground">Who should creators contact if they have questions?</p>
                      </div>
                      <div className="space-y-3 md:col-span-2">
                        <div>
                          <label className="text-sm font-medium">Posters / Campaign Images</label>
                          <p className="mt-1 text-xs text-muted-foreground">Attach any campaign posters, key visuals, or reference images creators should follow.</p>
                        </div>
                        <div className="rounded-lg border border-dashed border-border bg-background/50 px-4 py-4">
                          <input ref={posterFileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" multiple className="hidden" onChange={(event) => handlePosterUpload(event.target.files)} />
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-medium text-foreground">Upload images</p>
                              <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, JPEG, or WebP. Up to 5 images, 5MB each.</p>
                            </div>
                            <Button type="button" variant="outline" disabled={isUploadingPosters || posterImageUrls.length >= 5} onClick={() => posterFileInputRef.current?.click()}>
                              {isUploadingPosters ? 'Uploading...' : 'Choose images'}
                            </Button>
                          </div>
                          {posterUploadError && <p className="mt-3 text-sm text-red-500">{posterUploadError}</p>}
                          {posterImageUrls.length > 0 && (
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                              {posterImageUrls.map((url) => (
                                <div key={url} className="overflow-hidden rounded-md border border-border bg-card">
                                  <img src={url} alt="Uploaded campaign visual" className="h-32 w-full object-cover" />
                                  <div className="flex items-center justify-end px-3 py-2">
                                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-red-500" onClick={() => handleRemovePosterImage(url)}>Remove</Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={!canGoBack} onClick={() => setActiveStep((step) => Math.max(step - 1, 0))}>Back</Button>
                    {canGoNext && <Button variant="outline" onClick={() => setActiveStep((step) => Math.min(step + 1, briefSteps.length - 1))}>Continue</Button>}
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    {!currentStepComplete && <p className="text-sm text-muted-foreground">Complete this step to keep the brief moving.</p>}
                    {saveError && <div className="w-full rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 sm:w-80"><p className="text-sm text-red-500">{saveError}</p></div>}
                    {canPublishFromCurrentStep && <Button disabled={isSaving} onClick={() => saveBrief('published')}>{isSaving ? 'Publishing...' : 'Ready to publish'}</Button>}
                  </div>
                </div>
              </section>
            )}
          </main>

          <aside className="sticky top-6 rounded-xl bg-card/45 p-4 shadow-sm">
            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium">{isBriefCompleted ? 'Brief status' : 'Brief progress'}</p>
                <span className="text-sm text-muted-foreground">{displayedCompletionPercentage}%</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background">
                <div className={`h-full transition-all duration-300 ${displayedCompletionPercentage === 100 ? 'bg-green-500' : displayedCompletionPercentage >= 60 ? 'bg-blue-500' : 'bg-yellow-500'}`} style={{ width: `${displayedCompletionPercentage}%` }} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{displayedCompletedCount} of {criteriaFields.length} completed</p>
              <p className="mt-2 text-sm text-foreground">{isBriefCompleted ? (editingPublishedBrief ? 'Editing published brief' : 'Published and ready to send') : nextActionLabel}</p>
            </div>

            {!showPublishedOverview && (
              <div className="mt-5 border-t border-border/60 pt-5">
                <p className="text-sm font-medium">Complete these before publishing</p>
                {remainingFields.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {remainingFields.map((field) => <li key={field.label} className="flex items-center gap-2 text-sm text-muted-foreground"><span className="h-2 w-2 rounded-full bg-muted-foreground/40" />{field.label}</li>)}
                  </ul>
                ) : (
                  <p className="mt-3 flex items-center gap-2 text-sm text-green-500"><span className="h-2 w-2 rounded-full bg-green-500" />Everything is complete.</p>
                )}
              </div>
            )}

            <div className="mt-5 border-t border-border/60 pt-5">
              <p className="text-sm font-medium">Creator brief document</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{isBriefCompleted ? 'Download a professional PDF brief for clients and creators.' : 'Complete all required brief sections before downloading.'}</p>
              <div className="mt-3 space-y-2">
                {isBriefCompleted && <Button type="button" variant="outline" className="w-full" onClick={handleViewCreatorBrief}>View Creator Brief</Button>}
                <Button type="button" className="w-full" disabled={isExportingBrief || !isBriefCompleted} onClick={handleExportCreatorBrief}>{isExportingBrief ? 'Generating...' : 'Download Brief PDF'}</Button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {!isLoading && !errorMessage && !selectedCampaign && (
        <div className="rounded-lg bg-card/40 p-6 text-center">
          <p className="text-sm text-muted-foreground">Campaign brief could not be loaded</p>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 w-[min(320px,calc(100vw-2rem))] rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
          <p className={`text-sm ${toast.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>{toast.message}</p>
        </div>
      )}

      <Dialog open={showPublishSuccess} onOpenChange={setShowPublishSuccess}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Brief published successfully</DialogTitle>
            <DialogDescription>Your creator-facing brief document is ready to view, export, and send.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={handleViewCreatorBrief}>View Creator Brief</Button>
            <Button disabled={isExportingBrief || !isBriefCompleted} onClick={handleExportCreatorBrief}>{isExportingBrief ? 'Generating...' : 'Download Brief PDF'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
