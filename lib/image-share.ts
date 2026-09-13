import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { UserError } from './errors';
import { saveToGallery } from './gallery-save';
import { shareLocalFile, webDownload, writeCacheFile, type DeliveryMode, type DeliveryResult } from './file-delivery';

/**
 * Serahkan satu imej JPEG kepada pengguna — kod QR kehadiran, kod QR bayaran.
 *
 * Dua pilihan, sama seperti eksport Excel (`file-delivery.ts`):
 *   - 'save'  → "Simpan ke Galeri": ditulis terus ke galeri telefon melalui
 *               expo-media-library (kebenaran tulis sahaja, foto sahaja).
 *   - 'share' → "Kongsi": share sheet sistem.
 * Web memuat turun terus untuk kedua-duanya.
 *
 * `source` boleh URL https (fail dalam Storage), `file://` (tangkapan skrin
 * yang belum dimuat naik), atau `data:` di web.
 */

const MIME = 'image/jpeg';

/** Salinan tempatan `file://` — galeri dan share sheet tidak menerima URL https. */
async function toLocalFile(source: string, fileName: string): Promise<string> {
  if (!/^https?:/i.test(source)) return source;

  const target = writeCacheFile(new Uint8Array(0), fileName, 'kongsi');
  target.delete();
  return (await File.downloadFileAsync(source, target)).uri;
}

export async function deliverImage(
  source: string,
  fileName: string,
  dialogTitle: string,
  mode: DeliveryMode,
): Promise<DeliveryResult> {
  if (Platform.OS === 'web') {
    const response = await fetch(source);
    if (!response.ok) throw new UserError('Imej tidak dapat dimuat turun.');
    webDownload(await response.blob(), fileName);
    return 'downloaded';
  }

  if (mode === 'save') {
    await saveToGallery(await toLocalFile(source, fileName));
    return 'saved';
  }

  await shareLocalFile(await toLocalFile(source, fileName), MIME, dialogTitle);
  return 'shared';
}

/** Ayat banner bagi hasil simpan imej. */
export function imageDeliveryMessage(result: DeliveryResult): string | null {
  switch (result) {
    case 'saved':
      return 'Gambar disimpan ke galeri.';
    case 'downloaded':
      return 'Gambar dimuat turun.';
    default:
      return null;
  }
}

/** 'Usrah ULK Mac 2026' → 'usrah-ulk-mac-2026' — nama fail yang selamat. */
export function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'gambar'
  );
}
