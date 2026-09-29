import { supabase } from './supabase';

/**
 * Statistik Kelengkapan Data Ahli — JABATAN DATA & SUMBER MANUSIA.
 *
 * Enam kategori (Data Peribadi, Pendidikan, Pekerjaan, Perniagaan, Keluarga,
 * Komitmen), setiap satu dikira "Siap" di pelayan sahaja — lihat
 * `20260929000075_member_data_completeness_v2.sql` untuk logik penuh setiap
 * kategori (termasuk medan bersyarat yang tidak dikira bila tidak relevan).
 *
 * Klien di sini HANYA memaparkan agregat; tiada baris ahli individu dibaca.
 */

export type CompletenessBucket = { peratus: number; jumlah: number };

export type MemberCompletenessSummary = {
  jumlah_ahli: number;
  /** ISO timestamp — `MAX(updated_at)` merentasi semua ahli, atau null jika tiada ahli. */
  kemaskini_terkini: string | null;
  mengikut_kategori: {
    data_peribadi: number;
    pendidikan: number;
    pekerjaan: number;
    perniagaan: number;
    keluarga: number;
    komitmen: number;
  };
  /** Tujuh baris tetap (100/83/67/50/33/17/0), tersusun menurun. */
  mengikut_bucket: CompletenessBucket[];
};

export async function fetchMemberCompletenessSummary(): Promise<MemberCompletenessSummary> {
  const { data, error } = await supabase.rpc('member_data_completeness_summary');
  if (error) throw error;
  if (!data) throw new Error('Statistik kelengkapan data tidak dapat dibaca.');
  return data as MemberCompletenessSummary;
}
