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
const RANK_TIER_STYLES: { match: RegExp; classes: string }[] = [
  { match: /bronze/i, classes: 'bg-amber-100 text-amber-800 border-amber-200' },
  { match: /silver/i, classes: 'bg-slate-200 text-slate-700 border-slate-300' },
  { match: /gold/i, classes: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { match: /platinum/i, classes: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  { match: /diamond/i, classes: 'bg-sky-100 text-sky-800 border-sky-200' },
];

const RANK_FALLBACK_CLASSES = 'bg-muted text-muted-foreground border-border';

export const getRankBadgeClasses = (rank: string): string => {
  const tier = RANK_TIER_STYLES.find((t) => t.match.test(rank));
  return tier ? tier.classes : RANK_FALLBACK_CLASSES;
};
