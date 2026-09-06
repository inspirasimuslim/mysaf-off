import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

/**
 * Pilih, kecilkan dan muat naik avatar ahli.
 *
 * Nama objek ialah '<member_id>.jpg' — terikat pada rekod ahli dan bukan pada
 * akaun, kerana policy storage menentukan hak menulis dengan membaca semula
 * `members` (lihat `20260906000006_avatars_and_usrah.sql`). Satu ahli
 * bermakna satu fail, jadi muat naik baharu menggantikan yang lama dan tiada
 * fail yatim terkumpul.
 */

const BUCKET = 'avatars';

/** Had piksel; gambar telefon moden jauh lebih besar daripada yang diperlukan. */
const MAX_DIMENSION = 512;
const QUALITY = 0.7;

export class AvatarError extends Error {}

/** `null` bermakna pengguna membatalkan pemilihan — bukan ralat. */
export async function pickAvatar(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new AvatarError('Kebenaran capaian galeri diperlukan untuk menukar gambar.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });

  if (result.canceled || !result.assets.length) return null;
  return result.assets[0]?.uri ?? null;
}

/**
 * Kecilkan kepada sisi terpanjang 512px dan mampatkan sebagai JPEG.
 *
 * Dibuat sebelum muat naik, bukan selepas: fail 4MB dari kamera menjadi
 * puluhan kilobait, jadi kuota Storage percuma kekal memadai dan muat naik
 * selesai pada talian yang perlahan.
 */
async function compress(uri: string): Promise<Blob> {
  const context = ImageManipulator.manipulate(uri).resize({ width: MAX_DIMENSION });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });

  const response = await fetch(saved.uri);
  return await response.blob();
}

/**
 * Muat naik avatar dan kemas kini `members.avatar_url`.
 *
 * Memulangkan URL awam yang sudah disertakan penanda masa — tanpa itu, pelayar
 * dan `expo-image` akan terus memaparkan gambar lama daripada cache kerana URL
 * bagi seorang ahli tidak pernah berubah.
 */
export async function uploadAvatar(memberId: string, uri: string): Promise<string> {
  const blob = await compress(uri);
  const path = memberId + '.jpg';

  // `upsert` menimpa fail sedia ada di path yang sama — itu yang menggantikan
  // avatar lama, jadi tiada padam berasingan diperlukan.
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) throw new AvatarError(uploadError.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = data.publicUrl + '?v=' + Date.now();

  const { error: updateError } = await supabase.from('members').update({ avatar_url: url }).eq('id', memberId);
  if (updateError) throw new AvatarError(updateError.message);

  return url;
}
