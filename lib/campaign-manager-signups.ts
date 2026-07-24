import { supabase } from '@/lib/supabase/client';

type SupabaseRow = Record<string, unknown>;

const CAMPAIGN_MANAGERS_PAGE_SIZE = 1000;

const toText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .map(toText)
      .filter(Boolean)
      .join(', ');
  }
  return '';
};

const normalizePhone = (value: unknown): string => toText(value).replace(/[^\d+]/g, '');

export const isCampaignManagerSignup = (signup: SupabaseRow): boolean => {
  const roleText = [signup.signup_type, signup.role_label, signup.primary_creative_focus]
    .map(toText)
    .join(' ')
    .toLowerCase();
  return (
    roleText.includes('campaign-manager') ||
    roleText.includes('campaign manager') ||
    roleText.includes('campaign_manager')
  );
};

const sortSignups = (a: SupabaseRow, b: SupabaseRow): number => {
  const aTime = Date.parse(toText(a.created_at));
  const bTime = Date.parse(toText(b.created_at));
  if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) {
    return bTime - aTime;
  }
  return toText(b.created_at).localeCompare(toText(a.created_at));
};

// Single source of truth for "which campaign manager signups are real,
// distinct people" — used by the sidebar badge and the Campaign Managers
// page. The same person can resubmit the signup form multiple times,
// sometimes with a different email, so a repeated email, phone number, or
// LINE ID is treated as the same manager and only their most recent
// submission is kept.
export const getCampaignManagerSignups = async (): Promise<SupabaseRow[]> => {
  const signups: SupabaseRow[] = [];
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  const seenLineIds = new Set<string>();

  const keep = (row: SupabaseRow): boolean => {
    const email = toText(row.email).trim().toLowerCase();
    const phone = normalizePhone(row.phone_number);
    const lineId = toText(row.line_id).trim().toLowerCase();

    if (
      (email && seenEmails.has(email)) ||
      (phone && seenPhones.has(phone)) ||
      (lineId && seenLineIds.has(lineId))
    ) {
      return false;
    }

    if (email) seenEmails.add(email);
    if (phone) seenPhones.add(phone);
    if (lineId) seenLineIds.add(lineId);
    return true;
  };

  for (let page = 0; ; page += 1) {
    const from = page * CAMPAIGN_MANAGERS_PAGE_SIZE;
    const to = from + CAMPAIGN_MANAGERS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('creator_signups')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('Campaign manager signups fetch error:', error);
      return [];
    }

    const pageRows = (data ?? []) as SupabaseRow[];
    for (const row of pageRows.filter(isCampaignManagerSignup)) {
      if (keep(row)) {
        signups.push(row);
      }
    }

    if (pageRows.length < CAMPAIGN_MANAGERS_PAGE_SIZE) {
      break;
    }
  }

  const { data: sourceRows, error: sourceError } = await supabase
    .from('creator_signup_profile_sources')
    .select('*');

  if (!sourceError) {
    for (const row of ((sourceRows ?? []) as SupabaseRow[]).filter(isCampaignManagerSignup)) {
      if (keep(row)) {
        signups.push(row);
      }
    }
  }

  return signups.sort(sortSignups);
};

export const getCampaignManagerCount = async (): Promise<number> =>
  (await getCampaignManagerSignups()).length;
