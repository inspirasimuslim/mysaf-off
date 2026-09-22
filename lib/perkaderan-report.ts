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
): Promise<PerkaderanReport> {
  const report = await fetchPerkaderanExport(groupId);
  if (report.ringkasan_sesi.length === 0) {
    throw new UserError('Tiada rekod sesi untuk dilaporkan.');
  }

  const summarySheet = XLSX.utils.json_to_sheet(
    report.ringkasan_sesi.map((row) => ({
      Kumpulan: row.kumpulan,
      Naqib: row.naqib,
      Sekolah: row.sekolah,
      Tarikh: row.tarikh,
      Lokasi: row.lokasi ?? '',
      Topik: row.topik ?? '',
      'Bilangan Hadir': row.bilangan_hadir,
    })),
  );

  const detailSheet = XLSX.utils.json_to_sheet(
    report.kehadiran_terperinci.map((row) => ({
      Kumpulan: row.kumpulan,
      'Nama Mad\'u': row.nama_mad_u,
      Tingkatan: row.tingkatan ?? '',
      'Tarikh Sesi': row.tarikh_sesi,
      Hadir: row.hadir ? 'Ya' : 'Tidak',
    })),
    {
      header: ['Kumpulan', 'Nama Mad\'u', 'Tingkatan', 'Tarikh Sesi', 'Hadir'],
    },
  );

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, summarySheet, 'Ringkasan Sesi');
  XLSX.utils.book_append_sheet(book, detailSheet, 'Kehadiran Terperinci');

  const fileName = groupId ? eventFileName('usrah-sekolah', groupLabel ?? groupId) : 'usrah-sekolah-semua-kumpulan.xlsx';
  const result = await deliverWorkbook(book, fileName, 'Laporan Usrah Sekolah', mode);

  return { rows: report.ringkasan_sesi.length, fileName, result };
}
