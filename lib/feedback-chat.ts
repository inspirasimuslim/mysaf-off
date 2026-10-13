import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { supabase } from './supabase';

/** Mesti sepadan dengan semakan panjang dalam migration 151. */
export const CHAT_MAX_LENGTH = 2000;

export type FeedbackDepartment = { id: string; name: string };

export type FeedbackMyThread = {
  id: string;
  department_name: string;
  last_message_at: string;
  last_sender: 'ahli' | 'admin';
  last_body: string | null;
  unread: boolean;
};

export type FeedbackAdminThread = {
  id: string;
  member_name: string;
  generasi: string | null;
  department_name: string;
  last_message_at: string;
  last_sender: 'ahli' | 'admin';
  last_body: string | null;
  unread: boolean;
};

export type FeedbackThreadInfo = {
  department_name: string;
  member_name: string;
  generasi: string | null;
  is_owner: boolean;
  can_reply: boolean;
};

export type FeedbackMessage = {
  id: string;
  sender: 'ahli' | 'admin';
  sender_name: string;
  body: string;
  created_at: string;
};

/** Nama paparan department (selaras dengan penamaan baharu Hub Admin). Lalai: nama dalam pangkalan data. */
const DEPARTMENT_LABELS: Record<string, string> = {
  SETIAUSAHA: 'Setiausaha Agung (SUA)',
  'JABATAN SETIAUSAHA': 'Jabatan Setiausaha (JSU)',
  'TIMBALAN SETIAUSAHA': 'Timbalan Setiausaha (TSUA)',
  BENDAHARI: 'Bendahari Kehormat (BK)',
  'LAJNAH TARBIAH': 'Lajnah Tarbiah (LT)',
  'LAJNAH PERKADERAN': 'Lajnah Perkaderan (LP)',
  'LAJNAH HAL EHWAL SEKOLAH & ALUMNI': 'Lajnah Hal Ehwal Sekolah & Alumni (LHESA)',
  'LAJNAH PEMBANGUNAN GENERASI': 'Lajnah Pembangunan Generasi (LPG)',
  'LAJNAH PEMBANGUNAN NGO': 'Lajnah Pembangunan NGO (LPN)',
  'LAJNAH MUSLIMAT': 'Lajnah Muslimat (LM)',
  'I-GEM': 'Ikhwan Generasi Muda (I-GEM)',
  'LAJNAH KEBAJIKAN': 'Lajnah Kebajikan (LK)',
  'LAJNAH EKONOMI DAN ASET': 'Lajnah Ekonomi & Aset (LEA)',
  'JABATAN DATA & SUMBER MANUSIA': 'Jabatan Data & Sumber Manusia (JDSM)',
  'KESIHATAN AHLI': 'Lajnah Kebajikan (LK) — Kesihatan Ahli',
  'TABUNG ZAKAT': 'Lajnah Kebajikan (LK) — Tabung Zakat',
};

export function departmentLabel(name: string): string {
  return DEPARTMENT_LABELS[name] ?? name;
}

export async function fetchFeedbackDepartments(): Promise<FeedbackDepartment[]> {
  const { data, error } = await supabase.rpc('feedback_departments');
  if (error) throw error;
  return (data as FeedbackDepartment[] | null) ?? [];
}

export async function startFeedbackThread(departmentId: string, body: string): Promise<string> {
  const { data, error } = await supabase.rpc('feedback_start', { p_department: departmentId, p_body: body.trim() });
  if (error) throw error;
  return data as string;
}

export async function sendFeedbackMessage(threadId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('feedback_send', { p_thread: threadId, p_body: body.trim() });
  if (error) throw error;
}

export async function markFeedbackRead(threadId: string): Promise<void> {
  const { error } = await supabase.rpc('feedback_mark_read', { p_thread: threadId });
  if (error) throw error;
}

export async function fetchMyFeedbackThreads(): Promise<FeedbackMyThread[]> {
  const { data, error } = await supabase.rpc('feedback_my_threads');
  if (error) throw error;
  return (data as FeedbackMyThread[] | null) ?? [];
}

export async function fetchFeedbackMemberUnread(): Promise<number> {
  const { data, error } = await supabase.rpc('feedback_member_unread');
  if (error) throw error;
  return Number(data ?? 0);
}

/** Perbualan satu department (`departmentId`); tanpa argumen = semua yang boleh dilihat pemanggil. */
export async function fetchAdminFeedbackThreads(departmentId?: string): Promise<FeedbackAdminThread[]> {
  const { data, error } = await supabase.rpc('feedback_admin_threads', { p_department: departmentId ?? null });
  if (error) throw error;
  return (data as FeedbackAdminThread[] | null) ?? [];
}

export type FeedbackAdminDepartment = { department_id: string; department_name: string; unread: number };

/** Department yang pemanggil boleh lihat (Super Admin: semua aktif) + bilangan perbualan belum dibaca. */
export async function fetchFeedbackAdminDepartments(): Promise<FeedbackAdminDepartment[]> {
  const { data, error } = await supabase.rpc('feedback_admin_unread_by_dept');
  if (error) throw error;
  return ((data as FeedbackAdminDepartment[] | null) ?? []).map((row) => ({ ...row, unread: Number(row.unread) }));
}

/**
 * Peta nama department -> { id, unread } untuk Hub Admin; dimuat semula setiap kali skrin difokus
 * (lencana susut selepas admin membuka perbualan). `loading` = bacaan pertama belum selesai.
 */
export function useFeedbackDepartments(): {
  loading: boolean;
  byName: Record<string, { id: string; unread: number }>;
} {
  const [state, setState] = useState<{ loading: boolean; byName: Record<string, { id: string; unread: number }> }>({
    loading: true,
    byName: {},
  });
  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchFeedbackAdminDepartments()
        .then((rows) => {
          if (!active) return;
          const byName: Record<string, { id: string; unread: number }> = {};
          for (const row of rows) byName[row.department_name] = { id: row.department_id, unread: row.unread };
          setState({ loading: false, byName });
        })
        .catch(() => active && setState((prev) => ({ ...prev, loading: false })));
      return () => {
        active = false;
      };
    }, []),
  );
  return state;
}

/** Adakah pemanggil Super Admin atau admin mana-mana department (untuk papar peti masuk di Hub Admin)? */
export async function fetchFeedbackAdminInbox(): Promise<boolean> {
  const { data, error } = await supabase.rpc('feedback_admin_inbox');
  if (error) throw error;
  return data === true;
}

export async function fetchFeedbackThreadInfo(threadId: string): Promise<FeedbackThreadInfo> {
  const { data, error } = await supabase.rpc('feedback_thread_info', { p_thread: threadId });
  if (error) throw error;
  const row = (data as FeedbackThreadInfo[] | null)?.[0];
  if (!row) throw new Error('Perbualan tidak dijumpai.');
  return row;
}

export async function fetchFeedbackMessages(threadId: string): Promise<FeedbackMessage[]> {
  const { data, error } = await supabase.rpc('feedback_thread_messages', { p_thread: threadId });
  if (error) throw error;
  return (data as FeedbackMessage[] | null) ?? [];
}

/** Mesej ralat daripada RPC (kod 22023/42501/P0001/P0002 membawa teks Melayu yang selamat dipapar). */
export function feedbackErrorMessage(error: unknown, fallback: string): string {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e && typeof e.message === 'string' && ['22023', '42501', 'P0001', 'P0002'].includes(String(e.code))) {
    return e.message;
  }
  return fallback;
}

/** Masa ringkas untuk gelembung / senarai: "3:05 PM" hari ini, selain itu "13 Okt, 3:05 PM". */
export function formatChatTime(iso: string): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' });
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return time;
  const day = date.toLocaleDateString('ms-MY', { day: 'numeric', month: 'short' });
  return day + ', ' + time;
}
