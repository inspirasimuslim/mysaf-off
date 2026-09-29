import type { MemberEducation, MemberEducationDraft } from '@/types/database';

import { supabase } from './supabase';

/**
 * Operasi pangkalan data untuk tab Pendidikan, peringkat selepas SPM
 * (`member_education`).
 *
 * Sama corak PERSIS `lib/member-businesses.ts`: RLS pemilik sendiri
 * (`my_member_id()`) ATAU `can_view_members()`/`can_edit_members()` sedia
 * ada, tiada RPC pembalut — `saveMemberEducation` mendiff draf terhadap
 * baris asal dan memanggil insert/update/delete terus.
 */

export async function fetchMemberEducation(memberId: string): Promise<MemberEducation[]> {
  const { data, error } = await supabase
    .from('member_education')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as MemberEducation[] | null) ?? [];
}

/**
 * Selaraskan baris `member_education` seorang ahli dengan draf borang —
 * lihat `saveMemberBusinesses` untuk logik diff yang sama.
 */
export async function saveMemberEducation(
  memberId: string,
  original: MemberEducation[],
  draft: (MemberEducationDraft & { id?: string })[],
): Promise<void> {
  const originalIds = new Set(original.map((row) => row.id));
  const draftIds = new Set(draft.filter((row) => row.id).map((row) => row.id as string));

  const toDelete = original.filter((row) => !draftIds.has(row.id)).map((row) => row.id);
  const toUpdate = draft.filter((row) => row.id && originalIds.has(row.id));
  const toInsert = draft.filter((row) => !row.id);

  if (toDelete.length > 0) {
    const { error } = await supabase.from('member_education').delete().in('id', toDelete);
    if (error) throw error;
  }

  for (const row of toUpdate) {
    const { error } = await supabase
      .from('member_education')
      .update({
        peringkat: row.peringkat,
        jurusan: row.jurusan,
        institusi: row.institusi,
        status_pengajian: row.status_pengajian,
        sumber_pembiayaan: row.sumber_pembiayaan,
      })
      .eq('id', row.id as string);
    if (error) throw error;
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('member_education').insert(
      toInsert.map((row) => ({
        member_id: memberId,
        peringkat: row.peringkat,
        jurusan: row.jurusan,
        institusi: row.institusi,
        status_pengajian: row.status_pengajian,
        sumber_pembiayaan: row.sumber_pembiayaan,
      })),
    );
    if (error) throw error;
  }
}
