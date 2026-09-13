import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { supabase } from './supabase';
import { deliverWorkbook } from './xlsx-download';

/**
 * Senarai kehadiran SATU acara — usrah ATAU program — sebagai fail .xlsx.
 *
 * Berbeza bentuk daripada laporan tahunan `usrah-report.ts` dengan sengaja.
 * Laporan tahunan menjawab "siapa hadir sepanjang tahun" — satu baris seorang
 * ahli, dua belas kolum bulan. Fail ini menjawab "siapa hadir ke acara ini" —
 * satu baris satu kehadiran, dengan masa dan kaedah imbasan.
 *
 * Data datang daripada `event_attendance_export()` dan BUKAN daripada
 * `usrah_attendance_scans` + `members` terus: admin department acara belum
 * tentu memegang kebenaran membaca `members`, jadi laluan biasa akan
 * memulangkan senarai tanpa nama. Kebenaran ikut jenis acara di pelayan.
 */

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

export type EventAttendanceReport = {
  rows: number;
  fileName: string;
};

/** 'Program Ihya Ramadan' → 'kehadiran-program-ihya-ramadan.xlsx'. */
export function eventFileName(prefix: string, eventName: string): string {
  const slug = eventName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return prefix + '-' + (slug || 'acara') + '.xlsx';
}

export async function downloadEventAttendance(eventId: string, eventName: string): Promise<EventAttendanceReport> {
  const { data, error } = await supabase.rpc('event_attendance_export', { p_event_id: eventId });
  if (error) throw error;

  const rows = (data as AttendanceRow[] | null) ?? [];
  if (!rows.length) {
    throw new Error('Belum ada kehadiran direkodkan untuk acara ini.');
  }

  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      'Nombor Ahli': row.nombor_ahli ?? '',
      Nama: row.full_name,
      Generasi: generationLabel(row.generasi),
      // Waktu tempatan peranti — fail ini dibaca oleh orang yang berada di acara itu.
      'Masa Hadir': new Date(row.scanned_at).toLocaleString('ms-MY'),
      Method: METHOD_LABEL[row.method] ?? row.method,
    })),
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Kehadiran');

  const fileName = eventFileName('kehadiran', eventName);
  await deliverWorkbook(book, fileName, 'Kehadiran ' + eventName);

  return { rows: rows.length, fileName };
}
