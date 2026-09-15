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
