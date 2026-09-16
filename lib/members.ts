import type { DirectoryMember, Generation, Member, MemberSummary } from '@/types/database';

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

// --- Direktori ---------------------------------------------------------------

/**
 * Direktori ringkas untuk tab Ahli — dibaca oleh SEMUA pengguna yang log masuk.
 *
 * Ini bukan `select` ke `members`: RLS menyembunyikan baris orang lain daripada
 * ahli biasa, dengan sengaja. Fungsi `list_members_directory()` ialah laluan
 * berasingan yang mendedahkan lapan kolum terpilih sahaja — lihat
 * `20260906000004_members_directory.sql`.
 */
export async function fetchMemberDirectory(): Promise<DirectoryMember[]> {
  const { data, error } = await supabase.rpc('list_members_directory');
  if (error) throw error;
  return (data as DirectoryMember[] | null) ?? [];
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
 * Kaitkan akaun yang sedang log masuk kepada rekod ahli yang emelnya sama.
 *
 * Rekod yang diimport dari Excel mempunyai `user_id` NULL — RLS menyembunyikan
 * baris begitu daripada semua orang kecuali admin, jadi ahli tidak dapat
 * membaca rekodnya sendiri sehingga pautan dibuat. Padanan emel disahkan di
 * dalam pangkalan data (lihat `link_my_member_record` dalam
 * `20260906000003_member_account_linking.sql`); app tidak menghantar emel dan
 * tidak boleh memilih rekod mana yang dituntut.
 *
 * Memulangkan `id` rekod yang dipautkan, atau `null` bila tiada padanan tunggal.
 */
export async function linkMyMemberRecord(): Promise<string | null> {
  const { data, error } = await supabase.rpc('link_my_member_record');
  if (error) throw error;
  return (data as string | null) ?? null;
}

/**
 * Rekod ahli pengguna, dengan satu percubaan pautan bila belum dikaitkan.
 *
 * Digabungkan menjadi SATU fungsi supaya skrin Profil hanya mempunyai satu
 * laluan kod: sama ada rekod wujud, atau tidak. Kegagalan pautan sengaja tidak
 * ditelan — pemanggil melaporkannya seperti mana-mana ralat muat turun lain.
 */
export async function fetchMyMemberLinked(userId: string): Promise<Member | null> {
  const existing = await fetchMyMember(userId);
  if (existing) return existing;

  const linkedId = await linkMyMemberRecord();
  if (!linkedId) return null;

  return fetchMyMember(userId);
}

/**
 * Kemas kini sebahagian medan. Pemanggil menghantar hanya medan yang berubah —
 * menghantar kolum khusus admin sebagai ahli biasa akan ditolak oleh trigger
 * `members_guard_admin_columns`, bukan diabaikan secara senyap.
 */
export async function updateMember(id: string, patch: Partial<Member>): Promise<void> {
  /*
    `select('id')` bukan untuk membaca balik nilai — ia bukti bahawa tulisan
    benar-benar mendarat. Tanpa ia PostgREST memulangkan 204 walaupun TIADA
    baris dikemas kini, jadi permintaan yang ditapis oleh RLS kelihatan persis
    sama seperti simpanan yang berjaya: skrin memapar "Perubahan telah
    disimpan" sedangkan pangkalan data tidak berubah langsung.
  */
  const { data, error } = await supabase.from('members').update(patch).eq('id', id).select('id');
  if (error) throw error;

  if (!data || data.length === 0) {
    throw new Error('Perubahan tidak disimpan — rekod tidak dijumpai atau anda tiada kebenaran mengemas kininya.');
  }
}

// --- Generasi (pengurusan Super Admin) ---------------------------------------

/** Termasuk generasi nonaktif — skrin pengurusan perlu melihat kesemuanya. */
export async function createGeneration(code: string, label: string): Promise<void> {
  const { error } = await supabase
    .from('generations')
    .insert({ code: code.trim().toLowerCase(), label: label.trim() });
  if (error) throw error;
}

export async function setGenerationActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('generations').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}

/**
 * `members.generasi` merujuk `generations.code` dengan `on delete restrict`,
 * jadi pangkalan data sendiri yang menolak pemadaman generasi yang masih
 * digunakan — skrin tidak perlu mengira ahli dahulu.
 */
export async function deleteGeneration(id: string): Promise<void> {
  const { error } = await supabase.from('generations').delete().eq('id', id);
  if (error) throw error;
}

// --- Akaun ahli (Edge Function) ----------------------------------------------

export type CreatedMember = {
  member_id: string;
  nombor_ahli: string;
  email: string;
  full_name: string;
  /** Dipulangkan sekali sahaja — jangan simpan atau log. */
  password: string;
};

export type CreateMemberInput = {
  full_name: string;
  email: string;
  generasi: string;
  kawasan_usrah: string | null;
};

/**
 * Cipta akaun log masuk + rekod ahli.
 *
 * Melalui Edge Function kerana mencipta akaun memerlukan `service_role`, dan
 * kunci itu tidak boleh berada dalam app. Fungsi di pelayan mengesahkan semula
 * kebenaran pemanggil daripada JWT — panggilan ini bukan lapisan kawalan.
 */
export async function createMemberAccount(input: CreateMemberInput): Promise<CreatedMember> {
  const { data, error } = await supabase.functions.invoke('admin-create-member', { body: input });
  if (error) throw new Error(await edgeMessage(error, 'Gagal mencipta akaun ahli.'));
  if (data?.error) throw new Error(String(data.error));
  return data as CreatedMember;
}

/** Padam rekod ahli DAN akaunnya. Kekal — pemanggil mesti mengesahkan niat dahulu. */
export async function deleteMemberAccount(memberId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-delete-member', {
    body: { member_id: memberId },
  });
  if (error) throw new Error(await edgeMessage(error, 'Gagal memadam ahli.'));
  if (data?.error) throw new Error(String(data.error));
}

/**
 * Edge Function memulangkan sebab kegagalan dalam badan respons, tetapi
 * `FunctionsHttpError` hanya membawa "non-2xx status code". Tanpa membaca
 * badan itu, admin akan melihat mesej generik dan bukan sebab sebenar.
 */
export async function edgeMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: Response })?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json();
      if (body?.error) return String(body.error);
    } catch {
      // Badan bukan JSON — gunakan mesej sandaran.
    }
  }
  return error instanceof Error && error.message ? fallback + ' (' + error.message + ')' : fallback;
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
