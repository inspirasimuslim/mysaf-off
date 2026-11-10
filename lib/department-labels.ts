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
  SETIAUSAHA: 'Setiausaha Agung (SUA)',
  'TIMBALAN SETIAUSAHA': 'Timbalan Setiausaha (TSUA)',
  'JABATAN SETIAUSAHA': 'Jabatan Setiausaha (JSU)',
  BENDAHARI: 'Bendahari Kehormat (BK)',
  'LAJNAH TARBIAH': 'Lajnah Tarbiah (LT)',
  'LAJNAH PERKADERAN': 'Lajnah Perkaderan (LP)',
  'LAJNAH HAL EHWAL SEKOLAH & ALUMNI': 'Lajnah Hal Ehwal Sekolah & Alumni (LHESA)',
  'LAJNAH PEMBANGUNAN GENERASI': 'Lajnah Pembangunan Generasi (LPG)',
  'LAJNAH PEMBANGUNAN NGO': 'Lajnah Pembangunan NGO (LPN)',
  'LAJNAH KEBAJIKAN': 'Lajnah Kebajikan (LK)',
  'KESIHATAN AHLI': 'Lajnah Kebajikan (LK) — Kesihatan Ahli',
  'TABUNG ZAKAT': 'Lajnah Kebajikan (LK) — Tabung Zakat',
  'LAJNAH MUSLIMAT': 'Lajnah Muslimat (LM)',
  'LAJNAH EKONOMI DAN ASET': 'Lajnah Ekonomi & Aset (LEA)',
  'JABATAN DATA & SUMBER MANUSIA': 'Jabatan Data & Sumber Manusia (JDSM)',
  'I-GEM': 'Ikhwan Generasi Muda (I-GEM)',
};

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
