import type { MemberHealthIssue, MemberHealthIssueDraft, RaisLajnahKebajikan } from '@/types/database';

import { supabase } from './supabase';

/**
 * Operasi pangkalan data untuk tab Kesihatan (`member_health_issues`).
 *
 * DATA SENSITIF. Akses ditentukan sepenuhnya oleh RLS melalui
 * `can_view_health()`/`can_edit_health()` (pemilik sendiri + admin LAJNAH
 * KEBAJIKAN + Super Admin) — kod ini hanya bertanya fungsi yang sama supaya UI
 * tidak menunjukkan borang yang pasti ditolak. Sengaja BUKAN sebahagian
 * daripada `MemberForm.onSave`, Excel import/eksport atau Dashboard
 * Kelengkapan Data.
 */

export type HealthAccess = { view: boolean; edit: boolean };

export async function fetchHealthAccess(memberId: string): Promise<HealthAccess> {
  const [view, edit] = await Promise.all([
    supabase.rpc('can_view_health', { p_member_id: memberId }),
    supabase.rpc('can_edit_health', { p_member_id: memberId }),
  ]);
  if (view.error) throw view.error;
  if (edit.error) throw edit.error;
  return { view: view.data === true, edit: edit.data === true };
}

export async function fetchMemberHealth(memberId: string): Promise<MemberHealthIssue[]> {
  const { data, error } = await supabase
    .from('member_health_issues')
    .select('*')
    .eq('member_id', memberId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as MemberHealthIssue[] | null) ?? [];
}

/** Medan yang tidak relevan untuk jenis itu dikosongkan sebelum simpan. */
function normalise(row: MemberHealthIssueDraft) {
  const jenis = row.jenis_masalah;
  const ada = jenis !== 'tiada' && jenis !== 'tidak_mahu_nyatakan';
  const trimmed = (value: string | null) => (value && value.trim() !== '' ? value.trim() : null);
  return {
    jenis_masalah: jenis,
    nama_penyakit: ada ? trimmed(row.nama_penyakit) : null,
    ada_temujanji_hospital: ada ? row.ada_temujanji_hospital : null,
    keterangan_lain: jenis === 'lain_lain' ? trimmed(row.keterangan_lain) : null,
  };
}

/** Selaraskan baris ahli dengan draf — logik diff sama seperti `saveMemberBusinesses`. */
export async function saveMemberHealth(
  memberId: string,
  original: MemberHealthIssue[],
  draft: MemberHealthIssueDraft[],
): Promise<void> {
  const originalIds = new Set(original.map((row) => row.id));
  const draftIds = new Set(draft.filter((row) => row.id).map((row) => row.id as string));

  const toDelete = original.filter((row) => !draftIds.has(row.id)).map((row) => row.id);
  const toUpdate = draft.filter((row) => row.id && originalIds.has(row.id));
  const toInsert = draft.filter((row) => !row.id);

  if (toDelete.length > 0) {
    const { error } = await supabase.from('member_health_issues').delete().in('id', toDelete);
    if (error) throw error;
  }

  for (const row of toUpdate) {
    const { error } = await supabase
      .from('member_health_issues')
      .update(normalise(row))
      .eq('id', row.id as string);
    if (error) throw error;
  }

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('member_health_issues')
      .insert(toInsert.map((row) => ({ member_id: memberId, ...normalise(row) })));
    if (error) throw error;
  }
}

/** Kenalan "Rais Lajnah Kebajikan" — `null` jika jawatan kosong/tidak dijumpai. */
export async function fetchRaisLajnahKebajikan(): Promise<RaisLajnahKebajikan | null> {
  const { data, error } = await supabase.rpc('get_rais_lajnah_kebajikan');
  if (error) throw error;
  const row = ((data as RaisLajnahKebajikan[] | null) ?? [])[0];
  return row ?? null;
}
