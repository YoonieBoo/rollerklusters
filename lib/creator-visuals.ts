// Shared, deterministic visual system for creators — same person/rank always
// gets the same color everywhere in the app (list, popup, full profile),
// instead of each screen picking its own.

export const getInitials = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

// One color per letter of the alphabet, so every "P" name always lands on
// the same swatch — cycles through a fixed palette rather than picking
// randomly per person.
const AVATAR_PALETTE = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-indigo-500',
  'bg-teal-500',
  'bg-fuchsia-500',
];

export const getAvatarColorForName = (name: string): string => {
  const letter = name.trim().charAt(0).toUpperCase();
  const code = letter ? letter.charCodeAt(0) - 65 : 0; // 'A' -> 0
  const index = ((code % AVATAR_PALETTE.length) + AVATAR_PALETTE.length) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
};

// Rank badges are colored by tier (Bronze/Silver/Gold/...), not by the
// roman-numeral sub-level, so "Bronze I" and "Bronze IV" always match.
// Soft pastel tones — light tint background, gentle mid-tone text, no
// heavy border — rather than the more saturated default Tailwind chips.
const RANK_TIER_STYLES: { match: RegExp; classes: string }[] = [
  { match: /bronze/i, classes: 'bg-orange-50 text-orange-500 border-orange-100' },
  { match: /silver/i, classes: 'bg-slate-100 text-slate-500 border-slate-200' },
  { match: /gold/i, classes: 'bg-yellow-50 text-yellow-600 border-yellow-100' },
  { match: /platinum/i, classes: 'bg-teal-50 text-teal-600 border-teal-100' },
  { match: /diamond/i, classes: 'bg-blue-50 text-blue-500 border-blue-100' },
];

const RANK_FALLBACK_CLASSES = 'bg-muted text-muted-foreground border-border';

export const getRankBadgeClasses = (rank: string): string => {
  const tier = RANK_TIER_STYLES.find((t) => t.match.test(rank));
  return tier ? tier.classes : RANK_FALLBACK_CLASSES;
};
