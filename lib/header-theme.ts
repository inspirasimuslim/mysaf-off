import { useEffect, useState } from 'react';

import { ImageUploadError, readBytes } from './image-upload';
import { supabase } from './supabase';

/**
 * Tema header Utama — lihat `20261014000158_header_themes.sql`.
 * Bacaan melalui RPC `my_header_theme()` (hari jadi sendiri > perayaan aktif);
 * pengurusan (CRUD + muat naik) hanya Super Admin, dikuatkuasakan RLS/Storage.
 */

const BUCKET = 'header-themes';

export type HeaderTheme = {
  nama: string;
  jenis: 'perayaan' | 'hari_jadi';
  mobileUrl: string;
  desktopUrl: string | null;
};

export type HeaderThemeRow = {
  id: string;
  nama: string;
  jenis: 'perayaan' | 'hari_jadi';
  mula: string | null;
  tamat: string | null;
  image_mobile: string;
  image_desktop: string | null;
  aktif: boolean;
};

/** Saiz templat untuk Super Admin (px). Mobile ~ lebar 720 (2x) × tinggi 400; desktop lebar 2400 × 270. */
export const THEME_SPEC = {
  mobile: { width: 1440, height: 600 },
  desktop: { width: 2400, height: 300 },
  maxBytes: 2 * 1024 * 1024,
};

export function themeImageUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

let cache: { at: number; theme: HeaderTheme | null } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function fetchMyHeaderTheme(force = false): Promise<HeaderTheme | null> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.theme;
  const { data, error } = await supabase.rpc('my_header_theme');
  if (error) throw error;
  const row = (data as { nama: string; jenis: HeaderTheme['jenis']; image_mobile: string; image_desktop: string | null }[] | null)?.[0];
  const theme: HeaderTheme | null = row
    ? {
        nama: row.nama,
        jenis: row.jenis,
        mobileUrl: themeImageUrl(row.image_mobile),
        desktopUrl: row.image_desktop ? themeImageUrl(row.image_desktop) : null,
      }
    : null;
  cache = { at: Date.now(), theme };
  return theme;
}

export function clearHeaderThemeCache(): void {
  cache = null;
}

/** Tema semasa untuk header Utama; `null` = hijau biasa (juga bila gagal dimuat). */
export function useHeaderTheme(): HeaderTheme | null {
  const [theme, setTheme] = useState<HeaderTheme | null>(cache?.theme ?? null);
  useEffect(() => {
    let alive = true;
    fetchMyHeaderTheme()
      .then((next) => {
        if (alive) setTheme(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return theme;
}

// --- Pengurusan (Super Admin) ------------------------------------------------

export async function fetchAllHeaderThemes(): Promise<HeaderThemeRow[]> {
  const { data, error } = await supabase
    .from('header_themes')
    .select('id, nama, jenis, mula, tamat, image_mobile, image_desktop, aktif')
    .order('jenis', { ascending: false })
    .order('mula', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as HeaderThemeRow[];
}

export type HeaderThemeInput = {
  nama: string;
  jenis: 'perayaan' | 'hari_jadi';
  mula: string | null;
  tamat: string | null;
  aktif: boolean;
  /** URI fail baharu (pilihan semula) — tiada = kekalkan imej sedia ada. */
  mobileUri?: string | null;
  desktopUri?: string | null;
  /** Hanya desktop boleh dibuang tanpa ganti. */
  clearDesktop?: boolean;
};

function extOf(bytes: Uint8Array): 'png' | 'webp' {
  const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (png) return 'png';
  const webp =
    bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (webp) return 'webp';
  throw new ImageUploadError('Fail mesti PNG atau WebP.');
}

async function uploadRaw(uri: string, suffix: 'm' | 'd'): Promise<string> {
  const bytes = await readBytes(uri);
  const ext = extOf(bytes);
  if (bytes.length > THEME_SPEC.maxBytes) {
    throw new ImageUploadError('Fail terlalu besar (maksimum 2 MB). Mampatkan PNG dahulu.');
  }
  const path = `tema-${Date.now()}-${suffix}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: ext === 'png' ? 'image/png' : 'image/webp', upsert: false });
  if (error) throw new ImageUploadError(error.message);
  return path;
}

async function removeObjects(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (list.length === 0) return;
  await supabase.storage.from(BUCKET).remove(list).catch(() => {});
}

export async function saveHeaderTheme(existing: HeaderThemeRow | null, input: HeaderThemeInput): Promise<void> {
  if (!existing && !input.mobileUri) throw new ImageUploadError('Pilih imej mobile (PNG).');

  const newMobile = input.mobileUri ? await uploadRaw(input.mobileUri, 'm') : null;
  let newDesktop: string | null = null;
  try {
    if (input.desktopUri) newDesktop = await uploadRaw(input.desktopUri, 'd');
  } catch (caught) {
    await removeObjects([newMobile]);
    throw caught;
  }

  const payload = {
    nama: input.nama.trim(),
    jenis: input.jenis,
    mula: input.jenis === 'perayaan' ? input.mula : null,
    tamat: input.jenis === 'perayaan' ? input.tamat : null,
    aktif: input.aktif,
    image_mobile: newMobile ?? existing!.image_mobile,
    image_desktop: newDesktop ?? (input.clearDesktop ? null : (existing?.image_desktop ?? null)),
  };

  const query = existing
    ? supabase.from('header_themes').update(payload).eq('id', existing.id)
    : supabase.from('header_themes').insert(payload);
  const { error } = await query;
  if (error) {
    await removeObjects([newMobile, newDesktop]);
    throw error;
  }

  if (existing) {
    await removeObjects([
      newMobile ? existing.image_mobile : null,
      newDesktop || input.clearDesktop ? existing.image_desktop : null,
    ]);
  }
  clearHeaderThemeCache();
}

export async function deleteHeaderTheme(row: HeaderThemeRow): Promise<void> {
  const { error } = await supabase.from('header_themes').delete().eq('id', row.id);
  if (error) throw error;
  await removeObjects([row.image_mobile, row.image_desktop]);
  clearHeaderThemeCache();
}
