import { readJpegBase64 } from './image-upload';
import { edgeMessage } from './members';
import { supabase } from './supabase';

/**
 * Album Gambar Event — Google Drive Shared Drive, crowd-sourced.
 *
 * Fail SEBENAR tinggal di Google Drive; `event_photos` (dibaca terus, RLS
 * terbuka luas) hanya menyimpan metadata. Muat naik/padam SEBENAR melalui
 * Edge Function (credential Service Account tidak boleh berada di client) —
 * lihat `supabase/functions/{upload-event-photo,delete-event-photo,
 * get-photo-access-token}` dan `supabase/functions/_shared/google-drive.ts`.
 */

export type EventPhoto = {
  id: string;
  event_id: string;
  uploaded_by: string | null;
  drive_file_id: string;
  caption: string | null;
  created_at: string;
};

export async function fetchEventPhotos(eventId: string): Promise<EventPhoto[]> {
  const { data, error } = await supabase
    .from('event_photos')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as EventPhoto[] | null) ?? [];
}

/** Lebar & kualiti yang sama untuk SETIAP gambar album — kekal kecil untuk kuota Drive dan talian perlahan. */
const MAX_WIDTH = 1600;
const QUALITY = 0.75;

export async function uploadEventPhoto(
  eventId: string,
  uri: string,
  caption: string | null = null,
): Promise<{ photo_id: string; drive_file_id: string }> {
  const imageBase64 = await readJpegBase64(uri, MAX_WIDTH, QUALITY);

  const { data, error } = await supabase.functions.invoke('upload-event-photo', {
    body: { event_id: eventId, image_base64: imageBase64, caption },
  });
  if (error) throw new Error(await edgeMessage(error, 'Gagal memuat naik gambar.'));
  if (data?.error) throw new Error(String(data.error));
  return data as { photo_id: string; drive_file_id: string };
}

export async function deleteEventPhoto(photoId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-event-photo', { body: { photo_id: photoId } });
  if (error) throw new Error(await edgeMessage(error, 'Gagal memadam gambar.'));
  if (data?.error) throw new Error(String(data.error));
}

/*
  Cache token di PERINGKAT MODUL (bukan sekadar dalam satu komponen) — sah
  ~1 jam, jadi ia kekal berguna merentasi skrin album yang dibuka semula
  dalam sesi yang sama, bukan sekadar dalam satu pembukaan skrin. Setiap
  gambar dalam grid memanggil `getPhotoAccessToken()`, tetapi hanya
  permintaan PERTAMA (atau selepas luput) benar-benar memanggil Edge Function.
*/
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getPhotoAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const { data, error } = await supabase.functions.invoke('get-photo-access-token', { body: {} });
  if (error) throw new Error(await edgeMessage(error, 'Gagal mendapatkan capaian gambar.'));
  if (data?.error) throw new Error(String(data.error));

  const result = data as { access_token: string; expires_in: number };
  cachedToken = { token: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
  return result.access_token;
}

/** URL fetch TERUS dari Google (bukan proxy Supabase) — lihat nota `get-photo-access-token`. */
export function driveImageUrl(driveFileId: string, accessToken: string): string {
  return 'https://www.googleapis.com/drive/v3/files/' + driveFileId + '?alt=media&access_token=' + encodeURIComponent(accessToken);
}
