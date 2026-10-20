import { ImageUploadError, readJpegBytes } from './image-upload';
import { supabase } from './supabase';

/**
 * Pemegang PhD — lihat `20261020000162_phd_graduates.sql`.
 *
 * Bacaan terbuka kepada semua ahli log masuk; tulisan (table + Storage) hanya diterima
 * RLS bagi admin JABATAN DATA & SUMBER MANUSIA (can_edit) atau Super Admin.
 */

const BUCKET = 'phd-gallery';
const IMAGE_WIDTH = 1000;

export type PhdGraduate = {
  id: string;
  nama: string;
  generasi: string | null;
  bidang: string | null;
  universiti: string | null;
  tahun_tamat: number | null;
  tajuk_tesis: string | null;
  gambar_path: string | null;
};

export type PhdInput = {
  nama: string;
  generasi: string | null;
  bidang: string | null;
  universiti: string | null;
  tahun_tamat: number | null;
  tajuk_tesis: string | null;
};

const COLUMNS = 'id, nama, generasi, bidang, universiti, tahun_tamat, tajuk_tesis, gambar_path';

export function phdImageUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function cleanPhdText(value: string): string | null {
  const text = value.trim().replace(/\s+/g, ' ');
  return text ? text : null;
}

export async function fetchPhdGraduates(): Promise<PhdGraduate[]> {
  const { data, error } = await supabase
    .from('phd_graduates')
    .select(COLUMNS)
    .order('tahun_tamat', { ascending: false, nullsFirst: false })
    .order('nama', { ascending: true });
  if (error) throw error;
  return (data ?? []) as PhdGraduate[];
}

async function uploadPhoto(uri: string): Promise<string> {
  const bytes = await readJpegBytes(uri, IMAGE_WIDTH);
  const path = `phd-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new ImageUploadError(error.message);
  return path;
}

async function removePhoto(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}

/**
 * Simpan (tambah/sunting) satu pemegang PhD.
 *
 * `photoUri` = fail baharu yang dipilih (tiada = kekalkan gambar sedia ada);
 * `removePhotoFlag` = buang gambar tanpa ganti. Gambar baharu dimuat naik DAHULU,
 * baris disimpan kemudian, dan objek lama dibuang hanya selepas berjaya — kegagalan
 * separuh jalan tidak meninggalkan baris tanpa gambar. Objek yang tertinggal (jika
 * penyimpanan baris gagal) dibuang cuba-terbaik.
 */
export async function savePhdGraduate(
  existing: PhdGraduate | null,
  input: PhdInput,
  photoUri: string | null,
  removePhotoFlag: boolean,
): Promise<void> {
  let newPath: string | null = null;
  if (photoUri) newPath = await uploadPhoto(photoUri);

  const gambar_path = newPath ?? (removePhotoFlag ? null : (existing?.gambar_path ?? null));

  try {
    if (existing) {
      const { error } = await supabase.from('phd_graduates').update({ ...input, gambar_path }).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('phd_graduates').insert({ ...input, gambar_path });
      if (error) throw error;
    }
  } catch (caught) {
    await removePhoto(newPath);
    throw caught;
  }

  if (existing?.gambar_path && existing.gambar_path !== gambar_path) await removePhoto(existing.gambar_path);
}

export async function deletePhdGraduate(row: PhdGraduate): Promise<void> {
  const { error } = await supabase.from('phd_graduates').delete().eq('id', row.id);
  if (error) throw error;
  await removePhoto(row.gambar_path);
}
