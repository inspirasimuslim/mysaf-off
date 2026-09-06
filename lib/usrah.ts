import { supabase } from './supabase';
import type { UsrahMatch } from './usrah-import';

/**
 * Operasi pangkalan data untuk kehadiran usrah bulanan.
 *
 * Sama seperti `lib/members.ts`: setiap fungsi melontar ralat mentah Supabase
 * dan tidak menyemak peranan sendiri. RLS pada `usrah_monthly_attendance` yang
 * menentukan baris mana boleh dibaca atau ditulis — lihat
 * `20260906000008_usrah_monthly_attendance.sql`.
 */

/** Baris ditulis dalam kelompok supaya satu import setahun tidak menjadi satu permintaan gergasi. */
const UPSERT_CHUNK = 500;

/** 12 nilai, Januari → Disember. `null` bermakna belum ada rekod. */
export type UsrahYear = (boolean | null)[];

export type UsrahImportProgress = { done: number; total: number };

type AttendanceRow = {
  member_id: string;
  year: number;
  month: number;
  attended: boolean | null;
};

export function emptyUsrahYear(): UsrahYear {
  return Array.from({ length: 12 }, () => null);
}

/**
 * Kehadiran seorang ahli bagi satu tahun, sentiasa sebagai 12 nilai.
 *
 * Bentuk tetap 12 dipilih supaya pemanggil tidak perlu tahu bulan mana yang
 * ada baris dan mana yang tiada — ketiadaan baris dan `attended` NULL
 * bermaksud perkara yang sama kepada pembaca.
 */
export async function fetchUsrahYear(memberId: string, year: number): Promise<UsrahYear> {
  const { data, error } = await supabase
    .from('usrah_monthly_attendance')
    .select('month, attended')
    .eq('member_id', memberId)
    .eq('year', year);

  if (error) throw error;

  const months = emptyUsrahYear();
  ((data as { month: number; attended: boolean | null }[] | null) ?? []).forEach((row) => {
    if (row.month >= 1 && row.month <= 12) months[row.month - 1] = row.attended;
  });

  return months;
}

/**
 * Tulis kehadiran setahun bagi setiap ahli yang dipadankan.
 *
 * Kesemua 12 bulan ditulis, termasuk yang `null`. Import yang hanya menulis
 * bulan berisi akan meninggalkan nilai lama bagi bulan yang dikosongkan dalam
 * fail baharu — dengan menulis kesemuanya, fail yang diimport sentiasa menjadi
 * gambaran muktamad bagi tahun itu.
 *
 * `onConflict` pada (member_id, year, month) yang menjadikan import berulang
 * satu kemas kini, bukan pendua.
 */
export async function importUsrahAttendance(
  matched: UsrahMatch[],
  year: number,
  onProgress?: (progress: UsrahImportProgress) => void,
): Promise<number> {
  const rows: AttendanceRow[] = [];

  matched.forEach((match) => {
    match.months.forEach((attended, index) => {
      rows.push({ member_id: match.memberId, year, month: index + 1, attended });
    });
  });

  let done = 0;

  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK);

    const { error } = await supabase
      .from('usrah_monthly_attendance')
      .upsert(chunk, { onConflict: 'member_id,year,month' });
    if (error) throw error;

    done += chunk.length;
    onProgress?.({ done, total: rows.length });
  }

  return done;
}
