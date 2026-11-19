import { supabase } from './supabase';

/** Had baris setiap permintaan PostgREST (`max_rows` dalam supabase/config.toml). */
const PAGE_SIZE = 1000;

/** Pengaman supaya gelung tidak berjalan selama-lamanya jika pelayan tidak pernah memulangkan halaman pendek. */
const MAX_PAGES = 200;

/**
 * Panggil RPC yang memulangkan senarai dan ambil SEMUA baris, halaman demi halaman.
 *
 * Tanpa ini, PostgREST memotong hasil secara senyap pada 1000 baris — laporan yang
 * satu baris setiap ahli setiap bulan (cth. kehadiran usrah) hanya mendapat ~140
 * ahli yang pertama, tanpa sebarang ralat. RPC mesti mempunyai `order by` yang
 * stabil supaya halaman tidak bertindih atau tertinggal.
 */
export async function rpcAll<T>(fn: string, args?: Record<string, unknown>): Promise<T[]> {
  const all: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase.rpc(fn, args).range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const rows = (data as T[] | null) ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }

  return all;
}
