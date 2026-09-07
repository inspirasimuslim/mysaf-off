import * as XLSX from 'xlsx';

import { ImportError, toGenerationCode, type RawRow } from './ahli-import';
import { findNearMatch, normalizeNameForMatch } from './name-matching';
import type { MemberLookupRow } from './usrah-import';

/**
 * Membaca laporan yuran 2025 dan memadankan setiap baris kepada rekod
 * `members` yang sedia ada.
 *
 * Bentuknya mengikut `usrah-import`: bebas daripada React Native, padanan nama
 * dibuat di sini dan bukan dalam pangkalan data supaya admin dapat MELIHAT nama
 * mana yang tersasar sebelum apa-apa ditulis, dan baris yang tidak dipadankan
 * tidak menghentikan import.
 */

// =============================================================================
// Bentuk data
// =============================================================================

export type YuranMatch = {
  memberId: string;
  /** Nama seperti dalam `members`, bukan seperti dalam fail. */
  fullName: string;
  generasi: string | null;
  /** Nama seperti ditulis dalam fail, bila ia berbeza daripada rekod. */
  fileName: string;

  /** TUNGGAKAN — hutang terkumpul sehingga hujung 2025. */
  amountDue: number;
  /** Jumlah kredit yang ditulis: bayaran, lebihan, dan pelarasan laporan. */
  paid: number;
  /** Baki yang laporan itu sendiri nyatakan — sasaran yang mesti dipadankan. */
  reportedBalance: number;
  reportedCredit: number;

  /**
   * `true` bila TUNGGAKAN − BAKI_TUNGGAKAN tidak sama dengan PEMBAYARAN_2025.
   *
   * Laporan sumber mengandungi lapan baris sebegini: caj RM30 direkodkan
   * tetapi bakinya sifar, tanpa bayaran yang menerangkannya. Import mengikut
   * BAKI (angka yang bendahari telah selaraskan) dan menanda barisnya, supaya
   * pelarasan itu kelihatan dan bukan berlaku senyap.
   */
  reconciled: boolean;

  /** `true` bila padanan ditemui tanpa generasi yang sepadan. */
  looseMatch: boolean;

  /**
   * Skor keserupaan bila padanan dibuat secara HAMPIR dan bukan tepat, atau
   * `null` bila nama sepadan tepat.
   *
   * Baris begini dipapar berasingan dalam pratonton. Laporan yuran dan Senarai
   * Ahli ditaip oleh dua orang berbeza, jadi ejaan bercanggah ('YUSOFF' lawan
   * 'YUSOF') dan menolak baris kerana satu huruf bermakna hutang benar hilang —
   * tetapi wang bukan perkara untuk ditulis atas tekaan tanpa disemak.
   */
  nearMatch: number | null;
};

export type YuranUnmatched = {
  /** Nombor baris seperti dilihat dalam Excel (baris 1 = pengepala). */
  row: number;
  name: string;
  generasi: string | null;
  message: string;
};

export type YuranParseResult = {
  matched: YuranMatch[];
  unmatched: YuranUnmatched[];
  /** Jumlah baris data dalam fail, termasuk yang tidak dipadankan. */
  totalRows: number;
};

const REQUIRED_COLUMNS = ['NAMA', 'GENERASI', 'TUNGGAKAN'] as const;

/** Sel wang → nombor. Sel kosong dan teks yang tidak terbaca menjadi 0. */
function toAmount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const parsed = Number.parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

// =============================================================================
// Padanan nama — sama bentuk seperti `usrah-import`
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
      generationCandidates.set(member.generasi, [...(generationCandidates.get(member.generasi) ?? []), member]);
    }
    byName.set(name, [...(byName.get(name) ?? []), member]);
  });

  return { byGeneration, byName, generationCandidates };
}

// =============================================================================
// Kemasukan awam
// =============================================================================

export function parseYuranRows(rows: RawRow[], members: MemberLookupRow[]): YuranParseResult {
  const { byGeneration, byName, generationCandidates } = buildIndex(members);

  const matched: YuranMatch[] = [];
  const unmatched: YuranUnmatched[] = [];
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
          message: byNameOnly.length + ' ahli berkongsi nama ini — generasi dalam fail tidak sepadan dengan mana-mana.',
        });
        return;
      }
    }

    /*
      Peringkat ketiga: ejaan yang hampir, DALAM generasi yang sama sahaja.

      Generasi mengecilkan medan calon daripada 325 orang kepada belasan, jadi
      padanan hampir di sini menjawab "siapa dalam kumpulan ini yang namanya
      dieja hampir begini" dan bukan "siapa sahaja dalam organisasi". Tanpa had
      itu, ambang keserupaan yang sama akan mula memadankan orang yang berlainan.
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

    const amountDue = toAmount(raw.TUNGGAKAN);
    const payment = toAmount(raw.PEMBAYARAN_2025);
    const credit = toAmount(raw.LEBIHAN_BAYARAN);

    /*
      BAKI_TUNGGAKAN ialah angka yang bendahari telah selaraskan, jadi ia yang
      menentukan berapa kredit direkodkan — bukan PEMBAYARAN_2025 semata-mata.

      Bila fail konsisten (BAKI = TUNGGAKAN − PEMBAYARAN), kedua-dua cara
      menghasilkan nombor yang sama. Bila ia tidak konsisten — lapan baris dalam
      laporan 2025 mencaj RM30 tetapi menyatakan baki sifar — mengikut
      PEMBAYARAN akan membuatkan app berkata lapan orang berhutang sedangkan
      dokumen bendahari sendiri berkata mereka tidak.

      Kolum BAKI_TUNGGAKAN yang tiada dianggap sebagai "tiada pelarasan", jadi
      fail tanpa kolum itu berkelakuan tepat seperti pemetaan mudah.
      `paid` dibiarkan boleh negatif: laporan yang menyatakan baki LEBIH tinggi
      daripada caj ialah caj tambahan, dan menyembunyikannya dengan melantai
      pada sifar akan menjadikan import tidak sepadan dengan sumbernya.
    */
    const hasBalanceColumn = raw.BAKI_TUNGGAKAN !== null && raw.BAKI_TUNGGAKAN !== undefined;
    const reportedBalance = hasBalanceColumn ? toAmount(raw.BAKI_TUNGGAKAN) : amountDue - payment;

    const settled = amountDue - reportedBalance;
    const paid = settled + credit;

    matched.push({
      memberId: member.id,
      fullName: member.full_name,
      generasi: member.generasi,
      fileName,
      amountDue,
      paid,
      reportedBalance,
      reportedCredit: credit,
      reconciled: settled !== payment,
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
export function parseYuranWorkbook(base64: string, members: MemberLookupRow[]): YuranParseResult {
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

  return parseYuranRows(rows, members);
}

// =============================================================================
// Ringkasan pratonton
// =============================================================================

export type YuranImportSummary = {
  members: number;
  totalDue: number;
  totalPaid: number;
  /** Hutang bersih selepas import, dilantaikan pada sifar setiap ahli. */
  totalOutstanding: number;
  totalCredit: number;
  /** Baris yang bakinya tidak menepati bayaran yang tercatat. */
  reconciled: number;
  looseMatches: number;
  /** Baris yang dipadankan melalui ejaan hampir — perlu disemak mata sebelum import. */
  nearMatches: number;
};

export function summariseYuran(matched: YuranMatch[]): YuranImportSummary {
  return matched.reduce<YuranImportSummary>(
    (summary, row) => {
      const net = row.amountDue - row.paid;
      return {
        members: summary.members + 1,
        totalDue: summary.totalDue + row.amountDue,
        totalPaid: summary.totalPaid + row.paid,
        totalOutstanding: summary.totalOutstanding + Math.max(net, 0),
        totalCredit: summary.totalCredit + Math.max(-net, 0),
        reconciled: summary.reconciled + (row.reconciled ? 1 : 0),
        looseMatches: summary.looseMatches + (row.looseMatch ? 1 : 0),
        nearMatches: summary.nearMatches + (row.nearMatch !== null ? 1 : 0),
      };
    },
    { members: 0, totalDue: 0, totalPaid: 0, totalOutstanding: 0, totalCredit: 0, reconciled: 0, looseMatches: 0, nearMatches: 0 },
  );
}
