import { supabase } from './supabase';

/**
 * Rumusan keseluruhan ahli — kiraan agregat daripada `member_statistics()`.
 *
 * Tiada baris individu dalam jawapan ini; skrin Rumusan boleh dibuka oleh
 * setiap ahli yang aktif. Lihat `20260913000020_member_statistics.sql`.
 */

export type StatSlice = { label: string; count: number };

export type MemberStatistics = {
  total_ahli: number;
  ikut_jantina: StatSlice[];
  /** Label ialah kod generasi ('i01'), dalam urutan numerik, termasuk yang tiada ahli. */
  ikut_generasi: StatSlice[];
  ikut_sekolah: StatSlice[];
  /** Label ialah kod kawasan ('UPT') atau 'Tiada Rekod'. */
  ikut_kawasan_usrah: StatSlice[];
  ikut_status_pekerjaan: StatSlice[];
  ikut_status_perkahwinan: StatSlice[];
  /** Anggaran daripada teks alamat — lihat komen dalam migration. */
  ikut_negeri: StatSlice[];
  dijana_pada: string;
};

/**
 * Kategori "tiada data". Dipapar kelabu dan diletak paling akhir: ia bukan
 * kategori sebenar, dan mewarnakannya seperti kategori lain membuatkan pembaca
 * menyangka ia satu kumpulan ahli.
 */
export const NO_RECORD_LABELS: ReadonlySet<string> = new Set([
  'Tiada Rekod',
  'Lain-lain / Tiada Rekod',
  'Tidak Dapat Dikenal Pasti',
]);

export function isNoRecord(label: string): boolean {
  return NO_RECORD_LABELS.has(label);
}

export async function fetchMemberStatistics(): Promise<MemberStatistics> {
  const { data, error } = await supabase.rpc('member_statistics');
  if (error) throw error;
  if (!data) throw new Error('Rumusan ahli tidak dapat dibaca.');
  const stats = data as MemberStatistics;
  return { ...stats, ikut_status_perkahwinan: foldPernahBerkahwin(stats.ikut_status_perkahwinan) };
}

/**
 * Rumusan dibuka oleh SEMUA ahli, jadi "Pernah Berkahwin" tidak dipaparkan —
 * kiraannya digabung ke "Berkahwin". Pembezaan itu untuk rujukan admin sahaja
 * (borang ahli / skrin admin), bukan untuk ahli biasa. Dilakukan di sini, bukan
 * dalam SQL, supaya ia berkesan serta-merta tanpa bergantung pada versi fungsi
 * pangkalan data.
 */
function foldPernahBerkahwin(slices: StatSlice[]): StatSlice[] {
  const pernah = slices.find((slice) => slice.label === 'Pernah Berkahwin');
  if (!pernah) return slices;
  return slices
    .filter((slice) => slice !== pernah)
    .map((slice) => (slice.label === 'Berkahwin' ? { ...slice, count: slice.count + pernah.count } : slice));
}
