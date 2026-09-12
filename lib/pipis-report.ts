import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { fetchPipisReport } from './pipis';

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

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type PipisReport = {
  rows: number;
  /** Laluan fail di peranti; kosong di web kerana pelayar terus memuat turunnya. */
  uri: string | null;
  fileName: string;
};

/**
 * Jana fail dan serahkan kepada pengguna.
 *
 * Dua platform, dua cara menyerahkan fail — sama seperti `yuran-report.ts`:
 * peranti menulis ke cache dan menyerahkannya kepada share sheet sistem; web
 * mencetuskan muat turun daripada blob dalam ingatan.
 */
export async function downloadPipisReport(): Promise<PipisReport> {
  const rows = await fetchPipisReport();
  if (!rows.length) {
    throw new Error('Tiada rekod ahli untuk dilaporkan.');
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

  if (Platform.OS === 'web') {
    const output = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([output], { type: MIME }));

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);

    return { rows: rows.length, uri: null, fileName };
  }

  const base64 = XLSX.write(book, { type: 'base64', bookType: 'xlsx' }) as string;

  const directory = new Directory(Paths.cache, 'laporan');
  if (!directory.exists) directory.create({ intermediates: true });

  const file = new File(directory, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: MIME, dialogTitle: 'Laporan PIPIS ASET' });
  }

  return { rows: rows.length, uri: file.uri, fileName };
}
