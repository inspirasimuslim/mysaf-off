import {
  BIDANG_KERAJAAN_OPTIONS,
  BIDANG_KHUSUS_SWASTA_OPTIONS,
  BUSINESS_MODE_OPTIONS,
  BUSINESS_SUBKATEGORI_OFFLINE_OPTIONS,
  BUSINESS_SUBKATEGORI_ONLINE_OPTIONS,
  EDUCATION_PERINGKAT_OPTIONS,
  JENIS_KERJA_SENDIRI_OPTIONS,
  JENIS_MASALAH_KESIHATAN_OPTIONS,
  KUMPULAN_BIDANG_SWASTA_OPTIONS,
  PENDAPATAN_RANGE_OPTIONS,
  SEBAB_PERKAHWINAN_OPTIONS,
  SEKTOR_PEKERJAAN_OPTIONS,
  STATUS_PEKERJAAN_OPTIONS,
  STATUS_PENGAJIAN_ENTRY_OPTIONS,
  STATUS_PERKAHWINAN_OPTIONS,
  SUMBER_PEMBIAYAAN_OPTIONS,
  generationLabel,
  optionLabel,
  type Option,
} from '@/types/database';

import type { MemberExportRow, SheetCell } from './member-sheet';

/**
 * Sheet tambahan eksport ahli — satu sheet setiap tab borang (Pendidikan,
 * Perniagaan, Pekerjaan, Keluarga, Komitmen) dan eksport Kesihatan yang
 * berasingan sepenuhnya. Bebas daripada React Native (sama seperti
 * `member-sheet.ts`).
 *
 * Nama + Generasi sentiasa dua lajur pertama. Berbeza daripada sheet
 * `user_data` (yang perlu boleh dimuat naik semula, jadi menyimpan kod mentah),
 * sheet ini bacaan sahaja — nilai ditulis sebagai label yang boleh dibaca.
 */

export type ExportSheet = { name: string; header: string[]; rows: Record<string, SheetCell>[] };

function label<T extends string>(options: Option<T>[], value: T | null | undefined): string {
  return value ? optionLabel(options, value) : '';
}

const text = (value: string | null | undefined) => value ?? '';
const yesNo = (value: boolean | null | undefined) => (value === null || value === undefined ? '' : value ? 'Ya' : 'Tidak');
const generasi = (code: string | null) => (code ? generationLabel(code) : '');

const BIDANG_KHUSUS_FLAT = Object.values(BIDANG_KHUSUS_SWASTA_OPTIONS).flat();
const SUBKATEGORI_ALL = [...BUSINESS_SUBKATEGORI_ONLINE_OPTIONS, ...BUSINESS_SUBKATEGORI_OFFLINE_OPTIONS];

// ── Pendidikan & Perniagaan (1-ke-banyak) ────────────────────────────────────

export type EducationExportRow = {
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  peringkat: string;
  jurusan: string | null;
  institusi: string | null;
  status_pengajian: string;
  sumber_pembiayaan: string | null;
};

export type BusinessExportRow = {
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  mode: string;
  sub_kategori: string[] | null;
  nama_perniagaan: string | null;
  negeri_operasi: string | null;
  anggaran_pendapatan_range: string | null;
};

const PENDIDIKAN_HEADER = ['Nama', 'Generasi', 'Peringkat', 'Jurusan/Bidang', 'Institusi', 'Status Pengajian', 'Sumber Pembiayaan'];

export function pendidikanSheet(rows: EducationExportRow[]): ExportSheet {
  return {
    name: 'Pendidikan',
    header: PENDIDIKAN_HEADER,
    rows: rows.map((row) => ({
      Nama: row.full_name,
      Generasi: generasi(row.generasi),
      Peringkat: label(EDUCATION_PERINGKAT_OPTIONS, row.peringkat as never),
      'Jurusan/Bidang': text(row.jurusan),
      Institusi: text(row.institusi),
      'Status Pengajian': label(STATUS_PENGAJIAN_ENTRY_OPTIONS, row.status_pengajian as never),
      'Sumber Pembiayaan': label(SUMBER_PEMBIAYAAN_OPTIONS, row.sumber_pembiayaan as never),
    })),
  };
}

const PERNIAGAAN_HEADER = ['Nama', 'Generasi', 'Mod', 'Sub-kategori', 'Nama Perniagaan', 'Negeri Operasi', 'Anggaran Pendapatan'];

export function perniagaanSheet(rows: BusinessExportRow[]): ExportSheet {
  return {
    name: 'Perniagaan',
    header: PERNIAGAAN_HEADER,
    rows: rows.map((row) => ({
      Nama: row.full_name,
      Generasi: generasi(row.generasi),
      Mod: label(BUSINESS_MODE_OPTIONS, row.mode as never),
      'Sub-kategori': (row.sub_kategori ?? []).map((value) => label(SUBKATEGORI_ALL, value as never) || value).join(', '),
      'Nama Perniagaan': text(row.nama_perniagaan),
      'Negeri Operasi': text(row.negeri_operasi),
      'Anggaran Pendapatan': label(PENDAPATAN_RANGE_OPTIONS, row.anggaran_pendapatan_range as never),
    })),
  };
}

// ── Pekerjaan / Keluarga / Komitmen (satu baris satu ahli, dari members_full_export) ──

/** Bidang mengikut sektor — hanya cabang sektor semasa dipaparkan, ikut cascade borang. */
function bidangPekerjaan(member: MemberExportRow): string {
  switch (member.sektor_pekerjaan) {
    case 'kerajaan': {
      const bidang = label(BIDANG_KERAJAAN_OPTIONS, member.bidang_kerajaan);
      return member.bidang_kerajaan === 'lain_lain' && member.bidang_kerajaan_lain_teks
        ? bidang + ': ' + member.bidang_kerajaan_lain_teks
        : bidang;
    }
    case 'swasta':
    case 'glc': {
      const kumpulan = label(KUMPULAN_BIDANG_SWASTA_OPTIONS, member.kumpulan_bidang_swasta);
      const khusus = label(BIDANG_KHUSUS_FLAT, member.bidang_khusus_swasta);
      const lain = member.bidang_khusus_swasta === 'lain_lain' ? text(member.bidang_khusus_swasta_lain_teks) : '';
      return [kumpulan, [khusus, lain].filter(Boolean).join(': ')].filter(Boolean).join(' / ');
    }
    case 'sendiri': {
      // Bekerja sendiri + berniaga: butiran di sheet Perniagaan, tiada jenis/bidang di sini.
      return [label(JENIS_KERJA_SENDIRI_OPTIONS, member.jenis_kerja_sendiri), text(member.bidang_kerja_sendiri_lain_teks)]
        .filter(Boolean)
        .join(': ');
    }
    default:
      return '';
  }
}

const PEKERJAAN_HEADER = [
  'Nama',
  'Generasi',
  'Status Pekerjaan',
  'Sektor Pekerjaan',
  'Bidang',
  'Jawatan',
  'Nama Majikan/Syarikat',
  'Negeri Tempat Kerja',
  'Anggaran Pendapatan',
  'Bidang Pekerjaan Lama (Pesara)',
];

export function pekerjaanSheet(members: MemberExportRow[]): ExportSheet {
  return {
    name: 'Pekerjaan',
    header: PEKERJAAN_HEADER,
    rows: members.map((member) => {
      // Cabang kerja hanya bermakna bila status 'bekerja' (borang mengosongkannya bila tidak,
      // tetapi data lama boleh tersangkut) — status kosong (belum diisi semula) dibiarkan.
      const notWorking = member.status_pekerjaan !== null && member.status_pekerjaan !== 'bekerja';
      return {
        Nama: member.full_name,
        Generasi: generasi(member.generasi),
        'Status Pekerjaan': label(STATUS_PEKERJAAN_OPTIONS, member.status_pekerjaan),
        'Sektor Pekerjaan': notWorking ? '' : label(SEKTOR_PEKERJAAN_OPTIONS, member.sektor_pekerjaan),
        Bidang: notWorking ? '' : bidangPekerjaan(member),
        Jawatan: notWorking ? '' : text(member.jawatan_pekerjaan),
        'Nama Majikan/Syarikat': notWorking ? '' : text(member.nama_majikan),
        'Negeri Tempat Kerja': notWorking ? '' : text(member.negeri_tempat_kerja),
        'Anggaran Pendapatan': notWorking ? '' : label(PENDAPATAN_RANGE_OPTIONS, member.anggaran_pendapatan_range),
        'Bidang Pekerjaan Lama (Pesara)': text(member.bidang_pekerjaan_lama),
      };
    }),
  };
}

const KELUARGA_HEADER = [
  'Nama',
  'Generasi',
  'Status Perkahwinan',
  'Nama Pasangan',
  'Status MBM / Bukan MBM',
  'Tahun Berkahwin',
  'Sebab Berakhir Perkahwinan',
  'Cenderung Baitul Muslim',
  'Bilangan Anak',
];

export function keluargaSheet(members: MemberExportRow[]): ExportSheet {
  return {
    name: 'Keluarga',
    header: KELUARGA_HEADER,
    rows: members.map((member) => ({
      Nama: member.full_name,
      Generasi: generasi(member.generasi),
      'Status Perkahwinan': label(STATUS_PERKAHWINAN_OPTIONS, member.status_perkahwinan),
      // Sudah diselesaikan pelayan: nama ahli pasangan (MBM) atau teks Bukan MBM.
      'Nama Pasangan': text(member.nama_pasangan),
      'Status MBM / Bukan MBM': text(member.status_pasangan),
      'Tahun Berkahwin': text(member.tahun_berkahwin),
      'Sebab Berakhir Perkahwinan': label(SEBAB_PERKAHWINAN_OPTIONS, member.sebab_bercerai_kematian),
      'Cenderung Baitul Muslim': yesNo(member.cenderung_baitul_muslim),
      'Bilangan Anak': member.bil_anak === null ? '' : member.bil_anak,
    })),
  };
}

const KOMITMEN_HEADER = [
  'Nama',
  'Generasi',
  'Jawatan Ikhwan Aktif',
  'Jawatan Ikhwan 1',
  'Jawatan Ikhwan 2',
  'Jawatan PAS Aktif',
  'Jawatan PAS 1',
  'Jawatan PAS 2',
  'No. Keahlian PAS',
];

export function komitmenSheet(members: MemberExportRow[]): ExportSheet {
  return {
    name: 'Komitmen',
    header: KOMITMEN_HEADER,
    rows: members.map((member) => ({
      Nama: member.full_name,
      Generasi: generasi(member.generasi),
      'Jawatan Ikhwan Aktif': yesNo(member.jawatan_ikhwan_aktif),
      'Jawatan Ikhwan 1': text(member.jawatan_ikhwan_1),
      'Jawatan Ikhwan 2': text(member.jawatan_ikhwan_2),
      'Jawatan PAS Aktif': yesNo(member.jawatan_pas_aktif),
      'Jawatan PAS 1': text(member.jawatan_pas_1),
      'Jawatan PAS 2': text(member.jawatan_pas_2),
      'No. Keahlian PAS': text(member.no_keahlian_pas),
    })),
  };
}

// ── Kesihatan (eksport berasingan, BUKAN sebahagian eksport Ahli Keseluruhan) ──

export type HealthExportRow = {
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  jenis_masalah: string;
  nama_penyakit: string | null;
  ada_temujanji_hospital: boolean | null;
  keterangan_lain: string | null;
};

const KESIHATAN_HEADER = [
  'Nombor Ahli',
  'Nama',
  'Generasi',
  'Jenis Masalah',
  'Nama Penyakit/Kondisi',
  'Ada Temujanji Hospital',
  'Keterangan Lain',
];

export function kesihatanSheet(rows: HealthExportRow[]): ExportSheet {
  return {
    name: 'Kesihatan',
    header: KESIHATAN_HEADER,
    rows: rows.map((row) => ({
      'Nombor Ahli': text(row.nombor_ahli),
      Nama: row.full_name,
      Generasi: generasi(row.generasi),
      'Jenis Masalah': label(JENIS_MASALAH_KESIHATAN_OPTIONS, row.jenis_masalah as never),
      'Nama Penyakit/Kondisi': text(row.nama_penyakit),
      'Ada Temujanji Hospital': yesNo(row.ada_temujanji_hospital),
      'Keterangan Lain': text(row.keterangan_lain),
    })),
  };
}
