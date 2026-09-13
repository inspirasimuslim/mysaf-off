import { Asset, requestPermissionsAsync } from 'expo-media-library';

import { UserError } from './errors';

/**
 * Tulis satu fail imej tempatan (`file://`, bersambungan) ke galeri telefon.
 *
 * Fail `.native` — Metro memilihnya untuk Android/iOS sahaja. `expo-media-library`
 * memanggil `requireNativeModule` sebaik diimport dan tiada pelaksanaan web, jadi
 * import di peringkat atas modul kongsi akan melumpuhkan SELURUH app di pelayar.
 */
export async function saveToGallery(localUri: string): Promise<void> {
  // Tulis sahaja (`writeOnly`): app tidak perlu MEMBACA galeri untuk menyimpan satu gambar.
  const permission = await requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) {
    throw new UserError('Kebenaran galeri diperlukan untuk menyimpan gambar. Benarkan dalam Tetapan telefon, atau guna Kongsi.');
  }
  await Asset.create(localUri);
}
