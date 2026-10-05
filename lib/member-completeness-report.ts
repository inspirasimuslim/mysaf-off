import * as XLSX from 'xlsx';

import { generationLabel } from '@/types/database';

import { UserError } from './errors';
import { fetchMemberCompletenessSummary, fetchMemberLoginStats } from './member-completeness';
import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { supabase } from './supabase';
import { deliverWorkbook } from './xlsx-download';

/**
 * Eksport Statistik Kelengkapan Data — satu baris setiap ahli, status enam
 * kategori (Siap/Belum) + peratus keseluruhan + kemaskini terakhir rekod itu.
 *
 * Berasingan daripada `member-export.ts` (`members_full_export`): laporan itu
 * ialah salinan data ahli untuk disunting semula; laporan ini ialah status
 * kelengkapan, bentuk lajur yang berbeza sepenuhnya dan tidak boleh dimuat
 * naik semula.
 */

export type MemberCompletenessExportRow = {
  nombor_ahli: string | null;
  full_name: string;
  generasi: string | null;
  data_peribadi: boolean;
  pendidikan: boolean;
  pekerjaan: boolean;
  perniagaan: boolean;
  keluarga: boolean;
  komitmen: boolean;
  jumlah_siap: number;
  peratus: number;
  updated_at: string | null;
  login_terakhir: string | null;
};

/** PostgREST menghadkan 1000 baris setiap permintaan secara lalai. */
const PAGE_SIZE = 1000;

export async function fetchMemberCompletenessExport(): Promise<MemberCompletenessExportRow[]> {
  const rows: MemberCompletenessExportRow[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .rpc('member_data_completeness_export')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const batch = (data as MemberCompletenessExportRow[] | null) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

const siapBelum = (value: boolean) => (value ? 'Siap' : 'Belum');

function rowToSheetRow(row: MemberCompletenessExportRow): Record<string, string | number> {
  return {
    NomborAhli: row.nombor_ahli ?? '',
    NamaPenuh: row.full_name,
    Generasi: row.generasi ? generationLabel(row.generasi) : '',
    'Data Peribadi': siapBelum(row.data_peribadi),
    Pendidikan: siapBelum(row.pendidikan),
    Pekerjaan: siapBelum(row.pekerjaan),
    Perniagaan: siapBelum(row.perniagaan),
    Keluarga: siapBelum(row.keluarga),
    Komitmen: siapBelum(row.komitmen),
    'Kategori Siap': row.jumlah_siap + ' / 6',
    'Peratus Kelengkapan': row.peratus + '%',
    'Kemaskini Terakhir': row.updated_at ? new Date(row.updated_at).toLocaleString('ms-MY') : '',
    'Pernah Login': row.login_terakhir ? 'Ya' : 'Belum',
    'Login Terakhir': row.login_terakhir ? new Date(row.login_terakhir).toLocaleString('ms-MY') : '',
  };
}

export type MemberCompletenessReportResult = { rows: number; fileName: string; result: DeliveryResult };

export async function downloadMemberCompletenessReport(mode: DeliveryMode): Promise<MemberCompletenessReportResult> {
  const [rows, summary, login] = await Promise.all([
    fetchMemberCompletenessExport(),
    fetchMemberCompletenessSummary(),
    fetchMemberLoginStats(),
  ]);
  if (!rows.length) throw new UserError('Tiada rekod ahli untuk dieksport.');

  const sheet = XLSX.utils.json_to_sheet(rows.map(rowToSheetRow));
  const book = XLSX.utils.book_new();

  const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) + '%' : '0%');
  const total = summary.jumlah_ahli;
  const k = summary.mengikut_kategori;
  const ringkasan: (string | number)[][] = [
    ['RINGKASAN', 'Bilangan', 'Peratus'],
    ['Ahli aktif', total, ''],
    ['Pernah berjaya login', login.pernah_login, pct(login.pernah_login, login.jumlah_ahli)],
    ['Belum pernah login', login.jumlah_ahli - login.pernah_login, pct(login.jumlah_ahli - login.pernah_login, login.jumlah_ahli)],
    [],
    ['KELENGKAPAN MENGIKUT KATEGORI (siap)', 'Bilangan', 'Peratus'],
    ['Data Peribadi', k.data_peribadi, pct(k.data_peribadi, total)],
    ['Pendidikan', k.pendidikan, pct(k.pendidikan, total)],
    ['Pekerjaan', k.pekerjaan, pct(k.pekerjaan, total)],
    ['Perniagaan', k.perniagaan, pct(k.perniagaan, total)],
    ['Keluarga', k.keluarga, pct(k.keluarga, total)],
    ['Komitmen', k.komitmen, pct(k.komitmen, total)],
    [],
    ['KELENGKAPAN KESELURUHAN', 'Bilangan ahli', 'Peratus'],
    ...summary.mengikut_bucket.map((b): (string | number)[] => [b.peratus + '% lengkap', b.jumlah, pct(b.jumlah, total)]),
  ];
  const sheetRingkasan = XLSX.utils.aoa_to_sheet(ringkasan);
  sheetRingkasan['!cols'] = [{ wch: 38 }, { wch: 14 }, { wch: 10 }];

  const generasiRows = login.mengikut_generasi.map((g) => ({
    Generasi: g.generasi ? generationLabel(g.generasi) : 'Tiada generasi',
    'Jumlah Ahli': g.jumlah,
    'Pernah Login': g.pernah_login,
    'Peratus Login': pct(g.pernah_login, g.jumlah),
    'Belum Login': g.jumlah - g.pernah_login,
    'Data 100% Siap': g.siap_penuh,
    'Purata Kelengkapan': g.purata_peratus + '%',
  }));
  const sheetGenerasi = XLSX.utils.json_to_sheet(generasiRows);

  XLSX.utils.book_append_sheet(book, sheetRingkasan, 'ringkasan');
  XLSX.utils.book_append_sheet(book, sheetGenerasi, 'mengikut_generasi');
  XLSX.utils.book_append_sheet(book, sheet, 'kelengkapan_data');

  const today = new Date();
  const stamp =
    today.getFullYear() +
    '-' +
    String(today.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(today.getDate()).padStart(2, '0');
  const fileName = 'kelengkapan-data-ahli-' + stamp + '.xlsx';

  const result = await deliverWorkbook(book, fileName, 'Statistik Kelengkapan Data Ahli', mode);
  return { rows: rows.length, fileName, result };
}
