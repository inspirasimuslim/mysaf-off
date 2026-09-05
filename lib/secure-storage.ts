import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * SecureStore ada had saiz nilai (~2KB pada iOS) dan tidak wujud di web.
 * Adapter ini:
 *  - web    : localStorage (dengan pengawal SSR untuk `expo export` static)
 *  - native : SecureStore, nilai besar dipecah kepada beberapa chunk.
 *
 * Skema chunk: kunci `k` menyimpan bilangan chunk, `k.0`..`k.n-1` menyimpan isinya.
 */
const CHUNK_SIZE = 1536;

const isWeb = Platform.OS === 'web';

function webStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

async function readChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(key);
  if (raw === null) return 0;
  const count = Number.parseInt(raw, 10);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

async function clearChunks(key: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
}

export async function getItem(key: string): Promise<string | null> {
  if (isWeb) return webStorage()?.getItem(key) ?? null;

  const count = await readChunkCount(key);
  if (count === 0) return null;

  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const part = await SecureStore.getItemAsync(chunkKey(key, i));
    // Chunk hilang/rosak — anggap tiada nilai tersimpan.
    if (part === null) return null;
    parts.push(part);
  }
  return parts.join('');
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStorage()?.setItem(key, value);
    return;
  }

  const previousCount = await readChunkCount(key);

  const parts: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    parts.push(value.slice(i, i + CHUNK_SIZE));
  }
  if (parts.length === 0) parts.push('');

  for (let i = 0; i < parts.length; i += 1) {
    await SecureStore.setItemAsync(chunkKey(key, i), parts[i] as string);
  }
  await SecureStore.setItemAsync(key, String(parts.length));

  // Buang chunk lama yang tidak lagi digunakan.
  for (let i = parts.length; i < previousCount; i += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
}

export async function removeItem(key: string): Promise<void> {
  if (isWeb) {
    webStorage()?.removeItem(key);
    return;
  }

  const count = await readChunkCount(key);
  await clearChunks(key, count);
  await SecureStore.deleteItemAsync(key);
}

/** Storage adapter dalam bentuk yang diterima oleh `@supabase/supabase-js`. */
export const SecureStorageAdapter = {
  getItem,
  setItem,
  removeItem,
};
