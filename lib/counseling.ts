import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { supabase } from './supabase';

/** Mesti sepadan dengan semakan panjang dalam migration 153. */
export const COUNSEL_MAX_LENGTH = 2000;

export type Counselor = { id: string; full_name: string; generasi: string | null; no_tel: string | null };

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
