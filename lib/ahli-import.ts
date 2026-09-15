import * as XLSX from 'xlsx';

import {
  generationOrder,
  type Member,
  type PendapatanRange,
  type StatusPekerjaan,
  type StatusPengajian,
  type StatusPerkahwinan,
} from '@/types/database';

/**
 * Membaca dan menterjemah fail Excel keahlian kepada baris `members`.
 *
 * Modul ini SENGAJA bebas daripada React Native — tiada import komponen, tiada
 * akses fail. Ia menerima base64 (dari `expo-document-picker`) atau tatasusunan
 * baris mentah, dan memulangkan data bersih. Kerana itu logik yang sama boleh
 * dijalankan di web, di peranti, dan dalam skrip Node untuk pengesahan.
 *
 * Semua kegagalan dikumpul dalam `issues`, tidak dibuang senyap — pemanggil
 * bertanggungjawab memaparkannya sebelum import disahkan.
 */

// =============================================================================
// Bentuk data
// =============================================================================

export type RawRow = Record<string, unknown>;

/**
 * Baris sedia untuk dimasukkan ke `members` (tanpa kolum yang dijana Supabase).
 * `avatar_url` turut ditinggalkan — fail Excel tiada gambar, jadi import tidak
 * sepatutnya menulis kolum itu langsung dan menimpa apa yang mungkin ada.
 */
export type ParsedMember = Omit<Member, 'id' | 'user_id' | 'avatar_url' | 'self_updated_at'>;

export type ImportIssueLevel = 'ralat' | 'amaran';

export type ImportIssue = {
  level: ImportIssueLevel;
  /** Nombor baris seperti dilihat dalam Excel (baris 1 = pengepala). */
  row: number;
  name: string;
  message: string;
};

export type ParseResult = {
  members: ParsedMember[];
  issues: ImportIssue[];
  /** Jumlah baris dalam fail, termasuk yang ditolak. */
  totalRows: number;
  /**
   * `true` bila fail membawa lajur NomborAhli (fail eksport Senarai Ahli).
   * Nombor itu dikekalkan sebagai kunci kemas kini; tanpanya nombor diberi
   * semula mengikut susunan dan boleh menimpa rekod lain yang bernombor sama.
   */
  hasMemberNumbers: boolean;
};

// =============================================================================
// Pembantu penukaran nilai
// =============================================================================

/** Rentetan yang dikemas; sel kosong / '-' dianggap tiada nilai. */
function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '-') return null;
  return trimmed;
}

function int(value: unknown): number | null {
  const raw = text(value);
  if (raw === null) return null;
  // Buang segala yang bukan digit — sumber kadangkala menulis "3 orang".
  const digits = raw.replace(/[^\d-]/g, '');
  if (!digits) return null;
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const raw = text(value);
  if (raw === null) return false;
  return /^(true|ya|yes|1)$/i.test(raw);
}

/** 1, '1', '0001' → '0001'. Excel membuang sifar di hadapan sebaik sel disunting. */
function memberNumber(value: unknown): string | null {
  const raw = text(value);
  if (raw === null) return null;
  return /^\d+$/.test(raw) ? raw.padStart(4, '0') : raw;
}

/** Buang tanda baca dan ruang berganda supaya padanan tidak terikat pada ejaan. */
function normalise(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// =============================================================================
// Penterjemah nilai
// =============================================================================

/**
 * 'Ikhwan 26' → 'i26'. Nombor 2-digit diekstrak dari mana-mana bahagian teks,
 * jadi 'IKHWAN-7' dan 'Generasi 07' turut dikenali.
 */
export function toGenerationCode(value: unknown): string | null {
  const raw = text(value);
  if (raw === null) return null;

  const match = /(\d{1,2})/.exec(raw);
  if (!match) return null;

  const number = Number.parseInt(match[1] as string, 10);
  if (!Number.isFinite(number) || number < 1) return null;

  return 'i' + String(number).padStart(2, '0');
}

export function toStatusPerkahwinan(value: unknown): StatusPerkahwinan | null {
  const raw = text(value);
  if (raw === null) return null;

  const key = normalise(raw);
  if (key === 'BUJANG') return 'bujang';
  if (key.includes('BUKAN MBM')) return 'berkahwin_bukan_mbm';
  if (key.includes('MBM')) return 'berkahwin_mbm';
  // 'BERKAHWIN' tanpa penjelasan — anggap bukan MBM (pilihan paling selamat).
  if (key.includes('BERKAHWIN')) return 'berkahwin_bukan_mbm';
  return null;
}

export function toStatusPekerjaan(value: unknown): StatusPekerjaan | null {
  const raw = text(value);
  if (raw === null) return null;

  const key = normalise(raw);
  const has = (needle: string) => key.includes(needle);

  // Urutan penting: gabungan diperiksa dahulu supaya 'BEKERJA & BELAJAR'
  // tidak tersangkut pada padanan 'BEKERJA' yang lebih longgar.
  if (has('BEKERJA') && has('BELAJAR')) return 'bekerja_dan_belajar';
  if (has('BERNIAGA') || has('USAHAWAN')) return 'berniaga_usahawan';
  if (has('SURI RUMAH') || has('SURIRUMAH')) return 'suri_rumah';
  if (has('PESARA')) return 'pesara';
  if (has('BELAJAR') || has('PELAJAR')) return 'belajar_sepenuh_masa';
  // 'TIDAK BEKERJA' mengandungi 'BEKERJA', jadi ia mesti diperiksa dahulu.
  if (has('MENGANGGUR') || has('TIDAK BEKERJA')) return 'tidak_bekerja';
  if (has('BEKERJA')) return 'bekerja';
  return null;
}

const PENDAPATAN_RANGES: readonly string[] = ['<1000', '1000-2999', '3000-4999', '5000-9999', '10000+'];

/** Nombor pendapatan mentah → julat. Nilai <= 0 dianggap tiada maklumat. */
export function toPendapatanRange(value: unknown): PendapatanRange | null {
  /*
    Nilai yang sudah berbentuk julat diterima apa adanya. Fail eksport menulis
    julat seperti tersimpan ('3000-4999'); tanpa semakan ini `int()` membuang
    sengkang dan membacanya sebagai 30004999, jadi setiap ahli yang dieksport
    dan dimuat naik semula akan melompat ke '10000+'.
  */
  const raw = text(value);
  if (raw !== null && PENDAPATAN_RANGES.includes(raw)) return raw as PendapatanRange;

  const amount = int(value);
  if (amount === null || amount <= 0) return null;

  if (amount < 1000) return '<1000';
  if (amount < 3000) return '1000-2999';
  if (amount < 5000) return '3000-4999';
  if (amount < 10000) return '5000-9999';
  return '10000+';
}

/**
 * Fail sumber tiada kolum status pengajian — ia disimpulkan daripada status
 * bekerja/belajar, dengan sandaran kepada kehadiran maklumat institusi supaya
 * data pengajian yang sedia ada tidak tersembunyi di sebalik borang bersyarat.
 */
function inferStatusPengajian(
  statusPekerjaan: StatusPekerjaan | null,
  hasStudyDetails: boolean,
): StatusPengajian | null {
  if (statusPekerjaan === 'belajar_sepenuh_masa' || statusPekerjaan === 'bekerja_dan_belajar') {
    return 'sedang_belajar';
  }
  if (hasStudyDetails) return 'sudah_tamat';
  return null;
}

// =============================================================================
// Pemetaan kolum
// =============================================================================

/**
 * Kolum sumber yang SENGAJA diabaikan.
 * `Pekerjaan` dan `BilTanggungan` digantikan oleh medan yang lebih khusus;
 * `NoTel2` tiada tempat dalam skema; `Role` ialah lajur peranan sistem lama.
 */
export const IGNORED_COLUMNS = ['Pekerjaan', 'BilTanggungan', 'NoTel2', 'Role'] as const;

/** Pengepala yang mesti ada sebelum fail diterima. */
const REQUIRED_COLUMNS = ['UserName', 'Generasi'] as const;

/**
 * Nama dalam baris contoh template (`lib/excel-templates.ts`). Baris itu ditolak
 * di sini supaya template yang dimuat naik tanpa dipadam barisnya tidak mencipta
 * seorang ahli bernama "CONTOH NAMA AHLI".
 */
export const TEMPLATE_EXAMPLE_NAME = 'CONTOH NAMA AHLI';

function mapRow(raw: RawRow): ParsedMember {
  const statusPekerjaan = toStatusPekerjaan(raw.StatusBelajarBekerja);

  const namaInstitusi = text(raw.NamaInstitusi);
  const jurusanPengajian = text(raw.JurusanPengajian);
  const tahunPengajian = text(raw.TahunPengajian);
  const alamatInstitusi = text(raw.AlamatInstitusi);
  const sumberPembiayaan = text(raw.PembiayaanPengajian);

  const hasStudyDetails = Boolean(
    namaInstitusi || jurusanPengajian || tahunPengajian || alamatInstitusi || sumberPembiayaan,
  );

  return {
    // --- Identiti --- (tanpa lajur NomborAhli, nombor diberikan oleh assignMemberNumbers)
    nombor_ahli: memberNumber(raw.NomborAhli),
    generasi: toGenerationCode(raw.Generasi),
    full_name: text(raw.UserName) ?? '',
    jantina: text(raw.Jantina),
    nric: text(raw.Nric),
    email: text(raw.Email),
    no_tel: text(raw.NoTel),
    alamat: text(raw.Alamat),
    alamat_semasa: text(raw.AlamatSemasa),
    kawasan_usrah: text(raw.KawasanUsrah),
    disekat: bool(raw.Disekat),

    // --- Jawatan ---
    jawatan_ikhwan_1: text(raw.JawatanIkhwan1),
    jawatan_ikhwan_2: text(raw.JawatanIkhwan2),
    jawatan_ikhwan_3: text(raw.JawatanIkhwan3),
    jawatan_pas_1: text(raw.JawatanPas1),
    jawatan_pas_2: text(raw.JawatanPas2),
    jawatan_pas_3: text(raw.JawatanPas3),
    no_keahlian_pas: text(raw.NoKeahlianPas),

    // --- Pendidikan ---
    tahap_pendidikan: text(raw.TahapPendidikan),
    status_pengajian: inferStatusPengajian(statusPekerjaan, hasStudyDetails),
    sekolah: text(raw.Sekolah),
    nama_institusi: namaInstitusi,
    alamat_institusi: alamatInstitusi,
    tahun_pengajian: tahunPengajian,
    jurusan_pengajian: jurusanPengajian,
    sumber_pembiayaan: sumberPembiayaan,
    pembiayaan_lain: text(raw.NyatakanPembiayaan),

    // --- Pekerjaan ---
    status_pekerjaan: statusPekerjaan,
    sektor_pekerjaan: text(raw.SektorPekerjaan),
    jawatan_pekerjaan: text(raw.JawatanPekerjaan),
    nama_majikan: text(raw.NamaMajikanSyarikat),
    alamat_tempat_kerja: text(raw.AlamatTempatBekerja),
    anggaran_pendapatan_range: toPendapatanRange(raw.AnggaranPendapatan),
    jenis_perniagaan: text(raw.JenisPerniagaan),

    // --- Keluarga ---
    status_perkahwinan: toStatusPerkahwinan(raw.StatusPerkahwinan),
    nama_pasangan: text(raw.NyatakanJikaMBM),
    tahun_berkahwin: text(raw.TahunBerkahwin),
    bil_anak: int(raw.BilAnak),
    anggaran_pendapatan_isi_rumah_range: toPendapatanRange(raw.AnggaranPendapatanIsiRumah),
    bil_tanggungan_selain_keluarga: int(raw.BilTanggunganSelainKeluarga),
    pekerjaan_ibu: text(raw.PekerjaanIbu),
    pekerjaan_bapa: text(raw.PekerjaanBapa),
    bil_tanggungan_ibu_bapa: int(raw.BilTanggunganIbuBapa),
  };
}

// =============================================================================
// Penomboran ahli
// =============================================================================

/**
 * Susun i01 → i27, dan dalam setiap generasi ikut nama A–Z, kemudian berikan
 * nombor ahli berjalan '0001', '0002', ... merentasi SEMUA baris — kaunter
 * tidak berulang semula pada setiap generasi.
 *
 * Perbandingan nama menggunakan `localeCompare` supaya nama beraksen disusun
 * mengikut jangkaan pembaca, bukan mengikut nilai kod aksara.
 */
export function assignMemberNumbers(members: ParsedMember[]): ParsedMember[] {
  const sorted = [...members].sort((a, b) => {
    const byGeneration = generationOrder(a.generasi) - generationOrder(b.generasi);
    if (byGeneration !== 0) return byGeneration;
    return a.full_name.localeCompare(b.full_name, 'ms', { sensitivity: 'base' });
  });

  return sorted.map((member, index) => ({
    ...member,
    nombor_ahli: String(index + 1).padStart(4, '0'),
  }));
}

/**
 * Kekalkan NomborAhli dari fail — laluan fail eksport yang disunting dan dimuat
 * naik semula.
 *
 * Nombor ialah kunci kemas kini, jadi memberinya semula mengikut susunan
 * (seperti `assignMemberNumbers`) akan menulis data seseorang ke atas rekod
 * orang lain sebaik sahaja satu ahli ditambah atau dibuang dari fail. Baris
 * tanpa nombor diberi nombor selepas yang tertinggi dalam fail, dan dilaporkan
 * supaya admin boleh menyemaknya.
 */
export function keepMemberNumbers(members: ParsedMember[], issues: ImportIssue[]): ParsedMember[] {
  let next = members.reduce((highest, member) => {
    const value = member.nombor_ahli && /^\d+$/.test(member.nombor_ahli) ? Number.parseInt(member.nombor_ahli, 10) : 0;
    return Math.max(highest, value);
  }, 0);

  const numbered = members.filter((member) => member.nombor_ahli !== null);
  const fresh = assignMemberNumbers(members.filter((member) => member.nombor_ahli === null)).map((member) => {
    next += 1;
    const nombor = String(next).padStart(4, '0');
    issues.push({
      level: 'amaran',
      row: 0,
      name: member.full_name,
      message: 'Tiada NomborAhli — diberi nombor baharu ' + nombor + '. Pastikan nombor itu belum dimiliki ahli lain.',
    });
    return { ...member, nombor_ahli: nombor };
  });

  return [...numbered, ...fresh];
}

// =============================================================================
// Kemasukan awam
// =============================================================================

/**
 * Terjemah baris mentah kepada baris `members` bernombor.
 *
 * Baris tanpa nama atau tanpa generasi sah DITOLAK (bukan diperbaiki secara
 * senyap) kerana kedua-duanya menentukan nombor ahli yang diberikan.
 */
export function parseRows(rows: RawRow[]): ParseResult {
  const issues: ImportIssue[] = [];
  const accepted: ParsedMember[] = [];
  /** NomborAhli yang sudah diambil → baris pertama yang memegangnya. */
  const numbers = new Map<string, number>();

  rows.forEach((raw, index) => {
    // Baris 1 ialah pengepala, jadi baris data pertama ialah baris 2 dalam Excel.
    const rowNumber = index + 2;
    const name = text(raw.UserName) ?? '(tanpa nama)';

    const member = mapRow(raw);

    if (!member.full_name) {
      issues.push({ level: 'ralat', row: rowNumber, name, message: 'Tiada UserName — baris dilangkau.' });
      return;
    }

    if (member.full_name.toUpperCase() === TEMPLATE_EXAMPLE_NAME) {
      issues.push({ level: 'ralat', row: rowNumber, name, message: 'Baris contoh daripada template — dilangkau.' });
      return;
    }

    if (!member.generasi) {
      issues.push({
        level: 'ralat',
        row: rowNumber,
        name,
        message: 'Generasi "' + String(raw.Generasi ?? '') + '" tidak dikenali — baris dilangkau.',
      });
      return;
    }

    // --- Amaran: data diterima, tetapi patut disemak oleh admin ---
    if (raw.StatusBelajarBekerja && !member.status_pekerjaan) {
      issues.push({
        level: 'amaran',
        row: rowNumber,
        name,
        message: 'Status pekerjaan "' + String(raw.StatusBelajarBekerja) + '" tidak dapat dipetakan.',
      });
    }

    if (raw.StatusPerkahwinan && !member.status_perkahwinan) {
      issues.push({
        level: 'amaran',
        row: rowNumber,
        name,
        message: 'Status perkahwinan "' + String(raw.StatusPerkahwinan) + '" tidak dapat dipetakan.',
      });
    }

    // Nilai pendapatan yang terlalu kecil hampir pasti tersalah isi di sumber
    // (contoh: bilangan orang ditaip dalam ruangan pendapatan).
    const income = int(raw.AnggaranPendapatan);
    const householdIncome = int(raw.AnggaranPendapatanIsiRumah);
    if (income !== null && income > 0 && income < 100) {
      issues.push({
        level: 'amaran',
        row: rowNumber,
        name,
        message: 'AnggaranPendapatan "' + income + '" nampak tersalah isi — dipetakan ke "<1000".',
      });
    }
    if (householdIncome !== null && householdIncome > 0 && householdIncome < 100) {
      issues.push({
        level: 'amaran',
        row: rowNumber,
        name,
        message: 'AnggaranPendapatanIsiRumah "' + householdIncome + '" nampak tersalah isi — dipetakan ke "<1000".',
      });
    }

    // Dua baris dengan nombor yang sama akan saling menimpa semasa upsert.
    if (member.nombor_ahli) {
      const earlier = numbers.get(member.nombor_ahli);
      if (earlier !== undefined) {
        issues.push({
          level: 'ralat',
          row: rowNumber,
          name,
          message: 'NomborAhli ' + member.nombor_ahli + ' sudah digunakan pada baris ' + earlier + ' — baris dilangkau.',
        });
        return;
      }
      numbers.set(member.nombor_ahli, rowNumber);
    }

    accepted.push(member);
  });

  // --- Amaran peringkat fail: emel berganda menghalang pautan akaun ---
  const seen = new Map<string, string>();
  accepted.forEach((member) => {
    const email = member.email?.toLowerCase();
    if (!email) return;
    const owner = seen.get(email);
    if (owner) {
      issues.push({
        level: 'amaran',
        row: 0,
        name: member.full_name,
        message: 'Emel ' + email + ' berkongsi dengan ' + owner + ' — hanya satu boleh dikaitkan ke akaun.',
      });
    } else {
      seen.set(email, member.full_name);
    }
  });

  const hasMemberNumbers = accepted.some((member) => member.nombor_ahli !== null);
  const members = hasMemberNumbers ? keepMemberNumbers(accepted, issues) : assignMemberNumbers(accepted);

  return { members, issues, totalRows: rows.length, hasMemberNumbers };
}

/** Ralat yang membawa mesej sedia-papar dalam BM. */
export class ImportError extends Error {}

/**
 * Baca fail .xlsx daripada base64 dan terjemah kandungannya.
 *
 * base64 dipilih sebagai format masukan kerana ia satu-satunya bentuk yang
 * `expo-document-picker` boleh berikan secara seragam di web DAN di peranti.
 */
export function parseWorkbook(base64: string): ParseResult {
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

  const headers = Object.keys(rows[0] as RawRow);
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) {
    throw new ImportError('Kolum wajib tiada dalam fail: ' + missing.join(', ') + '.');
  }

  return parseRows(rows);
}

/** Ringkasan yang dipapar selepas import selesai. */
export type ImportSummary = {
  total: number;
  withEmail: number;
  withoutEmail: number;
};

export function summarise(members: ParsedMember[]): ImportSummary {
  const withEmail = members.filter((member) => Boolean(member.email)).length;
  return { total: members.length, withEmail, withoutEmail: members.length - withEmail };
}
