'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Instagram, Users, Send, CheckCircle2, FileText, Clock } from 'lucide-react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingDots } from '@/components/ui/loading-dots';
import { getInitials, getAvatarColorForName, getRankBadgeClasses } from '@/lib/creator-visuals';

const ActivityChart = dynamic(() => import('./ActivityChart'), { ssr: false });

type SupabaseRow = Record<string, unknown>;

const toText = (v: unknown) => (v == null ? '' : String(v));

const formatDate = (d: string | null | undefined) => {
  if (!d) return 'N/A';
  const p = new Date(d);
  return Number.isNaN(p.getTime()) ? 'N/A' : `${p.getDate()}/${p.getMonth() + 1}/${p.getFullYear()}`;
};

const formatLabel = (v: unknown, fallback = 'N/A') => {
  const t = toText(v).trim();
  if (!t) return fallback;
  return t.split(/[-_\s]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const formatArray = (v: unknown): string => {
  if (Array.isArray(v)) return v.map(x => formatLabel(x)).filter(s => s !== 'N/A').join(', ') || 'N/A';
  try {
    const parsed = JSON.parse(toText(v));
    if (Array.isArray(parsed)) return formatArray(parsed);
  } catch {}
  return formatLabel(v);
};

const getCreatorName = (p: SupabaseRow) =>
  toText(p.display_name).trim() || toText(p.creator_name).trim() || toText(p.social_handle).trim() || 'Unnamed Creator';

const engagementStatusLabels: Record<string, string> = {
  matched: 'Invite sent',
  accepted: 'Accepted',
  declined: 'Declined',
  in_discussion: 'In discussion',
  active: 'Active',
  completed: 'Completed',
};

const statusColors: Record<string, string> = {
  matched: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  in_discussion: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
};

type ActivityPeriod = 'week' | 'month';

function buildActivityData(
  engagements: SupabaseRow[],
  submissions: SupabaseRow[],
  period: ActivityPeriod
) {
  const now = new Date();
  const slots = period === 'week' ? 8 : 6;
  const labels: string[] = [];
  const inviteCounts: number[] = Array(slots).fill(0);
  const submitCounts: number[] = Array(slots).fill(0);

  for (let i = slots - 1; i >= 0; i--) {
    if (period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      labels.push(`W${String(d.getDate()).padStart(2, '0')}/${d.getMonth() + 1}`);
    } else {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));
    }
  }

  const slotIndex = (dateStr: string) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return -1;
    for (let i = slots - 1; i >= 0; i--) {
      const slotStart = new Date(now);
      if (period === 'week') {
        slotStart.setDate(slotStart.getDate() - i * 7);
        slotStart.setHours(0, 0, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setDate(slotEnd.getDate() + 7);
        if (d >= slotStart && d < slotEnd) return slots - 1 - i;
      } else {
        const slotMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
        if (d.getFullYear() === slotMonth.getFullYear() && d.getMonth() === slotMonth.getMonth())
          return slots - 1 - i;
      }
    }
    return -1;
  };

  for (const eng of engagements) {
    const idx = slotIndex(toText(eng.created_at));
    if (idx >= 0) inviteCounts[idx]++;
  }
  for (const sub of submissions) {
    const idx = slotIndex(toText(sub.submitted_at));
    if (idx >= 0) submitCounts[idx]++;
  }

  return labels.map((label, i) => ({
    label,
    Invites: inviteCounts[i],
    Submissions: submitCounts[i],
  }));
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">{icon}{label}</div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function CreatorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<SupabaseRow | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [engagements, setEngagements] = useState<SupabaseRow[]>([]);
  const [campaigns, setCampaigns] = useState<Map<string, SupabaseRow>>(new Map());
  const [submissions, setSubmissions] = useState<SupabaseRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<ActivityPeriod>('week');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);

      const { data: prof, error: profErr } = await supabase
        .from('creator_profiles')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (profErr || !prof) {
        setError(profErr?.message ?? 'Creator not found');
        setIsLoading(false);
        return;
      }

      setProfile(prof as SupabaseRow);

      const userId = toText(prof.user_id);

      const [engRes, subRes, userRes] = await Promise.all([
        userId
          ? supabase.from('engagements').select('*').eq('creator_id', userId).order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase.from('submissions').select('*').order('submitted_at', { ascending: false }),
        userId
          ? supabase.from('users').select('avatar_url').eq('id', userId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      setAvatarUrl((userRes.data as { avatar_url?: string } | null)?.avatar_url ?? null);

      const engRows = (engRes.data ?? []) as SupabaseRow[];
      setEngagements(engRows);

      const creatorSocial = toText(prof.social_handle).trim().toLowerCase().replace(/^@/, '');
      const subRows = ((subRes.data ?? []) as SupabaseRow[]).filter(s => {
        const ref = toText(s.creator_ref).toLowerCase().replace(/^@/, '');
        return (userId && ref === userId) || (creatorSocial && ref === creatorSocial);
      });
      setSubmissions(subRows);

      if (engRows.length > 0) {
        const campaignIds = [...new Set(engRows.map(e => toText(e.campaign_id)).filter(Boolean))];
        const { data: campData } = await supabase
          .from('campaigns')
          .select('id, name, client_name, status')
          .in('id', campaignIds);
        const map = new Map<string, SupabaseRow>();
        for (const c of (campData ?? []) as SupabaseRow[]) map.set(toText(c.id), c);
        setCampaigns(map);
      }

      setIsLoading(false);
    };

    load();
  }, [id]);

  useEffect(() => {
    if (isLoading) return;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const target = document.getElementById(hash);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingDots text="Loading creator profile..." />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => router.push('/creators')}>
          <ArrowLeft size={16} /> Back
        </Button>
        <p className="text-sm text-red-500">{error ?? 'Creator not found'}</p>
      </div>
    );
  }

  const name = getCreatorName(profile);
  const initials = getInitials(name);
  const color = getAvatarColorForName(name);

  const invited = engagements.length;
  const accepted = engagements.filter(e => ['accepted', 'active', 'completed'].includes(toText(e.status))).length;
  const completed = engagements.filter(e => toText(e.status) === 'completed').length;
  const isActive = accepted > 0 || submissions.length > 0;

  const interests = formatArray(
    profile.interested_content_types ?? profile.content_categories ?? profile.content_types ?? profile.primary_creative_focus
  );
  const program = toText(profile.faculty || profile.university_program || profile.program).trim() || 'N/A';
  const platform = formatLabel(profile.platform);
  const handle = toText(profile.social_handle).trim() || null;
  const followers = (() => {
    const v = profile.manual_follower_count ?? profile.follower_count;
    const n = Number(toText(v).replace(/,/g, ''));
    return !v || Number.isNaN(n) ? 'N/A' : new Intl.NumberFormat().format(n);
  })();
  const rank = formatLabel(profile.creator_rank);
  const scholarship = (() => {
    const v = profile.scholarship_student ?? profile.is_scholarship_student;
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    const t = toText(v).toLowerCase();
    return ['true','yes','y'].includes(t) ? 'Yes' : ['false','no','n'].includes(t) ? 'No' : 'N/A';
  })();

  return (
    <div className="space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" className="gap-2 w-fit" onClick={() => router.push('/creators')}>
        <ArrowLeft size={16} /> Back to Onboarded Creators
      </Button>

      {/* Profile card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          {/* Avatar */}
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={name}
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white ${color}`}>
              {initials}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                {isActive ? 'Active' : 'New'}
              </span>
            </div>
            {handle && (
              <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1.5">
                <Instagram size={13} />
                @{handle.replace(/^@/, '')} · {platform}
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-sm text-muted-foreground">{program}</span>
              {interests !== 'N/A' && interests.split(', ').map((tag) => (
                <span key={tag} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 border border-blue-100">
                  {tag}
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span className="text-muted-foreground">Followers <span className="font-medium text-foreground">{followers}</span></span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                Rank
                {rank === 'N/A' ? (
                  <span className="font-medium text-foreground">N/A</span>
                ) : (
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${getRankBadgeClasses(rank)}`}>
                    {rank}
                  </span>
                )}
              </span>
              <span className="text-muted-foreground">Scholarship <span className="font-medium text-foreground">{scholarship}</span></span>
              <span className="text-muted-foreground">Joined <span className="font-medium text-foreground">{formatDate(toText(profile.created_at) || null)}</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={<Send size={15} />} label="Campaigns Invited" value={invited} />
        <StatCard icon={<CheckCircle2 size={15} />} label="Campaigns Accepted" value={accepted} />
        <StatCard icon={<FileText size={15} />} label="Content Submitted" value={submissions.length} />
        <StatCard icon={<Users size={15} />} label="Completed" value={completed} sub="campaigns finished" />
      </div>

      {/* Activity Chart */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="font-semibold text-foreground">Activity Overview</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Invites received and content submitted over time</p>
          </div>
          <div className="flex rounded-lg border border-border bg-muted/40 p-1 text-xs font-medium gap-1">
            <button
              onClick={() => setPeriod('week')}
              className={`rounded-md px-3 py-1.5 transition-colors ${period === 'week' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Weekly
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`rounded-md px-3 py-1.5 transition-colors ${period === 'month' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Monthly
            </button>
          </div>
        </div>
        <div className="px-2 py-5">
          {engagements.length === 0 && submissions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No activity data yet.</p>
          ) : (
            <ActivityChart data={buildActivityData(engagements, submissions, period)} />
          )}
        </div>
      </div>

      {/* Campaign history */}
      <div id="campaign-history" className="scroll-mt-6 rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold text-foreground">Campaign History</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">All campaigns this creator has been invited to</p>
        </div>

        {engagements.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            No campaigns yet — send an invite from the Invites page.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {engagements.map((eng) => {
              const camp = campaigns.get(toText(eng.campaign_id));
              const status = toText(eng.status);
              return (
                <div key={toText(eng.id)} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {camp ? toText(camp.name) : 'Campaign'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Clock size={11} />
                      {formatDate(toText(eng.created_at) || null)}
                      {camp && toText(camp.client_name) && ` · ${toText(camp.client_name)}`}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {engagementStatusLabels[status] ?? formatLabel(status)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submissions */}
      {submissions.length > 0 && (
        <div id="content-submissions" className="scroll-mt-6 rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold text-foreground">Content Submissions</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Content submitted by this creator</p>
          </div>
          <div className="divide-y divide-border">
            {submissions.map((sub) => (
              <div key={toText(sub.id)} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {toText(sub.submission_link) ? (
                      <a href={toText(sub.submission_link)} target="_blank" rel="noopener noreferrer"
                        className="text-primary underline underline-offset-2 hover:opacity-80">
                        View content
                      </a>
                    ) : 'No link'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Submitted {formatDate(toText(sub.submitted_at) || null)}
                  </p>
                </div>
                <Badge className={`shrink-0 capitalize ${statusColors[toText(sub.status)] ?? ''}`}>
                  {formatLabel(sub.status)}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
