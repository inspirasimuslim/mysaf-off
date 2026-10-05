import { supabase } from './supabase';

/**
 * Senarai Ahli Diputihkan — rekod SEJARAH ahli yang dibuang secara rasmi.
 *
 * BERDIRI SENDIRI (nama sebagai teks, bukan `member_id`): orang yang
 * disenaraikan di sini sudah bukan ahli dan mungkin tiada langsung rekod
 * `members` lagi. RLS terhad kepada department SETIAUSAHA / Super Admin —
 * lihat `20260923000058_ahli_diputihkan.sql`.
 */
export type AhliDiputihkan = {
  id: string;
  nama: string;
  generasi: string;
  tahun_dibuang: number;
  catatan: string | null;
  created_by: string | null;
  created_at: string;
};

export type CreateAhliDiputihkanInput = {
  nama: string;
  generasi: string;
  tahun_dibuang: number;
  catatan: string | null;
};

export async function fetchAhliDiputihkan(): Promise<AhliDiputihkan[]> {
  const { data, error } = await supabase
    .from('ahli_diputihkan')
    .select('*')
    .order('tahun_dibuang', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as AhliDiputihkan[] | null) ?? [];
}

export async function createAhliDiputihkan(input: CreateAhliDiputihkanInput): Promise<AhliDiputihkan> {
  const { data: session } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('ahli_diputihkan')
    .insert({ ...input, created_by: session.user?.id ?? null })
    .select('*')
    .single();

  if (error) throw error;
  return data as AhliDiputihkan;
}

export type UpdateAhliDiputihkanInput = {
  nama: string;
  generasi: string;
  tahun_dibuang: number;
  catatan: string | null;
};

export async function updateAhliDiputihkan(id: string, input: UpdateAhliDiputihkanInput): Promise<AhliDiputihkan> {
  const { data, error } = await supabase.from('ahli_diputihkan').update(input).eq('id', id).select('*').single();
  if (error) throw error;
  return data as AhliDiputihkan;
}

export async function deleteAhliDiputihkan(id: string): Promise<void> {
  const { error } = await supabase.from('ahli_diputihkan').delete().eq('id', id);
  if (error) throw error;
}
