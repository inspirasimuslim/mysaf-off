import { supabase } from './supabase';

/**
 * Penarafan Ahli Paling Aktif & Generasi Terbaik — admin LAJNAH PEMBANGUNAN
 * GENERASI sahaja. Lihat `20260915000034_activity_ranking.sql`.
 *
 * Markah dikira sepenuhnya di pelayan (lima komponen, ditulis keras). Skrin
 * hanya memapar; ia tidak mengira semula apa-apa.
 */

export type MemberActivity = {
  member_id: string;
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  avatar_url: string | null;
  /** 0/1 — tiada tunggakan yuran pada tahun tarikh akhir. */
  yuran_lunas: number;
  /** 0/1 — ada sumbangan PIPIS dalam tempoh. */
  pipis_sumbang: number;
  /** Bilangan bulan hadir usrah dalam tempoh. */
  usrah_bulan: number;
  /** 0/1 — memegang jawatan dalam Carta Organisasi (status semasa). */
  ada_jawatan_org: number;
  /** 0/1 — memegang jawatan PAS (status semasa). */
  ada_jawatan_pas: number;
  total_score: number;
  /** Jumlah PIPIS dalam tempoh — pemecah seri, bukan sebahagian markah. */
  pipis_amount_period: number;
};

export type GenerationActivity = {
  /** NULL = ahli tanpa generasi. */
  generasi: string | null;
  jumlah_ahli_aktif: number;
  jumlah_ahli_generasi: number;
  peratus_aktif: number;
  jumlah_pipis_generasi: number;
};

export type ActivityRanking = {
  members: MemberActivity[];
  generations: GenerationActivity[];
  startDate: string;
  endDate: string;
  minScore: number;
};

/** PostgREST memulangkan `numeric` sebagai nombor atau rentetan — seragamkan. */
const num = (value: unknown): number => Number(value ?? 0);

export async function fetchActivityRanking(
  startDate: string,
  endDate: string,
  minScore: number,
): Promise<ActivityRanking> {
  const [members, generations] = await Promise.all([
    supabase.rpc('member_activity_score', { p_start_date: startDate, p_end_date: endDate }),
    supabase.rpc('generasi_terbaik', { p_start_date: startDate, p_end_date: endDate, p_min_score: minScore }),
  ]);

  if (members.error) throw members.error;
  if (generations.error) throw generations.error;

  return {
    members: ((members.data ?? []) as MemberActivity[]).map((row) => ({
      ...row,
      yuran_lunas: num(row.yuran_lunas),
      pipis_sumbang: num(row.pipis_sumbang),
      usrah_bulan: num(row.usrah_bulan),
      ada_jawatan_org: num(row.ada_jawatan_org),
      ada_jawatan_pas: num(row.ada_jawatan_pas),
      total_score: num(row.total_score),
      pipis_amount_period: num(row.pipis_amount_period),
    })),
    generations: ((generations.data ?? []) as GenerationActivity[]).map((row) => ({
      ...row,
      jumlah_ahli_aktif: num(row.jumlah_ahli_aktif),
      jumlah_ahli_generasi: num(row.jumlah_ahli_generasi),
      peratus_aktif: num(row.peratus_aktif),
      jumlah_pipis_generasi: num(row.jumlah_pipis_generasi),
    })),
    startDate,
    endDate,
    minScore,
  };
}

/**
 * Markah tertinggi yang mungkin dalam tempoh: empat komponen 0/1 (yuran, PIPIS,
 * jawatan organisasi, jawatan PAS) + satu markah bagi setiap bulan usrah.
 */
export function maxPossibleScore(startDate: string, endDate: string): number {
  const [sy, sm] = startDate.split('-').map(Number);
  const [ey, em] = endDate.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return 4;
  return 4 + Math.max(0, ey * 12 + em - (sy * 12 + sm) + 1);
}

/** 1234.5 → 'RM1,234.50'; nombor bulat tanpa perpuluhan. */
export function ringgit(value: number): string {
  return (
    'RM' +
    value.toLocaleString('en-MY', {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}
