'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileDown,
  FileText,
  Flag,
  GraduationCap,
  Instagram,
  Music2,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  UserPlus,
  Users,
  Youtube,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LoadingDots } from '@/components/ui/loading-dots';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/lib/supabase/client';
import { getScopedCreators, UNIVERSITIES } from '@/lib/creator-scope';
import { getInitials, getAvatarColorForName, getRankBadgeClasses } from '@/lib/creator-visuals';

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

const PlatformIcon = ({ platform, className }: { platform?: string | null; className?: string }) => {
  switch (toText(platform).trim().toLowerCase()) {
    case 'tiktok':
      return <Music2 className={className} />;
    case 'youtube':
      return <Youtube className={className} />;
    case 'instagram':
    default:
      return <Instagram className={className} />;
  }
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

// Real faculty data is messy free text with multiple spellings for the same
// program (e.g. "BBA" / "bba" / "Bachelor of Business Administration"), so
// the filter groups them into clean categories by keyword rather than
// showing every raw variant as a separate option.
const FACULTY_CATEGORIES: { label: string; keywords: string[] }[] = [
  {
    label: 'DDI / MSME',
    keywords: [
      'ddi',
      'msme',
      'design and digital innovation',
      'digital design and innovation',
      'martin de tours',
    ],
  },
  {
    label: 'BBA / Business Administration',
    keywords: ['bba', 'bachelor of business administration', 'business administration', 'sustainable business management'],
  },
  { label: 'Communication Arts', keywords: ['communication art'] },
  { label: 'Architecture', keywords: ['architecture'] },
  { label: 'Engineering', keywords: ['engineering'] },
  { label: 'Music', keywords: ['music'] },
];

const categorizeFaculty = (rawFaculty: unknown): string => {
  const text = toText(rawFaculty).trim().toLowerCase();
  if (!text) return 'Unspecified';
  if (text === 'bie') return 'Engineering';
  for (const category of FACULTY_CATEGORIES) {
    if (category.keywords.some((keyword) => text.includes(keyword))) {
      return category.label;
    }
  }
  return 'Other';
};

const CreatorMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
      {label}
    </p>
    <p className="mt-1 break-words text-sm font-medium text-foreground">{value}</p>
  </div>
);

const RankBadge = ({ rank }: { rank: unknown }) => {
  const label = formatLabel(rank);
  if (label === 'N/A') {
    return <span className="text-muted-foreground">N/A</span>;
  }
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${getRankBadgeClasses(
        label
      )}`}
    >
      {label}
    </span>
  );
};

const ACTIVE_ENGAGEMENT_STATUSES = ['accepted', 'active', 'completed'];

// Bulk activity lookup so the whole list can show/filter by status in one
// pass, instead of the per-creator fetch the popup card does on open.
const enrichWithActivityStatus = async (creatorsList: CreatorProfile[]): Promise<CreatorProfile[]> => {
  const [engRes, subRes] = await Promise.all([
    supabase.from('engagements').select('creator_id, status'),
    supabase.from('submissions').select('creator_ref'),
  ]);

  const activeUserIds = new Set<string>();
  for (const e of (engRes.data ?? []) as { creator_id?: string; status?: string }[]) {
    const creatorId = toText(e.creator_id);
    if (creatorId && ACTIVE_ENGAGEMENT_STATUSES.includes(toText(e.status))) {
      activeUserIds.add(creatorId);
    }
  }

  const submittedRefs = new Set<string>();
  for (const s of (subRes.data ?? []) as { creator_ref?: string }[]) {
    const ref = toText(s.creator_ref).trim().toLowerCase().replace(/^@/, '');
    if (ref) submittedRefs.add(ref);
  }

  return creatorsList.map((creator) => {
    const userId = toText(creator.user_id);
    const social = toText(creator.social_handle).trim().toLowerCase().replace(/^@/, '');
    const isActive =
      (Boolean(userId) && activeUserIds.has(userId)) ||
      (Boolean(userId) && submittedRefs.has(userId)) ||
      (Boolean(social) && submittedRefs.has(social));
    return { ...creator, is_active: isActive };
  });
};

const CreatorAvatar = ({
  name,
  avatarUrl,
  size = 32,
}: {
  name: string;
  avatarUrl?: unknown;
  size?: number;
}) => {
  const url = toText(avatarUrl).trim();

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${getAvatarColorForName(
        name
      )}`}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.4) }}
    >
      {getInitials(name)}
    </div>
  );
};


const getCreatorFacultyCategory = (creator: CreatorProfile): string =>
  categorizeFaculty(
    getFirstValue(creator, [
      'faculty',
      'facultyName',
      'university_program',
      'universityProgram',
      'program',
      'major',
    ])
  );

const FACULTY_FILTER_SORT_ORDER = ['Unspecified', 'Other'];

const SCHOLARSHIP_FILTER_ORDER = ['Yes', 'No', 'N/A'];
const SCHOLARSHIP_FILTER_LABELS: Record<string, string> = {
  Yes: 'Scholarship',
  No: 'Non-scholarship',
  'N/A': 'Unspecified',
};

const initialNewCreatorForm = {
  creatorName: '',
  email: '',
  platform: '',
  socialHandle: '',
  followerCount: '',
  university: '',
  faculty: '',
  contentCategories: '',
  scholarshipStudent: false,
  bio: '',
  phoneNumber: '',
  lineId: '',
  location: '',
};

const PLATFORM_OPTIONS = ['TikTok', 'Instagram', 'YouTube'] as const;

export default function CreatorsPage() {
  const router = useRouter();
  const [creators, setCreators] = useState<CreatorProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facultyFilter, setFacultyFilter] = useState('all');
  const [scholarshipFilter, setScholarshipFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isAddingCreator, setIsAddingCreator] = useState(false);
  const [addCreatorError, setAddCreatorError] = useState<string | null>(null);
  const [newCreatorForm, setNewCreatorForm] = useState(initialNewCreatorForm);
  const [selectedCreator, setSelectedCreator] = useState<CreatorProfile | null>(null);
  const [selectedCreatorStats, setSelectedCreatorStats] = useState<{
    invited: number;
    accepted: number;
    submitted: number;
    completed: number;
  } | null>(null);

  const openCreatorCard = async (creator: CreatorProfile) => {
    if (!creator.id) return;
    setSelectedCreator(creator);
    setSelectedCreatorStats(null);

    const userId = toText(creator.user_id);

    const [engRes, subRes] = await Promise.all([
      userId
        ? supabase.from('engagements').select('status').eq('creator_id', userId)
        : Promise.resolve({ data: [] }),
      supabase.from('submissions').select('creator_ref'),
    ]);

    const engagementRows = (engRes.data ?? []) as { status?: string }[];
    const creatorSocial = toText(creator.social_handle).trim().toLowerCase().replace(/^@/, '');
    const submissionRows = ((subRes.data ?? []) as { creator_ref?: string }[]).filter((s) => {
      const ref = toText(s.creator_ref).toLowerCase().replace(/^@/, '');
      return (userId && ref === userId) || (creatorSocial && ref === creatorSocial);
    });

    setSelectedCreatorStats({
      invited: engagementRows.length,
      accepted: engagementRows.filter((e) => ['accepted', 'active', 'completed'].includes(toText(e.status)))
        .length,
      submitted: submissionRows.length,
      completed: engagementRows.filter((e) => toText(e.status) === 'completed').length,
    });
  };

  const refreshCreators = async () => {
    try {
      const scoped = await getScopedCreators();
      const enriched = await enrichWithActivityStatus(scoped as CreatorProfile[]);
      setCreators(enriched);
      window.dispatchEvent(new CustomEvent('creator-count-update', { detail: scoped.length }));
    } catch (error) {
      console.error('Creators refresh error:', error);
    }
  };

  const handleAddCreator = async () => {
    setAddCreatorError(null);

    if (
      !newCreatorForm.creatorName.trim() ||
      !newCreatorForm.email.trim() ||
      !newCreatorForm.platform ||
      !newCreatorForm.socialHandle.trim()
    ) {
      setAddCreatorError('Creator name, email, platform, and social handle are required.');
      return;
    }

    setIsAddingCreator(true);

    try {
      const res = await fetch('/api/creators/manual-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCreatorForm),
      });
      const json = await res.json();

      if (!res.ok) {
        setAddCreatorError(json?.error ?? 'Could not add this creator.');
        setIsAddingCreator(false);
        return;
      }

      setShowAddDialog(false);
      setNewCreatorForm(initialNewCreatorForm);
      await refreshCreators();
    } catch (error) {
      setAddCreatorError(error instanceof Error ? error.message : 'Could not add this creator.');
    } finally {
      setIsAddingCreator(false);
    }
  };

  const facultyOptions = Array.from(new Set(creators.map(getCreatorFacultyCategory))).sort((a, b) => {
    const aRank = FACULTY_FILTER_SORT_ORDER.indexOf(a);
    const bRank = FACULTY_FILTER_SORT_ORDER.indexOf(b);
    if (aRank !== -1 || bRank !== -1) {
      return (aRank === -1 ? FACULTY_FILTER_SORT_ORDER.length : aRank) -
        (bRank === -1 ? FACULTY_FILTER_SORT_ORDER.length : bRank);
    }
    return a.localeCompare(b);
  });

  const scholarshipOptions = SCHOLARSHIP_FILTER_ORDER.filter((value) =>
    creators.some((creator) => formatScholarshipStudent(creator) === value)
  );

  const visibleCreators = creators
    .filter((creator) => facultyFilter === 'all' || getCreatorFacultyCategory(creator) === facultyFilter)
    .filter(
      (creator) => scholarshipFilter === 'all' || formatScholarshipStudent(creator) === scholarshipFilter
    )
    .filter((creator) => {
      const isPending = creator.verification_status === 'pending_onboarding';
      if (statusFilter === 'all') return true;
      if (statusFilter === 'pending') return isPending;
      if (isPending) return false;
      return statusFilter === 'active' ? Boolean(creator.is_active) : !creator.is_active;
    });

  const creatorGroups = groupCreatorsBySignupDate(visibleCreators).filter(
    (g) => g.label !== 'Unknown signup date'
  );

  useEffect(() => {
    let isMounted = true;

    const fetchCreators = async (showLoading = true) => {
      if (showLoading) {
        setIsLoading(true);
      }

      setErrorMessage(null);

      try {
        const scoped = await getScopedCreators();

        if (!isMounted) {
          return;
        }

        const enriched = await enrichWithActivityStatus(scoped as CreatorProfile[]);

        if (!isMounted) {
          return;
        }

        setCreators(enriched);
        // Broadcast the authoritative count so the sidebar badge stays in sync
        window.dispatchEvent(new CustomEvent('creator-count-update', { detail: scoped.length }));
      } catch (error) {
        if (!isMounted) {
          return;
        }
        console.error('Creators fetch error:', error);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load creators');
        if (showLoading) {
          setCreators([]);
        }
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Onboarded Creators</h1>
        <div className="flex items-center gap-2">
          <Select value={facultyFilter} onValueChange={setFacultyFilter}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="All faculties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All faculties</SelectItem>
              {facultyOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={scholarshipFilter} onValueChange={setScholarshipFilter}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue placeholder="All creators" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All creators</SelectItem>
              {scholarshipOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {SCHOLARSHIP_FILTER_LABELS[option] ?? option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => {
              setAddCreatorError(null);
              setNewCreatorForm(initialNewCreatorForm);
              setShowAddDialog(true);
            }}
          >
            <UserPlus size={15} />
            Add Creator
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            disabled={isExporting || visibleCreators.length === 0}
            onClick={async () => {
              setIsExporting(true);
              // Only include actual creator_profiles (id defined), not unmatched signup stubs
              try { await downloadCreatorsListPdf(visibleCreators); } finally { setIsExporting(false); }
            }}
          >
            <FileDown size={15} />
            {isExporting ? 'Generating...' : 'Download PDF'}
          </Button>
        </div>
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
                        onClick={() => openCreatorCard(creator)}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <CreatorAvatar name={getCreatorName(creator)} avatarUrl={creator.avatar_url} size={36} />
                          <div className="min-w-0">
                            <p className="break-words font-medium text-foreground">
                              {getCreatorName(creator)}
                            </p>
                            <p className="mt-1 break-words text-sm text-muted-foreground">
                              {toText(creator.social_handle).trim() || 'N/A'} ·{' '}
                              {formatLabel(creator.platform)}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <CreatorMetric
                            label="Followers"
                            value={formatFollowers(creator)}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-normal text-muted-foreground">
                              Rank
                            </p>
                            <p className="mt-1">
                              <RankBadge rank={creator.creator_rank} />
                            </p>
                          </div>
                          <CreatorMetric
                            label="Program"
                            value={getCreatorProgram(creator)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hidden overflow-x-auto md:block">
                  <Table className="min-w-[860px] table-fixed">
                    <TableHeader className="bg-muted/60">
                      <TableRow className="h-10 hover:bg-muted/60">
                        <TableHead className="w-[32%] py-2">Creator</TableHead>
                        <TableHead className="w-[34%] py-2">Program</TableHead>
                        <TableHead className="w-[16%] py-2">Followers</TableHead>
                        <TableHead className="w-[18%] py-2">Rank</TableHead>
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
                            onClick={() => openCreatorCard(creator)}
                          >
                            <TableCell className="whitespace-normal py-2 font-medium text-foreground">
                              <div className="flex items-center gap-2.5">
                                <CreatorAvatar name={getCreatorName(creator)} avatarUrl={creator.avatar_url} size={28} />
                                <span className="break-words">{getCreatorName(creator)}</span>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-normal break-words py-2 text-muted-foreground">
                              {getCreatorProgram(creator)}
                            </TableCell>
                            <TableCell className="py-2 text-muted-foreground">
                              {formatFollowers(creator)}
                            </TableCell>
                            <TableCell className="py-2 text-muted-foreground">
                              <RankBadge rank={creator.creator_rank} />
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

      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          if (!isAddingCreator) {
            setShowAddDialog(open);
            if (!open) {
              setNewCreatorForm(initialNewCreatorForm);
              setAddCreatorError(null);
            }
          }
        }}
      >
        <DialogContent className="bg-card border-border max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Creator</DialogTitle>
            <DialogDescription>
              Add someone directly as an onboarded creator, without waiting for them to fill out
              the signup form. This creates their account and profile right away.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-creator-name">Creator name *</Label>
                <Input
                  id="new-creator-name"
                  placeholder="Jane Doe"
                  value={newCreatorForm.creatorName}
                  onChange={(e) => setNewCreatorForm((f) => ({ ...f, creatorName: e.target.value }))}
                  disabled={isAddingCreator}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-creator-email">Email *</Label>
                <Input
                  id="new-creator-email"
                  type="email"
                  placeholder="jane@example.com"
                  value={newCreatorForm.email}
                  onChange={(e) => setNewCreatorForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={isAddingCreator}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Platform *</Label>
                <Select
                  value={newCreatorForm.platform}
                  onValueChange={(v) => setNewCreatorForm((f) => ({ ...f, platform: v }))}
                  disabled={isAddingCreator}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-creator-handle">Social handle *</Label>
                <Input
                  id="new-creator-handle"
                  placeholder="@janedoe"
                  value={newCreatorForm.socialHandle}
                  onChange={(e) => setNewCreatorForm((f) => ({ ...f, socialHandle: e.target.value }))}
                  disabled={isAddingCreator}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-creator-followers">Follower count</Label>
                <Input
                  id="new-creator-followers"
                  type="number"
                  min="0"
                  placeholder="1000"
                  value={newCreatorForm.followerCount}
                  onChange={(e) => setNewCreatorForm((f) => ({ ...f, followerCount: e.target.value }))}
                  disabled={isAddingCreator}
                />
              </div>
              <div className="space-y-1.5">
                <Label>University</Label>
                <Select
                  value={newCreatorForm.university}
                  onValueChange={(v) => setNewCreatorForm((f) => ({ ...f, university: v }))}
                  disabled={isAddingCreator}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select university" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIVERSITIES.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-creator-faculty">Faculty / program</Label>
                <Input
                  id="new-creator-faculty"
                  placeholder="e.g. DDI, BBA, Communication Arts"
                  value={newCreatorForm.faculty}
                  onChange={(e) => setNewCreatorForm((f) => ({ ...f, faculty: e.target.value }))}
                  disabled={isAddingCreator}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-creator-categories">Content categories</Label>
                <Input
                  id="new-creator-categories"
                  placeholder="Beauty, Fashion, Campus Life"
                  value={newCreatorForm.contentCategories}
                  onChange={(e) => setNewCreatorForm((f) => ({ ...f, contentCategories: e.target.value }))}
                  disabled={isAddingCreator}
                />
                <p className="text-xs text-muted-foreground">Comma-separated</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-creator-phone">Phone number</Label>
                <Input
                  id="new-creator-phone"
                  placeholder="+66..."
                  value={newCreatorForm.phoneNumber}
                  onChange={(e) => setNewCreatorForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                  disabled={isAddingCreator}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-creator-line">LINE ID</Label>
                <Input
                  id="new-creator-line"
                  value={newCreatorForm.lineId}
                  onChange={(e) => setNewCreatorForm((f) => ({ ...f, lineId: e.target.value }))}
                  disabled={isAddingCreator}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-creator-bio">Bio</Label>
              <Textarea
                id="new-creator-bio"
                placeholder="Short description of this creator's content"
                value={newCreatorForm.bio}
                onChange={(e) => setNewCreatorForm((f) => ({ ...f, bio: e.target.value }))}
                disabled={isAddingCreator}
                className="min-h-20"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
              <Label htmlFor="new-creator-scholarship" className="cursor-pointer">
                Scholarship student
              </Label>
              <Switch
                id="new-creator-scholarship"
                checked={newCreatorForm.scholarshipStudent}
                onCheckedChange={(checked) =>
                  setNewCreatorForm((f) => ({ ...f, scholarshipStudent: checked }))
                }
                disabled={isAddingCreator}
              />
            </div>

            {addCreatorError && <p className="text-sm text-red-500">{addCreatorError}</p>}

            <div className="flex gap-2 justify-end pt-2">
              <Button
                variant="outline"
                onClick={() => setShowAddDialog(false)}
                disabled={isAddingCreator}
              >
                Cancel
              </Button>
              <Button onClick={handleAddCreator} disabled={isAddingCreator}>
                {isAddingCreator ? 'Adding...' : 'Add Creator'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedCreator)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedCreator(null);
            setSelectedCreatorStats(null);
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-1rem)] gap-0 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl sm:max-h-[88vh] sm:max-w-[480px] [&>button]:right-4 [&>button]:top-4 [&>button]:flex [&>button]:size-8 [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:bg-slate-50 [&>button]:text-slate-700 [&>button]:opacity-100 [&>button]:hover:bg-slate-100">
          {selectedCreator && (
            <>
              <DialogTitle className="sr-only">{getCreatorName(selectedCreator)}</DialogTitle>
              <DialogDescription className="sr-only">Creator profile summary</DialogDescription>

              <div className="px-5 pb-5 pt-11 sm:px-6 sm:pb-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="mx-auto shrink-0 sm:mx-0 [&>div]:ring-2 [&>div]:ring-slate-50 [&>img]:ring-2 [&>img]:ring-slate-50">
                    <CreatorAvatar
                      name={getCreatorName(selectedCreator)}
                      avatarUrl={selectedCreator.avatar_url}
                      size={72}
                    />
                  </div>

                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    <h2 className="truncate text-lg font-bold tracking-tight text-slate-950">
                      {getCreatorName(selectedCreator)}
                    </h2>
                    {toText(selectedCreator.social_handle).trim() && (
                      <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-slate-500 sm:justify-start">
                        <PlatformIcon platform={selectedCreator.platform} className="size-3.5 text-slate-800" />
                        {toText(selectedCreator.social_handle).trim().replace(/^@/, '')} ·{' '}
                        {formatLabel(selectedCreator.platform)}
                      </p>
                    )}
                    <div className="mt-2.5 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                      {getCreatorProgram(selectedCreator) !== 'N/A' && (
                        <span className="rounded-full border border-indigo-100 bg-indigo-50/70 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                          {getCreatorProgram(selectedCreator)}
                        </span>
                      )}
                      {getCreatorInterest(selectedCreator) !== 'N/A' &&
                        getCreatorInterest(selectedCreator)
                          .split(', ')
                          .map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-indigo-100 bg-indigo-50/70 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                            >
                              {tag}
                            </span>
                          ))}
                    </div>
                  </div>
                </div>

                <div className="my-4 h-px bg-slate-200" />

                <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4">
                  {[
                    { icon: <Users className="size-3.5" />, label: 'Followers', value: formatFollowers(selectedCreator) },
                    { icon: <ShieldCheck className="size-3.5" />, label: 'Rank', value: <RankBadge rank={selectedCreator.creator_rank} /> },
                    { icon: <GraduationCap className="size-3.5" />, label: 'Scholarship', value: formatScholarshipStudent(selectedCreator) },
                    { icon: <CalendarDays className="size-3.5" />, label: 'Joined', value: formatDate(toText(selectedCreator.created_at) || null) },
                  ].map((item) => (
                    <div key={item.label} className="min-w-0 text-center sm:text-left">
                      <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600 sm:justify-start">
                        {item.icon}
                        {item.label}
                      </div>
                      <div className="mt-1 text-sm font-bold text-slate-950 sm:pl-5">{item.value}</div>
                    </div>
                  ))}
                </div>

                <div className="my-4 h-px bg-slate-200" />

                <h3 className="text-sm font-semibold text-slate-900">Activity Overview</h3>
                <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { icon: <Send className="size-4 text-indigo-600" />, iconBg: 'bg-violet-50', label: 'Invited', value: selectedCreatorStats?.invited, unit: 'campaign' },
                    { icon: <CheckCircle2 className="size-4 text-emerald-500" />, iconBg: 'bg-emerald-50', label: 'Accepted', value: selectedCreatorStats?.accepted, unit: 'campaign' },
                    { icon: <FileText className="size-4 text-blue-600" />, iconBg: 'bg-blue-50', label: 'Submitted', value: selectedCreatorStats?.submitted, unit: 'contents' },
                    { icon: <Flag className="size-4 text-orange-500" />, iconBg: 'bg-orange-50', label: 'Completed', value: selectedCreatorStats?.completed, unit: 'campaign' },
                  ].map((stat) => (
                    <div key={stat.label} className="flex flex-col items-center rounded-xl border border-slate-200 px-2 py-3 text-center shadow-sm">
                      <div className={`flex size-8 items-center justify-center rounded-full ${stat.iconBg}`}>
                        {stat.icon}
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-600">{stat.label}</p>
                      <p className="mt-0.5 text-base font-bold text-slate-950">
                        {selectedCreatorStats ? stat.value ?? 0 : '—'}
                      </p>
                      <p className="text-[10px] text-slate-700">{stat.unit}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex gap-2.5 rounded-xl border border-violet-200 bg-violet-50/70 p-3">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                    {toText(selectedCreator.bio).trim() ? <Star className="size-3.5" /> : <Sparkles className="size-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-violet-700">
                      {getCreatorInterest(selectedCreator) !== 'N/A'
                        ? `${getCreatorInterest(selectedCreator).split(', ')[0]} Creator`
                        : 'Creator Profile'}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-700">
                      {toText(selectedCreator.bio).trim() ||
                        `${getCreatorName(selectedCreator)} creates content for an engaged online audience.`}
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="mt-4 h-10 w-full rounded-lg border-2 border-indigo-500 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 hover:text-indigo-700"
                  onClick={() => {
                    const id = selectedCreator.id;
                    setSelectedCreator(null);
                    setSelectedCreatorStats(null);
                    router.push(`/creators/${id}`);
                  }}
                >
                  <span className="flex flex-1 items-center justify-center gap-1.5">
                    <ExternalLink className="size-4" />
                    View full profile
                  </span>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
