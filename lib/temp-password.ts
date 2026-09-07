import { supabase } from './supabase';

/**
 * Kata laluan sementara.
 *
 * Ahli baharu menerima kata laluan yang SAMA — `TEMP_PASSWORD` dalam Edge
 * Function — dan itu disengajakan: satu rahsia yang perlu dihantar berbeza
 * kepada ratusan orang bukan rahsia, ia cuma kerja pentadbiran yang akan gagal.
 *
 * Perlindungannya berada di dua tempat lain, dan kedua-duanya di sini:
 *
 *   1. `must_change_password` — app menolak pergi ke mana-mana selain skrin
 *      tukar kata laluan.
 *   2. `temp_password_expires_at` — selepas tiga hari kata laluan itu tidak
 *      lagi membuka apa-apa, dan hanya Super Admin boleh membukanya semula.
 *
 * Sama seperti `lib/suspension.ts`, ini lapisan PENGALAMAN PENGGUNA. Kedua-dua
 * tanda dibaca melalui `my_password_status()`, `security definer`, supaya
 * jawapannya tidak bergantung pada policy yang tiada kaitan dengan kata laluan.
 */

/** Kata laluan yang diedarkan bersama akaun baharu — sama seperti dalam Edge Function. */
export const TEMP_PASSWORD = 'ikhwandihati';

export const EXPIRED_MESSAGE =
  'Tempoh log masuk sementara anda telah tamat. Hubungi Super Admin untuk membukanya semula.';

/**
 * `'unknown'` ialah jawapan yang SAH, sama seperti dalam semakan sekatan —
 * tetapi ia dilayan secara BERBEZA di sini.
 *
 * Sekatan gagal-tertutup: tanpa jawapan, tiada bukti akaun itu dibenarkan.
 * Paksaan tukar kata laluan gagal-TERBUKA: ia kemudahan dan bukan sempadan
 * keselamatan, dan menahan seseorang di luar app kerana talian tergendala akan
 * merugikan tanpa melindungi apa-apa.
 */
export type PasswordStatus =
  | { state: 'checking' }
  | { state: 'ok' }
  | { state: 'must-change'; expiresAt: string | null }
  | { state: 'expired' }
  | { state: 'unknown' };

type StatusRow = { must_change: boolean; expires_at: string | null };

export async function fetchPasswordStatus(): Promise<PasswordStatus> {
  const { data, error } = await supabase.rpc('my_password_status');
  if (error) return { state: 'unknown' };

  const row = (data as StatusRow[] | null)?.[0];

  // Tiada baris bermakna akaun ini belum dipautkan kepada rekod ahli. Ia tidak
  // pernah menerima kata laluan sementara, jadi tiada apa untuk dipaksa.
  if (!row || !row.must_change) return { state: 'ok' };

  if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) {
    return { state: 'expired' };
  }

  return { state: 'must-change', expiresAt: row.expires_at };
}

/** Dipanggil SELEPAS `auth.updateUser({ password })` berjaya, bukan sebelumnya. */
export async function completePasswordChange(): Promise<void> {
  const { error } = await supabase.rpc('complete_password_change');
  if (error) throw error;
}

/*
  SQLSTATE yang dilontar sendiri oleh `reset_member_login_window()`. Kelas 'MS'
  ialah kod aplikasi projek ini, jadi mesejnya ditulis oleh kita dan selamat
  dipapar terus — tidak seperti kod sistem, yang mesejnya dalam bahasa
  Inggeris dan boleh mendedahkan butiran dalaman.
*/
const RESET_CODES = new Set(['MS001', 'MS002']);

export type PasswordResetResult = {
  member_id: string;
  full_name: string;
  email: string | null;
  /** Kata laluan sementara — sama untuk semua, jadi ia dipapar untuk disampaikan. */
  password: string;
  expires_at: string;
};

/**
 * Tetapkan semula kata laluan seorang ahli kepada kata laluan sementara —
 * Super Admin sahaja.
 *
 * Menggantikan `resetMemberLoginWindow()` sebagai laluan bantuan admin. Bendera
 * sahaja hanya membantu ahli yang MASIH INGAT kata laluannya; orang yang
 * meminta bantuan admin biasanya meminta kerana dia tidak ingat.
 */
export async function resetMemberPassword(memberId: string): Promise<PasswordResetResult> {
  const { data, error } = await supabase.functions.invoke('admin-reset-member-password', {
    body: { member_id: memberId },
  });

  if (error) {
    /*
      Edge Function memulangkan sebab kegagalan dalam badan respons, tetapi
      `FunctionsHttpError` hanya membawa "non-2xx status code". Tanpa membaca
      badan itu, admin akan melihat mesej generik dan bukan sebab sebenar —
      termasuk amaran keadaan tidak konsisten, yang mesti sampai.
    */
    const context = (error as { context?: Response })?.context;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        if (body?.error) throw new Error(String(body.error));
      } catch (parsed) {
        if (parsed instanceof Error && parsed.message) throw parsed;
      }
    }
    throw new Error('Gagal menetapkan semula kata laluan ahli.');
  }

  if (data?.error) throw new Error(String(data.error));
  return data as PasswordResetResult;
}

/**
 * Buka semula tetingkap tiga hari TANPA menyentuh kata laluan — Super Admin
 * sahaja.
 *
 * Dikekalkan untuk keserasian; app tidak lagi memanggilnya. Ia masih berguna
 * bagi kes yang berbeza daripada "lupa kata laluan": ahli yang tahu kata
 * laluannya tetapi tetingkap sementaranya sudah luput.
 */
export async function resetMemberLoginWindow(memberId: string): Promise<string> {
  const { data, error } = await supabase.rpc('reset_member_login_window', { p_member_id: memberId });

  if (error) {
    if (RESET_CODES.has(error.code)) throw new Error(error.message);
    throw error;
  }

  return String(data);
}

export type SuperAdminContact = { full_name: string; no_tel: string | null };

/**
 * Nama dan nombor Super Admin, untuk skrin log masuk.
 *
 * Boleh dipanggil SEBELUM log masuk — `anon` diberi EXECUTE dengan sengaja.
 * Orang yang paling memerlukan nombor ini ialah orang yang tidak boleh masuk.
 */
export async function fetchSuperAdminContacts(): Promise<SuperAdminContact[]> {
  const { data, error } = await supabase.rpc('list_super_admin_contacts');
  if (error) throw error;
  return (data as SuperAdminContact[] | null) ?? [];
}

/** Akaun ahli untuk SETIAP rekod yang belum ada — Super Admin sahaja. */
export type ProvisionSummary = {
  dicipta: number;
  dipaut_semula: number;
  dilangkau_sudah_ada_akaun: number;
  dilangkau_tiada_emel: number;
  gagal: { email: string; sebab: string }[];
};

export async function provisionMemberAccounts(): Promise<ProvisionSummary> {
  const { data, error } = await supabase.functions.invoke('admin-provision-members', { body: {} });

  if (error) {
    const context = (error as { context?: Response })?.context;
    if (context && typeof context.json === 'function') {
      try {
        const body = await context.json();
        if (body?.error) throw new Error(String(body.error));
      } catch (parsed) {
        if (parsed instanceof Error && parsed.message) throw parsed;
      }
    }
    throw new Error('Gagal mencipta akaun ahli.');
  }

  if (data?.error) throw new Error(String(data.error));
  return data as ProvisionSummary;
}
