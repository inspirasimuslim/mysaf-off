import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { supabase } from './supabase';
import { deliverWorkbook } from './xlsx-download';

/**
 * Eksport TRANSAKSI yuran dan PIPIS — satu baris setiap bayaran, setiap status.
 *
 * Berbeza daripada laporan agregat (`yuran-report.ts`, `pipis-report.ts`) dengan
 * sengaja, dan berdiri di sebelahnya dan bukan menggantikannya.
 *
 * Laporan agregat mengira `status = 'success'` sahaja — betul, kerana baki
 * seseorang tidak patut bergerak kerana bayaran yang gagal. Tetapi itu bermakna
 * bayaran ToyyibPay yang gagal, atau yang tersangkut pada 'pending' kerana
 * callback tidak sampai, tidak muncul dalam SATU pun fail. Bayaran tersangkut
 * itulah yang paling perlu dikejar, jadi fail ini membawa semuanya.
 */

const STATUS_LABEL: Record<string, string> = {
  success: 'Berjaya',
  pending: 'Menunggu',
  failed: 'Gagal',
};

const METHOD_LABEL: Record<string, string> = {
  gateway: 'Bayaran online',
  import: 'Rekod lejar',
  import_opening: 'Baki permulaan',
  manual_adjustment: 'Pelarasan manual',
};

/** Bentuk pulangan `yuran_transactions_export()` dan `pipis_transactions_export()`. */
type TransactionRow = {
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  created_at: string;
  amount: number | string | null;
  requested_amount: number | string | null;
  method: string;
  status: string;
  gateway_bill_code: string | null;
  /** Tiada sebelum migration 094 — sel kosong. */
  gateway_reference?: string | null;
  /** Yuran sahaja (`undefined` bagi PIPIS) — tahun bayaran itu dikreditkan. */
  tahun?: number | null;
  /** Yuran sahaja — terisi bila bayaran datang daripada Bayaran Kumpulan. */
  rujukan_kumpulan?: string | null;
  direkod_oleh?: string | null;
  note: string | null;
};

export type TransactionsReport = {
  rows: number;
  fileName: string;
  result: DeliveryResult;
};

/** PostgREST memulangkan `numeric` sebagai nombor ATAU rentetan — seragamkan. */
function amountCell(value: number | string | null): number | string {
  if (value === null || value === undefined || value === '') return '';
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : '';
}

function sheetRows(rows: TransactionRow[]): Record<string, string | number | Date>[] {
  return rows.map((row) => ({
    'Nombor Ahli': row.nombor_ahli ?? '',
    Nama: row.full_name,
    Generasi: generationLabel(row.generasi),
    // Lajur Tahun hanya untuk yuran; PIPIS tiada tahun (sekali seumur hidup).
    ...(row.tahun !== undefined ? { Tahun: row.tahun ?? '' } : {}),
    // Objek Date sebenar (bukan teks) supaya Excel mengiktirafnya sebagai
    // datetime — bendahari boleh sort/filter ikut masa. Waktu tempatan
    // peranti, sama seperti fail lain — fail ini dibaca oleh bendahari,
    // bukan pelayan.
    'Tarikh & Masa': new Date(row.created_at),
    Jumlah: amountCell(row.amount),
    // Jumlah yang ahli MINTA bayar, berbanding yang benar-benar masuk. Bagi
    // bayaran gagal, kolum ini satu-satunya petunjuk berapa dia cuba bayar.
    'Jumlah Diminta': amountCell(row.requested_amount),
    // Bayaran kumpulan disimpan sebagai `manual_adjustment` — dilabel berasingan
    // supaya tidak kelihatan seperti pelarasan biasa.
    Kaedah: row.rujukan_kumpulan ? 'Bayaran kumpulan' : (METHOD_LABEL[row.method] ?? row.method),
    Status: STATUS_LABEL[row.status] ?? row.status,
    'Kod Bil ToyyibPay': row.gateway_bill_code ?? '',
    'Rujukan ToyyibPay': row.gateway_reference ?? '',
    ...(row.rujukan_kumpulan !== undefined ? { 'Rujukan Kumpulan': row.rujukan_kumpulan ?? '' } : {}),
    // Nama admin yang merekod (import atau pelarasan manual) — jejak audit; kosong bagi bayaran online.
    'Direkod Oleh': row.direkod_oleh ?? '',
    Nota: row.note ?? '',
  }));
}

async function download(
  rows: TransactionRow[],
  sheetName: string,
  fileName: string,
  dialogTitle: string,
  mode: DeliveryMode,
): Promise<TransactionsReport> {
  const sheet = XLSX.utils.json_to_sheet(sheetRows(rows), {
    cellDates: true,
    dateNF: 'yyyy-mm-dd hh:mm:ss',
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName);

  const result = await deliverWorkbook(book, fileName, dialogTitle, mode);
  return { rows: rows.length, fileName, result };
}

/**
 * Transaksi yuran — seluruh sejarah, atau satu tahun.
 *
 * `year` null bermakna semua tahun: bayaran yang tersangkut tidak semestinya
 * berada dalam tahun yang sedang dilihat di skrin.
 */
export async function downloadYuranTransactions(
  year: number | null,
  mode: DeliveryMode,
): Promise<TransactionsReport> {
  const { data, error } = await supabase.rpc('yuran_transactions_export', { p_year: year });
  if (error) throw error;

  const rows = (data as TransactionRow[] | null) ?? [];
  if (!rows.length) {
    throw new UserError(
      year === null ? 'Tiada transaksi yuran direkodkan.' : 'Tiada transaksi yuran untuk tahun ' + year + '.',
    );
  }

  return download(
    rows,
    'Transaksi Yuran',
    year === null ? 'transaksi-yuran.xlsx' : 'transaksi-yuran-' + year + '.xlsx',
    'Transaksi Yuran',
    mode,
  );
}

/** Transaksi PIPIS — tiada parameter tahun, PIPIS ialah sumbangan sekali seumur hidup. */
export async function downloadPipisTransactions(mode: DeliveryMode): Promise<TransactionsReport> {
  const { data, error } = await supabase.rpc('pipis_transactions_export');
  if (error) throw error;

  const rows = (data as TransactionRow[] | null) ?? [];
  if (!rows.length) throw new UserError('Tiada transaksi PIPIS direkodkan.');

  return download(rows, 'Transaksi PIPIS', 'transaksi-pipis.xlsx', 'Transaksi PIPIS', mode);
}
