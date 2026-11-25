import { useSyncExternalStore } from 'react';

import { supabase } from './supabase';

/** Peti masuk notifikasi ahli — membaca baris push_outbox milik sendiri (migration 175). */
export type MemberNotification = {
  id: number;
  title: string;
  body: string;
  route: string | null;
  created_at: string;
  read_at: string | null;
};

export async function fetchMyNotifications(limit = 50): Promise<MemberNotification[]> {
  const { data, error } = await supabase.rpc('my_notifications', { p_limit: limit });
  if (error) throw error;
  return (data as MemberNotification[] | null) ?? [];
}

export async function markNotificationsRead(id?: number): Promise<void> {
  const { error } = await supabase.rpc('my_notifications_mark_read', { p_id: id ?? null });
  if (error) throw error;
  void refreshUnreadCount(true);
}

// --- Kiraan belum dibaca: satu stor kongsi supaya setiap kepala skrin tidak membuat pertanyaan sendiri ---
let unread = 0;
let lastFetch = 0;
const listeners = new Set<() => void>();
const MIN_INTERVAL_MS = 30_000;

function emit() {
  listeners.forEach((listener) => listener());
}

export async function refreshUnreadCount(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastFetch < MIN_INTERVAL_MS) return;
  lastFetch = now;
  const { data, error } = await supabase.rpc('my_notifications_unread');
  if (error) return;
  const next = typeof data === 'number' ? data : 0;
  if (next !== unread) {
    unread = next;
    emit();
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    // Pelanggan pertama: segarkan serta-merta (pengguna mungkin bertukar) dan mula tinjauan 60 saat.
    void refreshUnreadCount(true);
    timer = setInterval(() => void refreshUnreadCount(true), 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useUnreadNotificationCount(): number {
  return useSyncExternalStore(subscribe, () => unread, () => 0);
}
