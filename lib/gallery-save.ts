/**
 * Web: tiada galeri. `deliverImage` memuat turun terus melalui pelayar dan tidak
 * pernah sampai ke sini; stub ini wujud supaya web tidak mengimport
 * `expo-media-library` (lihat `gallery-save.native.ts`).
 */
export async function saveToGallery(_localUri: string): Promise<void> {
  throw new Error('Simpan ke galeri hanya tersedia dalam app telefon.');
}
