import * as XLSX from 'xlsx';

import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { appendExportSheet, fetchAllRpcRows } from './member-export';
import { kesihatanSheet, type HealthExportRow } from './member-export-sheets';
import { deliverWorkbook } from './xlsx-download';

/**
 * Eksport data Kesihatan — fail BERASINGAN daripada eksport Ahli Keseluruhan.
 *
 * DATA SENSITIF. `members_export_kesihatan()` menyemak di pelayan bahawa
 * pemanggil ialah admin LAJNAH KEBAJIKAN atau Super Admin; butang yang
 * tersembunyi dalam app bukan lapisan kawalan.
 */

export type HealthExportResult = { rows: number; fileName: string; result: DeliveryResult };

export async function downloadHealthExport(mode: DeliveryMode): Promise<HealthExportResult> {
  const rows = await fetchAllRpcRows<HealthExportRow>('members_export_kesihatan');
  if (!rows.length) throw new UserError('Tiada rekod kesihatan untuk dieksport.');

  const book = XLSX.utils.book_new();
  appendExportSheet(book, kesihatanSheet(rows));

  const today = new Date();
  const stamp =
    today.getFullYear() +
    '-' +
    String(today.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(today.getDate()).padStart(2, '0');
  const fileName = 'data-kesihatan-ahli-' + stamp + '.xlsx';

  const result = await deliverWorkbook(book, fileName, 'Data Kesihatan Ahli', mode);
  return { rows: rows.length, fileName, result };
}
