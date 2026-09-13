import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

/**
 * Serahkan buku kerja .xlsx kepada pengguna.
 *
 * Dua platform, dua cara — sama seperti laporan sedia ada (`yuran-report.ts`,
 * `usrah-report.ts`): web mencetuskan muat turun daripada blob dalam ingatan;
 * peranti menulis ke cache dan menyerahkannya kepada share sheet sistem.
 *
 * Memulangkan laluan fail di peranti, atau `null` di web kerana pelayar terus
 * memuat turunnya.
 */

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function deliverWorkbook(
  book: XLSX.WorkBook,
  fileName: string,
  dialogTitle: string,
): Promise<string | null> {
  if (Platform.OS === 'web') {
    const output = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([output], { type: MIME }));

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);

    return null;
  }

  const base64 = XLSX.write(book, { type: 'base64', bookType: 'xlsx' }) as string;

  const directory = new Directory(Paths.cache, 'laporan');
  if (!directory.exists) directory.create({ intermediates: true });

  const file = new File(directory, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: MIME, dialogTitle });
  }

  return file.uri;
}
