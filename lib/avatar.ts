import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { updateMember } from './members';
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
 * Kecilkan kepada sisi terpanjang 512px, mampatkan sebagai JPEG, dan pulangkan
 * bait mentahnya.
 *
 * Dibuat sebelum muat naik, bukan selepas: fail 4MB dari kamera menjadi
 * puluhan kilobait, jadi kuota Storage percuma kekal memadai dan muat naik
 * selesai pada talian yang perlahan.
 *
 * Bait dibaca oleh `readBytes` di bawah, yang memilih pembaca mengikut
 * platform — lihat komennya untuk sebab satu pembaca tidak mencukupi.
 */
async function readJpegBytes(uri: string): Promise<Uint8Array> {
  const context = ImageManipulator.manipulate(uri).resize({ width: MAX_DIMENSION });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });

  const bytes = await readBytes(saved.uri);

  /*
    Setiap JPEG bermula dengan penanda SOI `FF D8`. Semakan ini bukan sekadar
    berjaga-jaga: versi terdahulu membaca fail melalui `fetch(uri).blob()`, dan
    apabila rangkaian React Native tidak dapat membuka `file://` itu ia
    memulangkan 200 dengan badan teks "File not found" — 14 bait yang dimuat
    naik sebagai `<member_id>.jpg` tanpa satu pun ralat. Semakan panjang sahaja
    terlepas kes itu, jadi bait pertama yang menentukan.
  */
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new AvatarError('Gambar yang diproses tidak sah. Sila cuba gambar lain.');
  }

  return bytes;
}

/**
 * Muat naik avatar dan kemas kini `members.avatar_url`.
 *
 * Yang dihantar ialah `Uint8Array`, dan itu PENTING. `storage-js` memilih cara
 * menghantar badan permintaan mengikut jenisnya:
 *
 *   - Blob → dibungkus dalam `FormData`, dan `contentType` DIABAIKAN.
 *   - selain itu → bait mentah, dengan header `content-type` ditetapkan.
 *
 * Laluan Blob itu rosak di React Native. `FormData` React Native hanya tahu
 * membina bahagian daripada rentetan atau objek `{ uri, name, type }`; Blob RN
 * pula tiada `uri` — hanya `_data` yang merujuk data di pihak native. Bahagian
 * itu dihantar KOSONG, jadi muat naik "berjaya" (status 200) tetapi objek yang
 * tersimpan sifar bait, dan setiap skrin memaparkan gambar putih.
 *
 * Menghantar bait terus mengelakkan kedua-dua masalah sekali gus: badan
 * permintaan benar-benar mengandungi JPEG itu, dan `image/jpeg` sampai sebagai
 * header supaya Storage tidak menyimpannya sebagai `application/octet-stream`.
 *
 * Memulangkan URL awam yang sudah disertakan penanda masa — tanpa itu, pelayar
 * dan `expo-image` akan terus memaparkan gambar lama daripada cache kerana URL
 * bagi seorang ahli tidak pernah berubah.
 */
export async function uploadAvatar(memberId: string, uri: string): Promise<string> {
  const bytes = await readJpegBytes(uri);
  const path = memberId + '.jpg';

  // `upsert` menimpa fail sedia ada di path yang sama — itu yang menggantikan
  // avatar lama, jadi tiada padam berasingan diperlukan.
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });

  if (uploadError) throw new AvatarError(uploadError.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = data.publicUrl + '?v=' + Date.now();

  /*
    Melalui `updateMember` dan bukan `.update()` terus: fungsi itu mengesahkan
    baris benar-benar dikemas kini. Muat naik yang failnya tersimpan tetapi
    URLnya tidak pernah mendarat ialah tepat keadaan yang memapar bulatan
    kosong sambil melaporkan kejayaan.
  */
  try {
    await updateMember(memberId, { avatar_url: url });
  } catch (caught) {
    throw new AvatarError(caught instanceof Error ? caught.message : 'Gagal menyimpan URL gambar.');
  }

  return url;
}
