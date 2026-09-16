import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { UserError } from './errors';

/**
 * Serahkan fail (Excel, dsb.) kepada pengguna — SATU tempat untuk semua eksport.
 *
 * Dua pilihan yang dipapar kepada pengguna:
 *
 *   - 'save' — "Simpan ke Peranti".
 *       Android: Storage Access Framework. Pengguna memilih folder (contoh
 *       Download), dan fail DITULIS terus ke situ. Tanpa ini, satu-satunya jalan
 *       ialah share sheet, dan sesetengah peranti Android tidak menawarkan
 *       "Simpan" yang jelas di dalamnya.
 *       iOS: share sheet — "Save to Files" sudah terbina dalam, jadi tiada
 *       laluan berasingan diperlukan.
 *   - 'share' — "Kongsi": share sheet sistem (WhatsApp, emel, Drive...).
 *
 * Web sentiasa memuat turun terus melalui pelayar; tiada perbezaan antara
 * kedua-dua pilihan di sana.
 *
 * `Directory.pickDirectoryAsync()` + `createFile()` ialah API SAF dalam
 * expo-file-system SDK 57 — pengganti `StorageAccessFramework.
 * requestDirectoryPermissionsAsync()` + `createFileAsync()` daripada API legacy.
 */

export type DeliveryMode = 'save' | 'share';

/** Apa yang BENAR-BENAR berlaku — pemanggil menulis banner berdasarkan ini. */
export type DeliveryResult = 'downloaded' | 'saved' | 'shared' | 'cancelled';

export function webDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  // Dilekatkan pada dokumen: Firefox (dan WebView lama) mengabaikan klik pada pautan yang terapung.
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  /*
    Dilepaskan LAMBAT. Safari iOS bertanya "Muat turun fail?" dahulu dan hanya
    membaca blob selepas pengguna menekan Muat Turun — URL yang sudah
    dilepaskan dalam 1 saat menghasilkan "Muat turun gagal".
  */
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
}

/** Tulis ke cache app — sumber untuk share sheet. Nama sama ditimpa. */
export function writeCacheFile(bytes: Uint8Array, fileName: string, folder = 'kongsi'): File {
  const directory = new Directory(Paths.cache, folder);
  if (!directory.exists) directory.create({ intermediates: true });

  const file = new File(directory, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  return file;
}

export async function shareLocalFile(uri: string, mimeType: string, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new UserError('Perkongsian fail tidak disokong pada peranti ini.');
  }
  await Sharing.shareAsync(uri, { mimeType, dialogTitle });
}

export async function deliverFile(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
  dialogTitle: string,
  mode: DeliveryMode,
): Promise<DeliveryResult> {
  if (Platform.OS === 'web') {
    webDownload(new Blob([bytes as BlobPart], { type: mimeType }), fileName);
    return 'downloaded';
  }

  if (mode === 'save' && Platform.OS === 'android') {
    let directory: Directory;
    try {
      directory = await Directory.pickDirectoryAsync();
    } catch {
      // Pemilih folder ditutup tanpa memilih — bukan ralat.
      return 'cancelled';
    }

    /*
      Nama TANPA sambungan: penyedia dokumen Android menambah sambungan
      mengikut jenis MIME, jadi 'laporan.xlsx' boleh menjadi
      'laporan.xlsx.xlsx'.
    */
    const file = directory.createFile(fileName.replace(/\.[^.]+$/, ''), mimeType);
    file.write(bytes);
    return 'saved';
  }

  const file = writeCacheFile(bytes, fileName, 'laporan');
  await shareLocalFile(file.uri, mimeType, dialogTitle);
  return 'shared';
}

/** Ayat banner yang sepadan dengan hasil — satu sumber supaya semua skrin berkata perkara yang sama. */
export function deliveryMessage(result: DeliveryResult, fileName: string, detail = ''): string {
  const suffix = detail ? ' (' + detail + ')' : '';
  switch (result) {
    case 'saved':
      return 'Fail ' + fileName + ' disimpan ke folder yang anda pilih' + suffix + '.';
    case 'downloaded':
      return 'Fail ' + fileName + ' dimuat turun' + suffix + '.';
    case 'shared':
      return 'Fail ' + fileName + ' dijana' + suffix + '.';
    case 'cancelled':
      return 'Simpanan dibatalkan — tiada folder dipilih.';
  }
}
