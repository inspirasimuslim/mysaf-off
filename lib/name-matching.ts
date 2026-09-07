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
 * Token yang DIBUANG sepenuhnya daripada kunci padanan.
 *
 * 'BIN', 'BINTI' dan gelaran haji tidak mengenal pasti sesiapa — ia
 * penyambung dan penghormatan. Satu senarai menulisnya dan satu lagi tidak
 * ('NIK NURHANAN NIK MANSOR' berbanding 'NIK NURHANAN BINTI NIK MANSOR'), dan
 * membiarkannya dalam kunci bermakna dua ejaan bagi orang yang SAMA tidak
 * pernah bertemu.
 *
 * Membuangnya menjadikan padanan lebih longgar, bukan lebih berisiko: bila dua
 * ahli berbeza tiba-tiba berkongsi kunci, pemadan menolak kedua-duanya sebagai
 * tidak menentu dan bukan meneka salah satu.
 */
const DROPPED = new Set(['BIN', 'BINTI', 'HAJI', 'HAJJAH']);

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
    .filter((token) => !DROPPED.has(token))
    .join(' ');
}

/**
 * Jarak Levenshtein — bilangan suntingan aksara antara dua rentetan.
 *
 * Dua baris sahaja disimpan dan bukan matriks penuh: nama pendek, tetapi fungsi
 * ini dipanggil sekali bagi setiap pasangan calon dalam satu generasi, dan
 * matriks penuh untuk 300 baris × 25 calon ialah kerja yang tidak diperlukan.
 */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const deletion = (previous[j] as number) + 1;
      const insertion = (current[j - 1] as number) + 1;
      current[j] = Math.min(substitution, deletion, insertion);
    }
    previous = current;
  }

  return previous[b.length] as number;
}

/** 1 = serupa sepenuhnya, 0 = tiada persamaan. */
export function nameSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}

/**
 * Ambang padanan hampir.
 *
 * Dipilih daripada data sebenar: 0.85 merangkumi ejaan yang berbeza satu atau
 * dua huruf ('YUSOFF'/'YUSOF', 'FAKHRURAZI'/'FAKHRURRAZI') tetapi menolak nama
 * yang benar-benar berlainan orang. Menurunkannya bermakna meneka; menaikkannya
 * bermakna kerja manual yang tidak perlu.
 */
export const NEAR_MATCH_THRESHOLD = 0.85;

/**
 * Calon TUNGGAL yang paling hampir, atau `null` bila tiada yang cukup hampir
 * ATAU lebih daripada satu yang sama hampir.
 *
 * Keraguan sengaja dilaporkan sebagai "tiada padanan" dan bukan diselesaikan
 * dengan meneka: dalam modul yuran, padanan yang salah memindahkan hutang
 * seseorang kepada orang lain, dan itu lebih teruk daripada baris yang perlu
 * dibetulkan oleh bendahari secara manual.
 */
export function findNearMatch<T>(
  key: string,
  candidates: T[],
  nameOf: (candidate: T) => string,
  threshold = NEAR_MATCH_THRESHOLD,
): { candidate: T; similarity: number } | null {
  let best: { candidate: T; similarity: number } | null = null;
  let runnerUp = 0;

  for (const candidate of candidates) {
    const similarity = nameSimilarity(key, normalizeNameForMatch(nameOf(candidate)));
    if (!best || similarity > best.similarity) {
      if (best) runnerUp = best.similarity;
      best = { candidate, similarity };
    } else if (similarity > runnerUp) {
      runnerUp = similarity;
    }
  }

  if (!best || best.similarity < threshold) return null;
  // Dua calon yang sama-sama hampir bermakna kita tidak tahu yang mana satu.
  if (runnerUp >= threshold) return null;

  return best;
}
