import type { MemberBusiness, MemberBusinessDraft } from '@/types/database';

import { supabase } from './supabase';

/**
 * Operasi pangkalan data untuk tab Perniagaan (`member_businesses`).
 *
 * Sama seperti `lib/members.ts`: setiap fungsi melontar ralat mentah Supabase
 * dan tidak menyemak peranan sendiri — RLS pada `member_businesses` (pemilik
 * sendiri ATAU `can_view_members()`/`can_edit_members()`) yang menentukan
 * baris mana boleh disentuh, lihat `20260929000074_member_form_rombak.sql`.
 *
 * Tiada RPC pembalut untuk simpan — `saveMemberBusinesses` memanggil
 * insert/update/delete terus dan mendiff draf borang terhadap baris asal,
 * ikut corak CRUD mudah sedia ada dalam codebase.
 */

export async function fetchMemberBusinesses(memberId: string): Promise<MemberBusiness[]> {
  const { data, error } = await supabase
    .from('member_businesses')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as MemberBusiness[] | null) ?? [];
}

/**
 * Selaraskan baris `member_businesses` seorang ahli dengan draf borang:
 * baris draf tanpa `id` = baharu (insert), baris dengan `id` yang masih ada
 * dalam draf = kemas kini (update), baris asal yang tiada lagi dalam draf =
 * dibuang (delete). Toggle "Ada Perniagaan" OFF menghantar draf kosong —
 * ini akan memadam SEMUA baris ahli itu.
 */
export async function saveMemberBusinesses(
  memberId: string,
  original: MemberBusiness[],
  draft: (MemberBusinessDraft & { id?: string })[],
): Promise<void> {
  const originalIds = new Set(original.map((row) => row.id));
  const draftIds = new Set(draft.filter((row) => row.id).map((row) => row.id as string));

  const toDelete = original.filter((row) => !draftIds.has(row.id)).map((row) => row.id);
  const toUpdate = draft.filter((row) => row.id && originalIds.has(row.id));
  const toInsert = draft.filter((row) => !row.id);

  if (toDelete.length > 0) {
    const { error } = await supabase.from('member_businesses').delete().in('id', toDelete);
    if (error) throw error;
  }

  for (const row of toUpdate) {
    const { error } = await supabase
      .from('member_businesses')
      .update({
        mode: row.mode,
        sub_kategori: row.sub_kategori,
        nama_perniagaan: row.nama_perniagaan,
        negeri_operasi: row.negeri_operasi,
        anggaran_pendapatan_range: row.anggaran_pendapatan_range,
      })
      .eq('id', row.id as string);
    if (error) throw error;
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('member_businesses').insert(
      toInsert.map((row) => ({
        member_id: memberId,
        mode: row.mode,
        sub_kategori: row.sub_kategori,
        nama_perniagaan: row.nama_perniagaan,
        negeri_operasi: row.negeri_operasi,
        anggaran_pendapatan_range: row.anggaran_pendapatan_range,
      })),
    );
    if (error) throw error;
  }
}
