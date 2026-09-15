import { supabase } from './supabase';

/**
 * Ahli yang lahir hari ini — daripada `birthday_today()`.
 *
 * Fungsi itu hanya memulangkan nama dan generasi; NRIC yang digunakan untuk
 * mengira tarikh lahir tidak pernah sampai ke app.
 */

export type BirthdayToday = { full_name: string; generasi: string | null };

export async function fetchBirthdaysToday(): Promise<BirthdayToday[]> {
  const { data, error } = await supabase.rpc('birthday_today');
  if (error) throw error;
  return (data as BirthdayToday[] | null) ?? [];
}

/**
 * Ahli yang sambut hari jadi pada bulan semasa — daripada `birthday_this_month()`.
 *
 * `tarikh_lahir` sudah siap dibaca ('15 September'); ia datang dari pangkalan
 * data dan bukan dibina di sini supaya "bulan semasa" dalam tajuk dan dalam
 * senarai sentiasa merujuk jam yang sama — waktu Malaysia, bukan jam peranti.
 */
export type BirthdayThisMonth = {
  full_name: string;
  generasi: string | null;
  hari: number;
  tarikh_lahir: string;
};

export async function fetchBirthdaysThisMonth(): Promise<BirthdayThisMonth[]> {
  const { data, error } = await supabase.rpc('birthday_this_month');
  if (error) throw error;
  return (data as BirthdayThisMonth[] | null) ?? [];
}
