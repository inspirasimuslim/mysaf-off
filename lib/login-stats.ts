import { supabase } from './supabase';

/**
 * Statistik Log Masuk — JABATAN DATA & SUMBER MANUSIA.
 *
 * Semua kiraan dibuat di pelayan (`login_stats_*`, `login_period_members`,
 * `login_last_seen` — lihat `20261019000161_login_events.sql`); klien hanya memaparkan.
 * "Log masuk" = sesi baharu; membuka app dengan sesi tersimpan tidak dikira.
 * Hari/minggu/bulan dikira mengikut waktu Malaysia.
 */

export type LoginPeriod = 'harian' | 'mingguan' | 'bulanan' | 'tahunan';

export type LoginSummary = {
  jumlah_ahli: number;
  hari_ini: number;
  tujuh_hari: number;
  tiga_puluh_hari: number;
  belum_pernah: number;
  tahun_terawal: number;
};

/** Satu bucket siri masa. `kunci` = tarikh mula bucket (YYYY-MM-DD). */
export type LoginBucket = { kunci: string; log_masuk: number; ahli: number };

export type PeriodMember = {
  member_id: string;
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  kali: number;
  pertama: string;
  terakhir: string;
};

export type LastSeenRow = {
  member_id: string;
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  terakhir: string | null;
  kali_30: number;
};

export type LastSeenFilter = 'semua' | 'belum' | 'tidak_aktif_30';

export async function fetchLoginSummary(): Promise<LoginSummary> {
  const { data, error } = await supabase.rpc('login_stats_summary');
  if (error) throw error;
  if (!data) throw new Error('Ringkasan log masuk tidak dapat dibaca.');
  return data as LoginSummary;
}

export async function fetchLoginSeries(period: LoginPeriod, year: number, month: number): Promise<LoginBucket[]> {
  const { data, error } = await supabase.rpc('login_stats_series', {
    p_period: period,
    p_year: year,
    p_month: month,
  });
  if (error) throw error;
  return (data ?? []) as LoginBucket[];
}

export async function fetchPeriodMembers(from: string, to: string): Promise<PeriodMember[]> {
  const { data, error } = await supabase.rpc('login_period_members', { p_from: from, p_to: to });
  if (error) throw error;
  return (data ?? []) as PeriodMember[];
}

export async function fetchLastSeen(
  search: string,
  filter: LastSeenFilter,
  limit: number,
  offset: number,
): Promise<{ jumlah: number; baris: LastSeenRow[] }> {
  const { data, error } = await supabase.rpc('login_last_seen', {
    p_search: search.trim() || null,
    p_tapis: filter,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? { jumlah: 0, baris: [] }) as { jumlah: number; baris: LastSeenRow[] };
}

// -----------------------------------------------------------------------------
// Tarikh (rentetan YYYY-MM-DD; dikira dalam UTC supaya tidak terjejas zon waktu peranti)
// -----------------------------------------------------------------------------

const MONTHS_FULL = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
const DAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];

function parse(key: string): Date {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function short(date: Date): string {
  return date.getUTCDate() + ' ' + MONTHS_SHORT[date.getUTCMonth()];
}

/** Julat tarikh (termasuk hujung) yang diwakili oleh satu bucket. */
export function bucketRange(period: LoginPeriod, key: string): { from: string; to: string } {
  const start = parse(key);
  switch (period) {
    case 'harian':
      return { from: key, to: key };
    case 'mingguan':
      return { from: key, to: iso(new Date(start.getTime() + 6 * 86_400_000)) };
    case 'bulanan':
      return { from: key, to: iso(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0))) };
    case 'tahunan':
      return { from: key, to: start.getUTCFullYear() + '-12-31' };
  }
}

/** Label pendek paksi-X. */
export function bucketLabel(period: LoginPeriod, key: string): string {
  const date = parse(key);
  switch (period) {
    case 'harian':
      return String(date.getUTCDate());
    case 'mingguan':
      return date.getUTCDate() + '/' + (date.getUTCMonth() + 1);
    case 'bulanan':
      return MONTHS_SHORT[date.getUTCMonth()] ?? '';
    case 'tahunan':
      return String(date.getUTCFullYear());
  }
}

/** Tajuk penuh bucket untuk baris maklumat carta dan tajuk senarai. */
export function bucketTitle(period: LoginPeriod, key: string): string {
  const date = parse(key);
  switch (period) {
    case 'harian':
      return (DAYS[date.getUTCDay()] ?? '') + ', ' + short(date) + ' ' + date.getUTCFullYear();
    case 'mingguan': {
      const end = new Date(date.getTime() + 6 * 86_400_000);
      return 'Minggu ' + short(date) + ' – ' + short(end) + ' ' + end.getUTCFullYear();
    }
    case 'bulanan':
      return MONTHS_FULL[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
    case 'tahunan':
      return 'Tahun ' + date.getUTCFullYear();
  }
}

/** Jam sahaja, contoh "11:14 AM" (waktu peranti) — untuk senarai harian. */
export function formatClock(isoTime: string): string {
  const d = new Date(isoTime);
  const h = d.getHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
