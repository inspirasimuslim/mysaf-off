import { supabase } from './supabase';

/**
 * Program pra-keahlian, tamrin berjadual dan prestasi mad'u (migration 177).
 * Prestasi (`fetchPrestasi*`) hanya dijawab untuk admin LAJNAH PERKADERAN / Super Admin —
 * RPC menolak orang lain (42501). Naqib hanya merekod kehadiran tamrin.
 */

export type PerkaderanProgram = { id: string; nama: string; sasaran_usrah: number; aktif: boolean };
export type PerkaderanTamrin = { id: string; program_id: string; nama: string; tarikh: string; lokasi: string | null };
export type TamrinRosterRow = { mad_u_id: string; nama: string; tingkatan: string; sekolah: string; group_name: string; hadir: boolean };

export type PrestasiMadU = {
  mad_u_id: string;
  nama: string;
  tingkatan: string;
  kelas: string | null;
  sekolah: string;
  group_name: string;
  naqib_nama: string | null;
  usrah_hadir: number;
  usrah_jumlah: number;
  tamrin_hadir: number;
  tamrin_jumlah: number;
  sasaran_usrah: number;
};

export type PrestasiRingkasan = {
  program: { id: string; nama: string; sasaran_usrah: number } | null;
  jumlah_madu: number;
  usrah_pct: number | null;
  tamrin_pct: number | null;
  sekolah: { sekolah: string; madu: number; usrah_pct: number | null; tamrin_pct: number | null }[];
  tamrin: { id: string; nama: string; tarikh: string; hadir: number; jumlah: number }[];
  bulanan: { bulan: string; sesi: number; hadir: number; peluang: number }[];
};

export type PrestasiDetail = {
  mad_u: { id: string; nama: string; tingkatan: string; kelas: string | null; sekolah: string; group_name: string; is_active: boolean };
  sasaran_usrah: number | null;
  usrah: { tarikh: string; topik: string | null; hadir: boolean }[];
  tamrin: { tarikh: string; nama: string; hadir: boolean }[];
} | null;

export async function fetchPrograms(): Promise<PerkaderanProgram[]> {
  const { data, error } = await supabase
    .from('perkaderan_program')
    .select('id, nama, sasaran_usrah, aktif')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as PerkaderanProgram[] | null) ?? [];
}

export async function saveProgram(input: { id?: string; nama: string; sasaran_usrah: number; aktif: boolean }): Promise<void> {
  const row = { nama: input.nama.trim(), sasaran_usrah: input.sasaran_usrah, aktif: input.aktif };
  const { error } = input.id
    ? await supabase.from('perkaderan_program').update(row).eq('id', input.id)
    : await supabase.from('perkaderan_program').insert(row);
  if (error) throw error;
}

export async function fetchTamrin(programId: string): Promise<PerkaderanTamrin[]> {
  const { data, error } = await supabase
    .from('perkaderan_tamrin')
    .select('id, program_id, nama, tarikh, lokasi')
    .eq('program_id', programId)
    .order('tarikh', { ascending: true });
  if (error) throw error;
  return (data as PerkaderanTamrin[] | null) ?? [];
}

export async function saveTamrin(input: { id?: string; program_id: string; nama: string; tarikh: string; lokasi: string }): Promise<void> {
  const row = { program_id: input.program_id, nama: input.nama.trim(), tarikh: input.tarikh, lokasi: input.lokasi.trim() || null };
  const { error } = input.id
    ? await supabase.from('perkaderan_tamrin').update(row).eq('id', input.id)
    : await supabase.from('perkaderan_tamrin').insert(row);
  if (error) throw error;
}

export async function deleteTamrin(id: string): Promise<void> {
  const { error } = await supabase.from('perkaderan_tamrin').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchTamrinRoster(tamrinId: string): Promise<TamrinRosterRow[]> {
  const { data, error } = await supabase.rpc('perkaderan_tamrin_roster', { p_tamrin: tamrinId });
  if (error) throw error;
  return (data as TamrinRosterRow[] | null) ?? [];
}

export async function setTamrinAttendance(tamrinId: string, semua: string[], hadir: string[]): Promise<void> {
  const { error } = await supabase.rpc('perkaderan_tamrin_set', { p_tamrin: tamrinId, p_semua: semua, p_hadir: hadir });
  if (error) throw error;
}

export async function fetchPrestasiRingkasan(programId: string | null): Promise<PrestasiRingkasan> {
  const { data, error } = await supabase.rpc('perkaderan_prestasi_ringkasan', { p_program: programId });
  if (error) throw error;
  return data as PrestasiRingkasan;
}

export async function fetchPrestasiMadU(programId: string | null): Promise<PrestasiMadU[]> {
  const { data, error } = await supabase.rpc('perkaderan_prestasi_madu', { p_program: programId });
  if (error) throw error;
  return (data as PrestasiMadU[] | null) ?? [];
}

export async function fetchPrestasiDetail(madUId: string): Promise<PrestasiDetail> {
  const { data, error } = await supabase.rpc('perkaderan_prestasi_detail', { p_mad_u: madUId });
  if (error) throw error;
  return data as PrestasiDetail;
}

/** Peratus bulat, atau null bila tiada peluang (jumlah 0). */
export function pct(hadir: number, jumlah: number): number | null {
  return jumlah > 0 ? Math.round((100 * hadir) / jumlah) : null;
}
