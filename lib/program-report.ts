import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { supabase } from './supabase';

/**
 * Senarai kehadiran SATU program sebagai fail .xlsx.
 *
 * Berbeza bentuk daripada `usrah-report.ts` dengan sengaja. Laporan usrah
 * menjawab "siapa hadir sepanjang tahun" — satu baris seorang ahli, dua belas
 * kolum bulan. Laporan program menjawab "siapa hadir ke acara ini" — satu baris
 * satu kehadiran, dengan masa dan kaedah imbasan. Menggabungkan kedua-duanya
 * akan menghasilkan satu helaian yang tidak menjawab mana-mana soalan dengan
 * baik.
 *
 * Data datang daripada `program_event_attendance()` dan BUKAN daripada
 * `usrah_attendance_scans` + `members` terus: admin JABATAN SETIAUSAHA belum
 * tentu memegang kebenaran membaca `members`, jadi laluan biasa akan memulangkan
 * senarai tanpa nama.
 */

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const METHOD_LABEL: Record<string, string> = {
  scan: 'Imbas kamera',
  upload: 'Muat naik gambar',
};

type AttendanceRow = {
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  scanned_at: string;
  method: string;
};

export type ProgramReport = {
  rows: number;
  /** Laluan fail di peranti; kosong di web kerana pelayar terus memuat turunnya. */
  uri: string | null;
  fileName: string;
};

export async function fetchProgramAttendance(eventId: string): Promise<AttendanceRow[]> {
  const { data, error } = await supabase.rpc('program_event_attendance', { p_event_id: eventId });
  if (error) throw error;
  return (data as AttendanceRow[] | null) ?? [];
}

/** 'Program Ihya Ramadan' → 'kehadiran-program-ihya-ramadan.xlsx'. */
function fileNameFor(eventName: string): string {
  const slug = eventName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return 'kehadiran-' + (slug || 'program') + '.xlsx';
}

function buildWorkbook(rows: AttendanceRow[]): XLSX.WorkBook {
  const sheetRows = rows.map((row) => ({
    'Nombor Ahli': row.nombor_ahli ?? '',
    Nama: row.full_name,
    Generasi: generationLabel(row.generasi),
    // Masa dipapar dalam waktu tempatan peranti — laporan ini dibaca oleh orang
    // yang berada di acara itu, bukan oleh sistem lain.
    'Masa Hadir': new Date(row.scanned_at).toLocaleString('ms-MY'),
    Method: METHOD_LABEL[row.method] ?? row.method,
  }));

  const sheet = XLSX.utils.json_to_sheet(sheetRows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Kehadiran');
  return book;
}

/**
 * Jana fail dan serahkan kepada pengguna.
 *
 * Dua platform, dua cara menyerahkan fail — sama seperti `usrah-report.ts`:
 * peranti menulis ke cache dan menyerahkannya kepada share sheet sistem; web
 * mencetuskan muat turun daripada blob dalam ingatan.
 */
export async function downloadProgramReport(eventId: string, eventName: string): Promise<ProgramReport> {
  const rows = await fetchProgramAttendance(eventId);
  if (!rows.length) {
    throw new Error('Belum ada kehadiran direkodkan untuk program ini.');
  }

  const book = buildWorkbook(rows);
  const fileName = fileNameFor(eventName);

  if (Platform.OS === 'web') {
    const output = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const url = URL.createObjectURL(new Blob([output], { type: MIME }));

    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);

    return { rows: rows.length, uri: null, fileName };
  }

  const base64 = XLSX.write(book, { type: 'base64', bookType: 'xlsx' }) as string;

  const directory = new Directory(Paths.cache, 'laporan');
  if (!directory.exists) directory.create({ intermediates: true });

  const file = new File(directory, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: MIME, dialogTitle: 'Kehadiran ' + eventName });
  }

  return { rows: rows.length, uri: file.uri, fileName };
}
