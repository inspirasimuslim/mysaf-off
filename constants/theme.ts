/**
 * Design tokens — kekal selari dengan `tailwind.config.js`.
 * Guna nilai ini bila prop komponen memerlukan warna literal
 * (contoh: ikon, placeholderTextColor, navigation options).
 */
export const Colors = {
  primary: '#0F5132',
  primaryDark: '#0A3A23',
  primaryMid: '#157347',
  primarySoft: '#E7F1EC',
  primaryTint: '#F2F8F5',

  background: '#FAFAFA',
  surface: '#FFFFFF',

  ink: '#1A1A1A',
  inkMuted: '#6B7280',
  inkFaint: '#9CA3AF',
  line: '#ECECEC',

  positive: '#16A34A',
  positiveSoft: '#E8F6ED',
  negative: '#DC2626',
  negativeSoft: '#FDECEC',
  warn: '#EA580C',
  warnSoft: '#FDF0E7',
  info: '#2563EB',
  infoSoft: '#EAF0FD',

  white: '#FFFFFF',
} as const;

export const Radius = {
  field: 16,
  card: 20,
  pill: 999,
} as const;

export const Spacing = {
  gutter: 20,
  card: 20,
} as const;

/*
  Aksen emas untuk hari jadi — ucapan di skrin Utama dan skrin Hari Jadi Bulan.

  Berasingan daripada `Colors` kerana ia bukan sebahagian daripada palet asas:
  palet itu tiada warna meraikan, dan `warn` (#EA580C) yang paling hampir
  membawa makna amaran. Nilai ini duduk di sebelahnya supaya masih sekeluarga,
  cuma lebih ke arah emas.
*/
export const BIRTHDAY_GOLD = '#D97706';

export type ColorName = keyof typeof Colors;
