import * as XLSX from 'xlsx';

import type { AhliDiputihkan } from './ahli-diputihkan';
import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { deliverWorkbook } from './xlsx-download';
import { generationLabel } from '@/types/database';

/**
 * Eksport Senarai Ahli Diputihkan — satu sheet ringkas (Nama, Generasi,
 * Tahun Diputihkan, Catatan), susunan sama seperti skrin (tahun menaik).
 *
 * Tidak memerlukan RPC/pelayan berasingan seperti eksport Ahli/Kesihatan —
 * `rows` diambil terus daripada apa yang skrin sudah muatkan (RLS
 * `can_view_ahli_diputihkan()` pada table itu sendiri sudah memadai).
 */

type ExportRow = { Nama: string; Generasi: string; 'Tahun Diputihkan': number; Catatan: string };

export type AhliDiputihkanExportResult = { rows: number; fileName: string; result: DeliveryResult };

export async function downloadAhliDiputihkanExport(
  rows: AhliDiputihkan[],
  mode: DeliveryMode,
): Promise<AhliDiputihkanExportResult> {
  if (!rows.length) throw new UserError('Tiada rekod ahli diputihkan untuk dieksport.');

  const sheetRows: ExportRow[] = rows.map((row) => ({
    Nama: row.nama,
    Generasi: generationLabel(row.generasi),
    'Tahun Diputihkan': row.tahun_dibuang,
    Catatan: row.catatan ?? '',
  }));

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(sheetRows), 'Ahli Diputihkan');

  const today = new Date();
  const stamp =
    today.getFullYear() +
    '-' +
    String(today.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(today.getDate()).padStart(2, '0');
  const fileName = 'ahli-diputihkan-' + stamp + '.xlsx';

  const result = await deliverWorkbook(book, fileName, 'Senarai Ahli Diputihkan', mode);
  return { rows: rows.length, fileName, result };
}
