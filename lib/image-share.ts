import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Serahkan satu imej JPEG kepada pengguna.
 *
 * Bentuk yang sama seperti eksport laporan (`xlsx-download.ts`): web memuat
 * turun terus; peranti menyerahkan fail kepada share sheet sistem, dan dari
 * situ pengguna memilih "Simpan imej" / galeri, WhatsApp, dan sebagainya.
 *
 * `source` boleh URL https (fail dalam Storage) atau URI tempatan (hasil
 * tangkapan skrin yang belum dimuat naik).
 */

const MIME = 'image/jpeg';

export async function shareImage(source: string, fileName: string, dialogTitle: string): Promise<void> {
  if (Platform.OS === 'web') {
    const response = await fetch(source);
    if (!response.ok) throw new Error('Imej tidak dapat dimuat turun.');

    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    // Dilepaskan kemudian dan bukan serta-merta: sesetengah pelayar belum
    // mula membaca blob ketika `click()` pulang.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  let uri = source;

  if (/^https?:/i.test(source)) {
    const directory = new Directory(Paths.cache, 'kongsi');
    if (!directory.exists) directory.create({ intermediates: true });

    const file = new File(directory, fileName);
    if (file.exists) file.delete();

    uri = (await File.downloadFileAsync(source, file)).uri;
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Perkongsian fail tidak disokong pada peranti ini.');
  }

  await Sharing.shareAsync(uri, { mimeType: MIME, dialogTitle, UTI: 'public.jpeg' });
}

/** 'Usrah ULK Mac 2026' → 'usrah-ulk-mac-2026' — nama fail yang selamat. */
export function fileSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'poster'
  );
}
