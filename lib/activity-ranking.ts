import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { supabase } from './supabase';
import { deliverWorkbook } from './xlsx-download';

/**
 * Penarafan Ahli dan Generasi — admin LAJNAH PEMBANGUNAN GENERASI sahaja.
 * Lihat `20260915000034_activity_ranking.sql` dan `…035_activity_ranking_v2.sql`.
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
  /** SUM total_score semua ahli generasi — metrik kedudukan. */
  jumlah_markah_generasi: number;
  jumlah_ahli_generasi: number;
  /** Konteks: generasi besar semula jadi mendapat jumlah lebih tinggi. */
  purata_markah: number;
  /** Pemecah seri. */
  jumlah_pipis_generasi: number;
};

export type ActivityRanking = {
  members: MemberActivity[];
  generations: GenerationActivity[];
  startDate: string;
  endDate: string;
};

export type InactiveList = {
  members: MemberActivity[];
  startDate: string;
  endDate: string;
  maxScore: number;
};

/** PostgREST memulangkan `numeric` sebagai nombor atau rentetan — seragamkan. */
const num = (value: unknown): number => Number(value ?? 0);

function normalizeMember(row: MemberActivity): MemberActivity {
  return {
    ...row,
    yuran_lunas: num(row.yuran_lunas),
    pipis_sumbang: num(row.pipis_sumbang),
    usrah_bulan: num(row.usrah_bulan),
    ada_jawatan_org: num(row.ada_jawatan_org),
    ada_jawatan_pas: num(row.ada_jawatan_pas),
    total_score: num(row.total_score),
    pipis_amount_period: num(row.pipis_amount_period),
  };
}

export async function fetchActivityRanking(startDate: string, endDate: string): Promise<ActivityRanking> {
  const [members, generations] = await Promise.all([
    supabase.rpc('member_activity_score', { p_start_date: startDate, p_end_date: endDate }),
    supabase.rpc('generasi_terbaik', { p_start_date: startDate, p_end_date: endDate }),
  ]);

  if (members.error) throw members.error;
  if (generations.error) throw generations.error;

  return {
    members: ((members.data ?? []) as MemberActivity[]).map(normalizeMember),
    generations: ((generations.data ?? []) as GenerationActivity[]).map((row) => ({
      ...row,
      jumlah_markah_generasi: num(row.jumlah_markah_generasi),
      jumlah_ahli_generasi: num(row.jumlah_ahli_generasi),
      purata_markah: num(row.purata_markah),
      jumlah_pipis_generasi: num(row.jumlah_pipis_generasi),
    })),
    startDate,
    endDate,
  };
}

/**
 * Ahli dengan total_score ≤ `maxScore`, markah paling rendah dahulu.
 *
 * Tapisan di pelayan (`p_max_score`); susunan menaik di sini — RPC kekal
 * menyusun menurun supaya penarafan penuh tidak berubah.
 */
export async function fetchInactiveMembers(startDate: string, endDate: string, maxScore: number): Promise<InactiveList> {
  const { data, error } = await supabase.rpc('member_activity_score', {
    p_start_date: startDate,
    p_end_date: endDate,
    p_max_score: maxScore,
  });
  if (error) throw error;

  const members = ((data ?? []) as MemberActivity[])
    .map(normalizeMember)
    .sort((a, b) => a.total_score - b.total_score || a.full_name.localeCompare(b.full_name, 'ms', { sensitivity: 'base' }));

  return { members, startDate, endDate, maxScore };
}

const yaTidak = (value: number): string => (value > 0 ? 'Ya' : 'Tidak');

/** Senarai Ahli Paling Tidak Aktif yang DIPAPAR, sebagai .xlsx. */
export async function downloadInactiveMembers(
  list: InactiveList,
  mode: DeliveryMode,
): Promise<{ rows: number; fileName: string; result: DeliveryResult }> {
  if (!list.members.length) throw new UserError('Tiada ahli dalam senarai untuk dimuat turun.');

  const sheet = XLSX.utils.json_to_sheet(
    list.members.map((row) => ({
      'Nombor Ahli': row.nombor_ahli ?? '',
      Nama: row.full_name,
      Generasi: row.generasi ? generationLabel(row.generasi) : 'Tanpa generasi',
      Markah: row.total_score,
      'Yuran Lunas': yaTidak(row.yuran_lunas),
      'Sumbang PIPIS': yaTidak(row.pipis_sumbang),
      'Bulan Usrah': row.usrah_bulan,
      'Jawatan Organisasi': yaTidak(row.ada_jawatan_org),
      'Jawatan PAS': yaTidak(row.ada_jawatan_pas),
      'Jumlah PIPIS Tempoh (RM)': row.pipis_amount_period,
    })),
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Tidak Aktif');

  const fileName = 'ahli-tidak-aktif-' + list.startDate + '-hingga-' + list.endDate + '.xlsx';
  const result = await deliverWorkbook(book, fileName, 'Ahli Paling Tidak Aktif', mode);

  return { rows: list.members.length, fileName, result };
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

/** Penarafan Generasi yang DIPAPAR, sebagai .xlsx. */
export async function downloadGenerationRanking(
  ranking: ActivityRanking,
  mode: DeliveryMode,
): Promise<{ rows: number; fileName: string; result: DeliveryResult }> {
  if (!ranking.generations.length) throw new UserError('Tiada generasi dalam penarafan untuk dimuat turun.');

  /*
    Kedudukan dikira MENGIKUT susunan pulangan RPC (markah menurun, seri
    dipecahkan oleh jumlah PIPIS) dan bukan dikira semula di sini — dua tempat
    yang menyusun perkara sama ialah dua tempat yang boleh tidak bersetuju.
  */
  const sheet = XLSX.utils.json_to_sheet(
    ranking.generations.map((row, index) => ({
      Kedudukan: index + 1,
      Generasi: row.generasi ? generationLabel(row.generasi) : 'Tanpa generasi',
      'Kod Generasi': row.generasi ?? '',
      'Jumlah Markah': row.jumlah_markah_generasi,
      'Bilangan Ahli': row.jumlah_ahli_generasi,
      'Purata Markah': row.purata_markah,
      'Jumlah PIPIS (RM)': row.jumlah_pipis_generasi,
    })),
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Penarafan Generasi');

  const fileName = 'penarafan-generasi-' + ranking.startDate + '-hingga-' + ranking.endDate + '.xlsx';
  const result = await deliverWorkbook(book, fileName, 'Penarafan Generasi', mode);

  return { rows: ranking.generations.length, fileName, result };
}
