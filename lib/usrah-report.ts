import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { supabase } from './supabase';
import { MONTH_LABELS } from './usrah-import';
import type { UsrahAttendanceSource, UsrahRecordedBy } from './usrah';
import { deliverWorkbook } from './xlsx-download';

/**
 * Laporan kehadiran usrah setahun sebagai fail .xlsx — dua helaian.
 *
 * Data datang daripada `usrah_year_report()` dan BUKAN daripada `members` +
 * `usrah_monthly_attendance` terus: admin LAJNAH TARBIAH belum tentu memegang
 * kebenaran membaca `members`, jadi laluan biasa akan memulangkan laporan tanpa
 * nama. Fungsi `security definer` itu mendedahkan tiga kolum pengenalan sahaja
 * kepada sesiapa yang sudah dibenarkan melihat rekod usrah.
 *
 * RPC memulangkan SATU BARIS SETIAP BULAN, bukan satu baris setiap ahli. Grid
 * 12 bulan dibina semula di sini. Bentuk itu dipilih kerana butiran kehadiran
 * (kawasan, tempat, tarikh) tidak muat dalam satu sel grid — meratakannya di
 * pelayan bermakna memilih satu bentuk sahaja untuk kedua-dua helaian.
 *
 * Ahli tanpa sebarang rekod pada tahun itu tetap dipulangkan (left join di
 * pelayan), dengan `month` NULL. Ahli begitu muncul dalam grid dengan dua belas
 * sel kosong dan tiada baris langsung dalam helaian butiran.
 */

/** Satu baris RPC: seorang ahli, satu bulan. `month` NULL = tiada rekod langsung. */
type ReportRow = {
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  month: number | null;
  attended: boolean | null;
  attendance_source: UsrahAttendanceSource | null;
  kawasan_attended: string | null;
  location_text: string | null;
  attended_date: string | null;
  recorded_by: UsrahRecordedBy | null;
};

/** Seorang ahli dengan dua belas bulannya, dikumpul semula daripada baris RPC. */
type MemberRows = {
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  /** Indeks 0–11; `undefined` bila bulan itu tiada rekod. */
  months: (ReportRow | undefined)[];
};

const SOURCE_LABEL: Record<UsrahAttendanceSource, string> = {
  usrah: 'Usrah',
  program_ganti: 'Program Ganti',
};

const RECORDED_BY_LABEL: Record<UsrahRecordedBy, string> = {
  system: 'Sistem',
  admin: 'Admin',
};

/** Sel kehadiran seperti dilihat dalam Excel. */
function cell(value: boolean | null | undefined): string {
  if (value === true) return 'HADIR';
  if (value === false) return 'TIDAK';
  return '';
}

export type UsrahReport = {
  year: number;
  rows: number;
  result: DeliveryResult;
  /** Laluan fail di peranti; kosong di web kerana pelayar terus memuat turunnya. */
  uri: string | null;
  fileName: string;
};

export async function fetchUsrahReportRows(year: number): Promise<ReportRow[]> {
  const { data, error } = await supabase.rpc('usrah_year_report', { target_year: year });
  if (error) throw error;
  return (data as ReportRow[] | null) ?? [];
}

/**
 * Baris per-bulan → seorang ahli setiap kemasukan, susunan RPC dikekalkan.
 *
 * Nombor ahli tidak boleh dijadikan kunci: ia dibenarkan NULL dalam skema, dan
 * dua ahli tanpa nombor akan bertindih menjadi satu baris. Nama + generasi
 * digunakan sebagai kunci ganti bagi kes itu.
 */
function groupByMember(rows: ReportRow[]): MemberRows[] {
  const members = new Map<string, MemberRows>();

  for (const row of rows) {
    const key = row.nombor_ahli ?? 'tanpa-nombor:' + row.full_name + '|' + (row.generasi ?? '');
    let member = members.get(key);
    if (!member) {
      member = {
        nombor_ahli: row.nombor_ahli,
        full_name: row.full_name,
        generasi: row.generasi,
        months: new Array<ReportRow | undefined>(12).fill(undefined),
      };
      members.set(key, member);
    }
    if (row.month !== null && row.month >= 1 && row.month <= 12) {
      member.months[row.month - 1] = row;
    }
  }

  return [...members.values()];
}

/** Helaian utama: satu baris seorang ahli, dua belas kolum bulan. */
function buildGridSheet(members: MemberRows[]): XLSX.WorkSheet {
  const sheetRows = members.map((member) => {
    const months = member.months.map((month) => cell(month?.attended));
    const attended = months.filter((value) => value === 'HADIR').length;

    const record: Record<string, string> = {
      'Nombor Ahli': member.nombor_ahli ?? '',
      Nama: member.full_name,
      Generasi: generationLabel(member.generasi),
    };

    MONTH_LABELS.forEach((label, index) => {
      record[label] = months[index] ?? '';
    });

    return { ...record, 'Jumlah Hadir': String(attended) };
  });

  return XLSX.utils.json_to_sheet(sheetRows);
}

/**
 * Helaian kedua: satu baris setiap BULAN HADIR.
 *
 * Bulan yang ditanda tidak hadir tidak membawa butiran — tiada kawasan, tiada
 * tarikh — jadi ia ditinggalkan di sini dan tinggal dalam grid sahaja. Helaian
 * ini menjawab "di mana dan bila", dan ketidakhadiran tiada jawapan untuk itu.
 */
function buildDetailSheet(members: MemberRows[], year: number): XLSX.WorkSheet {
  const detailRows: Record<string, string | number>[] = [];

  for (const member of members) {
    member.months.forEach((month, index) => {
      if (!month || month.attended !== true) return;

      detailRows.push({
        'Nombor Ahli': member.nombor_ahli ?? '',
        Nama: member.full_name,
        Generasi: generationLabel(member.generasi),
        Bulan: MONTH_LABELS[index] ?? '',
        Tahun: year,
        'Kawasan Dihadiri': month.kawasan_attended ?? '',
        'Nama Tempat': month.location_text ?? '',
        Tarikh: month.attended_date ?? '',
        Sumber: month.attendance_source ? SOURCE_LABEL[month.attendance_source] : '',
        'Direkod Oleh': month.recorded_by ? RECORDED_BY_LABEL[month.recorded_by] : '',
      });
    });
  }

  return XLSX.utils.json_to_sheet(detailRows, {
    // Helaian kekal berpengepala walaupun tiada seorang pun hadir sepanjang
    // tahun; json_to_sheet pada array kosong menghasilkan helaian kosong tanpa
    // tajuk, yang kelihatan seperti fail rosak.
    header: [
      'Nombor Ahli',
      'Nama',
      'Generasi',
      'Bulan',
      'Tahun',
      'Kawasan Dihadiri',
      'Nama Tempat',
      'Tarikh',
      'Sumber',
      'Direkod Oleh',
    ],
  });
}

/** Bina buku kerja daripada baris laporan. */
function buildWorkbook(rows: ReportRow[], year: number): { book: XLSX.WorkBook; members: number } {
  const members = groupByMember(rows);

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, buildGridSheet(members), 'Kehadiran Usrah');
  XLSX.utils.book_append_sheet(book, buildDetailSheet(members, year), 'Butiran Kehadiran');

  return { book, members: members.length };
}

/**
 * Jana fail dan serahkan kepada pengguna.
 *
 * Dua platform, dua cara menyerahkan fail — dan tiada satu pun yang berfungsi
 * pada kedua-duanya:
 *
 *   - Peranti: fail ditulis ke cache, kemudian diserahkan kepada share sheet
 *     sistem. Tiada folder "Muat Turun" yang boleh diandaikan wujud.
 *   - Web: tiada sistem fail untuk ditulis, jadi pautan muat turun dicetuskan
 *     terus daripada blob dalam ingatan.
 */
export async function downloadUsrahReport(year: number, mode: DeliveryMode): Promise<UsrahReport> {
  const rows = await fetchUsrahReportRows(year);
  if (!rows.length) {
    throw new UserError('Tiada rekod kehadiran untuk tahun ' + year + '.');
  }

  const { book, members } = buildWorkbook(rows, year);
  const fileName = 'kehadiran-usrah-' + year + '.xlsx';
  const result = await deliverWorkbook(book, fileName, 'Laporan Kehadiran Usrah ' + year, mode);

  return { year, rows: members, uri: null, fileName, result };
}
