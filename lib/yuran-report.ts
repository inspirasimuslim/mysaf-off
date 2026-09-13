import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { UserError } from './errors';
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

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type YuranReport = {
  year: number;
  rows: number;
  /** Laluan fail di peranti; kosong di web kerana pelayar terus memuat turunnya. */
  uri: string | null;
  fileName: string;
};

/**
 * Jana fail dan serahkan kepada pengguna.
 *
 * Dua platform, dua cara menyerahkan fail — sama seperti `usrah-report.ts` dan
 * `program-report.ts`: peranti menulis ke cache dan menyerahkannya kepada share
 * sheet sistem; web mencetuskan muat turun daripada blob dalam ingatan.
 */
export async function downloadYuranReport(year: number): Promise<YuranReport> {
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

  if (Platform.OS === 'web') {
    const output = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([output], { type: MIME }));

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);

    return { year, rows: rows.length, uri: null, fileName };
  }

  const base64 = XLSX.write(book, { type: 'base64', bookType: 'xlsx' }) as string;

  const directory = new Directory(Paths.cache, 'laporan');
  if (!directory.exists) directory.create({ intermediates: true });

  const file = new File(directory, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: MIME, dialogTitle: 'Laporan Yuran ' + year });
  }

  return { year, rows: rows.length, uri: file.uri, fileName };
}
