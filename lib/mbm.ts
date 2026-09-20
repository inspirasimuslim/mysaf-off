import type { MbmCouple } from '@/types/database';

import { supabase } from './supabase';

/**
 * Senarai pasangan Ahli MBM — daripada `list_mbm_couples()`.
 *
 * Hanya pasangan yang KEDUA-DUA belah `spouse_member_id` terpaut dua hala
 * dipulangkan; field lain pada `members` (NRIC, alamat, dll) tidak didedah.
 */
export async function fetchMbmCouples(): Promise<MbmCouple[]> {
  const { data, error } = await supabase.rpc('list_mbm_couples');
  if (error) throw error;
  return (data as MbmCouple[] | null) ?? [];
}
