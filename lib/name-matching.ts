/**
 * Normalisasi nama untuk PADANAN, bukan untuk paparan.
 *
 * Dua senarai yang ditaip oleh dua orang berbeza jarang sekali mengeja nama
 * yang sama dengan cara yang sama: 'B.', 'BIN' dan 'BN' bermaksud benda yang
 * sama, begitu juga 'HJ' dan 'HAJI', dan 'MOHD' yang muncul sebagai 'MUHAMMAD'
 * di senarai sebelah. Nama disaring kepada satu bentuk kanonik supaya padanan
 * tidak bergantung pada ejaan yang kebetulan sama.
 *
 * Hasilnya TIDAK pernah dipapar dan TIDAK pernah disimpan — ia hanya kunci
 * carian. Nama sebenar sentiasa datang daripada rekod `members`.
 */

/**
 * Token yang membawa makna yang sama. Kunci ialah ejaan yang mungkin ditemui,
 * nilai ialah bentuk kanonik yang dipilih.
 */
const SYNONYMS: Record<string, string> = {
  // Bin / binti
  B: 'BIN',
  BN: 'BIN',
  BIN: 'BIN',
  BT: 'BINTI',
  BTE: 'BINTI',
  BINTE: 'BINTI',
  BINTI: 'BINTI',

  // Gelaran haji
  HJ: 'HAJI',
  HAJI: 'HAJI',
  HJH: 'HAJJAH',
  HAJAH: 'HAJJAH',
  HAJJAH: 'HAJJAH',

  // Keluarga 'Muhammad' — ejaan paling banyak berbeza antara senarai.
  MD: 'MUHAMMAD',
  MHD: 'MUHAMMAD',
  MOHD: 'MUHAMMAD',
  MUHD: 'MUHAMMAD',
  MOHAMAD: 'MUHAMMAD',
  MOHAMED: 'MUHAMMAD',
  MOHAMMAD: 'MUHAMMAD',
  MOHAMMED: 'MUHAMMAD',
  MUHAMAD: 'MUHAMMAD',
  MUHAMMAD: 'MUHAMMAD',

  // Keluarga 'Abdul'
  ABD: 'ABDUL',
  ABDL: 'ABDUL',
  ABDUL: 'ABDUL',
};

/**
 * Nama → kunci padanan.
 *
 * '@' ialah penanda nama alias dalam senarai sumber ('ABDUL YADIY @HADI B.
 * YUSOF'), jadi ia dilayan sebagai pemisah perkataan biasa: kedua-dua senarai
 * melaluinya, jadi aliasnya kekal sebahagian daripada kunci pada kedua-dua
 * belah dan tidak pernah menjadi punca padanan tersasar.
 */
export function normalizeNameForMatch(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((token) => SYNONYMS[token] ?? token)
    .join(' ');
}
