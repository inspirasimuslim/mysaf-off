import { usePathname } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { usePermissions } from './permissions';
import { supabase } from './supabase';

/**
 * Notifikasi admin — migration 145 (`admin_notifications()`).
 *
 * Setiap baris ialah satu JENIS tugasan tertunggak (bukan satu mesej), dikira
 * terus oleh pangkalan data mengikut kebenaran pemanggil. Migration 169: bagi
 * iklan/padam akaun/bantuan, setiap admin ada status "dilihat" (disimpan di DB,
 * kekal selepas log keluar) — disenyapkan sehingga ada permohonan baharu. Chat dan
 * kaunseling guna status baca sendiri.
 */
export type AdminNotification = {
  kind: string;
  title: string;
  preview: string;
  jumlah: number;
  terbaru: string;
  /** Laluan expo-router skrin semakan. */
  route: string;
};

type Value = {
  items: AdminNotification[];
  /** Jumlah semua tugasan tertunggak (untuk nombor pada loceng). */
  total: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  /** Tandakan jenis notifikasi sudah dilihat (hanya jenis yang menyokongnya ditulis oleh DB). */
  markSeen: (kinds: string[]) => Promise<void>;
};

const EMPTY: Value = { items: [], total: 0, open: false, setOpen: () => undefined, refresh: async () => undefined, markSeen: async () => undefined };

const Context = createContext<Value>(EMPTY);

/** Jenis yang menyimpan status dilihat di DB (migration 169). */
const SEEN_KINDS = new Set(['iklan_menunggu', 'padam_akaun', 'bantuan_menunggu']);

/** Selang semak semula selagi app terbuka (ms). */
const POLL_MS = 90_000;

async function fetchAdminNotifications(): Promise<AdminNotification[]> {
  const { data, error } = await supabase.rpc('admin_notifications');
  if (error) throw error;
  return ((data as AdminNotification[] | null) ?? []).map((row) => ({ ...row, jumlah: Number(row.jumlah) }));
}

/**
 * Dipasang SEKALI dalam `AppGate` (selepas semua pintu lulus), supaya akaun yang
 * disekat/belum tukar kata laluan tidak membuat panggilan ini.
 *
 * Dimuat semula: sewaktu mula, bila skrin bertukar (admin yang baru meluluskan
 * sesuatu melihat penanda susut), bila app kembali aktif, dan berkala.
 * Dialog pratonton terbuka SEKALI setiap sesi app, sebaik data pertama tiba dan
 * ada sesuatu untuk dilihat — bukan pada setiap muat semula.
 */
export function AdminNotificationsProvider({ children }: { children: ReactNode }) {
  const { loading, isAdmin, isCounselor } = usePermissions();
  const pathname = usePathname();
  const enabled = !loading && (isAdmin() || isCounselor());

  const [items, setItems] = useState<AdminNotification[]>([]);
  const [open, setOpen] = useState(false);
  const autoShown = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const next = await fetchAdminNotifications();
      setItems(next);
      if (!autoShown.current) {
        autoShown.current = true;
        if (next.length > 0) setOpen(true);
      }
    } catch {
      // Notifikasi ialah bonus: kegagalan rangkaian tidak patut mengganggu skrin lain.
    }
  }, [enabled]);

  const markSeen = useCallback(
    async (kinds: string[]) => {
      if (!enabled || kinds.length === 0) return;
      // Senyapkan serta-merta (optimistik); jika gagal, muat semula memulihkan paparan sebenar.
      setItems((current) => current.filter((row) => !kinds.includes(row.kind) || !SEEN_KINDS.has(row.kind)));
      try {
        const { error } = await supabase.rpc('admin_notification_mark_seen', { p_kinds: kinds });
        if (error) throw error;
      } catch {
        // Gagal rangkaian: notifikasi muncul semula pada muat semula berikut.
      }
      await refresh();
    },
    [enabled, refresh],
  );

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      return;
    }
    void refresh();
  }, [enabled, refresh, pathname]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [enabled, refresh]);

  const value = useMemo<Value>(
    () => ({ items, total: items.reduce((sum, row) => sum + row.jumlah, 0), open, setOpen, refresh, markSeen }),
    [items, open, refresh, markSeen],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAdminNotifications(): Value {
  return useContext(Context);
}
