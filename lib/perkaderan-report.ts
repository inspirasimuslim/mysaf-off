import * as XLSX from 'xlsx';

import { UserError } from './errors';
import { eventFileName } from './event-attendance-report';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { fetchPerkaderanExport } from './perkaderan';
import { deliverWorkbook } from './xlsx-download';

/**
 * Laporan Usrah Sekolah sebagai fail .xlsx — dua helaian, daripada
 * `perkaderan_export()`. `groupId` null = semua kumpulan.
 */

export type PerkaderanReport = {
  rows: number;
  fileName: string;
  result: DeliveryResult;
};

export async function downloadPerkaderanReport(
  groupId: string | null,
  groupLabel: string | null,
  mode: DeliveryMode,
  month: number | null = null,
  year: number | null = null,
): Promise<PerkaderanReport> {
  const report = await fetchPerkaderanExport(groupId, month, year);
  if (report.ringkasan_sesi.length === 0) {
    throw new UserError('Tiada rekod sesi untuk dilaporkan.');
  }

  const summarySheet = XLSX.utils.json_to_sheet(
    report.ringkasan_sesi.map((row) => ({
      Kumpulan: row.kumpulan,
      Naqib: row.naqib,
      Sekolah: row.sekolah,
      'Status Kumpulan': row.status_kumpulan ?? '',
      Tarikh: row.tarikh,
      Lokasi: row.lokasi ?? '',
      Topik: row.topik ?? '',
      'Bilangan Hadir': row.bilangan_hadir,
      'Partner Naqib': row.partner_naqib ?? '',
      'Partner Hadir': row.partner_naqib === null ? '' : row.partner_hadir ? 'Ya' : 'Tidak',
    })),
  );

  const detailSheet = XLSX.utils.json_to_sheet(
    report.kehadiran_terperinci.map((row) => ({
      Kumpulan: row.kumpulan,
      'Status Kumpulan': row.status_kumpulan ?? '',
      'Nama Mad\'u': row.nama_mad_u,
      'Status Mad\'u': row.status_mad_u ?? '',
      Tingkatan: row.tingkatan ?? '',
      'Tarikh Sesi': row.tarikh_sesi,
      Hadir: row.hadir ? 'Ya' : 'Tidak',
      'Partner Naqib': row.partner_naqib ?? '',
      'Partner Hadir': row.partner_naqib === null ? '' : row.partner_hadir ? 'Ya' : 'Tidak',
    })),
    {
      header: ['Kumpulan', 'Status Kumpulan', 'Nama Mad\'u', 'Status Mad\'u', 'Tingkatan', 'Tarikh Sesi', 'Hadir', 'Partner Naqib', 'Partner Hadir'],
    },
  );

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, summarySheet, 'Ringkasan Sesi');
  XLSX.utils.book_append_sheet(book, detailSheet, 'Kehadiran Terperinci');

  const fileName = groupId ? eventFileName('usrah-sekolah', groupLabel ?? groupId) : 'usrah-sekolah-semua-kumpulan.xlsx';
  const result = await deliverWorkbook(book, fileName, 'Laporan Usrah Sekolah', mode);

  return { rows: report.ringkasan_sesi.length, fileName, result };
}
