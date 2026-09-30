import * as XLSX from 'xlsx';

import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import {
  AHLI_COLUMNS,
  MEMBER_EXPORT_ONLY_COLUMNS,
  MEMBER_NUMBER_COLUMN,
  MEMBER_READONLY_COLUMNS,
  memberToSheetRow,
  type MemberExportRow,
} from './member-sheet';
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

export async function fetchMembersFullExport(): Promise<MemberExportRow[]> {
  const rows: MemberExportRow[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase.rpc('members_full_export').range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const batch = (data as MemberExportRow[] | null) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

export type MemberExportResult = { rows: number; fileName: string; result: DeliveryResult };

export async function downloadMembersFullExport(mode: DeliveryMode): Promise<MemberExportResult> {
  const rows = await fetchMembersFullExport();
  if (!rows.length) throw new UserError('Tiada rekod ahli untuk dieksport.');

  const sheet = XLSX.utils.json_to_sheet(rows.map(memberToSheetRow), {
    header: [MEMBER_NUMBER_COLUMN, ...AHLI_COLUMNS, ...MEMBER_EXPORT_ONLY_COLUMNS, ...MEMBER_READONLY_COLUMNS],
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'user_data');

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
