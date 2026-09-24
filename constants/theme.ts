/**
 * Design tokens — kekal selari dengan `tailwind.config.js`.
 * Guna nilai ini bila prop komponen memerlukan warna literal
 * (contoh: ikon, placeholderTextColor, navigation options).
 */
export const Colors = {
  primary: '#2FA695',
  primaryDark: '#1B6B5F',
  primaryMid: '#5FC4B3',
  primarySoft: '#D9F2ED',
  primaryTint: '#F0FBF9',

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

/*
  Emas pencapaian — chip kedudukan pada kepala mint (primary), dan lencana di Profil.

  Lebih cerah daripada `BIRTHDAY_GOLD` kerana ia sentiasa duduk di atas latar
  gelap: #D97706 pada latar itu membaca sebagai coklat kusam, bukan emas. Aksen
  hari lahir pula duduk di atas latar terang, jadi keduanya tidak boleh berkongsi
  satu nilai.
*/
export const RANK_GOLD = '#FBBF24';

export type ColorName = keyof typeof Colors;
