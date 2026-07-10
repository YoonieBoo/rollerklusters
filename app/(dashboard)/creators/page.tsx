'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingDots } from '@/components/ui/loading-dots';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/lib/supabase/client';

type CreatorProfile = {
  id?: string | number | null;
  user_id?: string | null;
  email?: string | null;
  display_name?: string | null;
  creator_name?: string | null;
  social_handle?: string | null;
  tiktok_handle?: string | null;
  instagram_handle?: string | null;
  platform?: string | null;
  faculty?: string | null;
  university_program?: string | null;
  manual_follower_count?: number | string | null;
  follower_count?: number | string | null;
  creator_rank?: string | number | null;
  verification_status?: string | null;
  onboarding_completed?: boolean | string | null;
  scholarship_student?: boolean | string | null;
  is_scholarship_student?: boolean | string | null;
  line_id?: string | null;
  content_categories?: unknown;
  content_types?: unknown;
  interested_content_types?: unknown;
  primary_creative_focus?: unknown;
  additional_notes?: unknown;
  created_at?: string | null;
  [key: string]: unknown;
};

type UserProfile = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  full_name?: string | null;
  role?: string | null;
};

type CreatorSignup = {
  email?: string | null;
  display_name?: string | null;
  university_program?: string | null;
  instagram_handle?: string | null;
  tiktok_handle?: string | null;
  scholarship_student?: boolean | string | null;
  line_id?: string | null;
  interested_content_types?: unknown;
  primary_creative_focus?: unknown;
  additional_notes?: unknown;
  created_at?: string | null;
  signup_type?: string | null;
  role_label?: string | null;
  follower_count?: number | string | null;
};

const isCampaignManagerSignup = (signup: CreatorSignup): boolean => {
  const text = [signup.signup_type, signup.role_label, signup.primary_creative_focus]
    .map((v) => toText(v))
    .join(' ')
    .toLowerCase();
  return text.includes('campaign-manager') || text.includes('campaign manager') || text.includes('campaign_manager');
};

const CREATORS_REFRESH_INTERVAL_MS = 15000;

const toText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean).join(', ');
  }

  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map(toText)
      .filter(Boolean)
      .join(', ');
  }

  return '';
};

const formatLabel = (value: unknown, fallback = 'N/A') => {
  const text = toText(value).trim();

  if (!text) {
    return fallback;
  }

  return text
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatFollowers = (creator: CreatorProfile) => {
  const value = creator.manual_follower_count ?? creator.follower_count;
  const text = toText(value).trim();

  if (!text) {
    return 'N/A';
  }

  const numericValue =
    typeof value === 'number' ? value : Number(text.replace(/,/g, ''));

  if (Number.isNaN(numericValue)) {
    return text;
  }

  return new Intl.NumberFormat().format(numericValue);
};

const formatScholarshipStudent = (creator: CreatorProfile) => {
  const value = creator.scholarship_student ?? creator.is_scholarship_student;

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  const text = toText(value).trim().toLowerCase();

  if (['true', 'yes', 'y'].includes(text)) {
    return 'Yes';
  }

  if (['false', 'no', 'n'].includes(text)) {
    return 'No';
  }

  return 'N/A';
};

const getScholarshipStudentValue = (signup: CreatorSignup) => {
  if (typeof signup.scholarship_student === 'boolean') {
    return signup.scholarship_student;
  }

  const text = toText(signup.scholarship_student).trim().toLowerCase();

  if (['true', 'yes', 'y'].includes(text)) {
    return true;
  }

  if (['false', 'no', 'n'].includes(text)) {
    return false;
  }

  const notes = toText(signup.additional_notes);
  const notesMatch = notes.match(/scholarship\s+student\s*:\s*(yes|no)\b/i);

  if (notesMatch) {
    return notesMatch[1].toLowerCase() === 'yes';
  }

  return null;
};

const formatDate = (date: string | null | undefined) => {
  if (!date) {
    return 'N/A';
  }

  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'N/A';
  }

  return parsedDate.getDate() + '/' + (parsedDate.getMonth() + 1) + '/' + parsedDate.getFullYear();
};

const getDateClusterLabel = (date: string | null | undefined) => {
  const formattedDate = formatDate(date);

  return formattedDate === 'N/A' ? 'Unknown signup date' : formattedDate;
};

const groupCreatorsBySignupDate = (creators: CreatorProfile[]) => {
  const groups: { label: string; rows: CreatorProfile[] }[] = [];

  creators.forEach((creator) => {
    const label = getDateClusterLabel(creator.created_at);
    const existingGroup = groups.find((group) => group.label === label);

    if (existingGroup) {
      existingGroup.rows.push(creator);
      return;
    }

    groups.push({ label, rows: [creator] });
  });

  return groups;
};

const getCreatorName = (creator: CreatorProfile) =>
  toText(creator.display_name).trim() ||
  toText(creator.creator_name).trim() ||
  toText(creator.social_handle).trim() ||
  'Unnamed creator';

const getFirstValue = (creator: CreatorProfile, keys: string[]) => {
  for (const key of keys) {
    const value = creator[key];

    if (toText(value).trim()) {
      return value;
    }
  }

  return null;
};

const sanitizeHandle = (h: string): string => {
  const trimmed = h.replace(/^[@\-]+/, '').trim();
  if (!trimmed) return '';
  // Extract handle from a full TikTok URL (e.g. tiktok.com/@handle?params)
  const tiktokMatch = trimmed.match(/tiktok\.com\/@([^?&/\s]+)/);
  if (tiktokMatch) return tiktokMatch[1];
  // Extract handle from a full Instagram URL
  const igMatch = trimmed.match(/instagram\.com\/([^?&/\s]+)/);
  if (igMatch) return igMatch[1].replace(/\/$/, '');
  // Compound entries like "aux_janne and @aux_janne0.2" — take the last token
  if (trimmed.includes(' ')) {
    const fillers = new Set(['and', 'or', '&', 'also']);
    const parts = trimmed.split(/[\s,]+/)
      .map(w => w.replace(/^[@\-]+/, '').trim())
      .filter(w => w && !fillers.has(w.toLowerCase()));
    return parts[parts.length - 1] ?? '';
  }
  return trimmed;
};

const getTikTokUrl = (creator: CreatorProfile): string => {
  const raw = toText(creator.tiktok_handle).trim()
    || (toText(creator.platform).trim().toLowerCase() === 'tiktok' ? toText(creator.social_handle).trim() : '');
  const handle = sanitizeHandle(raw);
  return handle ? `https://www.tiktok.com/@${encodeURIComponent(handle)}` : '';
};

const getInstagramUrl = (creator: CreatorProfile): string => {
  const raw = toText(creator.instagram_handle).trim()
    || (toText(creator.platform).trim().toLowerCase() === 'instagram' ? toText(creator.social_handle).trim() : '');
  const handle = sanitizeHandle(raw);
  return handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : '';
};

const getYouTubeUrl = (creator: CreatorProfile): string => {
  if (toText(creator.platform).trim().toLowerCase() !== 'youtube') return '';
  const handle = sanitizeHandle(toText(creator.social_handle).trim());
  return handle ? `https://www.youtube.com/@${encodeURIComponent(handle)}` : '';
};

const downloadCreatorsListPdf = async (creators: CreatorProfile[]) => {
  const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 40;
  const marginTop = 50;
  const marginBottom = 50;
  const black = '#111827';
  const muted = '#6b7280';
  const link = '#2563eb';
  const headerBg = '#f3f4f6';
  const rowAlt = '#fafafa';
  const border = '#e5e7eb';

  const cols = [
    { label: 'Name', width: 110 },
    { label: 'Platform', width: 60 },
    { label: 'Program', width: 100 },
    { label: 'Followers', width: 65 },
    { label: 'Rank', width: 48 },
    { label: 'Interest', width: 108 },
    { label: 'Scholarship', width: 68 },
    { label: 'TikTok', width: 97 },
    { label: 'Instagram', width: 105 },
  ];

  const totalTableWidth = cols.reduce((sum, c) => sum + c.width, 0);
  const tableStartX = marginX;

  const setFont = (size: number, style: 'normal' | 'bold' = 'normal', color = black) => {
    pdf.setFont('helvetica', style);
    pdf.setFontSize(size);
    pdf.setTextColor(color);
  };

  // X offset of each column, precomputed for link annotation placement
  const colOffsets = cols.map((_, i) => cols.slice(0, i).reduce((s, c) => s + c.width, 0));

  const drawRow = (y: number, cells: string[], isHeader: boolean, isAlt: boolean) => {
    const rowHeight = 22;
    if (isHeader) {
      pdf.setFillColor(headerBg);
      pdf.rect(tableStartX, y, totalTableWidth, rowHeight, 'F');
    } else if (isAlt) {
      pdf.setFillColor(rowAlt);
      pdf.rect(tableStartX, y, totalTableWidth, rowHeight, 'F');
    }
    pdf.setDrawColor(border);
    pdf.rect(tableStartX, y, totalTableWidth, rowHeight, 'S');
    cells.forEach((text, i) => {
      const col = cols[i];
      const x = tableStartX + colOffsets[i];
      const cellText = pdf.splitTextToSize(text || '—', col.width - 8) as string[];
      const display = cellText[0] ?? '';
      setFont(isHeader ? 8.5 : 8, isHeader ? 'bold' : 'normal', isHeader ? black : muted);
      pdf.text(display, x + 4, y + 14);
    });
  };

  let cursorY = marginTop;

  // Title
  setFont(16, 'bold', black);
  pdf.text('Onboarded Creators', marginX, cursorY);
  cursorY += 18;
  setFont(9, 'normal', muted);
  pdf.text(`Generated ${new Date().toLocaleDateString('en-GB')} · ${creators.length} creator${creators.length === 1 ? '' : 's'}`, marginX, cursorY);
  cursorY += 20;

  // Header row
  drawRow(cursorY, cols.map((c) => c.label), true, false);
  cursorY += 22;

  // Data rows
  creators.forEach((creator, idx) => {
    if (cursorY + 22 > pageHeight - marginBottom) {
      pdf.addPage();
      cursorY = marginTop;
      drawRow(cursorY, cols.map((c) => c.label), true, false);
      cursorY += 22;
    }
    const tiktokUrl = getTikTokUrl(creator);
    const igUrl = getInstagramUrl(creator);
    const ytUrl = getYouTubeUrl(creator);
    // TikTok column: TikTok link, or YouTube link for YouTube creators
    const tiktokDisplayUrl = tiktokUrl || ytUrl;
    const tiktokHandle = sanitizeHandle(toText(creator.tiktok_handle).trim()
      || (toText(creator.platform).trim().toLowerCase() === 'tiktok' ? toText(creator.social_handle).trim() : '')
      || (ytUrl ? toText(creator.social_handle).trim() : ''));
    const igHandle = sanitizeHandle(toText(creator.instagram_handle).trim()
      || (toText(creator.platform).trim().toLowerCase() === 'instagram' ? toText(creator.social_handle).trim() : ''));
    const tiktokDisplay = tiktokHandle ? `@${tiktokHandle}` : (ytUrl ? `@${sanitizeHandle(toText(creator.social_handle).trim())}` : 'N/A');
    const igDisplay = igHandle ? `@${igHandle}` : 'N/A';
    const isPending = creator.verification_status === 'pending_onboarding';
    drawRow(cursorY, [
      isPending ? `${getCreatorName(creator)} (Pending)` : getCreatorName(creator),
      formatLabel(creator.platform),
      getCreatorProgram(creator),
      formatFollowers(creator),
      formatLabel(creator.creator_rank),
      getCreatorInterest(creator),
      formatScholarshipStudent(creator),
      tiktokDisplayUrl ? tiktokDisplay : 'N/A',
      igUrl ? igDisplay : 'N/A',
    ], false, idx % 2 === 1);
    // Overwrite link cells in blue with PDF annotations
    if (tiktokDisplayUrl) {
      const colX = tableStartX + colOffsets[7];
      const clipped = (pdf.splitTextToSize(tiktokDisplay, cols[7].width - 8) as string[])[0] ?? '';
      setFont(8, 'normal', link);
      pdf.text(clipped, colX + 4, cursorY + 14);
      pdf.link(colX, cursorY, cols[7].width, 22, { url: tiktokDisplayUrl });
    }
    if (igUrl) {
      const colX = tableStartX + colOffsets[8];
      const clipped = (pdf.splitTextToSize(igDisplay, cols[8].width - 8) as string[])[0] ?? '';
      setFont(8, 'normal', link);
      pdf.text(clipped, colX + 4, cursorY + 14);
      pdf.link(colX, cursorY, cols[8].width, 22, { url: igUrl });
    }
    cursorY += 22;
  });

  // Footer page numbers
  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p);
    setFont(8, 'normal', muted);
    pdf.text(`Page ${p} of ${pageCount}`, pageWidth - marginX, pageHeight - 20, { align: 'right' });
  }

  pdf.save(`onboarded-creators-${new Date().toISOString().slice(0, 10)}.pdf`);
};

const getCreatorInterest = (creator: CreatorProfile) =>
  formatLabel(
    getFirstValue(creator, [
      'interested_content_types',
      'interestedContentTypes',
      'content_categories',
      'contentCategories',
      'content_types',
      'contentTypes',
      'content_interests',
      'contentInterests',
      'interests',
      'interest',
      'primary_creative_focus',
      'primaryCreativeFocus',
    ])
  );

const getCreatorProgram = (creator: CreatorProfile) =>
  toText(
    getFirstValue(creator, [
      'faculty',
      'facultyName',
      'university_program',
      'universityProgram',
      'program',
      'major',
    ])
  ).trim() || 'N/A';

const CreatorMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 break-words text-sm font-medium text-foreground">{value}</p>
  </div>
);

const normalizeCreatorIdentifier = (value: unknown) =>
  toText(value).trim().toLowerCase().replace(/^@/, '');

const normalizeEmail = (value: unknown) => toText(value).trim().toLowerCase();

const fetchOptionalRows = async <T extends Record<string, unknown>>(
  tableName: string,
  orderColumn?: string
) => {
  let query = supabase.from(tableName).select('*');

  if (orderColumn) {
    query = query.order(orderColumn, { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    console.warn(`Optional ${tableName} fetch skipped:`, error.message);
    return [] as T[];
  }

  return (data ?? []) as T[];
};

const getSignupMatch = (
  creator: CreatorProfile,
  usersById: Map<string, UserProfile>,
  signupsByEmail: Map<string, CreatorSignup>,
  signupsByIdentifier: Map<string, CreatorSignup>
) => {
  const profileUser = usersById.get(toText(creator.user_id));
  const email = normalizeEmail(creator.email) || normalizeEmail(profileUser?.email);

  if (email) {
    const emailMatch = signupsByEmail.get(email);

    if (emailMatch) {
      return emailMatch;
    }
  }

  const identifiers = [
    creator.display_name,
    creator.creator_name,
    creator.social_handle,
    profileUser?.name,
    profileUser?.full_name,
  ];

  for (const identifier of identifiers) {
    const match = signupsByIdentifier.get(normalizeCreatorIdentifier(identifier));

    if (match) {
      return match;
    }
  }

  return null;
};

const enrichCreatorsWithSubmittedFields = (
  creators: CreatorProfile[],
  users: UserProfile[],
  signups: CreatorSignup[]
) => {
  const usersById = new Map(
    users
      .map((user) => [toText(user.id), user] as const)
      .filter(([id]) => id)
  );
  const signupsByEmail = new Map(
    signups
      .map((signup) => [normalizeEmail(signup.email), signup] as const)
      .filter(([email]) => email)
  );
  const signupsByIdentifier = new Map<string, CreatorSignup>();

  signups.forEach((signup) => {
    [
      signup.display_name,
      signup.instagram_handle,
      signup.tiktok_handle,
    ].forEach((identifier) => {
      const normalizedIdentifier = normalizeCreatorIdentifier(identifier);

      if (normalizedIdentifier && !signupsByIdentifier.has(normalizedIdentifier)) {
        signupsByIdentifier.set(normalizedIdentifier, signup);
      }
    });
  });

  // Track which signups were matched to a profile (to find unmatched ones below)
  const matchedSignupEmails = new Set<string>();
  const matchedSignupHandles = new Set<string>();

  const enriched = creators.map((creator) => {
    const signup = getSignupMatch(
      creator,
      usersById,
      signupsByEmail,
      signupsByIdentifier
    );

    if (signup) {
      if (signup.email) matchedSignupEmails.add(normalizeEmail(signup.email));
      [signup.display_name, signup.instagram_handle, signup.tiktok_handle].forEach((id) => {
        const n = normalizeCreatorIdentifier(id);
        if (n) matchedSignupHandles.add(n);
      });
    }

    const scholarshipStudent =
      creator.scholarship_student ??
      creator.is_scholarship_student ??
      (signup ? getScholarshipStudentValue(signup) : null);
    const universityProgram =
      toText(signup?.university_program).trim() ||
      toText(creator.university_program).trim() ||
      toText(creator.universityProgram).trim() ||
      toText(creator.program).trim() ||
      null;
    const faculty =
      toText(creator.faculty).trim() ||
      toText(creator.facultyName).trim() ||
      null;
    const interestedContentTypes =
      creator.content_categories ??
      creator.contentCategories ??
      creator.content_types ??
      creator.contentTypes ??
      creator.interested_content_types ??
      creator.interestedContentTypes ??
      signup?.interested_content_types ??
      signup?.primary_creative_focus ??
      null;

    return {
      ...creator,
      scholarship_student: scholarshipStudent,
      faculty,
      university_program: universityProgram,
      interested_content_types: interestedContentTypes,
      tiktok_handle: toText(creator.tiktok_handle).trim() || toText(signup?.tiktok_handle).trim() || null,
      instagram_handle: toText(creator.instagram_handle).trim() || toText(signup?.instagram_handle).trim() || null,
    };
  });

  // Include signups that have no matching creator_profile yet (pending onboarding)
  // Deduplicate by email so repeat submissions only appear once
  const seenSignupEmails = new Set<string>();
  const unmatchedSignups = signups.filter((signup) => {
    if (isCampaignManagerSignup(signup)) return false;
    const email = normalizeEmail(signup.email);
    if (email && matchedSignupEmails.has(email)) return false;
    const handles = [signup.display_name, signup.instagram_handle, signup.tiktok_handle].map(
      normalizeCreatorIdentifier
    );
    if (handles.some((h) => h && matchedSignupHandles.has(h))) return false;
    if (email) {
      if (seenSignupEmails.has(email)) return false;
      seenSignupEmails.add(email);
    }
    return true;
  });

  const signupProfiles: CreatorProfile[] = unmatchedSignups.map((signup) => ({
    id: undefined,
    user_id: null,
    email: signup.email,
    display_name: signup.display_name,
    tiktok_handle: toText(signup.tiktok_handle).trim() || null,
    instagram_handle: toText(signup.instagram_handle).trim() || null,
    social_handle: toText(signup.tiktok_handle).trim() || toText(signup.instagram_handle).trim() || null,
    platform: toText(signup.tiktok_handle).trim() ? 'TikTok' : toText(signup.instagram_handle).trim() ? 'Instagram' : null,
    faculty: null,
    university_program: toText(signup.university_program).trim() || null,
    manual_follower_count: signup.follower_count ?? null,
    follower_count: signup.follower_count ?? null,
    creator_rank: null,
    verification_status: 'pending_onboarding',
    onboarding_completed: false,
    scholarship_student: getScholarshipStudentValue(signup),
    is_scholarship_student: null,
    line_id: signup.line_id,
    content_categories: null,
    content_types: null,
    interested_content_types: signup.interested_content_types ?? signup.primary_creative_focus ?? null,
    primary_creative_focus: signup.primary_creative_focus ?? null,
    additional_notes: signup.additional_notes,
    created_at: signup.created_at ?? null,
  }));

  const merged = [...enriched, ...signupProfiles];
  // Sort newest-first so date groups appear in correct order
  merged.sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });
  return merged;
};

export default function CreatorsPage() {
  const router = useRouter();
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const creatorGroups = groupCreatorsBySignupDate(creators).filter(
    (g) => g.label !== 'Unknown signup date'
  );

  useEffect(() => {
    let isMounted = true;

    const fetchCreators = async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true);
      }

      setErrorMessage(null);

      const { data, error } = await supabase
        .from('creator_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      const [users, signups, cmIdsRes] = await Promise.all([
        fetchOptionalRows<UserProfile>('users'),
        fetchOptionalRows<CreatorSignup>('creator_signups', 'created_at'),
        fetch('/api/campaign-manager-ids').then((r) => r.json()).catch(() => ({ ids: [] })),
      ]);

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error('Supabase creator profiles fetch error:', error);
        setErrorMessage(error.message);

        if (showLoading) {
          setCreators([]);
        }
      } else {
        const campaignManagerIds = new Set<string>(cmIdsRes?.ids ?? []);
        const creatorOnly = (data ?? []).filter(
          (p) => !campaignManagerIds.has(String((p as CreatorProfile).user_id ?? ''))
        );
        setCreators(
          enrichCreatorsWithSubmittedFields(
            creatorOnly as CreatorProfile[],
            users,
            signups
          )
        );
      }

      setIsLoading(false);
    };

    fetchCreators();

    const refreshVisibleCreators = () => {
      if (document.visibilityState === 'visible') {
        fetchCreators(false);
      }
    };

    const intervalId = window.setInterval(
      refreshVisibleCreators,
      CREATORS_REFRESH_INTERVAL_MS
    );
    window.addEventListener('focus', refreshVisibleCreators);
    document.addEventListener('visibilitychange', refreshVisibleCreators);

    const channel = supabase
      .channel('creator-profiles-page')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'creator_profiles' },
        () => {
          fetchCreators(false);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'creator_signups' },
        () => {
          fetchCreators(false);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        () => {
          fetchCreators(false);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshVisibleCreators);
      document.removeEventListener('visibilitychange', refreshVisibleCreators);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Onboarded Creators</h1>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          disabled={isExporting || creators.length === 0}
          onClick={async () => {
            setIsExporting(true);
            // Only include actual creator_profiles (id defined), not unmatched signup stubs
            try { await downloadCreatorsListPdf(creators); } finally { setIsExporting(false); }
          }}
        >
          <FileDown size={15} />
          {isExporting ? 'Generating...' : 'Download PDF'}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingDots text="Loading creators..." />
        </div>
      ) : errorMessage ? (
        <Card className="gap-0 overflow-hidden border-border bg-card py-0">
          <div className="p-6 text-center">
            <p className="text-red-500">Could not load creators.</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
          </div>
        </Card>
      ) : creators.length > 0 ? (
        <div className="space-y-6">
          {creatorGroups.map((group) => (
            <section key={group.label} className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
              </div>

              <Card className="gap-0 overflow-hidden border-border bg-card py-0">
                <div className="md:hidden">
                  <div className="divide-y divide-border">
                    {group.rows.map((creator, index) => (
                      <div
                        key={
                          toText(creator.id) ||
                          `${creator.social_handle ?? 'creator'}-${group.label}-${index}`
                        }
                        className="space-y-4 px-4 py-4 cursor-pointer hover:bg-muted/40 active:bg-muted/60 transition-colors"
                        onClick={() => creator.id && router.push(`/creators/${creator.id}`)}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="break-words font-medium text-foreground">
                              {getCreatorName(creator)}
                            </p>
                            {creator.verification_status === 'pending_onboarding' && (
                              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
                                Pending
                              </span>
                            )}
                          </div>
                          <p className="mt-1 break-words text-sm text-muted-foreground">
                            {toText(creator.social_handle).trim() || 'N/A'} ·{' '}
                            {formatLabel(creator.platform)}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <CreatorMetric
                            label="Followers"
                            value={formatFollowers(creator)}
                          />
                          <CreatorMetric
                            label="Rank"
                            value={formatLabel(creator.creator_rank)}
                          />
                          <CreatorMetric
                            label="Program"
                            value={getCreatorProgram(creator)}
                          />
                          <CreatorMetric
                            label="Interest"
                            value={getCreatorInterest(creator)}
                          />
                          <CreatorMetric
                            label="Scholarship"
                            value={formatScholarshipStudent(creator)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <Table className="min-w-[860px]">
                    <TableHeader className="bg-muted/60">
                      <TableRow className="h-10 hover:bg-muted/60">
                        <TableHead className="py-2">Creator</TableHead>
                        <TableHead className="py-2">Platform</TableHead>
                        <TableHead className="py-2">Program</TableHead>
                        <TableHead className="py-2">Followers</TableHead>
                        <TableHead className="py-2">Rank</TableHead>
                        <TableHead className="py-2">Interest</TableHead>
                        <TableHead className="py-2">Scholarship Student</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((creator, index) => (
                          <TableRow
                            key={
                              toText(creator.id) ||
                              `${creator.social_handle ?? 'creator'}-${group.label}-${index}`
                            }
                            className="h-11 border-border hover:bg-muted/40 cursor-pointer"
                            onClick={() => creator.id && router.push(`/creators/${creator.id}`)}
                          >
                            <TableCell className="py-2 font-medium text-foreground">
                              <div className="flex items-center gap-2">
                                {getCreatorName(creator)}
                                {creator.verification_status === 'pending_onboarding' && (
                                  <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
                                    Pending
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-2 text-muted-foreground">
                              {formatLabel(creator.platform)}
                            </TableCell>
                            <TableCell className="max-w-56 whitespace-normal break-words py-2 text-muted-foreground">
                              {getCreatorProgram(creator)}
                            </TableCell>
                            <TableCell className="py-2 text-muted-foreground">
                              {formatFollowers(creator)}
                            </TableCell>
                            <TableCell className="py-2 text-muted-foreground">
                              {formatLabel(creator.creator_rank)}
                            </TableCell>
                            <TableCell className="max-w-56 whitespace-normal break-words py-2 text-muted-foreground">
                              {getCreatorInterest(creator)}
                            </TableCell>
                            <TableCell className="py-2 text-muted-foreground">
                              {formatScholarshipStudent(creator)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <Card className="gap-0 overflow-hidden border-border bg-card py-0">
          <div className="p-6 text-center">
            <p className="text-muted-foreground">No signed-up creators yet.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
