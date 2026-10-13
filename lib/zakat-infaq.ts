import * as XLSX from 'xlsx';

import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { appendExportSheet, fetchAllRpcRows } from './member-export';
import type { ExportSheet } from './member-export-sheets';
import { supabase } from './supabase';
import { toNumberOrNull, type GatewayStatus } from './toyyibpay';
import { deliverWorkbook } from './xlsx-download';

/**
 * Infaq Tabung Zakat (migration 154) — bayaran online ToyyibPay, tiada sasaran.
 * Ahli hanya melihat sejarah bayarannya sendiri (RLS); admin TABUNG ZAKAT melihat semua
 * melalui RPC `zakat_infaq_admin_*`. Status ditentukan pelayan sahaja.
 */

export type ZakatInfaqRow = {
  id: string;
  amount: number;
  requested_amount: number | null;
  method: string;
  status: GatewayStatus;
  gateway_reference: string | null;
  note: string | null;
  created_at: string;
};

export type ZakatInfaqSummary = { jumlah: number; bilangan: number };

export function ringgitInfaq(value: number): string {
  return 'RM' + value.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toRow(raw: Record<string, unknown>): ZakatInfaqRow {
  return {
    id: String(raw.id),
    amount: toNumberOrNull(raw.amount) ?? 0,
    requested_amount: toNumberOrNull(raw.requested_amount),
    method: String(raw.method ?? 'gateway'),
    status: raw.status as GatewayStatus,
    gateway_reference: (raw.gateway_reference as string | null) ?? null,
    note: (raw.note as string | null) ?? null,
    created_at: String(raw.created_at),
  };
}

/** Sejarah infaq ahli sendiri, terbaharu dahulu. */
export async function fetchZakatInfaqHistory(memberId: string): Promise<ZakatInfaqRow[]> {
  const { data, error } = await supabase
    .from('zakat_infaq')
    .select('id, amount, requested_amount, method, status, gateway_reference, note, created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map(toRow);
}

/** Jumlah infaq berjaya ahli sendiri (dikira daripada sejarah — hanya status 'success'). */
export function summarizeZakatInfaq(rows: ZakatInfaqRow[]): ZakatInfaqSummary {
  const paid = rows.filter((row) => row.status === 'success');
  return { jumlah: paid.reduce((sum, row) => sum + row.amount, 0), bilangan: paid.length };
}

export async function fetchMyZakatInfaqSummary(memberId: string): Promise<ZakatInfaqSummary> {
  return summarizeZakatInfaq(await fetchZakatInfaqHistory(memberId));
}

// --- Admin (TABUNG ZAKAT) ---------------------------------------------------

export type ZakatInfaqAdminRow = {
  id: string;
  created_at: string;
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  amount: number;
  requested_amount: number | null;
  status: GatewayStatus;
  note: string | null;
  gateway_reference: string | null;
};

export type ZakatInfaqAdminSummary = { jumlah: number; bilangan: number; penderma: number; belum_selesai: number };

function toAdminRow(raw: ZakatInfaqAdminRow): ZakatInfaqAdminRow {
  return { ...raw, amount: toNumberOrNull(raw.amount) ?? 0, requested_amount: toNumberOrNull(raw.requested_amount) };
}

export async function fetchZakatInfaqAdminRows(): Promise<ZakatInfaqAdminRow[]> {
  const rows = await fetchAllRpcRows<ZakatInfaqAdminRow>('zakat_infaq_admin_list');
  return rows.map(toAdminRow);
}

export async function fetchZakatInfaqAdminSummary(): Promise<ZakatInfaqAdminSummary> {
  const { data, error } = await supabase.rpc('zakat_infaq_admin_summary');
  if (error) throw error;
  const row = (data as Record<string, unknown>[] | null)?.[0];
  return {
    jumlah: toNumberOrNull(row?.jumlah) ?? 0,
    bilangan: Number(row?.bilangan ?? 0),
    penderma: Number(row?.penderma ?? 0),
    belum_selesai: Number(row?.belum_selesai ?? 0),
  };
}

export function infaqStatusLabel(status: GatewayStatus): string {
  if (status === 'pending') return 'Sedang diproses';
  if (status === 'failed') return 'Tidak berjaya';
  return 'Berjaya';
}

const EXPORT_HEADER = [
  'Tarikh',
  'Masa',
  'Nombor Ahli',
  'Nama',
  'Generasi',
  'Amaun (RM)',
  'Status',
  'Rujukan',
  'Nota',
];

function exportSheet(rows: ZakatInfaqAdminRow[]): ExportSheet {
  return {
    name: 'Infaq Tabung Zakat',
    header: EXPORT_HEADER,
    rows: rows.map((row) => {
      const date = new Date(row.created_at);
      return {
        Tarikh: date.toLocaleDateString('en-GB'),
        Masa: date.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' }),
        'Nombor Ahli': row.nombor_ahli ?? '',
        Nama: row.full_name,
        Generasi: row.generasi ?? '',
        // Amaun bayaran yang belum/tidak berjaya ialah 0 — papar amaun diminta dalam nota status.
        'Amaun (RM)': row.status === 'success' ? row.amount : (row.requested_amount ?? 0),
        Status: infaqStatusLabel(row.status),
        Rujukan: row.gateway_reference ?? '',
        Nota: row.note ?? '',
      };
    }),
  };
}

export type ZakatInfaqExportResult = { rows: number; fileName: string; result: DeliveryResult };

/** Eksport SEMUA rekod infaq (semua status) ke Excel — pelayan menyemak kebenaran admin TABUNG ZAKAT. */
export async function downloadZakatInfaqExport(mode: DeliveryMode): Promise<ZakatInfaqExportResult> {
  const rows = await fetchZakatInfaqAdminRows();
  if (!rows.length) throw new UserError('Tiada rekod infaq untuk dieksport.');

  const book = XLSX.utils.book_new();
  appendExportSheet(book, exportSheet(rows));

  const today = new Date();
  const stamp =
    today.getFullYear() +
    '-' +
    String(today.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(today.getDate()).padStart(2, '0');
  const fileName = 'infaq-tabung-zakat-' + stamp + '.xlsx';

  const result = await deliverWorkbook(book, fileName, 'Infaq Tabung Zakat', mode);
  return { rows: rows.length, fileName, result };
}
