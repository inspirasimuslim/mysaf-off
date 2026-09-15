import type { Ionicons } from '@expo/vector-icons';

import type { Option } from '@/types/database';

import { supabase } from './supabase';

/**
 * Log Aktiviti Admin — bacaan sahaja.
 *
 * Tiada fungsi tulis di sini dengan sengaja: baris log hanya dicipta oleh
 * trigger pangkalan data dan Edge Function (migration
 * 20260915000043_admin_activity_log.sql). RLS membenarkan Super Admin sahaja
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
  program: ['usrah_events', 'announcements'],
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
  announcements: 'Pengumuman',
  yuran_payments: 'Yuran',
  pipis_contributions: 'PIPIS',
  adhoc_payment_types: 'Pembayaran Adhoc',
};

export const TARGET_TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  members: 'person-outline',
  departments: 'business-outline',
  generations: 'layers-outline',
  admin_assignments: 'shield-outline',
  profiles: 'shield-checkmark-outline',
  org_positions: 'git-network-outline',
  usrah_events: 'calendar-outline',
  announcements: 'megaphone-outline',
  yuran_payments: 'wallet-outline',
  pipis_contributions: 'wallet-outline',
  adhoc_payment_types: 'qr-code-outline',
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
}): Promise<AdminActivity[]> {
  let query = supabase
    .from('admin_activity_log')
    .select('id, actor_id, actor_name, action, target_type, target_id, details, created_at')
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + ACTIVITY_PAGE_SIZE - 1);

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
