import type { DeliveryMode, DeliveryResult } from './file-delivery';
import { fetchSilibus } from './perkaderan-program';
import { supabase } from './supabase';

export const BULAN_PENDEK = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];

type SesiRow = {
  group_id: string;
  session_date: string;
  jenis: 'fikrah' | 'bonding';
  topik: string | null;
  silibus_ids: string[] | null;
};

/** Satu sel bulan: tiada sesi -> kosong. `kod` ringkas untuk skrin, `penuh` untuk Excel. */
export type SelBulan = { kod: string; penuh: string; jenis: 'fikrah' | 'bonding'; no: number | null };

/** Peta `group_id` -> 12 bulan (indeks 0 = Januari) bagi satu tahun. */
export async function fetchPantauanBulanan(tahun: number): Promise<Map<string, (SelBulan[] | null)[]>> {
  const [silibus, res] = await Promise.all([
    fetchSilibus(),
    supabase
      .from('sekolah_usrah_sessions')
      .select('group_id, session_date, jenis, topik, silibus_ids')
      .gte('session_date', tahun + '-01-01')
      .lte('session_date', tahun + '-12-31')
      .order('session_date'),
  ]);
  if (res.error) throw res.error;
  const byId = new Map(silibus.map((s) => [s.id, s]));
  const out = new Map<string, (SelBulan[] | null)[]>();
  const bondingNo = new Map<string, number>();

  for (const s of (res.data as SesiRow[] | null) ?? []) {
    const bulan = Number.parseInt(s.session_date.slice(5, 7), 10) - 1;
    if (!(bulan >= 0 && bulan < 12)) continue;
    const sel: SelBulan[] = [];
    if (s.jenis === 'bonding') {
      const n = (bondingNo.get(s.group_id) ?? 0) + 1;
      bondingNo.set(s.group_id, n);
      sel.push({ kod: 'B' + n, penuh: 'Bonding ' + n, jenis: 'bonding', no: n });
    } else {
      const ids = (s.silibus_ids ?? []).map((id) => byId.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
      if (ids.length > 0) {
        for (const f of ids) sel.push({ kod: 'F' + f.urutan, penuh: 'F' + f.urutan + ' ' + f.tajuk, jenis: 'fikrah', no: f.urutan });
      } else {
        // Sesi import (Google Form): teks "Fikrah 1 : Dakwah Islamiyyah" dalam `topik`.
        const teks = (s.topik ?? '').trim();
        const nombor = [...teks.matchAll(/fikrah\s*(\d+)/gi)].map((m) => Number.parseInt(m[1]!, 10));
        if (nombor.length > 0) for (const n of nombor) sel.push({ kod: 'F' + n, penuh: teks, jenis: 'fikrah', no: n });
        else sel.push({ kod: teks ? teks.slice(0, 14) : 'Ada', penuh: teks || 'Ada sesi', jenis: 'fikrah', no: null });
      }
    }
    const baris = out.get(s.group_id) ?? Array.from({ length: 12 }, () => null as SelBulan[] | null);
    baris[bulan] = [...(baris[bulan] ?? []), ...sel];
    out.set(s.group_id, baris);
  }
  return out;
}

export type PantauanBaris = {
  sekolah: string;
  tingkatan: string; // "3" | "4" | "5"
  no: number;
  naqib: { nama: string; gen: string }[];
  bulan: (SelBulan[] | null)[];
};

/** Calon mengikut tingkatan (tahun 2026): T5 = I28, T4 = I29, T3 = I30. */
const CALON: Record<string, string> = { '5': 'I28', '4': 'I29', '3': 'I30' };

/** "AHMAD BIN ALI" -> "Ahmad"; nama pendek cukup untuk tajuk lajur kumpulan. */
function namaPendek(nama: string): string {
  const depan = nama.split(/\s+(?:bin|binti|b\.|bt\.?)\s+/i)[0] ?? nama;
  return depan.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/** F (Falahiah) / N (Naim) / huruf pertama perkataan terakhir. */
function awalanSekolah(sekolah: string): string {
  const u = sekolah.toUpperCase();
  if (u.includes('FALAHIAH')) return 'F';
  if (u.includes('NAIM')) return 'N';
  return (u.trim().split(/\s+/).pop() ?? 'X').charAt(0);
}

const bukanFalahiah = (sekolah: string) => Number(!sekolah.toUpperCase().includes('FALAHIAH'));

/**
 * Excel — susun atur SAMA dengan dokumen "Laporan Usrah 2026 (General)": satu jadual setiap tingkatan
 * (LAPORAN USRAH CALON I28 (TINGKATAN 5)), baris Sek, baris "Nama/Bulan" + "Group N: naqib gen", kemudian Jan–Dis.
 * Sel = kod (FF1 = Falahiah Fikrah 1, NB1 = Naim Bonding 1) atau X (tiada usrah); bulan belum tiba dibiarkan kosong.
 */
export async function downloadPantauanBulanan(
  baris: PantauanBaris[],
  tahun: number,
  mode: DeliveryMode,
): Promise<{ rows: number; fileName: string; result: DeliveryResult }> {
  const XLSX = await import('xlsx');
  const { deliverWorkbook } = await import('./xlsx-download');
  const bulanSemasa = new Date().getFullYear() === tahun ? new Date().getMonth() : 11;
  const aoa: string[][] = [];
  const merges: import('xlsx').Range[] = [];

  for (const ting of ['5', '4', '3']) {
    const kumpulan = baris
      .filter((b) => b.tingkatan === ting)
      .sort((a, b) => bukanFalahiah(a.sekolah) - bukanFalahiah(b.sekolah) || a.sekolah.localeCompare(b.sekolah) || a.no - b.no);
    if (kumpulan.length === 0) continue;

    aoa.push(['LAPORAN USRAH CALON ' + (CALON[ting] ?? '') + ' (TINGKATAN ' + ting + ') ' + tahun]);
    // Baris Sek: nama sekolah, digabung merentasi lajur kumpulannya.
    const sekRow = aoa.length;
    aoa.push(['Sek', ...kumpulan.map((k, i) => (i > 0 && kumpulan[i - 1]!.sekolah === k.sekolah ? '' : k.sekolah))]);
    kumpulan.forEach((k, i) => {
      if (i > 0 && kumpulan[i - 1]!.sekolah === k.sekolah) return;
      const akhir = kumpulan.findLastIndex((x) => x.sekolah === k.sekolah);
      if (akhir > i) merges.push({ s: { r: sekRow, c: i + 1 }, e: { r: sekRow, c: akhir + 1 } });
    });
    aoa.push([
      'Nama/Bulan',
      ...kumpulan.map(
        (k, i) => 'Group ' + (i + 1) + ': ' + k.naqib.map((n) => namaPendek(n.nama) + (n.gen !== '—' ? ' ' + n.gen : '')).join(' & '),
      ),
    ]);
    BULAN_PENDEK.forEach((nama, m) => {
      aoa.push([
        nama,
        ...kumpulan.map((k) => {
          const sel = k.bulan[m];
          if (sel && sel.length > 0) {
            const a = awalanSekolah(k.sekolah);
            return sel.map((x) => (x.jenis === 'bonding' ? a + 'B' + (x.no ?? '') : x.no !== null ? a + 'F' + x.no : x.penuh)).join(', ');
          }
          return m > bulanSemasa ? '' : 'X';
        }),
      ]);
    });
    aoa.push([], []);
  }
  aoa.push(['Petunjuk: F/N = Falahiah/Naim; F = Fikrah, B = Bonding (cth FF1 = Falahiah Fikrah 1, NB1 = Naim Bonding 1); X = tiada usrah.']);

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!merges'] = merges;
  sheet['!cols'] = [{ wch: 12 }, ...Array.from({ length: 14 }, () => ({ wch: 22 }))];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Laporan Usrah ' + tahun);
  const fileName = 'laporan-usrah-' + tahun + '-general.xlsx';
  const result = await deliverWorkbook(book, fileName, 'Laporan Usrah ' + tahun, mode);
  return { rows: baris.length, fileName, result };
}
