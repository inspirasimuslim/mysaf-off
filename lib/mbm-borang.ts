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
 * department MAJLIS BAITUL MUSLIM (+ Super Admin) melantik panel (`mbm_panel_*`) dan hanya nampak bilangan; butiran permohonan hanya untuk panel (migration 174).
 * Table terkunci; kebenaran disemak semula di pelayan.
 */

export const MBM_CONTACTS: readonly { name: string; phone: string }[] = [
  { name: 'KAMAL', phone: '013-4058718' },
  { name: 'RIDHUWAN', phone: '016-5279390' },
  { name: 'FARAH', phone: '014-5152462' },
  { name: 'FATIHI', phone: '013-2751059' },
  { name: 'KHAIRANI', phone: '013-9145096' },
  { name: 'FARHANA', phone: '019-9696359' },
];

export type MbmStatus = 'baharu' | 'selesai';

export type MbmMyApplication = {
  id: string;
  panel_pilihan: string;
  panel_id: string | null;
  status: MbmStatus;
  created_at: string;
};

/** Panel aktif yang boleh dipilih ahli (migration 173). */
export type MbmPanelOption = { id: string; nama: string; generasi: string | null };

/** Panel dalam skrin lantik (admin MBM). */
export type MbmPanel = {
  id: string;
  member_id: string;
  nama: string;
  generasi: string | null;
  aktif: boolean;
  baharu: number;
  jumlah: number;
};

/** Permohonan yang dilihat panel — hanya yang memilihnya. */
export type MbmPanelRow = {
  id: string;
  nombor_ahli: string | null;
  nama: string;
  generasi: string | null;
  no_telefon: string;
  status: MbmStatus;
  created_at: string;
};

export async function submitMbm(input: {
  nama: string;
  generasi: string;
  no_telefon: string;
  panelId: string;
}): Promise<void> {
  const { error } = await supabase.rpc('mbm_submit', {
    p_nama: input.nama,
    p_generasi: input.generasi,
    p_no_telefon: input.no_telefon,
    p_panel_id: input.panelId,
  });
  if (error) throw error;
}

export async function fetchMbmPanelOptions(): Promise<MbmPanelOption[]> {
  const { data, error } = await supabase.rpc('mbm_panel_options');
  if (error) throw error;
  return (data as MbmPanelOption[] | null) ?? [];
}

export async function fetchMbmPanels(): Promise<MbmPanel[]> {
  const { data, error } = await supabase.rpc('mbm_panel_list');
  if (error) throw error;
  return (data as MbmPanel[] | null) ?? [];
}

export async function addMbmPanel(memberId: string): Promise<void> {
  const { error } = await supabase.rpc('mbm_panel_add', { p_member: memberId });
  if (error) throw error;
}

export async function removeMbmPanel(id: string): Promise<void> {
  const { error } = await supabase.rpc('mbm_panel_remove', { p_id: id });
  if (error) throw error;
}

export function fetchMbmPanelInbox(): Promise<MbmPanelRow[]> {
  return fetchAllRpcRows<MbmPanelRow>('mbm_panel_inbox');
}

export async function setMbmPanelStatus(id: string, status: MbmStatus): Promise<void> {
  const { error } = await supabase.rpc('mbm_panel_set_status', { p_id: id, p_status: status });
  if (error) throw error;
}

export async function fetchMyMbmApplication(): Promise<MbmMyApplication | null> {
  const { data, error } = await supabase.rpc('mbm_my_application');
  if (error) throw error;
  return ((data as MbmMyApplication[] | null) ?? [])[0] ?? null;
}

export function mbmStatusLabel(status: MbmStatus): string {
  return status === 'selesai' ? 'Selesai' : 'Baharu';
}

const EXPORT_HEADER = ['Tarikh', 'Masa', 'Nombor Ahli', 'Nama', 'Generasi', 'No Telefon', 'Status'];

function exportSheet(rows: MbmPanelRow[]): ExportSheet {
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
        Status: mbmStatusLabel(row.status),
      };
    }),
  };
}

export type MbmExportResult = { rows: number; fileName: string; result: DeliveryResult };

/** Eksport permohonan yang memilih panel ini sahaja — pelayan hanya memulangkan baris panel itu. */
export async function downloadMbmExport(mode: DeliveryMode): Promise<MbmExportResult> {
  const rows = await fetchMbmPanelInbox();
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
