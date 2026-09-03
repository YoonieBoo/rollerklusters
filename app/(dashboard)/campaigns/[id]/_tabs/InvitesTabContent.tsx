'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

type EngagementRow = {
  id: string;
  creatorId: string;
  status: string;
};

const ENGAGEMENT_STATUS_OPTIONS = [
  { value: 'matched', label: 'Pending creator response' },
  { value: 'accepted', label: 'Accepted by creator' },
  { value: 'in_discussion', label: 'In discussion' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'declined', label: 'Declined by creator' },
];

const engagementStatusBadgeClasses: Record<string, string> = {
  matched: 'bg-amber-100 text-amber-700',
  accepted: 'bg-blue-100 text-blue-700',
  in_discussion: 'bg-purple-100 text-purple-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
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
      if (Array.isArray(parsed)) { parsed.forEach((v) => { if (v && typeof v === 'string' && v.trim()) tags.add(v.trim()); }); return; }
    } catch { /* not json */ }
  }
};

const extractCreatorTags = (row: Record<string, unknown>): string[] => {
  const tags = new Set<string>();
  addArrayTags(row.content_categories, tags);
  addArrayTags(row.content_types, tags);
  return Array.from(tags);
};

export default function InvitesTabContent({ campaignId }: { campaignId: string }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [mode, setMode] = useState<'creators' | 'manual'>('creators');
  const [creators, setCreators] = useState<InviteCreator[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(true);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [manualEmails, setManualEmails] = useState('');
  const [invitedUserIds, setInvitedUserIds] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<{ success?: string; error?: string } | null>(null);
  const [confirmResend, setConfirmResend] = useState<number | null>(null);
  const [engagements, setEngagements] = useState<EngagementRow[]>([]);
  const [updatingEngagementId, setUpdatingEngagementId] = useState<string | null>(null);

  const fetchEngagements = () => {
    supabase
      .from('engagements')
      .select('id, creator_id, status')
      .eq('campaign_id', campaignId)
      .then(({ data }) => {
        const rows = (data ?? []) as { id: string; creator_id: string; status: string }[];
        setEngagements(rows.map((row) => ({ id: row.id, creatorId: String(row.creator_id), status: row.status })));
        setInvitedUserIds(new Set(rows.map((row) => String(row.creator_id))));
      });
  };

  const handleStatusChange = async (engagementId: string, nextStatus: string) => {
    setUpdatingEngagementId(engagementId);
    const { error } = await supabase
      .from('engagements')
      .update({ status: nextStatus })
      .eq('id', engagementId);

    if (!error) {
      setEngagements((current) =>
        current.map((row) => (row.id === engagementId ? { ...row, status: nextStatus } : row))
      );
    }
    setUpdatingEngagementId(null);
  };

  const campaignIdRef = useRef(campaignId);
  useEffect(() => { campaignIdRef.current = campaignId; }, [campaignId]);

  const fetchCreators = async (showLoading = true) => {
    if (showLoading) setCreatorsLoading(true);
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
      if (email && seenEmails.has(email)) continue;
      if (email) seenEmails.add(email);
      list.push({
        id,
        userId: String(row.user_id ?? ''),
        name: String(row.display_name ?? '').trim() || String(row.creator_name ?? '').trim() || String(row.social_handle ?? '').trim() || 'Unknown',
        email: email || '',
        handle: String(row.social_handle ?? '').trim(),
        tags: extractCreatorTags(row),
      });
    }
    setCreators(list);
    setCreatorsLoading(false);
  };

  // Load campaign info and initial data
  useEffect(() => {
    supabase.from('campaigns').select('id, name, client_name').eq('id', campaignId).maybeSingle().then(({ data }) => {
      setCampaign(data as Campaign | null);
    });
    fetchCreators(true);
    fetchEngagements();
  }, [campaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime + polling so new onboarded creators appear automatically
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') fetchCreators(false); };
    const intervalId = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const channel = supabase
      .channel('invites-tab-creators')
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

  const creatorByUserId = useMemo(() => {
    const map = new Map<string, InviteCreator>();
    creators.forEach((c) => { if (c.userId) map.set(c.userId, c); });
    return map;
  }, [creators]);

  const filteredCreators = useMemo(() => {
    return creators.filter((c) => {
      if (tagFilter && !c.tags.includes(tagFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q);
      }
      return true;
    });
  }, [creators, tagFilter, search]);

  const handleSend = async (force = false) => {
    let emailList: string[];
    if (mode === 'creators') {
      emailList = Array.from(selectedEmails);
    } else {
      emailList = manualEmails.split(/[\n,]+/).map((e) => e.trim()).filter(Boolean);
    }
    if (emailList.length === 0) { setResult({ error: 'Please select at least one creator or enter an email address.' }); return; }

    if (!force && mode === 'creators') {
      const creatorMap = new Map(creators.map((c) => [c.email, c]));
      const alreadyInvitedCount = emailList.filter((email) => { const uid = creatorMap.get(email)?.userId; return uid && invitedUserIds.has(uid); }).length;
      if (alreadyInvitedCount > 0) { setConfirmResend(alreadyInvitedCount); return; }
    }

    setConfirmResend(null);
    setIsSending(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token ?? '';
      const creatorMap = new Map(creators.map((c) => [c.email, c]));
      const payload = mode === 'creators'
        ? { campaignId, campaignName: campaign?.name ?? '', clientName: campaign?.client_name ?? '', accessToken, creators: emailList.map((email) => ({ id: creatorMap.get(email)?.userId ?? '', email })) }
        : { campaignId, campaignName: campaign?.name ?? '', clientName: campaign?.client_name ?? '', accessToken, emails: emailList };
      const res = await fetch('/api/send-invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) {
        setResult({ error: json.error ?? 'Failed to send invites.' });
      } else {
        setResult({ success: `Invite sent to ${emailList.length} creator${emailList.length === 1 ? '' : 's'}.` });
        setSelectedEmails(new Set());
        setManualEmails('');
        fetchEngagements();
      }
    } catch {
      setResult({ error: 'Network error. Please try again.' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-4">
          <p className="text-sm font-medium text-foreground">
            Inviting to: <span className="text-primary">{campaign?.name ?? 'Loading...'}</span>
          </p>

        <div className="space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1 max-w-sm">
            <button type="button" onClick={() => setMode('creators')}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === 'creators' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              Choose creators
            </button>
            <button type="button" onClick={() => setMode('manual')}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
              Enter manually
            </button>
          </div>

          {mode === 'creators' ? (
            <div className="space-y-3">
              <input type="text" placeholder="Search by name, email, or handle..." value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full max-w-md rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setTagFilter(null)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${tagFilter === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                    All
                  </button>
                  {allTags.map((tag) => (
                    <button key={tag} type="button" onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${tagFilter === tag ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                      {tag}
                    </button>
                  ))}
                </div>
              )}
              <div className="rounded-md border border-border overflow-hidden">
                <div className="flex items-center justify-between border-b border-border bg-muted/60 px-3 py-2">
                  <span className="text-xs text-muted-foreground">
                    {creatorsLoading ? 'Loading creators...' : `${filteredCreators.length} creator${filteredCreators.length === 1 ? '' : 's'}`}
                  </span>
                  {filteredCreators.length > 0 && (
                    <button type="button" className="text-xs text-primary hover:underline"
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
                      }}>
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
                      const alreadyInvited = Boolean(creator.userId && invitedUserIds.has(creator.userId));
                      return (
                        <label key={creator.id}
                          className={`flex items-start gap-3 px-3 py-2.5 transition-colors ${hasEmail ? 'cursor-pointer hover:bg-muted/40' : 'cursor-not-allowed opacity-50'} ${isSelected ? 'bg-blue-50/50' : ''}`}>
                          <input type="checkbox" checked={isSelected} disabled={!hasEmail}
                            onChange={() => {
                              if (!hasEmail) return;
                              const next = new Set(selectedEmails);
                              if (isSelected) next.delete(creator.email); else next.add(creator.email);
                              setSelectedEmails(next);
                            }}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-primary disabled:opacity-40" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-sm font-medium text-foreground">{creator.name}</span>
                              {creator.handle && <span className="text-xs text-muted-foreground">@{creator.handle.replace(/^@/, '')}</span>}
                              {alreadyInvited && (
                                <span className="rounded-full bg-amber-100 px-2 py-0 text-[10px] font-semibold text-amber-700">Already invited</span>
                              )}
                            </div>
                            {creator.email
                              ? <p className="text-xs text-muted-foreground truncate">{creator.email}</p>
                              : <p className="text-xs text-orange-500">No email — cannot invite</p>}
                            {creator.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {creator.tags.map((tag) => (
                                  <span key={tag} className="rounded-full bg-blue-100 px-2 py-0 text-[10px] font-medium text-blue-700">{tag}</span>
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
              <textarea placeholder={"creator@example.com\nanother@example.com"} value={manualEmails} onChange={(e) => setManualEmails(e.target.value)} disabled={isSending} rows={6}
                className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:opacity-50" />
              <p className="text-xs text-muted-foreground">One email per line, or comma-separated.</p>
            </div>
          )}

          {engagements.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Invited creators ({engagements.length})
              </p>
              <div className="rounded-md border border-border overflow-hidden">
                <div className="max-h-72 overflow-y-auto divide-y divide-border">
                  {engagements.map((engagement) => {
                    const creator = creatorByUserId.get(engagement.creatorId);
                    return (
                      <div
                        key={engagement.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {creator?.name ?? 'Unknown creator'}
                          </p>
                          {creator?.handle && (
                            <p className="text-xs text-muted-foreground truncate">@{creator.handle.replace(/^@/, '')}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              engagementStatusBadgeClasses[engagement.status] ?? 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {ENGAGEMENT_STATUS_OPTIONS.find((o) => o.value === engagement.status)?.label ?? engagement.status}
                          </span>
                          <select
                            value={engagement.status}
                            disabled={updatingEngagementId === engagement.id}
                            onChange={(e) => void handleStatusChange(engagement.id, e.target.value)}
                            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                          >
                            {ENGAGEMENT_STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

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

          {confirmResend !== null && (
            <div className="rounded-md border border-amber-400/40 bg-amber-50 px-4 py-3 max-w-md space-y-2">
              <p className="text-sm font-medium text-amber-800">
                {confirmResend === 1
                  ? 'This creator has already been invited to this campaign.'
                  : `${confirmResend} of the selected creators have already been invited to this campaign.`}
              </p>
              <p className="text-sm text-amber-700">Do you want to send the invitation again?</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void handleSend(true)} disabled={isSending} className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
                  <Send size={13} />{isSending ? 'Sending...' : 'Yes, send again'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmResend(null)} disabled={isSending}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 pt-1 border-t border-border">
            {mode === 'creators' && selectedEmails.size > 0 && (
              <span className="text-sm text-muted-foreground">{selectedEmails.size} creator{selectedEmails.size === 1 ? '' : 's'} selected</span>
            )}
            <Button onClick={() => void handleSend()} disabled={isSending} className="gap-2 ml-auto">
              <Send size={15} />
              {isSending ? 'Sending...' : mode === 'creators' && selectedEmails.size > 0 ? `Send to ${selectedEmails.size} creator${selectedEmails.size === 1 ? '' : 's'}` : 'Send Invite'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
