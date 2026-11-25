import { supabase } from './supabase';

/**
 * Program pra-keahlian, tamrin berjadual dan prestasi mad'u (migration 177).
 * Prestasi (`fetchPrestasi*`) hanya dijawab untuk admin LAJNAH PERKADERAN / Super Admin —
 * RPC menolak orang lain (42501). Naqib hanya merekod kehadiran tamrin.
 */

export type PerkaderanProgram = { id: string; nama: string; sasaran_usrah: number; aktif: boolean };
export const TAMRIN_JENIS_OPTIONS = [
  { value: 'taq', label: 'TAQ — Tamrin Asas Qiadi' },
  { value: 'tampenor', label: 'Tampenor — Tamrin Pengurusan Organisasi' },
  { value: 'qtc', label: 'QTC — Qiadi Training Course' },
  { value: 'kuiz_3k', label: 'Kuiz 3K' },
  { value: 'tamrin_3k', label: 'Tamrin 3K' },
  { value: 'lain', label: 'Lain-lain' },
];
export type PerkaderanTamrin = { id: string; program_id: string; nama: string; tarikh: string; lokasi: string | null; jenis: string; tingkatan: string | null };
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
    .select('id, program_id, nama, tarikh, lokasi, jenis, tingkatan')
    .eq('program_id', programId)
    .order('tarikh', { ascending: true });
  if (error) throw error;
  return (data as PerkaderanTamrin[] | null) ?? [];
}

export async function saveTamrin(input: { id?: string; program_id: string; nama: string; tarikh: string; lokasi: string; jenis: string; tingkatan: string | null }): Promise<void> {
  const row = { program_id: input.program_id, nama: input.nama.trim(), tarikh: input.tarikh, lokasi: input.lokasi.trim() || null, jenis: input.jenis, tingkatan: input.tingkatan };
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

// ----- Ujian (migration 178) -----
export type PerkaderanUjian = { id: string; program_id: string; nama: string; tarikh: string; markah_penuh: number; markah_lulus: number };
export type UjianRosterRow = { mad_u_id: string; nama: string; tingkatan: string; sekolah: string; group_name: string; markah: number | null };
export type PrestasiUjian = { id: string; nama: string; tarikh: string; penuh: number; lulus: number; dinilai: number; bil_lulus: number; purata: number | null; aktif: number };
export type PrestasiUjianMadU = { nama: string; tarikh: string; penuh: number; lulus_markah: number; markah: number | null; lulus: boolean | null };

export async function fetchUjian(programId: string): Promise<PerkaderanUjian[]> {
  const { data, error } = await supabase
    .from('perkaderan_ujian')
    .select('id, program_id, nama, tarikh, markah_penuh, markah_lulus')
    .eq('program_id', programId)
    .order('tarikh', { ascending: true });
  if (error) throw error;
  return ((data as PerkaderanUjian[] | null) ?? []).map((u) => ({ ...u, markah_penuh: Number(u.markah_penuh), markah_lulus: Number(u.markah_lulus) }));
}

export async function saveUjian(input: { id?: string; program_id: string; nama: string; tarikh: string; markah_penuh: number; markah_lulus: number }): Promise<void> {
  const row = { program_id: input.program_id, nama: input.nama.trim(), tarikh: input.tarikh, markah_penuh: input.markah_penuh, markah_lulus: input.markah_lulus };
  const { error } = input.id
    ? await supabase.from('perkaderan_ujian').update(row).eq('id', input.id)
    : await supabase.from('perkaderan_ujian').insert(row);
  if (error) throw error;
}

export async function deleteUjian(id: string): Promise<void> {
  const { error } = await supabase.from('perkaderan_ujian').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchUjianRoster(ujianId: string): Promise<UjianRosterRow[]> {
  const { data, error } = await supabase.rpc('perkaderan_ujian_roster', { p_ujian: ujianId });
  if (error) throw error;
  return ((data as UjianRosterRow[] | null) ?? []).map((r) => ({ ...r, markah: r.markah == null ? null : Number(r.markah) }));
}

export async function setUjianMarkah(ujianId: string, ids: string[], markah: (number | null)[]): Promise<void> {
  const { error } = await supabase.rpc('perkaderan_ujian_set', { p_ujian: ujianId, p_ids: ids, p_markah: markah });
  if (error) throw error;
}

export async function fetchPrestasiUjian(programId: string | null): Promise<PrestasiUjian[]> {
  const { data, error } = await supabase.rpc('perkaderan_prestasi_ujian', { p_program: programId });
  if (error) throw error;
  return ((data as PrestasiUjian[] | null) ?? []).map((u) => ({ ...u, penuh: Number(u.penuh), lulus: Number(u.lulus), purata: u.purata == null ? null : Number(u.purata) }));
}

export async function fetchPrestasiUjianMadU(madUId: string): Promise<PrestasiUjianMadU[]> {
  const { data, error } = await supabase.rpc('perkaderan_prestasi_ujian_madu', { p_mad_u: madUId });
  if (error) throw error;
  return ((data as PrestasiUjianMadU[] | null) ?? []).map((u) => ({ ...u, penuh: Number(u.penuh), lulus_markah: Number(u.lulus_markah), markah: u.markah == null ? null : Number(u.markah) }));
}

// ----- Silibus (migration 179) -----
export type SilibusRow = { id: string; tingkatan: string; urutan: number; tajuk: string };

export async function fetchSilibus(tingkatan?: string | null): Promise<SilibusRow[]> {
  let query = supabase.from('perkaderan_silibus').select('id, tingkatan, urutan, tajuk').order('tingkatan').order('urutan');
  if (tingkatan) query = query.eq('tingkatan', tingkatan);
  const { data, error } = await query;
  if (error) throw error;
  return (data as SilibusRow[] | null) ?? [];
}

export async function saveSilibus(input: { id?: string; tingkatan: string; urutan: number; tajuk: string }): Promise<void> {
  const row = { tingkatan: input.tingkatan, urutan: input.urutan, tajuk: input.tajuk.trim() };
  const { error } = input.id
    ? await supabase.from('perkaderan_silibus').update(row).eq('id', input.id)
    : await supabase.from('perkaderan_silibus').insert(row);
  if (error) throw error;
}

export async function deleteSilibus(id: string): Promise<void> {
  const { error } = await supabase.from('perkaderan_silibus').delete().eq('id', id);
  if (error) throw error;
}
