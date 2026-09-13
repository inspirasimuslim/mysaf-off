import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { fetchPipisReport } from './pipis';
import { deliverWorkbook } from './xlsx-download';

/**
 * Laporan sumbangan PIPIS ASET sebagai fail .xlsx.
 *
 * Data datang daripada `pipis_full_report()` — sama seperti skrin senarai, jadi
 * fail dan skrin tidak boleh memberi dua jawapan berbeza tentang sumbangan
 * orang yang sama.
 *
 * Tiada parameter tahun: PIPIS ialah sumbangan sekali seumur hidup, jadi
 * laporan ini ialah gambaran keseluruhan dan bukan potongan setahun.
 */

export type PipisReport = {
  rows: number;
  fileName: string;
  result: DeliveryResult;
};

/** Jana fail dan serahkan kepada pengguna — simpan atau kongsi, lihat `file-delivery.ts`. */
export async function downloadPipisReport(mode: DeliveryMode): Promise<PipisReport> {
  const rows = await fetchPipisReport();
  if (!rows.length) {
    throw new UserError('Tiada rekod ahli untuk dilaporkan.');
  }

  const sheetRows = rows.map((row) => ({
    'Nombor Ahli': row.nombor_ahli ?? '',
    Nama: row.full_name,
    Generasi: generationLabel(row.generasi),
    'Jumlah Sumbangan': row.jumlah,
    'Peratus (%)': row.peratus,
    Status: row.status,
  }));

  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'PIPIS ASET');

  const fileName = 'pipis-aset.xlsx';
  const result = await deliverWorkbook(book, fileName, 'Laporan PIPIS ASET', mode);

  return { rows: rows.length, fileName, result };
}
