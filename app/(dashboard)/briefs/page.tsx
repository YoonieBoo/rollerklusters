'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

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
  status: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type BriefToast = {
  message: string;
  type: 'success' | 'error';
  showReviewsAction?: boolean;
};

const toText = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
};

const toTextList = (value: unknown) => {
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

const withSingleInput = (items: string[]) => (items.length > 0 ? items : ['']);

const cleanTextList = (items: string[]) =>
  items.map((item) => item.trim()).filter(Boolean);

const getMissingColumnName = (message: string) => {
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" of relation/i,
    /column "([^"]+)" does not exist/i,
    /record "new" has no field "([^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
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

    if (!result.error) {
      return { ...result, removedColumns };
    }

    const missingColumn = getMissingColumnName(result.error.message);

    if (!missingColumn || !(missingColumn in nextPayload)) {
      return { ...result, removedColumns };
    }

    const { [missingColumn]: _removed, ...trimmedPayload } = nextPayload;
    nextPayload = trimmedPayload as T;
    removedColumns.push(`${tableName}.${missingColumn}`);
  }

  return {
    data: null,
    error: { message: `Unable to save ${tableName}: too many schema retries` },
    removedColumns,
  };
};

const formatDate = (date: string | null) => {
  if (!date) {
    return 'N/A';
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'N/A';
  }

  return parsedDate.toLocaleDateString();
};

export default function BriefsPage() {
  const router = useRouter();
  const firstBriefSectionRef = useRef<HTMLElement | null>(null);
  const hasScrolledToBriefRef = useRef(false);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [briefs, setBriefs] = useState<BriefView[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
  const [activeStep, setActiveStep] = useState(0);

  const platformOptions = ['Instagram', 'TikTok', 'YouTube', 'LinkedIn', 'Twitter', 'Facebook'];

  const fetchBriefData = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const queryCampaignId =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('campaign')
        : null;

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
    const criteriaRows = criteriaTableMissing
      ? []
      : ((criteriaResult.data ?? []) as SupabaseRow[]);

      const campaignNames = new Map(
        campaignRows.map((campaign) => [
          toText(campaign.id),
          toText(campaign.name) || 'Untitled campaign',
        ])
      );

      const criteriaByBriefId = new Map(
        criteriaRows.map((criteria) => [toText(criteria.brief_id), criteria])
      );
      const criteriaByCampaignId = new Map(
        criteriaRows.map((criteria) => [toText(criteria.campaign_id), criteria])
      );

    const normalizedBriefs = briefRows
      .map((brief) => {
        const briefId = toText(brief.id);
        const campaignId = toText(brief.campaign_id);
        const criteria =
          criteriaByBriefId.get(briefId) ?? criteriaByCampaignId.get(campaignId) ?? {};
        const requiredElements = criteria.required_elements as SupabaseRow | undefined;

        return {
          id: briefId,
          campaignId,
          campaignName: campaignNames.get(campaignId) ?? 'Untitled campaign',
          objective: toText(brief.objective),
          targetAudience: toText(brief.target_audience),
          contentDirection: toTextList(brief.content_direction).join('\n'),
          platforms: toTextList(brief.platforms),
          keyMessages: toTextList(criteria.key_messages),
          brandRulesDo: toTextList(criteria.brand_rules_do),
          brandRulesDont: toTextList(criteria.brand_rules_dont),
          hashtags: toTextList(criteria.hashtags ?? requiredElements?.hashtags),
          mentions: toTextList(criteria.mentions ?? requiredElements?.mentions),
          cta: toText(criteria.cta ?? requiredElements?.cta),
          status: toText(brief.status) || null,
          createdAt: toText(brief.created_at) || null,
          updatedAt: toText(brief.updated_at) || null,
        };
      })
      .sort((firstBrief, secondBrief) => {
        const firstDate = new Date(firstBrief.updatedAt ?? firstBrief.createdAt ?? 0).getTime();
        const secondDate = new Date(secondBrief.updatedAt ?? secondBrief.createdAt ?? 0).getTime();

        return secondDate - firstDate;
      });

    setCampaigns(campaignRows);
    setBriefs(normalizedBriefs);
    setSelectedCampaignId((currentCampaignId) => {
      if (
        queryCampaignId &&
        campaignRows.some((campaign) => toText(campaign.id) === queryCampaignId)
      ) {
        return queryCampaignId;
      }

      if (currentCampaignId) {
        return currentCampaignId;
      }

      return toText(campaignRows[0]?.id) || normalizedBriefs[0]?.campaignId || '';
    });
    setIsLoading(false);
  };

  useEffect(() => {
    fetchBriefData();
  }, []);

  const selectedCampaign = campaigns.find((campaign) => campaign.id === selectedCampaignId);
  const selectedBrief = briefs.find((brief) => brief.campaignId === selectedCampaignId);

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
    setSaveError(null);
    setActiveStep(0);
  }, [selectedCampaignId, selectedBrief]);

  useEffect(() => {
    const queryCampaignId = new URLSearchParams(window.location.search).get('campaign');

    if (
      isLoading ||
      !selectedCampaign ||
      !queryCampaignId ||
      queryCampaignId !== selectedCampaignId ||
      hasScrolledToBriefRef.current
    ) {
      return;
    }

    hasScrolledToBriefRef.current = true;
    window.requestAnimationFrame(() => {
      firstBriefSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [isLoading, selectedCampaign, selectedCampaignId]);

  const handleArrayUpdate = (
    index: number,
    value: string,
    setter: (value: string[]) => void,
    array: string[]
  ) => {
    const newArray = [...array];
    newArray[index] = value;
    setter(newArray);
  };

  const addArrayInput = (
    setter: (value: string[]) => void,
    array: string[]
  ) => {
    setter([...array, '']);
  };

  const handleCampaignChange = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    setSaveError(null);
    setToast(null);
  };

  const showToast = (nextToast: BriefToast) => {
    setToast(nextToast);
  };

  const handleSaveFailure = (
    label: string,
    error: { message: string; code?: string } | null
  ) => {
    const message = error?.message ?? 'Unable to save brief';
    console.error(label, error);
    setSaveError(message);
    showToast({ message, type: 'error' });
    setIsSaving(false);
  };

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  const briefComplete = objective.trim() !== '' && 
    targetAudience.trim() !== '' && 
    contentDirection.trim() !== '' &&
    platforms.length > 0 &&
    keyMessages.some(msg => msg.trim() !== '') &&
    brandRulesDo.some(rule => rule.trim() !== '') &&
    brandRulesDont.some(rule => rule.trim() !== '') &&
    hashtags.some(tag => tag.trim() !== '') &&
    mentions.some(mention => mention.trim() !== '') &&
    cta.trim() !== '';

  const criteriaFields = [
    { label: 'Campaign goal', complete: objective.trim() !== '' },
    { label: 'Target audience', complete: targetAudience.trim() !== '' },
    { label: 'Content direction', complete: contentDirection.trim() !== '' },
    { label: 'Platforms', complete: platforms.length > 0 },
    { label: 'Key message', complete: keyMessages.some(msg => msg.trim() !== '') },
    { label: 'Brand do rules', complete: brandRulesDo.some(rule => rule.trim() !== '') },
    { label: 'Brand don’t rules', complete: brandRulesDont.some(rule => rule.trim() !== '') },
    { label: 'Hashtags', complete: hashtags.some(tag => tag.trim() !== '') },
    { label: 'Mentions', complete: mentions.some(mention => mention.trim() !== '') },
    { label: 'Call to action', complete: cta.trim() !== '' },
  ];

  const completedCount = criteriaFields.filter(f => f.complete).length;
  const completionPercentage = Math.round((completedCount / criteriaFields.length) * 100);
  const remainingFields = criteriaFields.filter((field) => !field.complete);
  const remainingLabels = remainingFields.map((field) => field.label);
  const briefSteps = [
    {
      title: 'Step 1 — Campaign Goal',
      question: 'What is the main goal of this campaign?',
      helper: 'Write the outcome your team wants creators to help achieve.',
      complete: objective.trim() !== '',
    },
    {
      title: 'Step 2 — Target Audience',
      question: 'Who are you trying to reach?',
      helper: 'Describe the people this campaign should speak to.',
      complete: targetAudience.trim() !== '',
    },
    {
      title: 'Step 3 — Content Direction',
      question: 'What should the creator content feel like?',
      helper: 'Give creators a simple direction for tone, story, and style.',
      complete: contentDirection.trim() !== '',
    },
    {
      title: 'Step 4 — Platforms',
      question: 'Where should creators post?',
      helper: 'Pick the channels that matter for this campaign.',
      complete: platforms.length > 0,
    },
    {
      title: 'Step 5 — Approval Notes',
      question: 'What does approved content need to include?',
      helper: 'Add the simple rules reviewers should check before approving content.',
      complete:
        keyMessages.some((msg) => msg.trim() !== '') &&
        brandRulesDo.some((rule) => rule.trim() !== '') &&
        brandRulesDont.some((rule) => rule.trim() !== '') &&
        hashtags.some((tag) => tag.trim() !== '') &&
        mentions.some((mention) => mention.trim() !== '') &&
        cta.trim() !== '',
    },
  ];
  const activeBriefStep = briefSteps[activeStep] ?? briefSteps[0];
  const nextIncompleteStepIndex = briefSteps.findIndex((step) => !step.complete);
  const nextActionLabel =
    nextIncompleteStepIndex === -1
      ? 'Ready to publish'
      : `Next section: ${briefSteps[nextIncompleteStepIndex].title.replace(/^Step \d+ — /, '')}`;
  const currentStepComplete = activeBriefStep?.complete ?? false;
  const canGoBack = activeStep > 0;
  const canGoNext = activeStep < briefSteps.length - 1;
  const isFinalStep = activeStep === briefSteps.length - 1;
  const canPublishFromCurrentStep = isFinalStep && briefComplete;

  const validateBrief = (requireComplete: boolean) => {
    if (!selectedCampaignId) {
      return 'Please select a campaign';
    }

    if (requireComplete && !briefComplete) {
      return `Missing before publish: ${remainingLabels.join(', ')}`;
    }

    return null;
  };

  const saveBrief = async (status: 'draft' | 'published') => {
    const validationError = validateBrief(status === 'published');

    if (validationError) {
      setSaveError(validationError);
      console.error('Brief validation error:', { message: validationError });
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
    const rawBrief = {
      objective: objective.trim(),
      target_audience: targetAudience.trim(),
      content_direction: contentDirection.trim(),
      platforms,
      acceptance_criteria: {
        key_messages: keyMessageValues,
        brand_rules_do: brandRulesDoValues,
        brand_rules_dont: brandRulesDontValues,
        required_elements: {
          hashtags: hashtagValues,
          mentions: mentionValues,
          cta: cta.trim(),
        },
      },
    };
    const briefPayload = {
      campaign_id: selectedCampaignId,
      raw_brief: JSON.stringify(rawBrief),
      objective: objective.trim(),
      target_audience: targetAudience.trim(),
      content_direction: contentDirection.trim(),
      platforms,
      status,
      updated_at: now,
    };

    let savedBrief: SupabaseRow | null = null;
    const existingBriefId = selectedBrief?.id;

    if (existingBriefId) {
      const updateResult = await saveWithOptionalColumns('briefs', briefPayload, async (payload) =>
        supabase
          .from('briefs')
          .update(payload)
          .eq('id', existingBriefId)
          .select('*')
          .maybeSingle()
      );

      if (updateResult.error) {
        handleSaveFailure('Supabase brief update error:', updateResult.error);
        return;
      }

      savedBrief = (updateResult.data as SupabaseRow | null) ?? null;
    } else {
      const latestBriefResult = await supabase
        .from('briefs')
        .select('*')
        .eq('campaign_id', selectedCampaignId)
        .limit(1)
        .maybeSingle();

      if (latestBriefResult.error) {
        handleSaveFailure('Supabase latest brief fetch error:', latestBriefResult.error);
        return;
      }

      const latestBriefId = toText(latestBriefResult.data?.id);

      if (latestBriefId) {
        const updateResult = await saveWithOptionalColumns('briefs', briefPayload, async (payload) =>
          supabase
            .from('briefs')
            .update(payload)
            .eq('id', latestBriefId)
            .select('*')
            .maybeSingle()
        );

        if (updateResult.error) {
          handleSaveFailure('Supabase brief update existing campaign brief error:', updateResult.error);
          return;
        }

        savedBrief = (updateResult.data as SupabaseRow | null) ?? null;
      } else {
        const insertResult = await saveWithOptionalColumns('briefs', briefPayload, async (payload) =>
          supabase.from('briefs').insert(payload).select('*').maybeSingle()
        );

        if (insertResult.error) {
          handleSaveFailure('Supabase brief insert error:', insertResult.error);
          return;
        }

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
      required_elements: {
        hashtags: hashtagValues,
        mentions: mentionValues,
        cta: cta.trim(),
      },
      updated_at: now,
    };

    if (savedBriefId) {
      const existingCriteriaResult = await supabase
        .from('acceptance_criteria')
        .select('*')
        .or(`brief_id.eq.${savedBriefId},campaign_id.eq.${selectedCampaignId}`)
        .limit(1)
        .maybeSingle();

      if (existingCriteriaResult.error && !isMissingRelationError(existingCriteriaResult.error)) {
        handleSaveFailure(
          'Supabase acceptance criteria fetch error:',
          existingCriteriaResult.error
        );
        return;
      }

      if (!isMissingRelationError(existingCriteriaResult.error)) {
        const existingCriteriaId = toText(existingCriteriaResult.data?.id);
        const criteriaResult = existingCriteriaId
          ? await saveWithOptionalColumns('acceptance_criteria', criteriaPayload, async (payload) =>
              supabase
                .from('acceptance_criteria')
                .update(payload)
                .eq('id', existingCriteriaId)
                .select('*')
                .maybeSingle()
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
      const campaignStatusResult = await saveWithOptionalColumns(
        'campaigns',
        {
          status: 'ready_for_review',
          updated_at: now,
        },
        async (payload) =>
          supabase
            .from('campaigns')
            .update(payload)
            .eq('id', selectedCampaignId)
            .select('id')
            .maybeSingle()
      );

      if (campaignStatusResult.error) {
        handleSaveFailure('Supabase campaign ready_for_review update error:', campaignStatusResult.error);
        return;
      }
    }

    await fetchBriefData();
    if (status === 'published') {
      setShowPublishSuccess(true);
    } else {
      showToast({ message: 'Draft saved', type: 'success' });
    }
    setIsSaving(false);
  };

  return (
    <div className="space-y-4">
      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading briefs...</p>
      )}

      {!isLoading && errorMessage && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
          <p className="text-sm text-red-500">Unable to load briefs</p>
          <p className="mt-1 text-xs text-muted-foreground">{errorMessage}</p>
        </div>
      )}

      {!isLoading && !errorMessage && campaigns.length === 0 && (
        <div className="rounded-md border border-border bg-card/40 p-4">
          <p className="text-sm text-foreground">No campaigns yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create your first campaign before writing a brief.
          </p>
        </div>
      )}

      {!isLoading && !errorMessage && selectedCampaign && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-start">
          <main
            ref={firstBriefSectionRef}
            className="rounded-xl bg-card/35 px-5 py-5 shadow-sm scroll-mt-6 md:px-6 md:py-6"
          >
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  {selectedBrief
                    ? `Last saved ${formatDate(selectedBrief.updatedAt ?? selectedBrief.createdAt)}`
                    : 'New brief'}
                </p>
                <h2 className="mt-0.5 text-xl font-semibold">
                  {selectedBrief?.campaignName ??
                    toText(selectedCampaign.name) ??
                    'Untitled campaign'}
                </h2>
              </div>
              <div className="flex flex-col items-start gap-3 md:items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                  disabled={isSaving}
                  onClick={() => saveBrief('draft')}
                >
                  {isSaving ? 'Saving...' : 'Save draft'}
                </Button>
                <div className="flex items-center gap-1.5">
                  {briefSteps.map((step, index) => (
                    <button
                      key={step.title}
                      type="button"
                      onClick={() => setActiveStep(index)}
                      className={`h-2.5 rounded-full transition-all ${
                        index === activeStep
                          ? 'w-8 bg-primary'
                          : step.complete
                          ? 'w-2.5 bg-green-500'
                          : 'w-2.5 bg-muted'
                      }`}
                      aria-label={`Open ${step.title}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <section className="max-w-3xl">
              <p className="text-sm font-medium text-muted-foreground">
                {activeBriefStep.title}
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-normal">
                {activeBriefStep.question}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeBriefStep.helper}
              </p>

              <div className="mt-5">
                {activeStep === 0 && (
                  <Textarea
                    placeholder="Example: Launch awareness for our summer creator campaign and drive more people to try the product."
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    className="min-h-32 resize-none border-border bg-background/50 text-base leading-7"
                  />
                )}

                {activeStep === 1 && (
                  <Textarea
                    placeholder="Example: Young women aged 18-25 in Bangkok who follow beauty, lifestyle, and campus creators."
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    className="min-h-32 resize-none border-border bg-background/50 text-base leading-7"
                  />
                )}

                {activeStep === 2 && (
                  <Textarea
                    placeholder="Example: Keep it casual, honest, and creator-led. Show real routines, quick demos, and personal opinions."
                    value={contentDirection}
                    onChange={(e) => setContentDirection(e.target.value)}
                    className="min-h-32 resize-none border-border bg-background/50 text-base leading-7"
                  />
                )}

                {activeStep === 3 && (
                  <div className="flex max-w-2xl flex-wrap gap-2">
                    {platformOptions.map((platform) => (
                      <Button
                        key={platform}
                        type="button"
                        size="sm"
                        variant={platforms.includes(platform) ? 'default' : 'outline'}
                        className="h-9 rounded-full px-4 text-sm"
                        onClick={() => {
                          if (platforms.includes(platform)) {
                            setPlatforms(platforms.filter((p) => p !== platform));
                          } else {
                            setPlatforms([...platforms, platform]);
                          }
                        }}
                      >
                        {platform}
                      </Button>
                    ))}
                  </div>
                )}

                {activeStep === 4 && (
                  <div className="grid grid-cols-1 gap-x-6 gap-y-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Key message</label>
                      {keyMessages.map((msg, idx) => (
                        <Input
                          key={idx}
                          placeholder="What creators must say"
                          value={msg}
                          onChange={(e) =>
                            handleArrayUpdate(idx, e.target.value, setKeyMessages, keyMessages)
                          }
                          className="bg-background/50"
                        />
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                        onClick={() => addArrayInput(setKeyMessages, keyMessages)}
                      >
                        + add another
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Brand do rules</label>
                      {brandRulesDo.map((rule, idx) => (
                        <Input
                          key={idx}
                          placeholder="What creators should do"
                          value={rule}
                          onChange={(e) =>
                            handleArrayUpdate(idx, e.target.value, setBrandRulesDo, brandRulesDo)
                          }
                          className="bg-background/50"
                        />
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                        onClick={() => addArrayInput(setBrandRulesDo, brandRulesDo)}
                      >
                        + add another
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Brand don’t rules</label>
                      {brandRulesDont.map((rule, idx) => (
                        <Input
                          key={idx}
                          placeholder="What creators should avoid"
                          value={rule}
                          onChange={(e) =>
                            handleArrayUpdate(idx, e.target.value, setBrandRulesDont, brandRulesDont)
                          }
                          className="bg-background/50"
                        />
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                        onClick={() => addArrayInput(setBrandRulesDont, brandRulesDont)}
                      >
                        + add another
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Hashtags</label>
                      {hashtags.map((tag, idx) => (
                        <Input
                          key={idx}
                          placeholder="#campaign"
                          value={tag}
                          onChange={(e) =>
                            handleArrayUpdate(idx, e.target.value, setHashtags, hashtags)
                          }
                          className="bg-background/50"
                        />
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                        onClick={() => addArrayInput(setHashtags, hashtags)}
                      >
                        + add another
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Mentions</label>
                      {mentions.map((mention, idx) => (
                        <Input
                          key={idx}
                          placeholder="@brand"
                          value={mention}
                          onChange={(e) =>
                            handleArrayUpdate(idx, e.target.value, setMentions, mentions)
                          }
                          className="bg-background/50"
                        />
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                        onClick={() => addArrayInput(setMentions, mentions)}
                      >
                        + add another
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Call to action</label>
                      <Input
                        placeholder="Example: Tap the link in bio"
                        value={cta}
                        onChange={(e) => setCta(e.target.value)}
                        className="bg-background/50"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={!canGoBack}
                    onClick={() => setActiveStep((step) => Math.max(step - 1, 0))}
                  >
                    Back
                  </Button>
                  {canGoNext && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        setActiveStep((step) => Math.min(step + 1, briefSteps.length - 1))
                      }
                    >
                      Continue
                    </Button>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  {!currentStepComplete && (
                    <p className="text-sm text-muted-foreground">
                      Complete this step to keep the brief moving.
                    </p>
                  )}
                  {saveError && (
                    <div className="w-full rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 sm:w-80">
                      <p className="text-sm text-red-500">{saveError}</p>
                    </div>
                  )}
                  {canPublishFromCurrentStep && (
                    <Button
                      disabled={isSaving}
                      onClick={() => saveBrief('published')}
                    >
                      {isSaving ? 'Publishing...' : 'Ready to publish'}
                    </Button>
                  )}
                </div>
              </div>
            </section>
          </main>

          <aside className="sticky top-6 rounded-xl bg-card/45 p-4 shadow-sm">
            <div className="mb-5 border-b border-border/60 pb-5">
              <label className="block text-sm font-medium">Choose campaign</label>
              <Select value={selectedCampaignId} onValueChange={handleCampaignChange}>
                <SelectTrigger className="mt-2 bg-card/70 border-border">
                  <SelectValue placeholder="Choose a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((campaign) => (
                    <SelectItem key={toText(campaign.id)} value={toText(campaign.id)}>
                      {toText(campaign.name) || 'Untitled campaign'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">
                This brief will be linked to the selected campaign.
              </p>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium">Brief progress</p>
                <span className="text-sm text-muted-foreground">{completionPercentage}%</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background">
                <div
                  className={`h-full transition-all duration-300 ${
                    completionPercentage === 100
                      ? 'bg-green-500'
                      : completionPercentage >= 60
                      ? 'bg-blue-500'
                      : 'bg-yellow-500'
                  }`}
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {completedCount} of {criteriaFields.length} completed
              </p>
              <p className="mt-2 text-sm text-foreground">{nextActionLabel}</p>
            </div>

            <div className="mt-5 border-t border-border/60 pt-5">
              <p className="text-sm font-medium">Complete these before publishing</p>
              {remainingFields.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {remainingFields.map((field) => (
                    <li
                      key={field.label}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                      {field.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-sm text-green-500">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Everything is complete.
                </p>
              )}
            </div>

          </aside>
        </div>
      )}

      {!isLoading && !errorMessage && !selectedCampaign && campaigns.length > 0 && (
        <div className="rounded-lg bg-card/40 p-6 text-center">
          <p className="text-sm text-muted-foreground">Select a campaign to edit its brief</p>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 w-[min(320px,calc(100vw-2rem))] rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
          <p
            className={`text-sm ${
              toast.type === 'success' ? 'text-green-500' : 'text-red-500'
            }`}
          >
            {toast.message}
          </p>
          {toast.showReviewsAction && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() =>
                router.push(`/reviews?campaign=${encodeURIComponent(selectedCampaignId)}`)
              }
            >
              Go to reviews
            </Button>
          )}
        </div>
      )}

      <Dialog open={showPublishSuccess} onOpenChange={setShowPublishSuccess}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Brief published successfully</DialogTitle>
            <DialogDescription>
              Your campaign brief is now ready for review.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => router.push('/campaigns')}
            >
              Back to Campaigns
            </Button>
            <Button
              onClick={() =>
                router.push(`/reviews?campaign=${encodeURIComponent(selectedCampaignId)}`)
              }
            >
              Go to Reviews
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
