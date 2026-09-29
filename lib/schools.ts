import type { School } from '@/types/database';

import { supabase } from './supabase';

/**
 * Operasi pangkalan data untuk senarai `schools`.
 *
 * Sama corak `fetchGenerations`/`createGeneration`/... dalam `lib/members.ts`
 * — RLS pada `schools` (baca terbuka, tulis Super Admin sahaja) yang
 * menentukan siapa boleh buat apa, lihat `20260929000077_pendidikan_rombak.sql`.
 */

/** Untuk dropdown borang ahli — hanya sekolah `aktif`. */
export async function fetchActiveSchools(): Promise<School[]> {
  const { data, error } = await supabase.from('schools').select('id, nama, aktif').eq('aktif', true).order('nama');
  if (error) throw error;
  return (data as School[] | null) ?? [];
}

/** Untuk skrin admin — termasuk sekolah nonaktif, admin perlu melihat kesemuanya. */
export async function fetchAllSchools(): Promise<School[]> {
  const { data, error } = await supabase.from('schools').select('id, nama, aktif').order('nama');
  if (error) throw error;
  return (data as School[] | null) ?? [];
}

export async function createSchool(nama: string): Promise<void> {
  const { error } = await supabase.from('schools').insert({ nama: nama.trim() });
  if (error) throw error;
}

export async function updateSchoolName(id: string, nama: string): Promise<void> {
  const { error } = await supabase.from('schools').update({ nama: nama.trim() }).eq('id', id);
  if (error) throw error;
}

export async function setSchoolActive(id: string, aktif: boolean): Promise<void> {
  const { error } = await supabase.from('schools').update({ aktif }).eq('id', id);
  if (error) throw error;
}

/**
 * Padam terus. `members.sekolah_id` guna `on delete restrict` (sama corak
 * `members.generasi`) — pangkalan data SENDIRI menolak pemadaman sekolah
 * yang masih dirujuk mana-mana ahli. Skrin admin sepatutnya guna
 * `setSchoolActive(id, false)` untuk kes itu (ikut corak `deleteGeneration`
 * dalam `lib/members.ts` — tukar ralat kekangan kepada mesej BM yang jelas).
 */
export async function deleteSchool(id: string): Promise<void> {
  const { error } = await supabase.from('schools').delete().eq('id', id);
  if (error) throw error;
}
