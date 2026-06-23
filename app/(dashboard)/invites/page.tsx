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

  const norm = (h: unknown) => String(h ?? '').replace(/^@/, '').toLowerCase().trim();

  const fetchCreators = async (showLoading = true) => {
    const campaignId = selectedCampaignIdRef.current;
    if (!campaignId) { setCreators([]); return; }
    if (showLoading) setCreatorsLoading(true);

    // creator_profiles has an email column + user_id; users table has email by id
    const [{ data: profileData }, { data: usersData }, { data: signupsData }] =
      await Promise.all([
        supabase.from('creator_profiles').select('id, email, display_name, creator_name, social_handle, user_id, content_categories, content_types, interested_content_types, primary_creative_focus'),
        supabase.from('users').select('id, email'),
        supabase.from('creator_signups').select('email, instagram_handle, tiktok_handle, display_name'),
      ]);

    // users table: id → email (public.users mirrors some auth users)
    const emailByUserId = new Map<string, string>(
      (usersData ?? []).map((u) => [String((u as Record<string, unknown>).id ?? ''), String((u as Record<string, unknown>).email ?? '').trim().toLowerCase()])
    );

    // creator_signups: handle/name → email fallback
    const emailByHandle = new Map<string, string>();
    for (const s of (signupsData ?? [])) {
      const email = String((s as Record<string, unknown>).email ?? '').trim().toLowerCase();
      if (!email) continue;
      for (const h of [
        norm((s as Record<string, unknown>).instagram_handle),
        norm((s as Record<string, unknown>).tiktok_handle),
        norm((s as Record<string, unknown>).display_name),
      ]) {
        if (h) emailByHandle.set(h, email);
      }
    }

    const seenEmails = new Set<string>();
    const list: InviteCreator[] = [];

    for (const row of (profileData ?? []) as Record<string, unknown>[]) {
      const profileId = String(row.id ?? '');
      // Priority: creator_profiles.email → users table by user_id → signup handle match
      const email =
        String(row.email ?? '').trim().toLowerCase() ||
        emailByUserId.get(String(row.user_id ?? '')) ||
        emailByHandle.get(norm(row.social_handle)) ||
        emailByHandle.get(norm(row.display_name)) ||
        emailByHandle.get(norm(row.creator_name)) ||
        '';
      if (!email || seenEmails.has(email)) continue;
      seenEmails.add(email);
      list.push({
        id: profileId,
        name:
          String(row.display_name ?? '').trim() ||
          String(row.creator_name ?? '').trim() ||
          String(row.social_handle ?? '').trim() ||
          'Unknown',
        email,
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
      const res = await fetch('/api/send-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: selectedCampaignId, emails: emailList }),
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
        <p className="mt-1 text-sm text-muted-foreground">
          Send creator brief invites by email.
        </p>
      </div>

      {/* Campaign picker */}
      <Card className="border-border bg-card p-4 gap-0 py-4">
        <label className="text-sm font-medium text-foreground block mb-2">
          Select campaign
        </label>
        {campaignsLoading ? (
          <p className="text-sm text-muted-foreground">Loading campaigns...</p>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No campaigns found.{' '}
            <button className="text-primary underline" onClick={() => router.push('/campaigns')}>
              Create one first.
            </button>
          </p>
        ) : (
          <div className="relative inline-block w-full max-w-sm">
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="w-full appearance-none rounded-md border border-border bg-muted px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
      </Card>

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
                          const allSelected = filteredCreators.every((c) => selectedEmails.has(c.email));
                          if (allSelected) {
                            const next = new Set(selectedEmails);
                            filteredCreators.forEach((c) => next.delete(c.email));
                            setSelectedEmails(next);
                          } else {
                            setSelectedEmails(new Set([...selectedEmails, ...filteredCreators.map((c) => c.email)]));
                          }
                        }}
                      >
                        {filteredCreators.every((c) => selectedEmails.has(c.email)) ? 'Deselect all' : 'Select all'}
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-border">
                    {creatorsLoading ? (
                      <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading...</div>
                    ) : filteredCreators.length === 0 ? (
                      <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                        {creators.length === 0 ? 'No creators with email addresses found.' : 'No creators match your search.'}
                      </div>
                    ) : (
                      filteredCreators.map((creator) => {
                        const isSelected = selectedEmails.has(creator.email);
                        return (
                          <label
                            key={creator.id}
                            className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors ${isSelected ? 'bg-blue-50/50' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                const next = new Set(selectedEmails);
                                if (isSelected) next.delete(creator.email);
                                else next.add(creator.email);
                                setSelectedEmails(next);
                              }}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2">
                                <span className="text-sm font-medium text-foreground">{creator.name}</span>
                                {creator.handle && (
                                  <span className="text-xs text-muted-foreground">@{creator.handle.replace(/^@/, '')}</span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate">{creator.email}</p>
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
