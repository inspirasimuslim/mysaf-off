import type { KumpulanUsrahOverview } from '@/types/database';

import type { KumpulanUsrahMatch } from './kumpulan-usrah-import';
import { supabase } from './supabase';

/**
 * Operasi pangkalan data untuk Kumpulan Usrah Tarbiah — LAJNAH TARBIAH.
 *
 * Sama corak `lib/perkaderan.ts`: setiap fungsi melontar ralat mentah
 * Supabase; RLS pada `kumpulan_usrah`/`kumpulan_usrah_members`/
 * `kumpulan_usrah_naqib` (lihat `20261004000112_kumpulan_usrah.sql`) yang
 * menentukan sama ada operasi dibenarkan — super_admin atau admin LAJNAH
 * TARBIAH (`can_edit_usrah()`).
 */

export async function fetchKumpulanUsrahOverview(): Promise<KumpulanUsrahOverview[]> {
  const { data, error } = await supabase.rpc('kumpulan_usrah_overview');
  if (error) throw error;
  return (data as KumpulanUsrahOverview[] | null) ?? [];
}

export async function createKumpulanUsrah(kawasanUsrah: string, nama: string): Promise<void> {
  const { error } = await supabase.from('kumpulan_usrah').insert({ kawasan_usrah: kawasanUsrah, nama: nama.trim() });
  if (error) throw error;
}

export async function renameKumpulanUsrah(id: string, nama: string): Promise<void> {
  const { error } = await supabase.from('kumpulan_usrah').update({ nama: nama.trim() }).eq('id', id);
  if (error) throw error;
}

/** Memadam kumpulan juga memadam pautan ahli & naqibnya (cascade) — ahli sendiri TIDAK disentuh. */
export async function deleteKumpulanUsrah(id: string): Promise<void> {
  const { error } = await supabase.from('kumpulan_usrah').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Tambah ahli ke kumpulan — jika ahli sudah dalam kumpulan LAIN, ia
 * dipindahkan (upsert on-conflict member_id), bukan ditolak sebagai ralat
 * unik. Lihat `kumpulan_usrah_set_member()`.
 */
export async function setKumpulanUsrahMember(kumpulanId: string, memberId: string): Promise<void> {
  const { error } = await supabase.rpc('kumpulan_usrah_set_member', { p_kumpulan_id: kumpulanId, p_member_id: memberId });
  if (error) throw error;
}

export async function removeKumpulanUsrahMember(rowId: string): Promise<void> {
  const { error } = await supabase.from('kumpulan_usrah_members').delete().eq('id', rowId);
  if (error) throw error;
}

/** Had 2 naqib setiap kumpulan dikuatkuasakan oleh trigger DB — melontar ralat bila dipenuhi. */
export async function addKumpulanUsrahNaqib(kumpulanId: string, memberId: string): Promise<void> {
  const { error } = await supabase.from('kumpulan_usrah_naqib').insert({ kumpulan_id: kumpulanId, member_id: memberId });
  if (error) throw error;
}

export async function removeKumpulanUsrahNaqib(rowId: string): Promise<void> {
  const { error } = await supabase.from('kumpulan_usrah_naqib').delete().eq('id', rowId);
  if (error) throw error;
}

// =============================================================================
// Muat Naik Kumpulan Usrah (skrin admin/kumpulan-usrah-upload.tsx)
// =============================================================================

const CHUNK_SIZE = 500;
const NAQIB_CAP = 2;

export type KumpulanUsrahImportProgress = { done: number; total: number };

export type KumpulanUsrahImportResult = {
  groupsCreated: number;
  membersAssigned: number;
  naqibAssigned: number;
  /** Baris NAQIB=YA yang tidak disimpan kerana kumpulan itu sudah ada 2 naqib. */
  naqibSkipped: number;
};

function groupKey(kawasan: string, nama: string): string {
  return kawasan + '|' + nama.trim().toLowerCase();
}

/**
 * Cipta kumpulan yang belum wujud, pindah/tetapkan setiap ahli ke kumpulannya,
 * dan lantik naqib yang ditanda (dihadkan 2 setiap kumpulan, mengira naqib
 * SEDIA ADA dahulu supaya had tidak terlangkau).
 *
 * Satu fungsi, bukan RPC pukal — konsisten dengan `importUsrahAttendance()`
 * (chunked upsert terus daripada klien, RLS `can_edit_usrah()` pada setiap
 * table yang menentukan kebenaran, bukan logik tersembunyi dalam satu RPC).
 */
export async function importKumpulanUsrah(
  matched: KumpulanUsrahMatch[],
  onProgress?: (progress: KumpulanUsrahImportProgress) => void,
): Promise<KumpulanUsrahImportResult> {
  const total = matched.length + 1; // +1 langkah persediaan kumpulan
  let done = 0;
  const report = () => onProgress?.({ done, total });

  // 1. Kumpulan sedia ada + cipta yang belum wujud.
  const { data: existingRows, error: existingError } = await supabase.from('kumpulan_usrah').select('id, kawasan_usrah, nama');
  if (existingError) throw existingError;

  const idByKey = new Map<string, string>();
  (existingRows ?? []).forEach((row: { id: string; kawasan_usrah: string; nama: string }) => {
    idByKey.set(groupKey(row.kawasan_usrah, row.nama), row.id);
  });

  const neededKeys = new Map<string, { kawasan_usrah: string; nama: string }>();
  matched.forEach((row) => {
    const key = groupKey(row.kawasan, row.namaKumpulan);
    if (!idByKey.has(key) && !neededKeys.has(key)) {
      neededKeys.set(key, { kawasan_usrah: row.kawasan, nama: row.namaKumpulan });
    }
  });

  let groupsCreated = 0;
  if (neededKeys.size > 0) {
    const toCreate = [...neededKeys.values()];
    const { data: created, error: createError } = await supabase.from('kumpulan_usrah').insert(toCreate).select('id, kawasan_usrah, nama');
    if (createError) throw createError;
    (created ?? []).forEach((row: { id: string; kawasan_usrah: string; nama: string }) => {
      idByKey.set(groupKey(row.kawasan_usrah, row.nama), row.id);
    });
    groupsCreated = created?.length ?? 0;
  }
  done += 1;
  report();

  // 2. Tetapkan/pindah setiap ahli ke kumpulannya — chunked upsert terus
  //    (bukan satu panggilan RPC setiap ahli — fail 300+ baris perlu laju).
  const memberRows = matched.map((row) => ({ kumpulan_id: idByKey.get(groupKey(row.kawasan, row.namaKumpulan)) as string, member_id: row.memberId }));

  for (let index = 0; index < memberRows.length; index += CHUNK_SIZE) {
    const chunk = memberRows.slice(index, index + CHUNK_SIZE);
    const { error } = await supabase.from('kumpulan_usrah_members').upsert(chunk, { onConflict: 'member_id' });
    if (error) throw error;
    done += chunk.length;
    report();
  }

  // 3. Naqib — kira had SEDIA ADA (termasuk naqib yang sudah wujud sebelum
  //    import ini) supaya had 2/kumpulan tidak terlangkau.
  const naqibRowsWanted = matched.filter((row) => row.isNaqib);
  let naqibAssigned = 0;
  let naqibSkipped = 0;

  if (naqibRowsWanted.length > 0) {
    const kumpulanIds = [...new Set(naqibRowsWanted.map((row) => idByKey.get(groupKey(row.kawasan, row.namaKumpulan)) as string))];
    const { data: existingNaqib, error: naqibError } = await supabase
      .from('kumpulan_usrah_naqib')
      .select('kumpulan_id, member_id')
      .in('kumpulan_id', kumpulanIds);
    if (naqibError) throw naqibError;

    const countByKumpulan = new Map<string, number>();
    const existingPairs = new Set<string>();
    (existingNaqib ?? []).forEach((row: { kumpulan_id: string; member_id: string }) => {
      countByKumpulan.set(row.kumpulan_id, (countByKumpulan.get(row.kumpulan_id) ?? 0) + 1);
      existingPairs.add(row.kumpulan_id + '|' + row.member_id);
    });

    const toInsert: { kumpulan_id: string; member_id: string }[] = [];
    naqibRowsWanted.forEach((row) => {
      const kumpulanId = idByKey.get(groupKey(row.kawasan, row.namaKumpulan)) as string;
      const pairKey = kumpulanId + '|' + row.memberId;
      if (existingPairs.has(pairKey)) return; // sudah naqib kumpulan ini — tiada kesan.
      const current = countByKumpulan.get(kumpulanId) ?? 0;
      if (current >= NAQIB_CAP) {
        naqibSkipped += 1;
        return;
      }
      countByKumpulan.set(kumpulanId, current + 1);
      existingPairs.add(pairKey);
      toInsert.push({ kumpulan_id: kumpulanId, member_id: row.memberId });
    });

    if (toInsert.length > 0) {
      const { error } = await supabase.from('kumpulan_usrah_naqib').insert(toInsert);
      if (error) throw error;
      naqibAssigned = toInsert.length;
    }
  }

  done = total;
  report();

  return { groupsCreated, membersAssigned: memberRows.length, naqibAssigned, naqibSkipped };
}
