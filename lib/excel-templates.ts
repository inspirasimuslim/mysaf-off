import * as XLSX from 'xlsx';

import { TEMPLATE_EXAMPLE_NAME } from './ahli-import';
import { AHLI_COLUMNS, type SheetCell } from './member-sheet';
import { MONTH_LABELS } from './usrah-import';

/**
 * Template .xlsx untuk setiap skrin muat naik.
 *
 * Dijana semasa butang ditekan dan bukan disimpan sebagai fail dalam assets/:
 * lajur diambil daripada pemalar yang SAMA dengan yang dibaca oleh import, jadi
 * template dan import tidak boleh menyimpang apabila salah satu diubah.
 *
 * Setiap template membawa SATU baris contoh supaya bentuk nilainya kelihatan.
 * Import ahli menolak baris contoh itu (`TEMPLATE_EXAMPLE_NAME`); import lain
 * melaporkannya sebagai "tidak dipadankan" kerana tiada ahli bernama begitu.
 *
 * Modul ini bebas daripada React Native — penyerahan fail tinggal di
 * `template-download.ts`.
 */

export type TemplateKind = 'ahli' | 'usrah' | 'yuran' | 'pipis';

type Template = {
  fileName: string;
  sheetName: string;
  /** Tajuk share sheet di peranti. */
  title: string;
  columns: readonly string[];
  example: Record<string, SheetCell>;
};

const EXAMPLE_GENERATION = 'Ikhwan 01';

const AHLI_EXAMPLE: Record<(typeof AHLI_COLUMNS)[number], SheetCell> = {
  UserName: TEMPLATE_EXAMPLE_NAME,
  Jantina: 'Muslimin',
  Alamat: 'NO 1, JALAN CONTOH, 43000 KAJANG, SELANGOR',
  AlamatSemasa: 'NO 1, JALAN CONTOH, 43000 KAJANG, SELANGOR',
  Email: 'contoh@email.com',
  NoTel: '0123456789',
  KawasanUsrah: 'ULK',
  Nric: '000000-00-0000',
  Disekat: 'FALSE',
  Sekolah: 'SMKA CONTOH',
  Generasi: EXAMPLE_GENERATION,
  StatusPerkahwinan: 'Bujang',
  StatusPekerjaan: 'Bekerja',
  BilAnak: 0,
  SektorPekerjaan: 'SWASTA',
  JawatanPekerjaan: 'JURUTERA',
  NamaMajikanSyarikat: 'SYARIKAT CONTOH SDN BHD',
  AnggaranPendapatan: 3500,
  NyatakanJikaMBM: '',
  TahunBerkahwin: '',
  JawatanIkhwan1: 'AHLI',
  JawatanIkhwan2: '',
  JawatanPas1: '',
  JawatanPas2: '',
  NoKeahlianPas: '',
};

/** Jan hadir, Feb tidak hadir, Mac hadir, bulan lain belum berekod. */
const USRAH_EXAMPLE: Record<string, SheetCell> = {
  NAMA: TEMPLATE_EXAMPLE_NAME,
  GENERASI: EXAMPLE_GENERATION,
  ...Object.fromEntries(MONTH_LABELS.map((month, index) => [month, index === 0 || index === 2 ? 1 : index === 1 ? 0 : ''])),
};

export const TEMPLATES: Record<TemplateKind, Template> = {
  ahli: {
    fileName: 'template-ahli.xlsx',
    sheetName: 'user_data',
    title: 'Template Muat Naik Ahli',
    columns: AHLI_COLUMNS,
    example: AHLI_EXAMPLE,
  },
  usrah: {
    fileName: 'template-usrah.xlsx',
    sheetName: 'Sheet1',
    title: 'Template Kehadiran Usrah',
    columns: ['NAMA', 'GENERASI', ...MONTH_LABELS],
    example: USRAH_EXAMPLE,
  },
  yuran: {
    fileName: 'template-yuran-baki-2025.xlsx',
    sheetName: 'Sheet1',
    title: 'Template Baki Permulaan Yuran',
    columns: ['NAMA', 'GENERASI', 'TUNGGAKAN', 'PEMBAYARAN_2025', 'BAKI_TUNGGAKAN', 'LEBIHAN_BAYARAN'],
    example: {
      NAMA: TEMPLATE_EXAMPLE_NAME,
      GENERASI: EXAMPLE_GENERATION,
      TUNGGAKAN: 90,
      PEMBAYARAN_2025: 60,
      BAKI_TUNGGAKAN: 30,
      LEBIHAN_BAYARAN: 0,
    },
  },
  pipis: {
    fileName: 'template-pipis.xlsx',
    sheetName: 'Sheet1',
    title: 'Template Sumbangan PIPIS',
    /*
      KAWASAN dan STATUS pernah berada di sini dan TIDAK pernah dibaca oleh
      `pipis-import` — admin yang menyunting STATUS dalam fail menyangka ia
      disimpan, sedangkan status dikira daripada jumlah sumbangan di pelayan.
      Lajur yang tidak membawa kesan lebih buruk daripada lajur yang tiada.
    */
    columns: ['NAMA', 'GENERASI', 'JUMLAH_SUMBANGAN'],
    example: {
      NAMA: TEMPLATE_EXAMPLE_NAME,
      GENERASI: EXAMPLE_GENERATION,
      JUMLAH_SUMBANGAN: 1500,
    },
  },
};

/** Buku kerja satu helaian: pengepala mengikut susunan `columns`, dan satu baris contoh. */
export function buildTemplateWorkbook(kind: TemplateKind): XLSX.WorkBook {
  const template = TEMPLATES[kind];
  const sheet = XLSX.utils.json_to_sheet([template.example], { header: [...template.columns] });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, template.sheetName);
  return book;
}
