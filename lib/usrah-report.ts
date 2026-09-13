import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { supabase } from './supabase';
import { MONTH_LABELS } from './usrah-import';
import { deliverWorkbook } from './xlsx-download';

/**
 * Laporan kehadiran usrah setahun sebagai fail .xlsx.
 *
 * Data datang daripada `usrah_year_report()` dan BUKAN daripada `members` +
 * `usrah_monthly_attendance` terus: admin LAJNAH TARBIAH belum tentu memegang
 * kebenaran membaca `members`, jadi laluan biasa akan memulangkan laporan tanpa
 * nama. Fungsi `security definer` itu mendedahkan tiga kolum pengenalan sahaja
 * kepada sesiapa yang sudah dibenarkan melihat rekod usrah.
 */

type ReportRow = {
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  [month: string]: string | boolean | null;
};

/** Sel kehadiran seperti dilihat dalam Excel. */
function cell(value: unknown): string {
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

/** Bina buku kerja daripada baris laporan. */
function buildWorkbook(rows: ReportRow[]): XLSX.WorkBook {
  const sheetRows = rows.map((row) => {
    const months = MONTH_LABELS.map((_, index) => cell(row['m' + String(index + 1).padStart(2, '0')]));
    const attended = months.filter((value) => value === 'HADIR').length;

    const record: Record<string, string> = {
      'Nombor Ahli': row.nombor_ahli ?? '',
      Nama: row.full_name,
      Generasi: generationLabel(row.generasi),
    };

    MONTH_LABELS.forEach((label, index) => {
      record[label] = months[index] as string;
    });

    return { ...record, 'Jumlah Hadir': String(attended) };
  });

  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Kehadiran Usrah');
  return book;
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

  const book = buildWorkbook(rows);
  const fileName = 'kehadiran-usrah-' + year + '.xlsx';
  const result = await deliverWorkbook(book, fileName, 'Laporan Kehadiran Usrah ' + year, mode);

  return { year, rows: rows.length, uri: null, fileName, result };
}
