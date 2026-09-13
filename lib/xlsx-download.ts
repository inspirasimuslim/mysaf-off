import * as XLSX from 'xlsx';

import { deliverFile, type DeliveryMode, type DeliveryResult } from './file-delivery';

/**
 * Serahkan buku kerja .xlsx kepada pengguna — setiap eksport Excel melalui sini.
 *
 * `mode` datang daripada butang yang ditekan: 'save' ("Simpan ke Peranti" —
 * folder pilihan melalui SAF di Android) atau 'share' ("Kongsi" — share
 * sheet). Web sentiasa memuat turun terus. Lihat `file-delivery.ts`.
 */

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function deliverWorkbook(
  book: XLSX.WorkBook,
  fileName: string,
  dialogTitle: string,
  mode: DeliveryMode = 'share',
): Promise<DeliveryResult> {
  const output = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return deliverFile(new Uint8Array(output), fileName, MIME, dialogTitle, mode);
}
