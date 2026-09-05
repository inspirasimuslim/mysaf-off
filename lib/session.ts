import type { AuthError } from '@supabase/supabase-js';

import { disableBiometric, isBiometricEnabled, saveRefreshToken } from './biometrics';
import { SecureStorageAdapter } from './secure-storage';
import { AUTH_STORAGE_KEY, supabase } from './supabase';

/**
 * Buang sesi dari storan tempatan SAHAJA — tanpa memanggil `POST /logout`.
 *
 * `supabase.auth.signOut()` membaca sesi dari storan dahulu; kalau tiada sesi di situ
 * ia melangkau panggilan rangkaian dan hanya membersihkan keadaan dalaman serta
 * memancarkan `SIGNED_OUT`. Jadi dengan membuang kunci sesi terlebih dahulu, kita
 * dapat log keluar di peranti ini tanpa membatalkan sesi di pelayan.
 */
async function clearLocalSession(): Promise<{ error: AuthError | null }> {
  await SecureStorageAdapter.removeItem(AUTH_STORAGE_KEY);
  return supabase.auth.signOut({ scope: 'local' });
}

/**
 * Log keluar dari peranti ini.
 *
 * Bila log masuk biometrik aktif, sesi pelayan SENGAJA dikekalkan hidup: refresh token
 * yang tersimpan itulah yang digunakan untuk memulihkan sesi selepas pengesahan
 * biometrik. Memanggil `signOut()` (walaupun `scope: 'local'`) akan menghantar
 * `POST /logout?scope=local` yang menamatkan sesi semasa di pelayan dan membatalkan
 * refresh token tersebut serta-merta.
 *
 * Data biometrik TIDAK dipadam di sini — hanya pengguna yang OFF-kan toggle di
 * Dashboard, atau `signOutEverywhere()`, yang boleh memadamnya.
 */
export async function signOutFromDevice(): Promise<{ error: AuthError | null }> {
  if (!(await isBiometricEnabled())) {
    // Tiada biometrik: tamatkan sesi peranti ini di pelayan seperti biasa.
    return supabase.auth.signOut({ scope: 'local' });
  }

  // Ambil refresh token terkini sebelum sesi dibuang — token berputar setiap kali
  // sesi dibaharui, jadi salinan tersimpan mesti yang paling akhir.
  const { data } = await supabase.auth.getSession();
  if (data.session?.refresh_token) {
    await saveRefreshToken(data.session.refresh_token);
  }

  return clearLocalSession();
}

/**
 * Log keluar dari SEMUA peranti dan batalkan keupayaan log masuk biometrik.
 * Ini satu-satunya laluan log keluar yang dibenarkan memadam data biometrik.
 */
export async function signOutEverywhere(): Promise<{ error: AuthError | null }> {
  await disableBiometric();
  return supabase.auth.signOut({ scope: 'global' });
}
