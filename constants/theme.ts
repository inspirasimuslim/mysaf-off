/**
 * Design tokens — kekal selari dengan `tailwind.config.js`.
 * Guna nilai ini bila prop komponen memerlukan warna literal
 * (contoh: ikon, placeholderTextColor, navigation options).
 */
/** Nama token warna — sama untuk kedua-dua tema. */
export type ColorName =
  | 'primary'
  | 'primaryDark'
  | 'primaryMid'
  | 'primarySoft'
  | 'primaryTint'
  | 'background'
  | 'surface'
  | 'ink'
  | 'inkMuted'
  | 'inkFaint'
  | 'line'
  | 'positive'
  | 'positiveSoft'
  | 'negative'
  | 'negativeSoft'
  | 'warn'
  | 'warnSoft'
  | 'info'
  | 'infoSoft'
  | 'white';

export type ThemeColors = Record<ColorName, string>;

/** Palet tema cerah — rupa asal app. */
export const LightColors: ThemeColors = {
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
};

/**
 * Palet tema gelap. Hijau utama dicerahkan sedikit supaya masih terbaca
 * sebagai teks/pautan di atas latar gelap, dan masih menanggung teks putih
 * apabila menjadi latar butang. Warna "soft" ialah versi gelap yang rendah
 * kontras — bukan pastel cerah yang menyilaukan.
 */
export const DarkColors: ThemeColors = {
  primary: '#2A9462',
  primaryDark: '#1B7048',
  primaryMid: '#34A872',
  primarySoft: '#1A3328',
  primaryTint: '#142A21',

  background: '#0F1211',
  surface: '#181C1A',

  ink: '#ECEFED',
  inkMuted: '#A3ACA7',
  inkFaint: '#7A847F',
  line: '#2A302D',

  positive: '#22C55E',
  positiveSoft: '#12301F',
  negative: '#F87171',
  negativeSoft: '#3A1B1B',
  warn: '#FB923C',
  warnSoft: '#3A2616',
  info: '#60A5FA',
  infoSoft: '#1A2740',

  white: '#FFFFFF',
};

/**
 * Palet tema cerah sebagai nilai tetap. Kod komponen sepatutnya guna
 * `useColors()` (`@/lib/theme`) supaya ikut tema; `Colors` kekal untuk
 * kod di luar pokok React yang tidak boleh guna hook.
 */
export const Colors = LightColors;

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
  Emas pencapaian — chip kedudukan pada kepala hijau, dan lencana di Profil.

  Lebih cerah daripada `BIRTHDAY_GOLD` kerana ia sentiasa duduk di atas hijau
  gelap: #D97706 pada latar itu membaca sebagai coklat kusam, bukan emas. Aksen
  hari lahir pula duduk di atas latar terang, jadi keduanya tidak boleh berkongsi
  satu nilai.
*/
export const RANK_GOLD = '#FBBF24';

