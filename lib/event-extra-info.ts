import { uploadImage } from './image-upload';
import { supabase } from './supabase';

/**
 * Maklumat Tambahan acara — penerangan dan poster tambahan, dipaparkan di hujung
 * skrin butiran acara ahli. Poster UTAMA kekal pada `usrah_events.poster_url`.
 * Lihat `20261009000144_event_extra_info.sql`.
 */

const BUCKET = 'event-posters';
const MAX_WIDTH = 1080;

/** Had poster tambahan (selari dengan CHECK pangkalan data). */
export const MAX_EXTRA_POSTERS = 8;
export const MAX_EXTRA_DESCRIPTION = 4000;

export type EventExtraInfo = {
  event_id: string;
  description: string | null;
  poster_urls: string[];
};

/** Satu poster dalam draf: sudah dimuat naik (`remote`) atau fail tempatan yang menunggu. */
export type ExtraPosterDraft = { uri: string; remote: boolean };

export const EMPTY_EXTRA_DRAFT = { enabled: false, description: '', posters: [] as ExtraPosterDraft[] };
export type ExtraInfoDraft = typeof EMPTY_EXTRA_DRAFT;

/** `null` bila acara tiada maklumat tambahan. */
export async function fetchEventExtraInfo(eventId: string): Promise<EventExtraInfo | null> {
  const { data, error } = await supabase
    .from('event_extra_info')
    .select('event_id, description, poster_urls')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as EventExtraInfo;
  const description = row.description?.trim() ? row.description : null;
  if (!description && row.poster_urls.length === 0) return null;
  return { event_id: row.event_id, description, poster_urls: row.poster_urls };
}

/** Draf borang daripada baris tersimpan; `null` -> togel OFF. */
export function draftFromInfo(info: EventExtraInfo | null): ExtraInfoDraft {
  if (!info) return { ...EMPTY_EXTRA_DRAFT };
  return {
    enabled: true,
    description: info.description ?? '',
    posters: info.poster_urls.map((uri) => ({ uri, remote: true })),
  };
}

/** Path objek dalam bucket daripada URL awam ('…/event-posters/<path>?v=…'). */
function objectPathFromUrl(url: string): string | null {
  const marker = '/' + BUCKET + '/';
  const start = url.indexOf(marker);
  if (start === -1) return null;
  const path = url.slice(start + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
}

/**
 * Simpan draf: muat naik poster tempatan, kekalkan yang sudah ada, upsert baris.
 *
 * Togel OFF (atau draf kosong) membuang baris dan fail yang tidak lagi digunakan —
 * "tiada maklumat tambahan" bermakna tiada baris, bukan baris kosong.
 * `previousUrls` ialah poster yang tersimpan sebelum ini; yang tidak lagi ada
 * dalam draf dibuang dari Storage secara cuba-terbaik (kegagalan hanya
 * meninggalkan fail yatim, bukan sebab untuk menggagalkan simpan).
 */
export async function saveEventExtraInfo(
  eventId: string,
  draft: ExtraInfoDraft,
  previousUrls: string[] = [],
): Promise<void> {
  const description = draft.description.trim();
  const keep = draft.enabled ? draft.posters : [];
  const text = draft.enabled ? description : '';

  if (!draft.enabled || (!text && keep.length === 0)) {
    const { error } = await supabase.from('event_extra_info').delete().eq('event_id', eventId);
    if (error) throw error;
    await removeObjects(previousUrls);
    return;
  }

  const urls: string[] = [];
  const stamp = Date.now();
  for (let index = 0; index < keep.length; index += 1) {
    const poster = keep[index] as ExtraPosterDraft;
    if (poster.remote) {
      urls.push(poster.uri);
    } else {
      urls.push(await uploadImage(BUCKET, eventId + '-info-' + stamp + '-' + index + '.jpg', poster.uri, MAX_WIDTH));
    }
  }

  const { error } = await supabase.from('event_extra_info').upsert(
    {
      event_id: eventId,
      description: text || null,
      poster_urls: urls,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'event_id' },
  );
  if (error) throw error;

  const kept = new Set(urls);
  await removeObjects(previousUrls.filter((url) => !kept.has(url)));
}

async function removeObjects(urls: string[]): Promise<void> {
  const paths = urls.map(objectPathFromUrl).filter((path): path is string => Boolean(path));
  if (paths.length === 0) return;
  await supabase.storage
    .from(BUCKET)
    .remove(paths)
    .catch(() => undefined);
}

/** Buang fail poster tambahan selepas acara dipadam terus (cuba-terbaik). */
export async function removeExtraPosterObjects(urls: string[]): Promise<void> {
  await removeObjects(urls);
}
