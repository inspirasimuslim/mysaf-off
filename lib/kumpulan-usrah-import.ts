import * as XLSX from 'xlsx';

import { ImportError, toGenerationCode, type RawRow } from './ahli-import';
import { normalizeNameForMatch } from './name-matching';

import { KAWASAN_USRAH_OPTIONS } from '@/types/database';

/**
 * Membaca fail Excel senarai Kumpulan Usrah (kawasan, kumpulan, ahli, naqib)
 * dan memadankan setiap baris kepada rekod `members` sedia ada.
 *
 * Sama falsafah `usrah-import.ts`: bebas daripada React Native, padanan nama
 * dibuat di sini (bukan di DB) supaya admin dapat MELIHAT baris yang tidak
 * dipadankan sebelum apa-apa ditulis. Baris tidak dipadankan tidak
 * menghentikan import — baki baris yang baik tetap diproses.
 */

// =============================================================================
// Bentuk data
// =============================================================================

export type MemberLookupRow = {
  id: string;
  full_name: string;
  generasi: string | null;
};

export type KumpulanUsrahMatch = {
  memberId: string;
  /** Nama seperti dalam `members`, bukan seperti dalam fail. */
  fullName: string;
  generasi: string | null;
  /** Nama seperti ditulis dalam fail, bila ia berbeza daripada rekod. */
  fileName: string;
  kawasan: string;
  namaKumpulan: string;
  isNaqib: boolean;
  /** `true` bila padanan ditemui tanpa generasi yang sepadan. */
  looseMatch: boolean;
};

export type KumpulanUsrahUnmatched = {
  /** Nombor baris seperti dilihat dalam Excel (baris 1 = pengepala). */
  row: number;
  name: string;
  generasi: string | null;
  message: string;
};

export type KumpulanUsrahParseResult = {
  matched: KumpulanUsrahMatch[];
  unmatched: KumpulanUsrahUnmatched[];
  totalRows: number;
};

// =============================================================================
// Padanan nama — sama corak usrah-import.ts
// =============================================================================

function generationKey(generasi: string, name: string): string {
  return generasi + '|' + normalizeNameForMatch(name);
}

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

/** Lajur penuh fail (termasuk NAQIB, pilihan) — dikongsi dengan template muat turun (`lib/excel-templates.ts`). */
export const KUMPULAN_USRAH_COLUMNS = ['KAWASAN', 'KUMPULAN', 'NAMA', 'GENERASI', 'NAQIB'] as const;
const REQUIRED_COLUMNS = ['KAWASAN', 'KUMPULAN', 'NAMA', 'GENERASI'] as const;
const VALID_KAWASAN = new Set(KAWASAN_USRAH_OPTIONS.map((option) => option.value));

/** Lajur NAQIB pilihan — 'YA'/'Y'/'TRUE'/'1' dianggap ya, selainnya (termasuk kosong) tidak. */
function toNaqibFlag(value: unknown): boolean {
  const raw = String(value ?? '').trim().toUpperCase();
  return raw === 'YA' || raw === 'Y' || raw === 'TRUE' || raw === '1';
}

export function parseKumpulanUsrahRows(rows: RawRow[], members: MemberLookupRow[]): KumpulanUsrahParseResult {
  const { byGeneration, byName } = buildIndex(members);

  const matched: KumpulanUsrahMatch[] = [];
  const unmatched: KumpulanUsrahUnmatched[] = [];

  /** Satu ahli hanya boleh dalam SATU kumpulan — baris berganda bagi ahli yang sama dilangkau, bukan saling menimpa senyap. */
  const claimed = new Map<string, number>();

  rows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const fileName = String(raw.NAMA ?? '').trim();
    const generasi = toGenerationCode(raw.GENERASI);
    const kawasanRaw = String(raw.KAWASAN ?? '').trim().toUpperCase();
    const namaKumpulan = String(raw.KUMPULAN ?? '').trim();
    const isNaqib = toNaqibFlag(raw.NAQIB);

    if (!fileName) {
      unmatched.push({ row: rowNumber, name: '(tanpa nama)', generasi, message: 'Baris tiada nama.' });
      return;
    }
    if (!VALID_KAWASAN.has(kawasanRaw)) {
      unmatched.push({ row: rowNumber, name: fileName, generasi, message: 'Kod kawasan "' + kawasanRaw + '" tidak sah.' });
      return;
    }
    if (!namaKumpulan) {
      unmatched.push({ row: rowNumber, name: fileName, generasi, message: 'Baris tiada nama kumpulan.' });
      return;
    }

    const normalised = normalizeNameForMatch(fileName);
    let candidates = generasi ? (byGeneration.get(generationKey(generasi, fileName)) ?? []) : [];
    let looseMatch = false;

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
      unmatched.push({ row: rowNumber, name: fileName, generasi, message: 'Tiada ahli sepadan dalam Senarai Ahli.' });
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
      kawasan: kawasanRaw,
      namaKumpulan,
      isNaqib,
      looseMatch,
    });
  });

  return { matched, unmatched, totalRows: rows.length };
}

export function parseKumpulanUsrahWorkbook(base64: string, members: MemberLookupRow[]): KumpulanUsrahParseResult {
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

  return parseKumpulanUsrahRows(rows, members);
}

// =============================================================================
// Ringkasan
// =============================================================================

export type KumpulanUsrahGroupSummary = {
  kawasan: string;
  namaKumpulan: string;
  jumlahAhli: number;
  jumlahNaqib: number;
};

/** Kumpulan unik (kawasan+nama) daripada baris yang dipadankan, untuk pratonton sebelum commit. */
export function summariseKumpulanUsrahGroups(matched: KumpulanUsrahMatch[]): KumpulanUsrahGroupSummary[] {
  const byKey = new Map<string, KumpulanUsrahGroupSummary>();

  matched.forEach((row) => {
    const key = row.kawasan + '|' + row.namaKumpulan.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.jumlahAhli += 1;
      if (row.isNaqib) existing.jumlahNaqib += 1;
    } else {
      byKey.set(key, { kawasan: row.kawasan, namaKumpulan: row.namaKumpulan, jumlahAhli: 1, jumlahNaqib: row.isNaqib ? 1 : 0 });
    }
  });

  return [...byKey.values()].sort((a, b) => a.kawasan.localeCompare(b.kawasan) || a.namaKumpulan.localeCompare(b.namaKumpulan));
}
