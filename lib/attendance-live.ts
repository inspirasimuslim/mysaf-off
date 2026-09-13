import { supabase } from './supabase';

/**
 * Kehadiran masa nyata untuk satu acara — skrin admin "Kehadiran Live".
 *
 * Realtime digunakan sebagai ISYARAT sahaja. Mesej perubahan membawa baris
 * imbasan (member_id, masa) dan bukan nama; admin JABATAN SETIAUSAHA pula tidak
 * boleh membaca `members`. Jadi setiap isyarat mencetuskan bacaan semula
 * `event_attendance_live()`, yang memulangkan nama dan avatar dengan semakan
 * kebenaran jenis acara. Lihat `20260913000023_attendance_live.sql`.
 */

export type LiveAttendee = {
  scan_id: string;
  full_name: string;
  generasi: string | null;
  avatar_url: string | null;
  scanned_at: string;
  method: 'scan' | 'upload';
};

export async function fetchLiveAttendance(eventId: string): Promise<LiveAttendee[]> {
  const { data, error } = await supabase.rpc('event_attendance_live', { p_event_id: eventId });
  if (error) throw error;
  return (data as LiveAttendee[] | null) ?? [];
}

/** Keadaan saluran seperti dilaporkan oleh supabase-js. */
export type LiveStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR' | 'CONNECTING';

/**
 * Langgan perubahan `usrah_attendance_scans` bagi satu acara.
 *
 * Memulangkan fungsi yang MESTI dipanggil semasa skrin ditutup: saluran yang
 * tidak dibuang kekal terbuka pada pelayan Realtime dan dikira terhadap had
 * sambungan serentak projek.
 */
export function subscribeLiveAttendance(
  eventId: string,
  onChange: () => void,
  onStatus: (status: LiveStatus) => void,
): () => void {
  /*
    Tiga pendengar, bukan satu dengan `event: '*'`.

    Realtime tidak menyokong penapis pada DELETE, dan pada table ber-RLS mesej
    DELETE hanya membawa kunci utama (`id`) — bukan `event_id` — jadi penapis
    `event_id=eq.…` tidak pernah sepadan dan pemadaman tidak sampai langsung. Kiraan akan kekal pada nombor
    lama sehingga skrin dibuka semula.

    DELETE dilanggan TANPA penapis. Mesejnya hanya isyarat untuk membaca semula
    melalui RPC (yang menapis mengikut acara dan kebenaran), dan kandungannya
    hanya id baris, jadi tiada data acara lain terdedah. Pemadaman jarang
    berlaku — pembetulan oleh admin — jadi bacaan semula tambahan tidak membebankan.
  */
  const channel = supabase
    .channel('kehadiran-live:' + eventId)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'usrah_attendance_scans', filter: 'event_id=eq.' + eventId },
      () => onChange(),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'usrah_attendance_scans', filter: 'event_id=eq.' + eventId },
      () => onChange(),
    )
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'usrah_attendance_scans' }, () => onChange())
    .subscribe((status) => onStatus(status as LiveStatus));

  return () => {
    void supabase.removeChannel(channel);
  };
}
