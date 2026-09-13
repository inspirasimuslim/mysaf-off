import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { deliverWorkbook } from './xlsx-download';
import { fetchYuranReport } from './yuran';

/**
 * Laporan yuran setahun sebagai fail .xlsx.
 *
 * Data datang daripada `yuran_year_report()` — sama seperti skrin senarai, jadi
 * fail dan skrin tidak boleh memberi dua jawapan berbeza tentang wang orang
 * yang sama.
 *
 * Kolum "Jumlah Tertunggak" ialah baki KESELURUHAN dan bukan baki tahun itu:
 * laporan ini dicetak untuk mengejar hutang, dan hutang tidak berhenti di
 * sempadan tahun.
 */

export type YuranReport = {
  year: number;
  rows: number;
  fileName: string;
  result: DeliveryResult;
};

/** Jana fail dan serahkan kepada pengguna — simpan atau kongsi, lihat `file-delivery.ts`. */
export async function downloadYuranReport(year: number, mode: DeliveryMode): Promise<YuranReport> {
  const rows = await fetchYuranReport(year);
  if (!rows.length) {
    throw new UserError('Tiada rekod yuran untuk tahun ' + year + '.');
  }

  const sheetRows = rows.map((row) => ({
    'Nombor Ahli': row.nombor_ahli ?? '',
    Nama: row.full_name,
    Generasi: generationLabel(row.generasi),
    ['Caj ' + year]: row.caj_tahun,
    ['Bayaran ' + year]: row.bayar_tahun,
    'Jumlah Tertunggak': row.tertunggak,
    Kredit: row.kredit,
    Status: row.status,
  }));

  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Yuran ' + year);

  const fileName = 'yuran-' + year + '.xlsx';
  const result = await deliverWorkbook(book, fileName, 'Laporan Yuran ' + year, mode);

  return { year, rows: rows.length, fileName, result };
}
