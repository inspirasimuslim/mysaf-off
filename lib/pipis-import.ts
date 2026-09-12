import * as XLSX from 'xlsx';

import { ImportError, toGenerationCode, type RawRow } from './ahli-import';
import { findNearMatch, normalizeNameForMatch } from './name-matching';
import type { MemberLookupRow } from './usrah-import';

/**
 * Membaca fail sumbangan PIPIS ASET dan memadankan setiap baris kepada rekod
 * `members` yang sedia ada.
 *
 * Bentuknya mengikut `yuran-import`: bebas daripada React Native, padanan nama
 * dibuat di sini dan bukan dalam pangkalan data supaya admin dapat MELIHAT nama
 * mana yang tersasar sebelum apa-apa ditulis, dan baris yang tidak dipadankan
 * tidak menghentikan import.
 */

// =============================================================================
// Bentuk data
// =============================================================================

export type PipisMatch = {
  memberId: string;
  /** Nama seperti dalam `members`, bukan seperti dalam fail. */
  fullName: string;
  generasi: string | null;
  /** Nama seperti ditulis dalam fail, bila ia berbeza daripada rekod. */
  fileName: string;

  /** JUMLAH_SUMBANGAN seperti dalam fail. */
  amount: number;

  /** `true` bila padanan ditemui tanpa generasi yang sepadan. */
  looseMatch: boolean;

  /**
   * Skor keserupaan bila padanan dibuat secara HAMPIR dan bukan tepat, atau
   * `null` bila nama sepadan tepat. Baris begini dipapar berasingan dalam
   * pratonton — wang bukan perkara untuk ditulis atas tekaan tanpa disemak.
   */
  nearMatch: number | null;
};

export type PipisUnmatched = {
  /** Nombor baris seperti dilihat dalam Excel (baris 1 = pengepala). */
  row: number;
  name: string;
  generasi: string | null;
  message: string;
};

export type PipisParseResult = {
  matched: PipisMatch[];
  unmatched: PipisUnmatched[];
  /** Jumlah baris data dalam fail, termasuk yang tidak dipadankan. */
  totalRows: number;
};

const REQUIRED_COLUMNS = ['NAMA', 'GENERASI', 'JUMLAH_SUMBANGAN'] as const;

/** Sel wang → nombor. Sel kosong dan teks yang tidak terbaca menjadi 0. */
function toAmount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const parsed = Number.parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

// =============================================================================
// Padanan nama — sama bentuk seperti `yuran-import`
// =============================================================================

function generationKey(generasi: string, name: string): string {
  return generasi + '|' + normalizeNameForMatch(name);
}

function buildIndex(members: MemberLookupRow[]) {
  const byGeneration = new Map<string, MemberLookupRow[]>();
  const byName = new Map<string, MemberLookupRow[]>();
  /** Semua ahli satu generasi — medan calon bagi padanan hampir. */
  const generationCandidates = new Map<string, MemberLookupRow[]>();

  members.forEach((member) => {
    const name = normalizeNameForMatch(member.full_name);
    if (!name) return;

    if (member.generasi) {
      const generation = generationKey(member.generasi, member.full_name);
      byGeneration.set(generation, [...(byGeneration.get(generation) ?? []), member]);
      generationCandidates.set(member.generasi, [
        ...(generationCandidates.get(member.generasi) ?? []),
        member,
      ]);
    }
    byName.set(name, [...(byName.get(name) ?? []), member]);
  });

  return { byGeneration, byName, generationCandidates };
}

// =============================================================================
// Kemasukan awam
// =============================================================================

export function parsePipisRows(rows: RawRow[], members: MemberLookupRow[]): PipisParseResult {
  const { byGeneration, byName, generationCandidates } = buildIndex(members);

  const matched: PipisMatch[] = [];
  const unmatched: PipisUnmatched[] = [];
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
    let nearMatch: number | null = null;

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
          message:
            byNameOnly.length + ' ahli berkongsi nama ini — generasi dalam fail tidak sepadan dengan mana-mana.',
        });
        return;
      }
    }

    /*
      Peringkat ketiga: ejaan yang hampir, DALAM generasi yang sama sahaja.
      Had itu yang menjadikan padanan hampir menjawab "siapa dalam kumpulan ini
      yang namanya dieja hampir begini" dan bukan "siapa sahaja dalam
      organisasi" — sebab dan ambang yang sama seperti import yuran.
    */
    if (candidates.length === 0 && generasi) {
      const sameGeneration = generationCandidates.get(generasi) ?? [];
      const near = findNearMatch(normalised, sameGeneration, (member) => member.full_name);

      if (near) {
        candidates = [near.candidate];
        nearMatch = near.similarity;
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

    /*
      Ahli yang sama muncul dua kali dalam fail ialah nama yang sama ditulis
      dengan dua ejaan — bukan dua sumbangan. Baris kedua dilangkau dan
      dilaporkan: import yang MENGGANTIKAN angka ahli hanya akan menyimpan yang
      terakhir, jadi menambahnya secara senyap akan membuang salah satu tanpa
      sesiapa tahu.
    */
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
      amount: toAmount(raw.JUMLAH_SUMBANGAN),
      looseMatch,
      nearMatch,
    });
  });

  return { matched, unmatched, totalRows: rows.length };
}

/**
 * Baca fail .xlsx daripada base64 dan padankan barisnya kepada ahli.
 *
 * base64 atas sebab yang sama seperti import lain: ia satu-satunya bentuk yang
 * `expo-document-picker` boleh berikan secara seragam di web DAN di peranti.
 */
export function parsePipisWorkbook(base64: string, members: MemberLookupRow[]): PipisParseResult {
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

  return parsePipisRows(rows, members);
}

// =============================================================================
// Ringkasan pratonton
// =============================================================================

export type PipisImportSummary = {
  members: number;
  /** Jumlah keseluruhan yang akan ditulis. */
  total: number;
  /**
   * Baris berjumlah sifar. Ia dipadankan tetapi TIDAK menghasilkan rekod —
   * RPC import menolak sifar, jadi angka ini menerangkan mengapa bilangan
   * rekod di pangkalan data lebih kecil daripada bilangan baris dipadankan.
   */
  zeroRows: number;
  /** Ahli yang sudah mencapai atau melepasi sasaran RM5,000. */
  reachedTarget: number;
  looseMatches: number;
  /** Baris yang dipadankan melalui ejaan hampir — perlu disemak sebelum import. */
  nearMatches: number;
};

const TARGET = 5000;

export function summarisePipis(matched: PipisMatch[]): PipisImportSummary {
  return matched.reduce<PipisImportSummary>(
    (summary, row) => ({
      members: summary.members + 1,
      total: summary.total + row.amount,
      zeroRows: summary.zeroRows + (row.amount === 0 ? 1 : 0),
      reachedTarget: summary.reachedTarget + (row.amount >= TARGET ? 1 : 0),
      looseMatches: summary.looseMatches + (row.looseMatch ? 1 : 0),
      nearMatches: summary.nearMatches + (row.nearMatch !== null ? 1 : 0),
    }),
    { members: 0, total: 0, zeroRows: 0, reachedTarget: 0, looseMatches: 0, nearMatches: 0 },
  );
}
