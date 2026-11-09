import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ImageUploadError, readJpegBytes } from './image-upload';
import { supabase } from './supabase';

/** Mesti sepadan dengan semakan panjang dalam migration 153. */
export const COUNSEL_MAX_LENGTH = 2000;

export type Counselor = {
  id: string;
  full_name: string;
  generasi: string | null;
  no_tel: string | null;
  /** Profil (migration 165) — `undefined`/null sebelum migration dijalankan. */
  pendidikan?: string | null;
  pekerjaan?: string | null;
  gambar_path?: string | null;
};

export type CounselMyThread = {
  id: string;
  counselor_name: string;
  counselor_aktif: boolean;
  last_message_at: string;
  last_sender: 'ahli' | 'kaunselor';
  last_body: string | null;
  unread: boolean;
};

export type CounselorThread = {
  id: string;
  member_name: string;
  generasi: string | null;
  last_message_at: string;
  last_sender: 'ahli' | 'kaunselor';
  last_body: string | null;
  unread: boolean;
};

export type CounselThreadInfo = {
  counterpart_name: string;
  counterpart_generasi: string | null;
  is_member: boolean;
  can_reply: boolean;
};

export type CounselMessage = { id: string; sender: 'ahli' | 'kaunselor'; body: string; created_at: string };

/** Baris untuk LAJNAH KEBAJIKAN — BILANGAN sahaja, tiada identiti ahli yang menghubungi. */
export type CounselorAdminRow = {
  id: string;
  full_name: string;
  generasi: string | null;
  aktif: boolean;
  appointed_at: string;
  removed_at: string | null;
  ahli_menghubungi: number;
  nama_penuh?: string | null;
  pendidikan?: string | null;
  pekerjaan?: string | null;
  gambar_path?: string | null;
};

export type CounselorSearchRow = {
  id: string;
  full_name: string;
  generasi: string | null;
  nombor_ahli: string | null;
  sudah_kaunselor: boolean;
};

export async function fetchCounselors(): Promise<Counselor[]> {
  const { data, error } = await supabase.rpc('counseling_counselors');
  if (error) throw error;
  return (data as Counselor[] | null) ?? [];
}

/** Dicatat ketika ahli mengetik WhatsApp / Telefon (kegagalan senyap — tidak menghalang panggilan). */
export async function logCounselingContact(counselorId: string, channel: 'whatsapp' | 'telefon'): Promise<void> {
  const { error } = await supabase.rpc('counseling_log_contact', { p_counselor: counselorId, p_channel: channel });
  if (error) throw error;
}

export async function startCounselThread(counselorId: string, body: string): Promise<string> {
  const { data, error } = await supabase.rpc('counseling_start', { p_counselor: counselorId, p_body: body.trim() });
  if (error) throw error;
  return data as string;
}

export async function sendCounselMessage(threadId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('counseling_send', { p_thread: threadId, p_body: body.trim() });
  if (error) throw error;
}

export async function markCounselRead(threadId: string): Promise<void> {
  const { error } = await supabase.rpc('counseling_mark_read', { p_thread: threadId });
  if (error) throw error;
}

export async function fetchMyCounselThreads(): Promise<CounselMyThread[]> {
  const { data, error } = await supabase.rpc('counseling_my_threads');
  if (error) throw error;
  return (data as CounselMyThread[] | null) ?? [];
}

export async function fetchCounselMemberUnread(): Promise<number> {
  const { data, error } = await supabase.rpc('counseling_member_unread');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchCounselorThreads(): Promise<CounselorThread[]> {
  const { data, error } = await supabase.rpc('counseling_counselor_threads');
  if (error) throw error;
  return (data as CounselorThread[] | null) ?? [];
}

export async function fetchCounselorUnread(): Promise<number> {
  const { data, error } = await supabase.rpc('counseling_counselor_unread');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchCounselThreadInfo(threadId: string): Promise<CounselThreadInfo> {
  const { data, error } = await supabase.rpc('counseling_thread_info', { p_thread: threadId });
  if (error) throw error;
  const row = (data as CounselThreadInfo[] | null)?.[0];
  if (!row) throw new Error('Perbualan tidak dijumpai.');
  return row;
}

export async function fetchCounselMessages(threadId: string): Promise<CounselMessage[]> {
  const { data, error } = await supabase.rpc('counseling_thread_messages', { p_thread: threadId });
  if (error) throw error;
  return (data as CounselMessage[] | null) ?? [];
}

export async function fetchCounselorAdminList(): Promise<CounselorAdminRow[]> {
  const { data, error } = await supabase.rpc('counseling_admin_list');
  if (error) throw error;
  return ((data as CounselorAdminRow[] | null) ?? []).map((row) => ({
    ...row,
    ahli_menghubungi: Number(row.ahli_menghubungi),
  }));
}

export async function searchCounselorCandidates(query: string): Promise<CounselorSearchRow[]> {
  const { data, error } = await supabase.rpc('counseling_member_search', { p_q: query });
  if (error) throw error;
  return (data as CounselorSearchRow[] | null) ?? [];
}

export async function appointCounselor(memberId: string): Promise<void> {
  const { error } = await supabase.rpc('counseling_appoint', { p_member: memberId });
  if (error) throw error;
}

export async function removeCounselor(counselorId: string): Promise<void> {
  const { error } = await supabase.rpc('counseling_remove', { p_counselor: counselorId });
  if (error) throw error;
}

/** Padam kekal kaunselor (+ perbualannya). Objek gambar dibuang cuba-terbaik. */
export async function deleteCounselor(counselorId: string): Promise<void> {
  const { data, error } = await supabase.rpc('counseling_delete', { p_counselor: counselorId });
  if (error) throw error;
  if (typeof data === 'string' && data) {
    await supabase.storage.from('counselor-photos').remove([data]).catch(() => {});
  }
}

/** Mesej ralat RPC (kod 22023/42501/P0001/P0002 membawa teks Melayu yang selamat dipapar). */
export function counselErrorMessage(error: unknown, fallback: string): string {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e && typeof e.message === 'string' && ['22023', '42501', 'P0001', 'P0002'].includes(String(e.code))) {
    return e.message;
  }
  return fallback;
}

/** Bilangan perbualan belum dibaca untuk kaunselor (Hub Admin); dimuat semula setiap kali skrin difokus. */
export function useCounselorUnread(enabled: boolean): number {
  const [count, setCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let active = true;
      fetchCounselorUnread()
        .then((value) => active && setCount(value))
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [enabled]),
  );
  return enabled ? count : 0;
}

// --- Profil kaunselor (migration 165) ------------------------------------------

const PHOTO_BUCKET = 'counselor-photos';
const PHOTO_WIDTH = 800;

export const PROFILE_LIMITS = { nama: 120, pendidikan: 800, pekerjaan: 200 } as const;

export type CounselorProfileInput = { nama_penuh: string; pendidikan: string; pekerjaan: string };

export function counselorImageUrl(path: string): string {
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Satu kelayakan setiap baris -> senarai (baris kosong dibuang). */
export function educationLines(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Simpan profil. Gambar baharu dimuat naik DAHULU (dimampatkan ke lebar 800, JPEG), profil disimpan kemudian,
 * objek lama dibuang selepas berjaya; jika penyimpanan gagal, objek baharu dibuang (cuba-terbaik).
 */
export async function saveCounselorProfile(
  row: Pick<CounselorAdminRow, 'id' | 'gambar_path'>,
  input: CounselorProfileInput,
  photoUri: string | null,
  removePhotoFlag: boolean,
): Promise<void> {
  let newPath: string | null = null;
  if (photoUri) {
    const bytes = await readJpegBytes(photoUri, PHOTO_WIDTH);
    newPath = 'kaunselor-' + Date.now() + '.jpg';
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(newPath, bytes, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new ImageUploadError(error.message);
  }

  const setGambar = newPath !== null || removePhotoFlag;
  const { error } = await supabase.rpc('counseling_update_profile', {
    p_counselor: row.id,
    p_nama_penuh: input.nama_penuh,
    p_pendidikan: input.pendidikan,
    p_pekerjaan: input.pekerjaan,
    p_gambar_path: newPath,
    p_set_gambar: setGambar,
  });

  if (error) {
    if (newPath) await supabase.storage.from(PHOTO_BUCKET).remove([newPath]).catch(() => {});
    throw error;
  }

  if (setGambar && row.gambar_path && row.gambar_path !== newPath) {
    await supabase.storage.from(PHOTO_BUCKET).remove([row.gambar_path]).catch(() => {});
  }
}
