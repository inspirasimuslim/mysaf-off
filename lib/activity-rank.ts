import { supabase } from './supabase';

/**
 * Markah dan kedudukan ahli itu SENDIRI — daripada `my_activity_rank()`.
 *
 * Fungsi RPC itu tidak menerima id ahli; ia menentukan ahli daripada sesi,
 * jadi tiada parameter di sini yang boleh ditukar untuk melihat markah orang
 * lain. Tempohnya lalai kepada tahun semasa mengikut waktu Malaysia, dibuat di
 * pangkalan data supaya "tahun ini" tidak bergantung pada jam peranti.
 */
export type MyActivityRank = {
  rank: number;
  total_ahli: number;
  total_score: number;
  yuran_lunas: boolean;
  pipis_sumbang: boolean;
  usrah_bulan: number;
  ada_jawatan_org: boolean;
  ada_jawatan_pas: boolean;
};

/**
 * `null` bermakna ahli ini tiada kedudukan untuk dipapar — akaun belum
 * dipautkan kepada rekod ahli. Itu keadaan biasa bagi akaun baharu, bukan
 * kegagalan, jadi ia dibezakan daripada ralat yang dilemparkan.
 */
export async function fetchMyActivityRank(): Promise<MyActivityRank | null> {
  const { data, error } = await supabase.rpc('my_activity_rank');
  if (error) throw error;

  const rows = (data as MyActivityRank[] | null) ?? [];
  return rows[0] ?? null;
}
