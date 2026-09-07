import type { Announcement } from '@/types/database';

import { uploadImage } from './image-upload';
import { supabase } from './supabase';

/**
 * Operasi pangkalan data untuk pengumuman.
 *
 * Sama seperti `lib/usrah-events.ts`: setiap fungsi melontar ralat mentah
 * Supabase dan tidak menyemak peranan sendiri. RLS pada `announcements` yang
 * menentukan siapa boleh membaca dan menulis — lihat
 * `20260907000012_announcements_and_directory.sql`.
 */

const POSTER_BUCKET = 'announcement-posters';

/** Poster dipapar penuh lebar pada skrin telefon; 1080px sudah lebih daripada cukup. */
const POSTER_MAX_WIDTH = 1080;

export type CreateAnnouncementInput = {
  title: string;
  description: string | null;
  poster_url: string;
  is_active: boolean;
  /** 'YYYY-MM-DD' atau `null` untuk "tiada had pada hujung itu". */
  start_date: string | null;
  end_date: string | null;
};

/** Hari ini sebagai 'YYYY-MM-DD' waktu tempatan. */
function today(): string {
  const now = new Date();
  return (
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0')
  );
}

/**
 * Pengumuman yang patut dipapar kepada ahli HARI INI.
 *
 * Tetingkap ditapis di sini dan bukan dalam RLS: policy `announcements_select`
 * menjaga SIAPA yang boleh membaca, manakala tarikh menjawab BILA ia patut
 * kelihatan — dan pengurus mesti terus melihat pengumuman di luar tetingkapnya
 * untuk mengurusnya. Dua soalan berbeza, dua lapisan berbeza.
 *
 * Perbandingan dibuat terhadap tarikh peranti. Itu boleh diubah, tetapi kesan
 * terburuknya ialah seseorang melihat poster beberapa jam lebih awal — bukan
 * perkara yang berbaloi dilindungi dengan panggilan tambahan ke pelayan.
 */
export async function fetchVisibleAnnouncements(): Promise<Announcement[]> {
  const now = today();

  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .eq('is_active', true)
    .or('start_date.is.null,start_date.lte.' + now)
    .or('end_date.is.null,end_date.gte.' + now)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as Announcement[] | null) ?? [];
}

/**
 * Semua pengumuman yang boleh dilihat pemanggil.
 *
 * Ahli biasa mendapat yang aktif sahaja dan pengurus mendapat kesemuanya —
 * perbezaan itu datang daripada policy `announcements_select`, bukan daripada
 * penapis di sini. Satu fungsi melayan kedua-dua skrin kerana soalannya sama:
 * "apa yang saya dibenarkan lihat".
 */
export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as Announcement[] | null) ?? [];
}

export async function fetchAnnouncement(id: string): Promise<Announcement | null> {
  const { data, error } = await supabase.from('announcements').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Announcement | null) ?? null;
}

/**
 * Muat naik poster ke laluan yang dijana sendiri.
 *
 * Berbeza daripada poster program, yang dinamakan '<event_id>.jpg' dan dimuat
 * naik SELEPAS baris wujud: pengumuman memerlukan `poster_url` pada saat ia
 * dicipta (kolum itu NOT NULL), jadi failnya perlu wujud dahulu. Penanda masa
 * memberikan nama unik tanpa memerlukan id yang belum ada.
 */
export async function uploadAnnouncementPoster(uri: string): Promise<string> {
  const path = 'poster-' + Date.now() + '.jpg';
  return uploadImage(POSTER_BUCKET, path, uri, POSTER_MAX_WIDTH);
}

export async function createAnnouncement(input: CreateAnnouncementInput): Promise<Announcement> {
  const { data: session } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from('announcements')
    .insert({ ...input, created_by: session.user?.id ?? null })
    .select('*')
    .single();

  if (error) throw error;
  return data as Announcement;
}

/** Kemas kini dan pulangkan baris terkini — baris kosong bermakna RLS menolaknya. */
export async function updateAnnouncement(
  id: string,
  patch: Partial<CreateAnnouncementInput>,
): Promise<Announcement> {
  const { data, error } = await supabase.from('announcements').update(patch).eq('id', id).select('*');

  if (error) throw error;

  const row = (data as Announcement[] | null)?.[0];
  if (!row) {
    throw new Error('Perubahan tidak disimpan — pengumuman tidak dijumpai atau anda tiada kebenaran mengubahnya.');
  }

  return row;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
}
