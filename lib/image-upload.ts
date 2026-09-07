import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Pilih, kecilkan dan muat naik imej ke Supabase Storage.
 *
 * Dikongsi oleh avatar ahli dan poster program. Kedua-duanya melalui masalah
 * platform yang SAMA, jadi ia diselesaikan sekali di sini dan bukan disalin.
 */

export class ImageUploadError extends Error {}

const QUALITY = 0.7;

/** `null` bermakna pengguna membatalkan pemilihan — bukan ralat. */
export async function pickImage(aspect?: [number, number]): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new ImageUploadError('Kebenaran capaian galeri diperlukan untuk memilih gambar.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: aspect !== undefined,
    aspect,
    quality: 1,
  });

  if (result.canceled || !result.assets.length) return null;
  return result.assets[0]?.uri ?? null;
}

/**
 * Baca bait fail hasil, ikut cara yang betul bagi platform.
 *
 * Dua platform, dua jenis URI, dan tiada satu pembaca yang memahami kedua-dua:
 *
 *   - Peranti: `file://`. `fetch()` React Native TIDAK membacanya — ia
 *     memulangkan 200 dengan badan teks "File not found", yang pernah dimuat
 *     naik sebagai avatar 14 bait. `expo-file-system` yang membaca fail
 *     sebenar di sini.
 *
 *   - Web: `blob:`. Ia hanya wujud dalam ingatan pelayar, jadi tiada fail
 *     untuk dibuka pada sistem fail — `expo-file-system` menolaknya terus.
 *     `fetch()` pelayar pula membaca `blob:` dengan sempurna.
 *
 * Kedua-dua cabang memulangkan bait, bukan Blob: `storage-js` membungkus Blob
 * dalam `FormData`, dan bahagian FormData React Native yang dibina daripada
 * Blob dihantar KOSONG. Bait mentah mengelakkan laluan itu sekali gus
 * membolehkan satu semakan integriti yang sama untuk kedua-dua platform.
 */
async function readBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    return new Uint8Array(await response.arrayBuffer());
  }

  return await new File(uri).bytes();
}

/**
 * Kecilkan kepada lebar `maxWidth`, mampatkan sebagai JPEG, dan pulangkan
 * bait mentahnya.
 *
 * Dibuat sebelum muat naik, bukan selepas: fail 4MB dari kamera menjadi
 * puluhan kilobait, jadi kuota Storage percuma kekal memadai dan muat naik
 * selesai pada talian yang perlahan.
 */
export async function readJpegBytes(uri: string, maxWidth: number): Promise<Uint8Array> {
  const context = ImageManipulator.manipulate(uri).resize({ width: maxWidth });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });

  const bytes = await readBytes(saved.uri);

  /*
    Setiap JPEG bermula dengan penanda SOI `FF D8`. Semakan ini bukan sekadar
    berjaga-jaga: versi terdahulu membaca fail melalui `fetch(uri).blob()`, dan
    apabila rangkaian React Native tidak dapat membuka `file://` itu ia
    memulangkan 200 dengan badan teks "File not found" — 14 bait yang tersimpan
    tanpa satu pun ralat. Semakan panjang sahaja terlepas kes itu, jadi bait
    pertama yang menentukan.
  */
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new ImageUploadError('Gambar yang diproses tidak sah. Sila cuba gambar lain.');
  }

  return bytes;
}

/**
 * Muat naik imej dan pulangkan URL awamnya.
 *
 * Yang dihantar ialah `Uint8Array`, dan itu PENTING. `storage-js` memilih cara
 * menghantar badan permintaan mengikut jenisnya:
 *
 *   - Blob → dibungkus dalam `FormData`, dan `contentType` DIABAIKAN.
 *   - selain itu → bait mentah, dengan header `content-type` ditetapkan.
 *
 * Laluan Blob itu rosak di React Native, jadi bait dihantar terus: badan
 * permintaan benar-benar mengandungi JPEG itu, dan `image/jpeg` sampai sebagai
 * header supaya Storage tidak menyimpannya sebagai `application/octet-stream`.
 *
 * URL yang dipulangkan sudah disertakan penanda masa — tanpa itu, pelayar dan
 * `expo-image` akan terus memaparkan gambar lama daripada cache kerana URL bagi
 * satu path tidak pernah berubah.
 */
export async function uploadImage(
  bucket: string,
  path: string,
  uri: string,
  maxWidth: number,
): Promise<string> {
  const bytes = await readJpegBytes(uri, maxWidth);

  // `upsert` menimpa fail sedia ada di path yang sama — itu yang menggantikan
  // imej lama, jadi tiada padam berasingan diperlukan.
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

  if (error) throw new ImageUploadError(error.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl + '?v=' + Date.now();
}
