import * as XLSX from 'xlsx';

import type { Option } from '@/types/database';

import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { supabase } from './supabase';
import { deliverWorkbook } from './xlsx-download';

/**
 * Log Aktiviti Admin — bacaan sahaja.
 *
 * Tiada fungsi tulis di sini dengan sengaja: baris log hanya dicipta oleh
 * trigger pangkalan data dan Edge Function (migration
 * 20260915000043_admin_activity_log.sql). RLS membenarkan Owner sahaja
 * membacanya.
 */

export type AdminActivity = {
  id: string;
  /** `null` bila akaun pelaku sudah dipadam. */
  actor_id: string | null;
  /** Nama pada MASA tindakan — bukan nama semasa. */
  actor_name: string;
  action: string;
  /** Nama table sasaran, cth. `members`, `usrah_events`. */
  target_type: string;
  target_id: string | null;
  details: { label?: string; diubah?: string[]; [key: string]: unknown } | null;
  created_at: string;
};

export type ActivityCategory = 'ahli' | 'organisasi' | 'program' | 'kewangan';

const CATEGORY_TABLES: Record<ActivityCategory, string[]> = {
  ahli: ['members'],
  organisasi: ['departments', 'generations', 'admin_assignments', 'profiles', 'org_positions'],
  program: ['usrah_events', 'announcements', 'usrah_monthly_attendance'],
  kewangan: ['yuran_payments', 'pipis_contributions', 'adhoc_payment_types'],
};

export const ACTIVITY_CATEGORY_OPTIONS: Option<ActivityCategory>[] = [
  { value: 'ahli', label: 'Ahli & akaun' },
  { value: 'organisasi', label: 'Organisasi & admin' },
  { value: 'program', label: 'Program, usrah & pengumuman' },
  { value: 'kewangan', label: 'Yuran, PIPIS & pembayaran' },
];

export const TARGET_TYPE_LABEL: Record<string, string> = {
  members: 'Ahli',
  departments: 'Department',
  generations: 'Generasi',
  admin_assignments: 'Admin',
  profiles: 'Peranan',
  org_positions: 'Carta Organisasi',
  usrah_events: 'Program/Usrah',
  usrah_monthly_attendance: 'Kehadiran Usrah',
  announcements: 'Pengumuman',
  yuran_payments: 'Yuran',
  pipis_contributions: 'PIPIS',
  adhoc_payment_types: 'Pembayaran Adhoc',
};

export const ACTIVITY_PAGE_SIZE = 50;

/**
 * Satu halaman log, terkini dahulu.
 *
 * Carian dibuat di pelayan (bukan menapis halaman yang sudah dimuat) kerana
 * log hanya bertambah — padanan dari bulan lepas tidak patut bergantung pada
 * berapa kali "Muat lagi" ditekan.
 */
export async function fetchAdminActivity(params: {
  search: string;
  category: ActivityCategory | null;
  offset: number;
  /** Lalai `ACTIVITY_PAGE_SIZE` — eksport meminta halaman lebih besar. */
  pageSize?: number;
}): Promise<AdminActivity[]> {
  const size = params.pageSize ?? ACTIVITY_PAGE_SIZE;

  let query = supabase
    .from('admin_activity_log')
    .select('id, actor_id, actor_name, action, target_type, target_id, details, created_at')
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + size - 1);

  if (params.category) query = query.in('target_type', CATEGORY_TABLES[params.category]);

  // Aksara yang bermakna dalam sintaks penapis PostgREST dibuang, bukan dilepaskan.
  const term = params.search.replace(/[,()*%\\:"]/g, ' ').trim();
  if (term) {
    const pattern = '"*' + term + '*"';
    query = query.or(
      ['actor_name.ilike.' + pattern, 'action.ilike.' + pattern, 'details->>label.ilike.' + pattern].join(','),
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as AdminActivity[] | null) ?? [];
}

/**
 * Log sebagai .xlsx — mengikut carian dan kategori yang sedang dipapar.
 *
 * Fail mengambil tapisan yang SAMA seperti skrin, tetapi bukan halaman yang
 * sama: skrin memuat 50 baris setiap kali "Muat lagi" ditekan, manakala fail
 * mengambil keseluruhan hasil tapisan itu. Memuat turun "apa yang saya nampak"
 * dan mendapat separuh daripadanya ialah cara paling mudah untuk tersalah
 * percaya bahawa sesuatu tindakan tidak pernah berlaku.
 */
const EXPORT_PAGE_SIZE = 1000;

/** Had keras supaya log yang sudah bertahun tidak menarik seluruh table ke dalam ingatan telefon. */
const EXPORT_MAX_ROWS = 20000;

export async function fetchAdminActivityAll(params: {
  search: string;
  category: ActivityCategory | null;
}): Promise<AdminActivity[]> {
  const all: AdminActivity[] = [];

  for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += EXPORT_PAGE_SIZE) {
    const page = await fetchAdminActivity({ ...params, offset, pageSize: EXPORT_PAGE_SIZE });
    all.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) break;
  }

  return all;
}

/**
 * Medan yang diubah oleh satu tindakan, sebagai teks.
 *
 * Trigger audit menyimpannya sebagai array nama kolum dalam `details.diubah`.
 * Tindakan yang bukan kemas kini (cipta, padam) tiada senarai itu langsung.
 */
function changedFields(details: AdminActivity['details']): string {
  const changed = details?.diubah;
  return Array.isArray(changed) ? changed.join(', ') : '';
}

/** Label sasaran: nama table ditukar kepada istilah yang admin guna. */
function targetLabel(row: AdminActivity): string {
  const type = TARGET_TYPE_LABEL[row.target_type] ?? row.target_type;
  const label = typeof row.details?.label === 'string' ? row.details.label : null;
  return label ? type + ' — ' + label : type;
}

export async function downloadAdminActivityLog(
  params: { search: string; category: ActivityCategory | null },
  mode: DeliveryMode,
): Promise<{ rows: number; fileName: string; result: DeliveryResult }> {
  const rows = await fetchAdminActivityAll(params);
  if (!rows.length) throw new UserError('Tiada log aktiviti untuk tapisan ini.');

  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      'Nama Admin': row.actor_name,
      Tindakan: row.action,
      Sasaran: targetLabel(row),
      'Medan Diubah': changedFields(row.details),
      // Waktu tempatan peranti — log dibaca oleh orang yang berada di zon sama.
      'Tarikh & Masa': new Date(row.created_at).toLocaleString('ms-MY'),
    })),
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Log Aktiviti');

  const today = new Date();
  const stamp =
    today.getFullYear() +
    '-' +
    String(today.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(today.getDate()).padStart(2, '0');

  const fileName = 'log-aktiviti-admin-' + stamp + '.xlsx';
  const result = await deliverWorkbook(book, fileName, 'Log Aktiviti Admin', mode);

  return { rows: rows.length, fileName, result };
}
