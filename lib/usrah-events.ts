import type { EventDirectoryRow, EventMode, EventType, UpcomingEvent, UsrahEvent } from '@/types/database';

import { uploadImage } from './image-upload';
import { supabase } from './supabase';

/**
 * Operasi pangkalan data untuk program usrah.
 *
 * Sama seperti `lib/members.ts`: setiap fungsi melontar ralat mentah Supabase
 * dan tidak menyemak peranan sendiri. RLS pada `usrah_events` yang menentukan
 * siapa boleh membaca dan menulis — lihat `20260907000009_usrah_events.sql`.
 */

const POSTER_BUCKET = 'event-posters';

/** Poster dipapar penuh lebar pada skrin telefon; 1080px sudah lebih daripada cukup. */
const POSTER_MAX_WIDTH = 1080;

export type CreateUsrahEventInput = {
  name: string;
  event_type: EventType;
  /** Usrah sahaja; kekangan pangkalan data menolak nilai ini pada baris 'program'. */
  kawasan_usrah: string | null;
  year: number | null;
  month: number | null;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  location_text: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number;
  /** 'bersemuka' = geofence menghalang; 'hibrid' = geofence melabel sahaja. */
  event_mode: EventMode;
  /** Program sahaja — kehadiran turut dikira sebagai Usrah bulan tarikh mula. */
  bermalam: boolean;
  ganti_usrah: boolean;
  /** Wajib bila `ganti_usrah` (kekangan pangkalan data); NULL selainnya. */
  ganti_usrah_year: number | null;
  ganti_usrah_month: number | null;
};

export type UpdateUsrahEventInput = Partial<
  CreateUsrahEventInput & { is_active: boolean; poster_url: string; qr_enabled: boolean }
>;

/**
 * Acara satu jenis sahaja.
 *
 * Penapis `event_type` di sini ialah kemudahan, bukan sempadan keselamatan:
 * RLS sudah menyembunyikan jenis yang admin ini tiada kebenaran melihatnya.
 * Ia wujud supaya admin yang memegang KEDUA-DUA department masih melihat dua
 * senarai berasingan dan bukan satu senarai bercampur.
 */
export async function fetchUsrahEvents(eventType: EventType, archived = false): Promise<UsrahEvent[]> {
  const base = supabase.from('usrah_events').select('*').eq('event_type', eventType);

  const { data, error } = await (archived ? base.not('archived_at', 'is', null) : base.is('archived_at', null))
    .order('start_date', { ascending: false })
    .order('start_time', { ascending: false });

  if (error) throw error;
  return (data as UsrahEvent[] | null) ?? [];
}

export async function fetchUsrahEvent(id: string): Promise<UsrahEvent | null> {
  const { data, error } = await supabase.from('usrah_events').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as UsrahEvent | null) ?? null;
}

/**
 * Cipta acara dan pulangkan baris yang tersimpan.
 *
 * `valid_until` TIDAK dihantar dari sini — trigger pangkalan data yang
 * mengiranya (tiga jam selepas acara TAMAT, waktu Malaysia). Jam peranti boleh
 * silap atau diubah, dan tetingkap kehadiran bukan perkara yang patut
 * bergantung pada jam pengguna.
 *
 * `qr_token` juga TIDAK dihantar: trigger menjananya dalam INSERT yang sama
 * (UUID rawak, tidak boleh diteka daripada `id`), dan kekangan menolak token
 * kosong. Jadi baris yang berjaya dicipta SENTIASA mempunyai kod QR yang sah,
 * tanpa bergantung pada poster atau apa-apa langkah selepasnya. Lihat
 * `20260913000024_qr_token_server_generated.sql`.
 */
export async function createUsrahEvent(input: CreateUsrahEventInput): Promise<UsrahEvent> {
  const { data: session } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('usrah_events')
    .insert({ ...input, created_by: session.user?.id ?? null })
    .select('*')
    .single();

  if (error) throw error;
  return data as UsrahEvent;
}

/** Kemas kini dan pulangkan baris terkini — baris kosong bermakna RLS menolaknya. */
export async function updateUsrahEvent(id: string, patch: UpdateUsrahEventInput): Promise<UsrahEvent> {
  const { data, error } = await supabase.from('usrah_events').update(patch).eq('id', id).select('*');

  if (error) throw error;

  const row = (data as UsrahEvent[] | null)?.[0];
  if (!row) {
    throw new Error('Perubahan tidak disimpan — program tidak dijumpai atau anda tiada kebenaran mengubahnya.');
  }

  return row;
}

export type DeleteEventResult = {
  outcome: 'deleted' | 'archived';
  attendance: number;
  rsvp: number;
};

/**
 * "Padam" acara — pelayan yang memutuskan sama ada dipadam terus atau diarkib.
 *
 * Acara dengan rekod kehadiran/RSVP diarkibkan supaya sejarahnya kekal; yang
 * tiada rekod dipadam terus. Lihat `20260915000028_event_delete_archive.sql`.
 *
 * Selepas padam terus, poster asal dan poster ber-QR dibuang dari Storage.
 * Pembuangan itu cuba-terbaik: baris sudah tiada, jadi kegagalan di sini hanya
 * meninggalkan fail yatim — bukan sebab untuk melaporkan padam sebagai gagal.
 */
export async function deleteOrArchiveEvent(id: string): Promise<DeleteEventResult> {
  const { data, error } = await supabase.rpc('delete_or_archive_event', { p_event_id: id });
  if (error) throw error;

  const row = (data as { outcome: string; attendance_count: number; rsvp_count: number }[] | null)?.[0];
  if (!row) throw new Error('Program tidak dijumpai atau anda tiada kebenaran memadamnya.');

  if (row.outcome === 'deleted') {
    await supabase.storage
      .from(POSTER_BUCKET)
      .remove([id + '.jpg', id + '-qr.jpg'])
      .catch(() => undefined);
  }

  return {
    outcome: row.outcome === 'deleted' ? 'deleted' : 'archived',
    attendance: row.attendance_count,
    rsvp: row.rsvp_count,
  };
}

/**
 * Muat naik poster dan simpan URLnya pada program.
 *
 * Nama objek ialah '<event_id>.jpg', jadi satu program bermakna satu fail dan
 * poster baharu menggantikan yang lama tanpa padam berasingan.
 */
export async function uploadEventPoster(eventId: string, uri: string): Promise<string> {
  const url = await uploadImage(POSTER_BUCKET, eventId + '.jpg', uri, POSTER_MAX_WIDTH);
  await updateUsrahEvent(eventId, { poster_url: url });
  return url;
}

/**
 * Acara akan datang seperti dilihat oleh AHLI.
 *
 * Melalui `event_upcoming_directory()` dan bukan `.from('usrah_events')`: RLS
 * table itu kekal tertutup kepada ahli, dan atas sebab yang baik — barisnya
 * memegang `qr_token`, yang membolehkan sesiapa yang memilikinya mendakwa
 * hadir. Fungsi `security definer` itu mendedahkan kolum paparan dan kod QR
 * acara aktif sahaja — tanpa koordinat pin, geofence atau pencipta.
 */
export async function fetchUpcomingEvents(): Promise<UpcomingEvent[]> {
  const { data, error } = await supabase.rpc('event_upcoming_directory');
  if (error) throw error;
  return (data as UpcomingEvent[] | null) ?? [];
}

/**
 * SEMUA acara (lampau + semasa + akan datang) seperti dilihat oleh AHLI, dengan
 * bilangan gambar album setiap satu — lihat `event_directory_all()`.
 *
 * Untuk skrin Album global (Tetapan > Lain-lain > Album) dan event-info.tsx —
 * yang kedua perlu ini (bukan `fetchUpcomingEvents`) supaya butiran acara LAMA
 * masih boleh dipaparkan untuk sekat/gantikan butang Album, bukan terus jatuh
 * ke "Acara tidak dijumpai".
 *
 * `excludeArchivedAlbum` default `false` — butiran program/usrah (event-info.tsx)
 * SENTIASA kelihatan tak kira status album. HANYA skrin Album Tetapan (album.tsx)
 * yang patut hantar `true`, supaya "Padam Seluruh Album" menyorok acara itu dari
 * senarai Album sahaja, bukan daripada carousel/butiran ahli.
 */
export async function fetchAllEventsDirectory(excludeArchivedAlbum = false): Promise<EventDirectoryRow[]> {
  const { data, error } = await supabase.rpc('event_directory_all', {
    p_exclude_archived_album: excludeArchivedAlbum,
  });
  if (error) throw error;
  return (data as EventDirectoryRow[] | null) ?? [];
}
