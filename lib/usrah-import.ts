import * as XLSX from 'xlsx';

import { ImportError, toGenerationCode, type RawRow } from './ahli-import';
import { normalizeNameForMatch } from './name-matching';

/**
 * Membaca fail Excel kehadiran usrah bulanan dan memadankan setiap baris
 * kepada rekod `members` yang sedia ada.
 *
 * Seperti `ahli-import`, modul ini SENGAJA bebas daripada React Native — ia
 * menerima base64 dan senarai ahli, dan memulangkan data bersih. Padanan nama
 * dibuat di sini dan bukan di dalam pangkalan data supaya admin dapat MELIHAT
 * nama mana yang tidak berjaya dipadankan sebelum apa-apa ditulis.
 *
 * Baris yang tidak dapat dipadankan TIDAK menghentikan import. Fail sebenar
 * datang dari sumber luar dan sentiasa ada beberapa nama yang tersasar; menolak
 * keseluruhan fail kerana tiga baris bermakna 321 baris yang baik turut hilang.
 */

// =============================================================================
// Bentuk data
// =============================================================================

/** Ahli sedia ada yang menjadi sasaran padanan. */
export type MemberLookupRow = {
  id: string;
  full_name: string;
  generasi: string | null;
};

export type UsrahMatch = {
  memberId: string;
  /** Nama seperti dalam `members`, bukan seperti dalam fail. */
  fullName: string;
  generasi: string | null;
  /** Nama seperti ditulis dalam fail, bila ia berbeza daripada rekod. */
  fileName: string;
  /** 12 nilai, Januari hingga Disember. */
  months: (boolean | null)[];
  /** `true` bila padanan ditemui tanpa generasi yang sepadan. */
  looseMatch: boolean;
};

export type UsrahUnmatched = {
  /** Nombor baris seperti dilihat dalam Excel (baris 1 = pengepala). */
  row: number;
  name: string;
  generasi: string | null;
  message: string;
};

export type UsrahParseResult = {
  matched: UsrahMatch[];
  unmatched: UsrahUnmatched[];
  /** Jumlah baris data dalam fail, termasuk yang tidak dipadankan. */
  totalRows: number;
};

// =============================================================================
// Bulan
// =============================================================================

/** Label paparan, Januari → Disember. */
export const MONTH_LABELS = [
  'JAN', 'FEB', 'MAC', 'APR', 'MEI', 'JUN',
  'JUL', 'OGO', 'SEP', 'OKT', 'NOV', 'DIS',
] as const;

/**
 * Pengepala yang diterima untuk setiap bulan.
 *
 * Ejaan Inggeris turut diterima kerana fail sumber kadangkala dijana oleh
 * spreadsheet yang berlainan bahasa — menolak fail atas sebab 'MAR' dan bukan
 * 'MAC' hanya memaksa admin menyunting fail secara manual.
 */
const MONTH_HEADERS: readonly (readonly string[])[] = [
  ['JAN'],
  ['FEB'],
  ['MAC', 'MAR'],
  ['APR'],
  ['MEI', 'MAY'],
  ['JUN'],
  ['JUL'],
  ['OGO', 'OGOS', 'AUG', 'AUGUST'],
  ['SEP', 'SEPT'],
  ['OKT', 'OCT'],
  ['NOV'],
  ['DIS', 'DEC'],
];

/**
 * Sel kehadiran → keadaan.
 *
 * Sel kosong dan nilai yang bukan nombor (termasuk 'NaN' yang ditulis oleh
 * sesetengah eksport) menjadi `null`: "belum ada rekod" ialah jawapan yang
 * betul untuk bulan yang belum berlaku, bukan "tidak hadir".
 */
export function toAttended(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;

  const raw = String(value).trim();
  if (!raw) return null;

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return null;

  return parsed >= 1;
}

// =============================================================================
// Padanan nama
// =============================================================================

/** Kunci carian dalam satu generasi. */
function generationKey(generasi: string, name: string): string {
  return generasi + '|' + normalizeNameForMatch(name);
}

/**
 * Indeks carian dua peringkat.
 *
 * Nama sahaja disimpan berasingan supaya baris yang generasinya tersalah tulis
 * masih boleh dipadankan — tetapi hanya apabila nama itu unik merentasi seluruh
 * senarai ahli, kerana meneka antara dua orang yang sama nama lebih buruk
 * daripada melaporkannya sebagai tidak dipadankan.
 */
function buildIndex(members: MemberLookupRow[]) {
  const byGeneration = new Map<string, MemberLookupRow[]>();
  const byName = new Map<string, MemberLookupRow[]>();

  members.forEach((member) => {
    const name = normalizeNameForMatch(member.full_name);
    if (!name) return;

    if (member.generasi) {
      const generation = generationKey(member.generasi, member.full_name);
      byGeneration.set(generation, [...(byGeneration.get(generation) ?? []), member]);
    }
    byName.set(name, [...(byName.get(name) ?? []), member]);
  });

  return { byGeneration, byName };
}

// =============================================================================
// Kemasukan awam
// =============================================================================

const REQUIRED_COLUMNS = ['NAMA', 'GENERASI'] as const;

/** Cari pengepala bulan yang benar-benar wujud dalam fail. */
function resolveMonthColumns(headers: string[]): (string | null)[] {
  const upper = new Map(headers.map((header) => [header.trim().toUpperCase(), header]));

  return MONTH_HEADERS.map((aliases) => {
    for (const alias of aliases) {
      const found = upper.get(alias);
      if (found !== undefined) return found;
    }
    return null;
  });
}

export function parseUsrahRows(rows: RawRow[], members: MemberLookupRow[]): UsrahParseResult {
  const { byGeneration, byName } = buildIndex(members);
  const monthColumns = resolveMonthColumns(Object.keys(rows[0] as RawRow));

  const matched: UsrahMatch[] = [];
  const unmatched: UsrahUnmatched[] = [];

  /** Nama fail yang sudah diambil, supaya baris berganda tidak saling menimpa senyap. */
  const claimed = new Map<string, number>();

  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const fileName = String(raw.NAMA ?? '').trim();
    const generasi = toGenerationCode(raw.GENERASI);

    if (!fileName) {
      unmatched.push({ row: rowNumber, name: '(tanpa nama)', generasi, message: 'Baris tiada nama.' });
      return;
    }

    const normalised = normalizeNameForMatch(fileName);
    let candidates = generasi ? (byGeneration.get(generationKey(generasi, fileName)) ?? []) : [];
    let looseMatch = false;

    // Generasi tidak menemui apa-apa: cuba nama sahaja, tetapi hanya bila unik.
    if (candidates.length === 0) {
      const byNameOnly = byName.get(normalised) ?? [];
      if (byNameOnly.length === 1) {
        candidates = byNameOnly;
        looseMatch = true;
      } else if (byNameOnly.length > 1) {
        unmatched.push({
          row: rowNumber,
          name: fileName,
          generasi,
          message: byNameOnly.length + ' ahli berkongsi nama ini — generasi dalam fail tidak sepadan dengan mana-mana.',
        });
        return;
      }
    }

    if (candidates.length === 0) {
      unmatched.push({
        row: rowNumber,
        name: fileName,
        generasi,
        message: 'Tiada ahli sepadan dalam Senarai Ahli.',
      });
      return;
    }

    if (candidates.length > 1) {
      unmatched.push({
        row: rowNumber,
        name: fileName,
        generasi,
        message: candidates.length + ' ahli berkongsi nama dan generasi yang sama — tidak dapat ditentukan.',
      });
      return;
    }

    const member = candidates[0] as MemberLookupRow;

    const earlier = claimed.get(member.id);
    if (earlier !== undefined) {
      unmatched.push({
        row: rowNumber,
        name: fileName,
        generasi,
        message: 'Ahli yang sama sudah direkod pada baris ' + earlier + ' — baris ini dilangkau.',
      });
      return;
    }
    claimed.set(member.id, rowNumber);

    matched.push({
      memberId: member.id,
      fullName: member.full_name,
      generasi: member.generasi,
      fileName,
      months: monthColumns.map((column) => (column === null ? null : toAttended(raw[column]))),
      looseMatch,
    });
  });

  return { matched, unmatched, totalRows: rows.length };
}

/**
 * Baca fail .xlsx daripada base64 dan padankan barisnya kepada ahli.
 *
 * base64 dipilih atas sebab yang sama seperti `ahli-import`: ia satu-satunya
 * bentuk yang `expo-document-picker` boleh berikan secara seragam di web DAN
 * di peranti.
 */
export function parseUsrahWorkbook(base64: string, members: MemberLookupRow[]): UsrahParseResult {
  let rows: RawRow[];

  try {
    const workbook = XLSX.read(base64, { type: 'base64' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new ImportError('Fail Excel ini tiada helaian data.');

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new ImportError('Helaian pertama fail Excel ini kosong.');

    rows = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null, raw: true });
  } catch (caught) {
    if (caught instanceof ImportError) throw caught;
    throw new ImportError('Fail ini tidak dapat dibaca sebagai .xlsx. Pastikan ia fail Excel yang sah.');
  }

  if (!rows.length) throw new ImportError('Fail Excel ini tiada baris data.');

  const headers = Object.keys(rows[0] as RawRow).map((header) => header.trim().toUpperCase());
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) {
    throw new ImportError('Kolum wajib tiada dalam fail: ' + missing.join(', ') + '.');
  }

  if (resolveMonthColumns(Object.keys(rows[0] as RawRow)).every((column) => column === null)) {
    throw new ImportError('Fail ini tiada satu pun kolum bulan (JAN hingga DIS).');
  }

  return parseUsrahRows(rows, members);
}

// =============================================================================
// Ringkasan
// =============================================================================

export type UsrahSummary = {
  members: number;
  /** Jumlah sel bulan yang membawa jawapan (hadir atau tidak hadir). */
  recorded: number;
  attended: number;
};

export function summariseUsrah(matched: UsrahMatch[]): UsrahSummary {
  let recorded = 0;
  let attended = 0;

  matched.forEach((row) => {
    row.months.forEach((month) => {
      if (month === null) return;
      recorded += 1;
      if (month) attended += 1;
    });
  });

  return { members: matched.length, recorded, attended };
}

/** Bilangan bulan yang ada rekod bagi satu ahli. */
export function countRecorded(months: (boolean | null)[]): number {
  return months.filter((month) => month !== null).length;
}

/** Bilangan bulan hadir bagi satu ahli. */
export function countAttended(months: (boolean | null)[]): number {
  return months.filter((month) => month === true).length;
}
