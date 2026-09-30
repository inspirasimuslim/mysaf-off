import * as XLSX from 'xlsx';

import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import {
  MEMBER_EXPORT_COLUMN_ORDER,
  memberToSheetRow,
  type MemberExportRow,
} from './member-sheet';
import {
  keluargaSheet,
  komitmenSheet,
  pekerjaanSheet,
  pendidikanSheet,
  perniagaanSheet,
  type BusinessExportRow,
  type EducationExportRow,
  type ExportSheet,
} from './member-export-sheets';
import { supabase } from './supabase';
import { deliverWorkbook } from './xlsx-download';

/**
 * Eksport penuh data ahli — JABATAN DATA & SUMBER MANUSIA dan Super Admin.
 *
 * Data datang daripada `members_full_export()`, yang menyemak kebenaran di
 * pelayan; butang yang tersembunyi dalam app bukan lapisan kawalan.
 *
 * Fail yang terhasil sama bentuk dengan fail keahlian asal, ditambah lajur
 * `NomborAhli` di hadapan — jadi ia boleh disunting dan dimuat naik semula
 * melalui skrin Muat Naik Ahli untuk kemas kini pukal.
 */

/** PostgREST menghadkan 1000 baris setiap permintaan secara lalai. */
const PAGE_SIZE = 1000;

/** Baca semua baris satu RPC eksport, halaman demi halaman. */
export async function fetchAllRpcRows<T>(fn: string): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase.rpc(fn).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const batch = (data as T[] | null) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

export function fetchMembersFullExport(): Promise<MemberExportRow[]> {
  return fetchAllRpcRows<MemberExportRow>('members_full_export');
}

/** Tambah satu sheet bacaan sahaja; sheet tanpa baris tetap dipaparkan dengan tajuk lajur. */
export function appendExportSheet(book: XLSX.WorkBook, sheet: ExportSheet): void {
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(sheet.rows, { header: sheet.header }), sheet.name);
}

export type MemberExportResult = { rows: number; fileName: string; result: DeliveryResult };

export async function downloadMembersFullExport(mode: DeliveryMode): Promise<MemberExportResult> {
  const [rows, education, businesses] = await Promise.all([
    fetchMembersFullExport(),
    fetchAllRpcRows<EducationExportRow>('members_export_pendidikan'),
    fetchAllRpcRows<BusinessExportRow>('members_export_perniagaan'),
  ]);
  if (!rows.length) throw new UserError('Tiada rekod ahli untuk dieksport.');

  const sheet = XLSX.utils.json_to_sheet(rows.map(memberToSheetRow), {
    header: [...MEMBER_EXPORT_COLUMN_ORDER],
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'user_data');

  /*
    Sheet bacaan sahaja bagi setiap tab borang. `user_data` kekal sheet pertama —
    import hanya membaca sheet itu. Kesihatan SENGAJA tiada di sini
    (lihat `member-health-export.ts`).
  */
  for (const extra of [
    pendidikanSheet(education),
    perniagaanSheet(businesses),
    pekerjaanSheet(rows),
    keluargaSheet(rows),
    komitmenSheet(rows),
  ]) {
    appendExportSheet(book, extra);
  }

  const today = new Date();
  const stamp =
    today.getFullYear() +
    '-' +
    String(today.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(today.getDate()).padStart(2, '0');
  const fileName = 'data-ahli-' + stamp + '.xlsx';

  const result = await deliverWorkbook(book, fileName, 'Data Penuh Ahli', mode);
  return { rows: rows.length, fileName, result };
}
