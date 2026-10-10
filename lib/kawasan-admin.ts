import { supabase } from './supabase';

/**
 * Admin Usrah Kawasan (`usrah_kawasan_admins`, migration 147).
 *
 * Satu kawasan boleh ada beberapa admin; setiap admin hanya menyunting kawasan
 * yang dilantikkan kepadanya. Pelantikan hanya oleh Super Admin / admin LAJNAH
 * TARBIAH — RPC menolak orang lain, jadi tiada semakan kebenaran diulang di sini.
 */
export type KawasanAdmin = {
  id: string;
  kawasan_usrah: string;
  member_id: string;
  full_name: string;
  generasi: string | null;
};

export async function fetchKawasanAdmins(): Promise<KawasanAdmin[]> {
  const { data, error } = await supabase.rpc('list_usrah_kawasan_admins');
  if (error) throw error;
  return (data as KawasanAdmin[] | null) ?? [];
}

export async function addKawasanAdmin(kawasan: string, memberId: string): Promise<void> {
  const { error } = await supabase.rpc('add_usrah_kawasan_admin', { p_kawasan: kawasan, p_member_id: memberId });
  if (error) throw error;
}

export async function removeKawasanAdmin(id: string): Promise<void> {
  const { error } = await supabase.rpc('remove_usrah_kawasan_admin', { p_id: id });
  if (error) throw error;
}
