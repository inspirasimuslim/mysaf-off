import type { Generation, Member, MemberSummary } from '@/types/database';

import type { ParsedMember } from './ahli-import';
import { supabase } from './supabase';

/**
 * Operasi pangkalan data untuk modul Senarai Ahli.
 *
 * Sama seperti `lib/admin.ts`: setiap fungsi melontar ralat mentah Supabase dan
 * tidak menyemak peranan sendiri. RLS pada `members` yang menentukan baris mana
 * boleh dibaca atau ditulis — lihat `20260906000002_members.sql`.
 */

/** Kolum ringkas untuk skrin senarai. */
const SUMMARY_COLUMNS = 'id, nombor_ahli, generasi, full_name, email, disekat';

/**
 * PostgREST menghadkan 1000 baris setiap permintaan secara lalai. Senarai ahli
 * dijangka melebihi itu suatu hari nanti, jadi bacaan dibuat berhalaman.
 */
const PAGE_SIZE = 1000;

/** Baris ditulis dalam kelompok supaya satu import besar tidak menjadi satu permintaan gergasi. */
const INSERT_CHUNK = 100;

// --- Generasi ----------------------------------------------------------------

export async function fetchGenerations(): Promise<Generation[]> {
  const { data, error } = await supabase
    .from('generations')
    .select('id, code, label, is_active')
    .order('code');
  if (error) throw error;
  return (data as Generation[] | null) ?? [];
}

// --- Senarai ahli ------------------------------------------------------------

export async function fetchMembers(): Promise<MemberSummary[]> {
  const rows: MemberSummary[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from('members')
      .select(SUMMARY_COLUMNS)
      .order('nombor_ahli', { ascending: true, nullsFirst: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const batch = (data as MemberSummary[] | null) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

export async function fetchMember(id: string): Promise<Member | null> {
  const { data, error } = await supabase.from('members').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Member | null) ?? null;
}

/** Rekod ahli milik pengguna yang sedang log masuk, atau `null` bila belum dikaitkan. */
export async function fetchMyMember(userId: string): Promise<Member | null> {
  const { data, error } = await supabase.from('members').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as Member | null) ?? null;
}

/**
 * Kemas kini sebahagian medan. Pemanggil menghantar hanya medan yang berubah —
 * menghantar kolum khusus admin sebagai ahli biasa akan ditolak oleh trigger
 * `members_guard_admin_columns`, bukan diabaikan secara senyap.
 */
export async function updateMember(id: string, patch: Partial<Member>): Promise<void> {
  const { error } = await supabase.from('members').update(patch).eq('id', id);
  if (error) throw error;
}

// --- Import ------------------------------------------------------------------

export type ImportProgress = { done: number; total: number };

/**
 * Masukkan baris yang telah diterjemah ke dalam `members`.
 *
 * `nombor_ahli` ialah kunci konflik: menjalankan semula import yang sama akan
 * mengemas kini baris sedia ada dan bukan menduplikasinya. `user_id` tidak
 * disentuh langsung — pautan akaun yang sudah dibuat kekal utuh.
 */
export async function importMembers(
  members: ParsedMember[],
  onProgress?: (progress: ImportProgress) => void,
): Promise<number> {
  let done = 0;

  for (let index = 0; index < members.length; index += INSERT_CHUNK) {
    const chunk = members.slice(index, index + INSERT_CHUNK);

    const { error } = await supabase.from('members').upsert(chunk, { onConflict: 'nombor_ahli' });
    if (error) throw error;

    done += chunk.length;
    onProgress?.({ done, total: members.length });
  }

  return done;
}

/** Jumlah rekod ahli sedia ada — dipapar sebagai amaran sebelum import menimpanya. */
export async function countMembers(): Promise<number> {
  const { count, error } = await supabase.from('members').select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}
