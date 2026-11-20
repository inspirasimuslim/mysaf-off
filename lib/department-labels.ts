/**
 * Nama paparan + susunan rasmi department/lajnah. Satu sumber untuk Maklum
 * Balas, Hub Admin dan skrin lantik admin supaya senarai sentiasa sama.
 * Nama kunci = `departments.name` dalam pangkalan data.
 */
export const DEPARTMENT_ORDER: readonly string[] = [
  'SETIAUSAHA',
  'TIMBALAN SETIAUSAHA',
  'JABATAN SETIAUSAHA',
  'BENDAHARI',
  'LAJNAH TARBIAH',
  'LAJNAH PERKADERAN',
  'LAJNAH HAL EHWAL SEKOLAH & ALUMNI',
  'LAJNAH PEMBANGUNAN GENERASI',
  'LAJNAH PEMBANGUNAN NGO',
  'LAJNAH KEBAJIKAN',
  'KESIHATAN AHLI',
  'TABUNG ZAKAT',
  'LAJNAH MUSLIMAT',
  'LAJNAH EKONOMI DAN ASET',
  'JABATAN DATA & SUMBER MANUSIA',
  'I-GEM',
];

const DEPARTMENT_LABELS: Record<string, string> = {
  SETIAUSAHA: 'SETIAUSAHA AGUNG (SUA)',
  'TIMBALAN SETIAUSAHA': 'TIMBALAN SETIAUSAHA AGUNG (TSUA)',
  'JABATAN SETIAUSAHA': 'JABATAN SETIAUSAHA (JSU)',
  BENDAHARI: 'BENDAHARI KEHORMAT (BK)',
  'LAJNAH TARBIAH': 'LAJNAH TARBIAH (LT)',
  'LAJNAH PERKADERAN': 'LAJNAH PERKADERAN (LP)',
  'LAJNAH HAL EHWAL SEKOLAH & ALUMNI': 'LAJNAH HAL EHWAL SEKOLAH & ALUMNI (LHESA)',
  'LAJNAH PEMBANGUNAN GENERASI': 'LAJNAH PEMBANGUNAN GENERASI (LPG)',
  'LAJNAH PEMBANGUNAN NGO': 'LAJNAH PEMBANGUNAN NGO (LPN)',
  'LAJNAH KEBAJIKAN': 'LAJNAH KEBAJIKAN (LK)',
  'KESIHATAN AHLI': 'LAJNAH KEBAJIKAN - KESIHATAN',
  'TABUNG ZAKAT': 'LAJNAH KEBAJIKAN - BANTUAN ZAKAT',
  'LAJNAH MUSLIMAT': 'LAJNAH MUSLIMAT (LM)',
  'LAJNAH EKONOMI DAN ASET': 'LAJNAH EKONOMI & ASET (LEA)',
  'JABATAN DATA & SUMBER MANUSIA': 'JABATAN DATA & SUMBER MANUSIA (JDSM)',
  'I-GEM': 'IKHWAN GENERASI MUDA (I-GEM)',
};

/** Label bagi kaunselor (bukan department dalam DB — jadual `counselors` berasingan). */
export const COUNSELOR_LABEL = 'LAJNAH KEBAJIKAN - KAUNSELOR';

export function departmentLabel(name: string): string {
  return DEPARTMENT_LABELS[name] ?? name;
}

/** Susunan: senarai rasmi dahulu, yang tidak dikenali di hujung ikut abjad. */
export function departmentRank(name: string): number {
  const i = DEPARTMENT_ORDER.indexOf(name);
  return i === -1 ? DEPARTMENT_ORDER.length : i;
}

export function sortDepartments<T extends { name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => departmentRank(a.name) - departmentRank(b.name) || a.name.localeCompare(b.name));
}
