'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Send, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/lib/supabase/client';

type Campaign = {
  id: string;
  name: string | null;
  client_name: string | null;
};

type InviteCreator = {
  id: string;
  userId: string;
  name: string;
  email: string;
  handle: string;
  tags: string[];
};

const addArrayTags = (value: unknown, tags: Set<string>) => {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((v) => { if (v && typeof v === 'string' && v.trim()) tags.add(v.trim()); });
    return;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        parsed.forEach((v) => { if (v && typeof v === 'string' && v.trim()) tags.add(v.trim()); });
        return;
      }
    } catch { /* not json */ }
  }
};

const extractCreatorTags = (row: Record<string, unknown>): string[] => {
  const tags = new Set<string>();
  // Use the clean structured fields from creator_profiles
  addArrayTags(row.content_categories, tags);
  addArrayTags(row.content_types, tags);
  return Array.from(tags);
};

function InvitesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');

  const [mode, setMode] = useState<'creators' | 'manual'>('creators');
  const [creators, setCreators] = useState<InviteCreator[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [manualEmails, setManualEmails] = useState('');

  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ success?: string; error?: string } | null>(null);

  // Keep a ref so the refresh callback always sees the latest campaign id
  const selectedCampaignIdRef = useRef(selectedCampaignId);
  useEffect(() => { selectedCampaignIdRef.current = selectedCampaignId; }, [selectedCampaignId]);

  const fetchCreators = async (showLoading = true) => {
    const campaignId = selectedCampaignIdRef.current;
    if (!campaignId) { setCreators([]); return; }
    if (showLoading) setCreatorsLoading(true);

    // Server route uses admin client to join auth.users for emails
    const res = await fetch('/api/creators-with-email');
    const profileData: Record<string, unknown>[] = res.ok ? await res.json() : [];

    const seenIds = new Set<string>();
    const seenEmails = new Set<string>();
    const list: InviteCreator[] = [];

    for (const row of profileData) {
      const id = String(row.id ?? '');
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const email = String(row.email ?? '').trim().toLowerCase();
      // Deduplicate by email when present, but never drop a creator just for missing email
      if (email && seenEmails.has(email)) continue;
      if (email) seenEmails.add(email);

      list.push({
        id,
        userId: String(row.user_id ?? ''),
        name:
          String(row.display_name ?? '').trim() ||
          String(row.creator_name ?? '').trim() ||
          String(row.social_handle ?? '').trim() ||
          'Unknown',
        email: email || '',
        handle: String(row.social_handle ?? '').trim(),
        tags: extractCreatorTags(row),
      });
    }

    setCreators(list);
    setCreatorsLoading(false);
  };

  // Load campaigns
  useEffect(() => {
    supabase
      .from('campaigns')
      .select('id, name, client_name')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setCampaigns((data ?? []) as Campaign[]);
        setCampaignsLoading(false);
      });
  }, []);

  // Pre-select campaign from URL param
  useEffect(() => {
    const param = searchParams.get('campaign');
    if (param) setSelectedCampaignId(param);
  }, [searchParams]);

  // Initial fetch when campaign changes (with loading spinner + reset)
  useEffect(() => {
    if (!selectedCampaignId) { setCreators([]); return; }
    setSelectedEmails(new Set());
    setTagFilter(null);
    setSearch('');
    setResult(null);
    fetchCreators(true);
  }, [selectedCampaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime + polling so new onboarded creators appear automatically
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') fetchCreators(false); };
    const intervalId = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    const channel = supabase
      .channel('invites-creators')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'creator_profiles' }, () => fetchCreators(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'creator_signups' }, () => fetchCreators(false))
      .subscribe();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      supabase.removeChannel(channel);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    creators.forEach((c) => c.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  }, [creators]);

  const filteredCreators = useMemo(() => {
    return creators.filter((c) => {
      if (tagFilter && !c.tags.includes(tagFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.handle.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [creators, tagFilter, search]);

  const selectedCampaign = campaigns.find((c) => c.id === selectedCampaignId) ?? null;

  const handleSend = async () => {
    if (!selectedCampaignId) return;

    let emailList: string[];
    if (mode === 'creators') {
      emailList = Array.from(selectedEmails);
    } else {
      emailList = manualEmails
        .split(/[\n,]+/)
        .map((e) => e.trim())
        .filter(Boolean);
    }

    if (emailList.length === 0) {
      setResult({ error: 'Please select at least one creator or enter an email address.' });
      return;
    }

    setIsSending(true);
    setResult(null);

    try {
      // Get admin auth token so the ecosystem API can verify brand/admin identity
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token ?? '';

      const creatorMap = new Map(creators.map((c) => [c.email, c]));
      const payload =
        mode === 'creators'
          ? {
              campaignId: selectedCampaignId,
              campaignName: selectedCampaign?.name ?? '',
              clientName: selectedCampaign?.client_name ?? '',
              accessToken,
              creators: emailList.map((email) => ({
                id: creatorMap.get(email)?.userId ?? '',
                email,
              })),
            }
          : {
              campaignId: selectedCampaignId,
              campaignName: selectedCampaign?.name ?? '',
              clientName: selectedCampaign?.client_name ?? '',
              accessToken,
              emails: emailList,
            };

      const res = await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        setResult({ error: json.error ?? 'Failed to send invites.' });
      } else {
        setResult({ success: `Invite sent to ${emailList.length} creator${emailList.length === 1 ? '' : 's'}.` });
        setSelectedEmails(new Set());
        setManualEmails('');
      }
    } catch {
      setResult({ error: 'Network error. Please try again.' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Invites</h1>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-sm text-muted-foreground">
            Send creator brief invites by email.
          </p>

          {/* Campaign picker — aligned with subtitle */}
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-sm font-medium text-foreground whitespace-nowrap">
              Select campaign
            </label>
            {campaignsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : campaigns.length === 0 ? (
              <button className="text-sm text-primary underline" onClick={() => router.push('/campaigns')}>
                Create a campaign first
              </button>
            ) : (
              <div className="relative">
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  className="appearance-none rounded-md border border-border bg-card px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-w-[220px]"
                >
                  <option value="">— Choose a campaign —</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name ?? 'Untitled'}{c.client_name ? ` · ${c.client_name}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Invite UI — only shown once a campaign is selected */}
      {selectedCampaignId && (
        <Card className="border-border bg-card gap-0 py-0 overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <p className="text-sm font-medium text-foreground">
              Inviting to:{' '}
              <span className="text-primary">
                {selectedCampaign?.name ?? 'Selected campaign'}
              </span>
            </p>
          </div>

          <div className="p-5 space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 max-w-sm">
              <button
                type="button"
                onClick={() => setMode('creators')}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === 'creators' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Choose creators
              </button>
              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Enter manually
              </button>
            </div>

            {mode === 'creators' ? (
              <div className="space-y-3">
                {/* Search */}
                <input
                  type="text"
                  placeholder="Search by name, email, or handle..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full max-w-md rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />

                {/* Tag filter chips */}
                {allTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTagFilter(null)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${tagFilter === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                    >
                      All
                    </button>
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${tagFilter === tag ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

                {/* Creator list */}
                <div className="rounded-md border border-border overflow-hidden">
                  {/* List header */}
                  <div className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      {creatorsLoading
                        ? 'Loading creators...'
                        : `${filteredCreators.length} creator${filteredCreators.length === 1 ? '' : 's'}`}
                    </span>
                    {filteredCreators.length > 0 && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => {
                          const withEmail = filteredCreators.filter((c) => c.email);
                          const allSelected = withEmail.every((c) => selectedEmails.has(c.email));
                          if (allSelected) {
                            const next = new Set(selectedEmails);
                            withEmail.forEach((c) => next.delete(c.email));
                            setSelectedEmails(next);
                          } else {
                            setSelectedEmails(new Set([...selectedEmails, ...withEmail.map((c) => c.email)]));
                          }
                        }}
                      >
                        {filteredCreators.filter((c) => c.email).every((c) => selectedEmails.has(c.email)) ? 'Deselect all' : 'Select all'}
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-border">
                    {creatorsLoading ? (
                      <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading...</div>
                    ) : filteredCreators.length === 0 ? (
                      <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                        {creators.length === 0 ? 'No onboarded creators found.' : 'No creators match your search.'}
                      </div>
                    ) : (
                      filteredCreators.map((creator) => {
                        const hasEmail = Boolean(creator.email);
                        const isSelected = hasEmail && selectedEmails.has(creator.email);
                        return (
                          <label
                            key={creator.id}
                            className={`flex items-start gap-3 px-3 py-2.5 transition-colors ${hasEmail ? 'cursor-pointer hover:bg-muted/40' : 'cursor-not-allowed opacity-50'} ${isSelected ? 'bg-blue-50/50' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!hasEmail}
                              onChange={() => {
                                if (!hasEmail) return;
                                const next = new Set(selectedEmails);
                                if (isSelected) next.delete(creator.email);
                                else next.add(creator.email);
                                setSelectedEmails(next);
                              }}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-primary disabled:opacity-40"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2">
                                <span className="text-sm font-medium text-foreground">{creator.name}</span>
                                {creator.handle && (
                                  <span className="text-xs text-muted-foreground">@{creator.handle.replace(/^@/, '')}</span>
                                )}
                              </div>
                              {creator.email
                                ? <p className="text-xs text-muted-foreground truncate">{creator.email}</p>
                                : <p className="text-xs text-orange-500">No email — cannot invite</p>
                              }
                              {creator.tags.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {creator.tags.map((tag) => (
                                    <span key={tag} className="rounded-full bg-blue-100 px-2 py-0 text-[10px] font-medium text-blue-700">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-w-md">
                <label className="text-sm font-medium text-foreground block">Recipient emails</label>
                <textarea
                  placeholder="creator@example.com&#10;another@example.com"
                  value={manualEmails}
                  onChange={(e) => setManualEmails(e.target.value)}
                  disabled={isSending}
                  rows={6}
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground">One email per line, or comma-separated.</p>
              </div>
            )}

            {/* Feedback */}
            {result?.error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 max-w-md">
                <p className="text-sm text-red-500">{result.error}</p>
              </div>
            )}
            {result?.success && (
              <div className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2 max-w-md">
                <p className="text-sm text-green-600">{result.success}</p>
              </div>
            )}

            {/* Send bar */}
            <div className="flex items-center gap-4 pt-1 border-t border-border">
              {mode === 'creators' && selectedEmails.size > 0 && (
                <span className="text-sm text-muted-foreground">
                  {selectedEmails.size} creator{selectedEmails.size === 1 ? '' : 's'} selected
                </span>
              )}
              <Button
                onClick={handleSend}
                disabled={isSending || !selectedCampaignId}
                className="gap-2 ml-auto"
              >
                <Send size={15} />
                {isSending
                  ? 'Sending...'
                  : mode === 'creators' && selectedEmails.size > 0
                  ? `Send to ${selectedEmails.size} creator${selectedEmails.size === 1 ? '' : 's'}`
                  : 'Send Invite'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!selectedCampaignId && !campaignsLoading && campaigns.length > 0 && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <div className="text-center space-y-2">
            <Mail size={32} className="mx-auto opacity-30" />
            <p className="text-sm">Select a campaign above to start inviting creators.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvitesPage() {
  return (
    <Suspense>
      <InvitesPageInner />
    </Suspense>
  );
}
