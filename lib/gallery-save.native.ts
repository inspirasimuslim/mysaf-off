import { Asset, getPermissionsAsync, requestPermissionsAsync } from 'expo-media-library';

import { UserError } from './errors';

/**
 * Tulis satu fail imej tempatan (`file://`, bersambungan) ke galeri telefon.
 *
 * Fail `.native` — Metro memilihnya untuk Android/iOS sahaja. `expo-media-library`
 * memanggil `requireNativeModule` sebaik diimport dan tiada pelaksanaan web, jadi
 * import di peringkat atas modul kongsi akan melumpuhkan SELURUH app di pelayar.
 *
 * Kebenaran — tulis sahaja (`writeOnly`), foto sahaja:
 *   - Android 13+ : menulis ke MediaStore tidak memerlukan kebenaran runtime, jadi
 *                   TIADA dialog muncul dan `granted` terus benar. Ini dijangka.
 *   - Android 10–12: dialog WRITE_EXTERNAL_STORAGE (diisytihar oleh plugin, maxSdk 32).
 *   - iOS         : dialog NSPhotoLibraryAddUsageDescription.
 * Kebenaran dalam manifest datang dari plugin `expo-media-library` di app.json —
 * ia hanya masuk ke `android/` selepas `npx expo prebuild`.
 */
export async function saveToGallery(localUri: string): Promise<void> {
  let permission = await getPermissionsAsync(true, ['photo']);
  if (!permission.granted && permission.canAskAgain) {
    permission = await requestPermissionsAsync(true, ['photo']);
  }
  if (!permission.granted) {
    throw new UserError(
      permission.canAskAgain
        ? 'Kebenaran galeri ditolak. Tekan Simpan ke Galeri sekali lagi dan pilih Benarkan, atau guna Kongsi.'
        : 'Kebenaran galeri telah disekat. Benarkan dalam Tetapan telefon (Apl → MySAFF → Kebenaran), atau guna Kongsi.',
    );
  }

  try {
    await Asset.create(localUri);
  } catch (error) {
    // Ralat native tidak dipetakan oleh `toMalayError` — rekod butirannya supaya punca tidak hilang di sebalik mesej umum.
    console.warn('[saveToGallery] Asset.create gagal:', error);
    if (/permission/i.test(error instanceof Error ? error.message : String(error))) {
      throw new UserError('Binaan app ini tiada kebenaran galeri. Pasang semula versi app terkini, atau guna Kongsi.');
    }
    throw error;
  }
}
