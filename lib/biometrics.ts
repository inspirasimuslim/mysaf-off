import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

import { getItem, removeItem, setItem } from './secure-storage';

const ENABLED_KEY = 'mysafoff.biometric.enabled';
const REFRESH_TOKEN_KEY = 'mysafoff.biometric.refreshToken';

export type BiometricSupport = {
  /** Perkakasan biometrik wujud DAN sekurang-kurangnya satu sidik/wajah didaftarkan. */
  usable: boolean;
  hasHardware: boolean;
  isEnrolled: boolean;
  /** Contoh: "Face ID", "Cap Jari", "Biometrik". */
  label: string;
};

const UNSUPPORTED: BiometricSupport = {
  usable: false,
  hasHardware: false,
  isEnrolled: false,
  label: 'Biometrik',
};

export async function getBiometricSupport(): Promise<BiometricSupport> {
  if (Platform.OS === 'web') return UNSUPPORTED;

  try {
    const [hasHardware, isEnrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    let label = 'Biometrik';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      label = Platform.OS === 'ios' ? 'Face ID' : 'Pengecaman Wajah';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      label = Platform.OS === 'ios' ? 'Touch ID' : 'Cap Jari';
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      label = 'Imbasan Iris';
    }

    return { usable: hasHardware && isEnrolled, hasHardware, isEnrolled, label };
  } catch {
    return UNSUPPORTED;
  }
}

/**
 * Token disimpan tanpa `requireAuthentication` kerana pilihan itu tidak disokong
 * dalam Expo Go. Gerbang keselamatan ialah `promptBiometric()` yang mesti lulus
 * sebelum token ini digunakan.
 */
export async function promptBiometric(promptMessage: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Batal',
      fallbackLabel: 'Guna kata laluan peranti',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}

export async function isBiometricEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await getItem(ENABLED_KEY)) === '1';
}

/** Simpan bendera + refresh token supaya log masuk biometrik boleh pulihkan sesi. */
export async function enableBiometric(refreshToken: string): Promise<void> {
  await setItem(REFRESH_TOKEN_KEY, refreshToken);
  await setItem(ENABLED_KEY, '1');
}

/**
 * Padam bendera DAN token biometrik.
 *
 * Hanya dipanggil bila pengguna sendiri OFF-kan toggle di Dashboard, atau melalui
 * `signOutEverywhere()`. JANGAN panggil selepas satu kegagalan log masuk biometrik —
 * kegagalan sementara (token luput, tiada rangkaian) mesti hanya jatuh balik ke
 * skrin kata laluan, bukan mematikan ciri ini untuk selamanya.
 */
export async function disableBiometric(): Promise<void> {
  await removeItem(REFRESH_TOKEN_KEY);
  await removeItem(ENABLED_KEY);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return getItem(REFRESH_TOKEN_KEY);
}

/** Tulis ganti token tersimpan tanpa menyentuh bendera aktif/tidak. */
export async function saveRefreshToken(refreshToken: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await setItem(REFRESH_TOKEN_KEY, refreshToken);
}

/** Refresh token berputar setiap kali sesi dibaharui — kemas kini yang tersimpan. */
export async function syncStoredRefreshToken(refreshToken: string | null | undefined): Promise<void> {
  if (Platform.OS === 'web' || !refreshToken) return;
  if (!(await isBiometricEnabled())) return;
  await saveRefreshToken(refreshToken);
}

/** Butang "Log Masuk dengan Biometrik" hanya masuk akal bila kedua-duanya ada. */
export async function hasBiometricLogin(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const [enabled, token] = await Promise.all([isBiometricEnabled(), getStoredRefreshToken()]);
  return enabled && Boolean(token);
}
