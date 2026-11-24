import * as XLSX from 'xlsx';

import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { appendExportSheet, fetchAllRpcRows } from './member-export';
import type { ExportSheet } from './member-export-sheets';
import { supabase } from './supabase';
import { deliverWorkbook } from './xlsx-download';

/**
 * Majlis Baitul Muslim (MBM) — borang kecenderungan awal (migration 171).
 * Menggantikan Google Form. Ahli menghantar melalui RPC `mbm_submit`; admin
 * department MAJLIS BAITUL MUSLIM (+ Super Admin) menyemak melalui `mbm_admin_*`.
 * Table terkunci; kebenaran disemak semula di pelayan.
 */

/** Senarai panel pilihan — salinan borang asal (susunan sama). */
export const MBM_PANEL: readonly string[] = [
  'Nik Mohd Kamal bin Ibrahim@Nik Hanafi',
  'Ahmad Fatihi b Makhtar',
  'Mohd Ridhuwan b Che Musa',
  'Mohd Aidil Hanan b Jusoh',
  'Muhamad Zarif b Ilias',
  'Nurul Khairani bt Ismail',
  'Nurul Farihah bt Mad Rozali',
  'Nur Farhana bt Mohd Razali',
  'Nur Farah Syazwani bt Mohd Zurhan',
  'Nurul Jannah bt Mohd A’seri',
];

export const MBM_CONTACTS: readonly { name: string; phone: string }[] = [
  { name: 'KAMAL', phone: '013-4058718' },
  { name: 'RIDHUWAN', phone: '016-5279390' },
  { name: 'FARAH', phone: '014-5152462' },
  { name: 'FATIHI', phone: '013-2751059' },
  { name: 'KHAIRANI', phone: '013-9145096' },
  { name: 'FARHANA', phone: '019-9696359' },
];

export type MbmStatus = 'baharu' | 'selesai';

export type MbmMyApplication = { id: string; panel_pilihan: string; status: MbmStatus; created_at: string };

export type MbmAdminRow = {
  id: string;
  nombor_ahli: string | null;
  nama: string;
  generasi: string | null;
  no_telefon: string;
  panel_pilihan: string;
  status: MbmStatus;
  created_at: string;
};

export async function submitMbm(input: {
  nama: string;
  generasi: string;
  no_telefon: string;
  panel: string;
}): Promise<void> {
  const { error } = await supabase.rpc('mbm_submit', {
    p_nama: input.nama,
    p_generasi: input.generasi,
    p_no_telefon: input.no_telefon,
    p_panel: input.panel,
  });
  if (error) throw error;
}

export async function fetchMyMbmApplication(): Promise<MbmMyApplication | null> {
  const { data, error } = await supabase.rpc('mbm_my_application');
  if (error) throw error;
  return ((data as MbmMyApplication[] | null) ?? [])[0] ?? null;
}

export function fetchMbmAdminRows(): Promise<MbmAdminRow[]> {
  return fetchAllRpcRows<MbmAdminRow>('mbm_admin_list');
}

export async function setMbmStatus(id: string, status: MbmStatus): Promise<void> {
  const { error } = await supabase.rpc('mbm_admin_set_status', { p_id: id, p_status: status });
  if (error) throw error;
}

export function mbmStatusLabel(status: MbmStatus): string {
  return status === 'selesai' ? 'Selesai' : 'Baharu';
}

const EXPORT_HEADER = ['Tarikh', 'Masa', 'Nombor Ahli', 'Nama', 'Generasi', 'No Telefon', 'Panel Pilihan', 'Status'];

function exportSheet(rows: MbmAdminRow[]): ExportSheet {
  return {
    name: 'Permohonan MBM',
    header: EXPORT_HEADER,
    rows: rows.map((row) => {
      const date = new Date(row.created_at);
      return {
        Tarikh: date.toLocaleDateString('en-GB'),
        Masa: date.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' }),
        'Nombor Ahli': row.nombor_ahli ?? '',
        Nama: row.nama,
        Generasi: row.generasi ?? '',
        'No Telefon': row.no_telefon,
        'Panel Pilihan': row.panel_pilihan,
        Status: mbmStatusLabel(row.status),
      };
    }),
  };
}

export type MbmExportResult = { rows: number; fileName: string; result: DeliveryResult };

/** Eksport SEMUA permohonan MBM ke Excel — pelayan menyemak kebenaran admin MBM. */
export async function downloadMbmExport(mode: DeliveryMode): Promise<MbmExportResult> {
  const rows = await fetchMbmAdminRows();
  if (!rows.length) throw new UserError('Tiada permohonan MBM untuk dieksport.');

  const book = XLSX.utils.book_new();
  appendExportSheet(book, exportSheet(rows));

  const today = new Date();
  const stamp =
    today.getFullYear() +
    '-' +
    String(today.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(today.getDate()).padStart(2, '0');
  const fileName = 'permohonan-mbm-' + stamp + '.xlsx';

  const result = await deliverWorkbook(book, fileName, 'Permohonan MBM', mode);
  return { rows: rows.length, fileName, result };
}
