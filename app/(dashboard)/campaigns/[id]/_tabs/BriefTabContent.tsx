'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Loader2, ArrowUp } from 'lucide-react';
import type { BriefAssistResult } from '@/app/api/brief-assist/route';
import { downloadCreatorBriefPdf } from '@/lib/creator-brief-export';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
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

type BriefToast = { message: string; type: 'success' | 'error' };

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
const acceptedPosterMimeTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

const getPosterStoragePath = (url: string) => {
  const bucketPath = `/storage/v1/object/public/${posterBucketName}/`;
  const pathStart = url.indexOf(bucketPath);
  if (pathStart === -1) return '';
  return decodeURIComponent(url.slice(pathStart + bucketPath.length));
};

const platformOptions = ['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Twitter', 'Facebook'];

export default function BriefTabContent({ campaignId }: { campaignId: string }) {
  const posterFileInputRef = useRef<HTMLInputElement | null>(null);
  const saveAfterAiRef = useRef(false);

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [briefs, setBriefs] = useState<BriefView[]>([]);
  const selectedCampaignId = campaignId;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingBrief, setIsExportingBrief] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<BriefToast | null>(null);

  // Brief fields (populated from DB or AI)
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
  const [isUploadingPosters, setIsUploadingPosters] = useState(false);
  const [posterUploadError, setPosterUploadError] = useState<string | null>(null);

  // AI-first flow state
  const [campaignDescription, setCampaignDescription] = useState('');
  const [isAiAssisting, setIsAiAssisting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<BriefAssistResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAiInput, setShowAiInput] = useState(true);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

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
      campaignRows.map((c) => [toText(c.id), toText(c.name) || 'Untitled campaign'])
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
      .sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime());

    setCampaigns(campaignRows);
    setBriefs(normalizedBriefs);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchBriefData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId);
  const selectedBrief = briefs.find((b) => b.campaignId === selectedCampaignId);

  useEffect(() => {
    setObjective(selectedBrief?.objective ?? '');
    setTargetAudience(selectedBrief?.targetAudience ?? '');
    setContentDirection(selectedBrief?.contentDirection ?? '');
    setPlatforms(selectedBrief?.platforms ?? []);
    setKeyMessages(selectedBrief?.keyMessages?.length ? selectedBrief.keyMessages : ['']);
    setBrandRulesDo(selectedBrief?.brandRulesDo?.length ? selectedBrief.brandRulesDo : ['']);
    setBrandRulesDont(selectedBrief?.brandRulesDont?.length ? selectedBrief.brandRulesDont : ['']);
    setHashtags(selectedBrief?.hashtags?.length ? selectedBrief.hashtags : ['']);
    setMentions(selectedBrief?.mentions?.length ? selectedBrief.mentions : ['']);
    setCta(selectedBrief?.cta ?? '');
    setSubmissionDeadline(selectedBrief?.submissionDeadline ?? '');
    setContactSupport(selectedBrief?.contactSupport ?? '');
    setPosterImageUrls(selectedBrief?.posterImageUrls ?? []);
    setSaveError(null);
    setShowAiInput(!selectedBrief);
  }, [campaignId, selectedBrief]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const showToast = (next: BriefToast) => setToast(next);

  const handleSaveFailure = (label: string, error: { message: string; code?: string } | null) => {
    const message = error?.message ?? 'Unable to save brief';
    console.error(label, error);
    setSaveError(message);
    showToast({ message, type: 'error' });
    setIsSaving(false);
  };


  const buildCurrentCreatorBriefDocument = (): CreatorBriefDocument => {
    const keyMessageValues = cleanTextList(keyMessages);
    const brandRulesDoValues = cleanTextList(brandRulesDo);
    const brandRulesDontValues = cleanTextList(brandRulesDont);
    const hashtagValues = cleanTextList(hashtags);
    const mentionValues = cleanTextList(mentions);
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
      campaignGoal: objective || selectedBrief?.objective || '',
      targetAudience: targetAudience || selectedBrief?.targetAudience || '',
      contentDirection: contentDirection || selectedBrief?.contentDirection || '',
      platforms: platforms.length > 0 ? platforms : selectedBrief?.platforms ?? [],
      keyMessages: keyMessageValues.length > 0 ? keyMessageValues : selectedBrief?.keyMessages ?? [],
      brandRulesDo: brandRulesDoValues.length > 0 ? brandRulesDoValues : selectedBrief?.brandRulesDo ?? [],
      brandRulesDont: brandRulesDontValues.length > 0 ? brandRulesDontValues : selectedBrief?.brandRulesDont ?? [],
      hashtags: hashtagValues.length > 0 ? hashtagValues : selectedBrief?.hashtags ?? [],
      mentions: mentionValues.length > 0 ? mentionValues : selectedBrief?.mentions ?? [],
      callToAction: cta || selectedBrief?.cta || '',
      submissionDeadline: formatCampaignDate(submissionDeadline || null) || 'Not set',
      approvalNotes: generatedApprovalNotes || 'Not set',
      contactSupport: contactSupport || 'Not set',
      posterImageUrls,
      status: selectedBrief?.status ?? 'draft',
      updatedAt: selectedBrief?.updatedAt ?? new Date().toISOString(),
    };
  };

  const handleExportCreatorBrief = async () => {
    if (!selectedBrief) { setSaveError('Generate a brief first before downloading.'); return; }
    setIsExportingBrief(true);
    setSaveError(null);
    try {
      await downloadCreatorBriefPdf(buildCurrentCreatorBriefDocument());
    } catch {
      const message = 'Could not generate PDF. Please try again.';
      setSaveError(message);
      showToast({ message, type: 'error' });
    } finally {
      setIsExportingBrief(false);
    }
  };

  const persistPosterImageUrls = async (next: string[]) => {
    if (!selectedBrief?.id) return;
    const result = await saveWithOptionalColumns('briefs', { poster_image_urls: next, updated_at: new Date().toISOString() }, async (payload) =>
      supabase.from('briefs').update(payload).eq('id', selectedBrief.id).select('id').maybeSingle()
    );
    if (result.error) throw result.error;
  };

  const handlePosterUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPosterUploadError(null);
    const selected = Array.from(files);
    const slots = 5 - posterImageUrls.length;
    if (slots <= 0 || selected.length > slots || selected.some((f) => !acceptedPosterMimeTypes.has(f.type) || f.size > 5 * 1024 * 1024)) {
      setPosterUploadError('Please upload a PNG, JPG, JPEG, or WebP image under 5MB.');
      return;
    }
    setIsUploadingPosters(true);
    try {
      const uploaded: string[] = [];
      for (const file of selected) {
        const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
        const uid = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const path = `${selectedCampaignId || 'unassigned'}/${uid}.${ext}`;
        const up = await supabase.storage.from(posterBucketName).upload(path, file, { cacheControl: '3600', upsert: false });
        if (up.error) throw up.error;
        uploaded.push(supabase.storage.from(posterBucketName).getPublicUrl(path).data.publicUrl);
      }
      const next = [...posterImageUrls, ...uploaded];
      setPosterImageUrls(next);
      await persistPosterImageUrls(next);
    } catch (error) {
      setPosterUploadError(error instanceof Error ? error.message : 'Unable to upload image. Please try again.');
    } finally {
      setIsUploadingPosters(false);
      if (posterFileInputRef.current) posterFileInputRef.current.value = '';
    }
  };

  const handleRemovePosterImage = async (url: string) => {
    setPosterUploadError(null);
    const next = posterImageUrls.filter((u) => u !== url);
    setPosterImageUrls(next);
    try {
      await persistPosterImageUrls(next);
      const path = getPosterStoragePath(url);
      if (path) await supabase.storage.from(posterBucketName).remove([path]);
    } catch {
      setPosterUploadError('Unable to remove image. Please try again.');
      setPosterImageUrls(posterImageUrls);
    }
  };

  const saveBrief = async (status: 'draft' | 'published') => {
    if (!selectedCampaignId) { showToast({ message: 'Campaign not found', type: 'error' }); return; }
    setIsSaving(true);
    setSaveError(null);
    setToast(null);

    const now = new Date().toISOString();
    const keyMessageValues = cleanTextList(keyMessages);
    const brandRulesDoValues = cleanTextList(brandRulesDo);
    const brandRulesDontValues = cleanTextList(brandRulesDont);
    const hashtagValues = cleanTextList(hashtags);
    const mentionValues = cleanTextList(mentions);
    const nextPublishedAt = status === 'published' ? now : selectedBrief?.publishedAt;

    const briefPayload = {
      campaign_id: selectedCampaignId,
      raw_brief: JSON.stringify({ campaign_id: selectedCampaignId, objective: objective.trim(), goal: objective.trim(), target_audience: targetAudience.trim(), audience: targetAudience.trim(), content_direction: contentDirection.trim(), platforms, submission_deadline: submissionDeadline || null, contact_support: contactSupport.trim(), poster_image_urls: posterImageUrls, status, published_at: nextPublishedAt }),
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
      completion_percentage: status === 'published' ? 100 : null,
      published_at: nextPublishedAt,
      approval_notes: keyMessageValues.length > 0 ? `Creators must include: ${keyMessageValues.join(', ')}` : '',
      updated_at: now,
    };

    let savedBrief: SupabaseRow | null = null;
    const existingBriefId = selectedBrief?.id;

    if (existingBriefId) {
      const result = await saveWithOptionalColumns('briefs', briefPayload, async (p) =>
        supabase.from('briefs').update(p).eq('id', existingBriefId).select('*').maybeSingle()
      );
      if (result.error) { handleSaveFailure('Brief update error:', result.error); return; }
      savedBrief = (result.data as SupabaseRow | null) ?? null;
    } else {
      const latest = await supabase.from('briefs').select('*').eq('campaign_id', selectedCampaignId).limit(1).maybeSingle();
      if (latest.error) { handleSaveFailure('Brief fetch error:', latest.error); return; }
      const latestId = toText(latest.data?.id);
      if (latestId) {
        const result = await saveWithOptionalColumns('briefs', briefPayload, async (p) =>
          supabase.from('briefs').update(p).eq('id', latestId).select('*').maybeSingle()
        );
        if (result.error) { handleSaveFailure('Brief update error:', result.error); return; }
        savedBrief = (result.data as SupabaseRow | null) ?? null;
      } else {
        const result = await saveWithOptionalColumns('briefs', briefPayload, async (p) =>
          supabase.from('briefs').insert(p).select('*').maybeSingle()
        );
        if (result.error) { handleSaveFailure('Brief insert error:', result.error); return; }
        savedBrief = (result.data as SupabaseRow | null) ?? null;
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
      const existing = await supabase.from('acceptance_criteria').select('*').or(`brief_id.eq.${savedBriefId},campaign_id.eq.${selectedCampaignId}`).limit(1).maybeSingle();
      if (existing.error && !isMissingRelationError(existing.error)) { handleSaveFailure('Criteria fetch error:', existing.error); return; }
      if (!isMissingRelationError(existing.error)) {
        const existingId = toText(existing.data?.id);
        const criteriaResult = existingId
          ? await saveWithOptionalColumns('acceptance_criteria', criteriaPayload, async (p) =>
              supabase.from('acceptance_criteria').update(p).eq('id', existingId).select('*').maybeSingle()
            )
          : await saveWithOptionalColumns('acceptance_criteria', criteriaPayload, async (p) =>
              supabase.from('acceptance_criteria').insert(p).select('*').maybeSingle()
            );
        if (criteriaResult.error && !isMissingRelationError(criteriaResult.error)) { handleSaveFailure('Criteria save error:', criteriaResult.error); return; }
      }
    }

    await fetchBriefData();
    showToast({ message: status === 'published' ? 'Brief published' : 'Brief saved', type: 'success' });
    setIsSaving(false);
  };

  const handleAiAssist = async () => {
    const msg = campaignDescription.trim();
    if (!msg) return;
    setIsAiAssisting(true);
    setAiError(null);
    setAiSuggestions(null);
    try {
      const res = await fetch('/api/brief-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName: toText(selectedCampaign?.name) || 'Untitled campaign',
          clientName: toText(selectedCampaign?.client_name) || '',
          campaignDescription: msg,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setAiError(json.error ?? 'AI assist failed.'); return; }
      setAiSuggestions(json as BriefAssistResult);
    } catch {
      setAiError('Network error. Please try again.');
    } finally {
      setIsAiAssisting(false);
    }
  };

  const applyAiSuggestions = (suggestions: BriefAssistResult) => {
    if (suggestions.objective) setObjective(suggestions.objective);
    if (suggestions.targetAudience) setTargetAudience(suggestions.targetAudience);
    if (suggestions.contentDirection) setContentDirection(suggestions.contentDirection);
    if (suggestions.platforms.length > 0) setPlatforms(suggestions.platforms);
    const cleanMessages = suggestions.keyMessages.filter(Boolean);
    if (cleanMessages.length > 0) setKeyMessages(cleanMessages);
    const cleanDo = suggestions.brandRulesDo.filter(Boolean);
    if (cleanDo.length > 0) setBrandRulesDo(cleanDo);
    const cleanDont = suggestions.brandRulesDont.filter(Boolean);
    if (cleanDont.length > 0) setBrandRulesDont(cleanDont);
    const cleanHashtags = suggestions.hashtags.filter(Boolean);
    if (cleanHashtags.length > 0) setHashtags(cleanHashtags);
    const cleanMentions = suggestions.mentions.filter(Boolean);
    if (cleanMentions.length > 0) setMentions(cleanMentions);
    if (suggestions.cta) setCta(suggestions.cta);
    setAiSuggestions(null);
    setShowAiInput(false);
    if (!selectedBrief) {
      setShowDetailsDialog(true);
    } else {
      saveAfterAiRef.current = true;
    }
  };

  const handleDetailsSave = () => {
    setShowDetailsDialog(false);
    saveBrief('draft');
  };

  // Fires after applyAiSuggestions (edit flow) commits all state, then auto-saves
  useEffect(() => {
    if (!saveAfterAiRef.current) return;
    saveAfterAiRef.current = false;
    saveBrief('draft');
  }); // eslint-disable-line react-hooks/exhaustive-deps


  return (
    <div className="space-y-4">
      {isLoading && <p className="text-sm text-muted-foreground">Loading brief...</p>}

      {!isLoading && errorMessage && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-sm text-red-500">Unable to load brief</p>
          <p className="mt-1 text-xs text-muted-foreground">{errorMessage}</p>
        </div>
      )}

      {!isLoading && !errorMessage && !selectedCampaign && (
        <div className="rounded-lg bg-card/40 p-6 text-center">
          <p className="text-sm text-muted-foreground">Campaign brief could not be loaded</p>
        </div>
      )}

      {!isLoading && !errorMessage && selectedCampaign && (
        <main className="rounded-xl bg-card/35 px-5 py-5 shadow-sm md:px-6 md:py-6">

          {/* AI input — hidden once brief is applied */}
          {showAiInput && (
            <div className="flex flex-col items-center py-8">
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold tracking-tight text-foreground">Create Your Brief with AI</h2>
                <p className="mt-2 text-base text-muted-foreground">Describe your campaign and AI will generate a complete brief instantly.</p>
              </div>
              <div className="ai-input-card w-full max-w-2xl">
                <textarea
                  className="ai-input-textarea"
                  placeholder="Describe your campaign — the goal, target audience, tone, and any requirements…"
                  rows={3}
                  value={campaignDescription}
                  onChange={(e) => setCampaignDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleAiAssist();
                    }
                  }}
                />
                <div className="flex items-center justify-between px-4 pb-4 pt-1">
                  <p className="text-xs text-muted-foreground/50">⌘ Return to send</p>
                  <button
                    className="ai-send-circle"
                    disabled={!campaignDescription.trim() || isAiAssisting}
                    onClick={handleAiAssist}
                    type="button"
                  >
                    {isAiAssisting ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={16} />}
                  </button>
                </div>
              </div>
              {!isAiAssisting && !aiSuggestions && !selectedBrief && (
                <div className="mt-4 w-full max-w-2xl space-y-0.5">
                  {[
                    'Launch a new skincare line for university women in Bangkok on TikTok & Instagram',
                    'Promote an energy drink targeting gym-goers aged 18–25 with an energetic vibe',
                    'Build awareness for a sustainable fashion brand using authentic creator content',
                  ].map((s) => (
                    <button key={s} className="ai-suggestion-row" type="button" onClick={() => setCampaignDescription(s)}>
                      <Sparkles size={12} className="shrink-0 opacity-40" />
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {aiError && <p className="mt-4 text-sm text-red-500">{aiError}</p>}
            </div>
          )}

          {/* Loading state */}
          {isAiAssisting && (
            <div className="flex items-center justify-center gap-3 border-t border-border/40 py-10">
              <Loader2 size={18} className="animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating your brief…</p>
            </div>
          )}

          {/* Inline suggestions review */}
          {!isAiAssisting && aiSuggestions && (
            <section className="space-y-4 border-t border-border/40 pt-6">
              <div>
                <p className="text-sm font-semibold">Review your brief</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Edit any field below, then click Apply to save.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaign Goal</label>
                <Textarea value={aiSuggestions.objective} onChange={(e) => setAiSuggestions({ ...aiSuggestions, objective: e.target.value })} className="min-h-20 resize-none bg-background/50 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target Audience</label>
                <Textarea value={aiSuggestions.targetAudience} onChange={(e) => setAiSuggestions({ ...aiSuggestions, targetAudience: e.target.value })} className="min-h-20 resize-none bg-background/50 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Content Direction</label>
                <Textarea value={aiSuggestions.contentDirection} onChange={(e) => setAiSuggestions({ ...aiSuggestions, contentDirection: e.target.value })} className="min-h-20 resize-none bg-background/50 text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platforms</label>
                <div className="flex flex-wrap gap-2">
                  {platformOptions.map((p) => (
                    <Button key={p} type="button" size="sm" variant={aiSuggestions.platforms.includes(p) ? 'default' : 'outline'} className="h-8 rounded-full px-3 text-xs"
                      onClick={() => setAiSuggestions({ ...aiSuggestions, platforms: aiSuggestions.platforms.includes(p) ? aiSuggestions.platforms.filter((x) => x !== p) : [...aiSuggestions.platforms, p] })}>
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key Messages <span className="normal-case font-normal">(one per line)</span></label>
                <Textarea value={aiSuggestions.keyMessages.join('\n')} onChange={(e) => setAiSuggestions({ ...aiSuggestions, keyMessages: e.target.value.split('\n') })} className="min-h-20 resize-none bg-background/50 text-sm" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand Do Rules <span className="normal-case font-normal">(one per line)</span></label>
                  <Textarea value={aiSuggestions.brandRulesDo.join('\n')} onChange={(e) => setAiSuggestions({ ...aiSuggestions, brandRulesDo: e.target.value.split('\n') })} className="min-h-24 resize-none bg-background/50 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand Don&apos;t Rules <span className="normal-case font-normal">(one per line)</span></label>
                  <Textarea value={aiSuggestions.brandRulesDont.join('\n')} onChange={(e) => setAiSuggestions({ ...aiSuggestions, brandRulesDont: e.target.value.split('\n') })} className="min-h-24 resize-none bg-background/50 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hashtags <span className="normal-case font-normal">(one per line)</span></label>
                  <Textarea value={aiSuggestions.hashtags.join('\n')} onChange={(e) => setAiSuggestions({ ...aiSuggestions, hashtags: e.target.value.split('\n') })} className="min-h-20 resize-none bg-background/50 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mentions <span className="normal-case font-normal">(one per line)</span></label>
                  <Textarea value={aiSuggestions.mentions.join('\n')} onChange={(e) => setAiSuggestions({ ...aiSuggestions, mentions: e.target.value.split('\n') })} className="min-h-20 resize-none bg-background/50 text-sm" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Call to Action</label>
                <Input value={aiSuggestions.cta} onChange={(e) => setAiSuggestions({ ...aiSuggestions, cta: e.target.value })} className="bg-background/50 text-sm" />
              </div>
              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setAiSuggestions(null)}>Discard</Button>
                <Button className="gap-2" onClick={() => applyAiSuggestions(aiSuggestions)}>
                  <Sparkles size={15} />
                  Apply all
                </Button>
              </div>
            </section>
          )}

          {/* Brief summary — shown after applying */}
          {!isAiAssisting && !aiSuggestions && selectedBrief && (
            <section className="max-w-4xl space-y-6 border-t border-border/40 pt-6">
              <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3">
                <p className="text-sm font-medium text-green-700">Brief ready</p>
                <p className="mt-0.5 text-sm text-green-700/80">
                  Saved. Type a new description above to regenerate, or download the PDF.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Campaign Goal</p>
                  <p className="text-sm leading-6 text-foreground">{selectedBrief.objective || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Target Audience</p>
                  <p className="text-sm leading-6 text-foreground">{selectedBrief.targetAudience || '—'}</p>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Content Direction</p>
                  <p className="whitespace-pre-line text-sm leading-6 text-foreground">{selectedBrief.contentDirection || '—'}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Platforms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedBrief.platforms.length > 0
                      ? selectedBrief.platforms.map((p) => (
                          <span key={p} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{p}</span>
                        ))
                      : <span className="text-sm text-muted-foreground">—</span>}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Call to Action</p>
                  <p className="text-sm leading-6 text-foreground">{selectedBrief.cta || '—'}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key Messages</p>
                  <ul className="space-y-1.5">
                    {selectedBrief.keyMessages.length > 0
                      ? selectedBrief.keyMessages.map((m, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{m}
                          </li>
                        ))
                      : <li className="text-sm text-muted-foreground">—</li>}
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand Do Rules</p>
                  <ul className="space-y-1.5">
                    {selectedBrief.brandRulesDo.length > 0
                      ? selectedBrief.brandRulesDo.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />{r}
                          </li>
                        ))
                      : <li className="text-sm text-muted-foreground">—</li>}
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Brand Don&apos;t Rules</p>
                  <ul className="space-y-1.5">
                    {selectedBrief.brandRulesDont.length > 0
                      ? selectedBrief.brandRulesDont.map((r, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />{r}
                          </li>
                        ))
                      : <li className="text-sm text-muted-foreground">—</li>}
                  </ul>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hashtags</p>
                  <p className="text-sm text-foreground">{selectedBrief.hashtags.join('   ') || '—'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mentions</p>
                  <p className="text-sm text-foreground">{selectedBrief.mentions.join('   ') || '—'}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border/60 pt-5">
                <Button type="button" disabled={isExportingBrief} onClick={handleExportCreatorBrief}>
                  {isExportingBrief ? 'Generating...' : 'Download Brief'}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setCampaignDescription(''); setAiSuggestions(null); setShowAiInput(true); }}>
                  Regenerate with AI
                </Button>
                <Button type="button" variant="outline" onClick={() => setAiSuggestions({ objective, targetAudience, contentDirection, platforms, keyMessages: keyMessages.filter(Boolean), brandRulesDo: brandRulesDo.filter(Boolean), brandRulesDont: brandRulesDont.filter(Boolean), hashtags: hashtags.filter(Boolean), mentions: mentions.filter(Boolean), cta })}>
                  Edit Brief
                </Button>
              </div>

              {saveError && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                  <p className="text-sm text-red-500">{saveError}</p>
                </div>
              )}

                {/* Additional details — editable after brief is saved */}
                <div className="border-t border-border/60 pt-5">
                  <p className="text-sm font-semibold">Additional details</p>
                  <p className="mt-1 text-xs text-muted-foreground">Submission deadline, contact info, and campaign posters.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Submission Deadline</label>
                      <Input type="date" value={submissionDeadline} onChange={(e) => setSubmissionDeadline(e.target.value)} className="bg-background/50" />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-sm font-medium">Contact / Support</label>
                      <Textarea
                        placeholder="Who should creators contact if they have questions?"
                        value={contactSupport}
                        onChange={(e) => setContactSupport(e.target.value)}
                        className="min-h-20 resize-none bg-background/50"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <label className="text-sm font-medium">Posters / Campaign Images</label>
                      <div className="rounded-lg border border-dashed border-border bg-background/50 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">PNG, JPG, WebP · up to 5 images · 5MB each</p>
                          <Button type="button" variant="outline" size="sm" disabled={isUploadingPosters || posterImageUrls.length >= 5} onClick={() => posterFileInputRef.current?.click()}>
                            {isUploadingPosters ? 'Uploading...' : 'Choose images'}
                          </Button>
                        </div>
                        {posterUploadError && <p className="mt-2 text-sm text-red-500">{posterUploadError}</p>}
                        {posterImageUrls.length > 0 && (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {posterImageUrls.map((url) => (
                              <div key={url} className="overflow-hidden rounded-md border border-border bg-card">
                                <img src={url} alt="Campaign visual" className="h-28 w-full object-cover" />
                                <div className="flex justify-end px-3 py-1.5">
                                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-red-500" onClick={() => handleRemovePosterImage(url)}>Remove</Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="mt-4" disabled={isSaving} onClick={() => saveBrief('draft')}>
                    {isSaving ? 'Saving...' : 'Save details'}
                  </Button>
                </div>
              </section>
            )}
        </main>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 w-[min(320px,calc(100vw-2rem))] rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
          <p className={`text-sm ${toast.type === 'success' ? 'text-green-500' : 'text-red-500'}`}>{toast.message}</p>
        </div>
      )}

      {/* Hidden file input — always in DOM so dialog can trigger it */}
      <input ref={posterFileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" multiple className="hidden" onChange={(e) => handlePosterUpload(e.target.files)} />

      {/* Additional details popup — appears after first "Apply all" */}
      <Dialog open={showDetailsDialog} onOpenChange={(open) => { if (!open) handleDetailsSave(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add campaign details</DialogTitle>
            <DialogDescription>
              These optional details will appear on the creator brief. You can skip and update them later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Submission Deadline</label>
              <Input type="date" value={submissionDeadline} onChange={(e) => setSubmissionDeadline(e.target.value)} className="bg-background/50" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Contact / Support</label>
              <Textarea
                placeholder="Who should creators contact if they have questions?"
                value={contactSupport}
                onChange={(e) => setContactSupport(e.target.value)}
                className="min-h-20 resize-none bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Posters / Campaign Images</label>
              <div className="rounded-lg border border-dashed border-border bg-background/50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">PNG, JPG, WebP · up to 5 images · 5MB each</p>
                  <Button type="button" variant="outline" size="sm" disabled={isUploadingPosters || posterImageUrls.length >= 5} onClick={() => posterFileInputRef.current?.click()}>
                    {isUploadingPosters ? 'Uploading...' : 'Choose images'}
                  </Button>
                </div>
                {posterUploadError && <p className="mt-2 text-sm text-red-500">{posterUploadError}</p>}
                {posterImageUrls.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {posterImageUrls.map((url) => (
                      <div key={url} className="overflow-hidden rounded-md border border-border bg-card">
                        <img src={url} alt="Campaign visual" className="h-28 w-full object-cover" />
                        <div className="flex justify-end px-3 py-1.5">
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-red-500" onClick={() => handleRemovePosterImage(url)}>Remove</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={handleDetailsSave}>Skip for now</Button>
            <Button type="button" disabled={isSaving} onClick={handleDetailsSave}>
              {isSaving ? 'Saving…' : 'Save & continue'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
