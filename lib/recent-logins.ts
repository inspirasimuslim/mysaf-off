import { getItem, removeItem, setItem } from '@/lib/secure-storage';

/**
 * Cadangan isi pantas untuk skrin Log Masuk: paling banyak 2 emel terakhir yang
 * BERJAYA log masuk, disimpan pada peranti sahaja (tidak dihantar ke mana-mana).
 * Kata laluan TIDAK pernah disimpan di sini.
 */
const KEY = 'mysaff.recent-logins';
const MAX_ENTRIES = 2;

export async function getRecentLogins(): Promise<string[]> {
  try {
    const raw = await getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

/** Letak emel di atas senarai; emel sama (tanpa kira huruf besar/kecil) tidak diduplikasi. */
export async function saveRecentLogin(email: string): Promise<void> {
  const clean = email.trim();
  if (!clean) return;

  try {
    const current = await getRecentLogins();
    const next = [clean, ...current.filter((item) => item.toLowerCase() !== clean.toLowerCase())].slice(
      0,
      MAX_ENTRIES,
    );
    await setItem(KEY, JSON.stringify(next));
  } catch {
    // Ciri kemudahan sahaja — kegagalan menyimpan tidak boleh mengganggu log masuk.
  }
}

export async function clearRecentLogins(): Promise<void> {
  try {
    await removeItem(KEY);
  } catch {
    // Abaikan.
  }
}
