import * as Crypto from 'expo-crypto';

import type { EventType, UpcomingEvent, UsrahEvent } from '@/types/database';

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
};

export type UpdateUsrahEventInput = Partial<CreateUsrahEventInput & { is_active: boolean; poster_url: string }>;

/**
 * Kandungan kod QR.
 *
 * `randomUUID` dan bukan nilai yang diterbitkan daripada `id` program: sesiapa
 * yang memegang token ini boleh mendakwa hadir, jadi ia tidak boleh diteka
 * daripada apa-apa yang kelihatan pada skrin atau dalam URL.
 */
function newQrToken(): string {
  return Crypto.randomUUID();
}

/**
 * Acara satu jenis sahaja.
 *
 * Penapis `event_type` di sini ialah kemudahan, bukan sempadan keselamatan:
 * RLS sudah menyembunyikan jenis yang admin ini tiada kebenaran melihatnya.
 * Ia wujud supaya admin yang memegang KEDUA-DUA department masih melihat dua
 * senarai berasingan dan bukan satu senarai bercampur.
 */
export async function fetchUsrahEvents(eventType: EventType): Promise<UsrahEvent[]> {
  const { data, error } = await supabase
    .from('usrah_events')
    .select('*')
    .eq('event_type', eventType)
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
 */
export async function createUsrahEvent(input: CreateUsrahEventInput): Promise<UsrahEvent> {
  const { data: session } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('usrah_events')
    .insert({ ...input, qr_token: newQrToken(), created_by: session.user?.id ?? null })
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

export async function deleteUsrahEvent(id: string): Promise<void> {
  const { error } = await supabase.from('usrah_events').delete().eq('id', id);
  if (error) throw error;
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
 * hadir. Fungsi `security definer` itu mendedahkan sembilan kolum paparan
 * sahaja.
 */
export async function fetchUpcomingEvents(): Promise<UpcomingEvent[]> {
  const { data, error } = await supabase.rpc('event_upcoming_directory');
  if (error) throw error;
  return (data as UpcomingEvent[] | null) ?? [];
}
