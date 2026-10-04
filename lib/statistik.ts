import { useCallback, useEffect, useRef, useState } from 'react';

import { toMalayError } from './errors';
import { supabase } from './supabase';

/**
 * Dashboard Statistik — semua kiraan dibuat oleh RPC `stat_*` di pangkalan
 * data (lihat 20260929000071_statistik_dashboards.sql). Klien hanya memaparkan;
 * ia tidak pernah menarik baris individu ahli untuk dikira di sini.
 */

export type StatRpc = 'stat_tarbiah' | 'stat_perkaderan' | 'stat_pipis' | 'stat_yuran';

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type AttendanceCell = { bulan: number; hadir: number; direkod: number; peratus: number | null };

export type TarbiahStat = {
  years: number[];
  jumlah_ahli: number;
  kawasan_bulanan: (AttendanceCell & { kawasan: string })[];
  semua_bulanan: AttendanceCell[];
  generasi_bulanan: (AttendanceCell & { generasi: string })[];
  kawasan_tahunan: { kawasan: string; hadir: number; direkod: number; peratus: number | null }[];
  generasi_tahunan: { generasi: string; hadir: number; direkod: number; peratus: number | null }[];
  kawasan_ahli: { label: string; count: number }[];
  /** Diminta 2026-10-04 — pemantauan Kumpulan Usrah (`kumpulan_usrah`), bukan kehadiran. */
  kumpulan_usrah: { kawasan: string; nama: string; jumlah_ahli: number; naqib: string[] }[];
  kumpulan_usrah_liputan: { kawasan: string; jumlah_ahli: number; ahli_berkumpulan: number; jumlah_kumpulan: number }[];
};

export type PerkaderanStat = {
  years: number[];
  jumlah_naqib: number;
  jumlah_sesi: number;
  sesi_bulanan: { bulan: number; sesi: number }[];
  sekolah: {
    sekolah: string;
    bilangan_naqib: number;
    naqib: { nama: string; kumpulan: string | null; mad_u: number }[];
  }[];
};

export type PipisStat = {
  years: number[];
  bulanan: { bulan: number; jumlah: number }[];
  jumlah_tahun: number;
  generasi: { generasi: string; ahli: number; jumlah: number; baki: number }[];
  ringkasan: {
    jumlah_ahli: number;
    sasaran_seorang: number;
    sasaran_jumlah: number;
    terkumpul: number;
    baki: number;
    ahli_cukup: number;
  };
};

export type YuranStat = {
  years: number[];
  bulanan: { bulan: number; jumlah: number }[];
  jumlah_kutipan_tahun: number;
  tunggakan: { jumlah: number; ahli_tertunggak: number; jumlah_ahli: number };
  tunggakan_generasi: { generasi: string; tunggak: number; ahli_tertunggak: number }[];
};

export async function fetchStat<T>(rpc: StatRpc, year: number): Promise<T> {
  const { data, error } = await supabase.rpc(rpc, { p_year: year });
  if (error) throw error;
  if (!data) throw new Error('Statistik tidak dapat dibaca.');
  return data as T;
}

/** Nombor daripada JSON (medan `numeric` boleh tiba sebagai rentetan). */
export const toStatNumber = num;

/**
 * Muat satu dashboard mengikut tahun. Data lama kekal dipapar semasa tahun
 * lain dimuat supaya pemilih tahun tidak berkelip hilang.
 */
export function useStat<T>(rpc: StatRpc, enabled: boolean) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchStat<T>(rpc, year);
      if (id === request.current) setData(next);
    } catch (caught) {
      if (id === request.current) setError(toMalayError(caught, 'Gagal memuatkan statistik.'));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [rpc, year]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return { year, setYear, data, loading, error, reload: load };
}
