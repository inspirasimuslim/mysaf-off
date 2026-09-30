import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { UserError } from './errors';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
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
  proximity: 'Tekan Hadir (lokasi)',
};

type AttendanceRow = {
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  scanned_at: string;
  method: string;
  attendance_mode: 'bersemuka' | 'online';
  /** Jarak dari pin acara. Kosong bagi acara tanpa pin dan bagi kehadiran online. */
  distance_meters: number | string | null;
};

/**
 * Jarak sebagai nombor bulat, atau '-' bila tiada.
 *
 * PostgREST memulangkan `numeric` sebagai nombor ATAU rentetan bergantung pada
 * saiznya, jadi nilai ditukar secara eksplisit dan bukan diandaikan.
 */
function distanceCell(value: number | string | null): number | string {
  if (value === null || value === undefined || value === '') return '-';
  const meters = Number(value);
  return Number.isFinite(meters) ? Math.round(meters) : '-';
}

export type EventAttendanceReport = {
  rows: number;
  fileName: string;
  result: DeliveryResult;
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

export async function downloadEventAttendance(
  eventId: string,
  eventName: string,
  mode: DeliveryMode,
): Promise<EventAttendanceReport> {
  const { data, error } = await supabase.rpc('event_attendance_export', { p_event_id: eventId });
  if (error) throw error;

  const rows = (data as AttendanceRow[] | null) ?? [];
  if (!rows.length) {
    throw new UserError('Belum ada kehadiran direkodkan untuk acara ini.');
  }

  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      'Nombor Ahli': row.nombor_ahli ?? '',
      Nama: row.full_name,
      Generasi: generationLabel(row.generasi),
      // Objek Date sebenar (bukan teks) supaya boleh disusun/ditapis mengikut masa
      // dalam Excel. Waktu tempatan peranti, sama seperti eksport transaksi.
      'Masa Hadir': new Date(row.scanned_at),
      Kaedah: METHOD_LABEL[row.method] ?? row.method,
      'Mod Kehadiran': row.attendance_mode === 'online' ? 'Online' : 'Bersemuka',
      // '-' dan bukan sel kosong: kosong dibaca sebagai "jarak sifar" oleh
      // orang yang mengimbas lajur, dan sifar bermaksud tepat di atas pin.
      'Jarak (meter)': distanceCell(row.distance_meters),
    })),
    { cellDates: true, dateNF: 'yyyy-mm-dd hh:mm:ss' },
  );
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Kehadiran');

  const fileName = eventFileName('kehadiran', eventName);
  const result = await deliverWorkbook(book, fileName, 'Kehadiran ' + eventName, mode);

  return { rows: rows.length, fileName, result };
}
