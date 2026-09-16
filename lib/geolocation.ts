import * as Location from 'expo-location';
import { Platform } from 'react-native';

/**
 * Koordinat semasa peranti — SATU laluan untuk scan kehadiran dan "Guna Lokasi
 * Semasa" admin.
 *
 * Native: `expo-location`, `Accuracy.High`.
 *
 * Web: `navigator.geolocation` TERUS, bukan `expo-location`. Pelaksanaan web
 * expo-location (SDK 57):
 *   - memanggil `getCurrentPosition` dengan `maximumAge: Infinity` — pelayar
 *     boleh memulangkan kedudukan CACHE yang lama (lokasi rumah pagi tadi),
 *     dan jarak geofence dikira dari situ;
 *   - tiada `timeout` — spinner boleh berputar selama-lamanya bila GPS lemah;
 *   - melontar bila `navigator.permissions` tiada (Safari lama) walaupun
 *     geolokasi sendiri berfungsi.
 * Di sini `maximumAge: 0` (bacaan segar), `enableHighAccuracy`, dan had masa.
 *
 * Setiap kegagalan melontar `LocationError` dengan ayat yang boleh dituruti
 * pada platform itu — "tetapan pelayar" di web, "tetapan peranti" di telefon.
 */

export type Coords = {
  latitude: number;
  longitude: number;
  /** Radius ketidakpastian dalam meter, bila diketahui. */
  accuracy: number | null;
};

export type LocationErrorCode = 'location_denied' | 'location_unavailable' | 'location_failed';

export class LocationError extends Error {
  readonly code: LocationErrorCode;

  constructor(message: string, code: LocationErrorCode) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

/** Had GPS mencari kedudukan selepas kebenaran diberi. */
const WEB_POSITION_TIMEOUT_MS = 20000;
/** Had keseluruhan, termasuk dialog kebenaran yang dibiarkan tanpa jawapan. */
const WEB_HARD_TIMEOUT_MS = 60000;

function isIosBrowser(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** 'granted' | 'denied' | 'prompt', atau `null` bila pelayar tidak menyokong pertanyaan (Safari lama). */
async function webPermissionState(): Promise<PermissionState | null> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    return status?.state ?? null;
  } catch {
    return null;
  }
}

async function webCoords(): Promise<Coords> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new LocationError('Pelayar ini tidak menyokong lokasi. Cuba Chrome atau Safari terkini.', 'location_unavailable');
  }
  if (!window.isSecureContext) {
    throw new LocationError('Lokasi pelayar hanya berfungsi melalui HTTPS. Buka app melalui alamat https://.', 'location_unavailable');
  }

  /*
    Chrome mengira `timeout` SEMASA dialog kebenaran masih terbuka — ahli yang
    mengambil masa membaca dialog itu mendapat "tamat masa". Selagi kebenaran
    belum diberi, hanya had keseluruhan yang digunakan.
  */
  const permission = await webPermissionState();
  const positionTimeout = permission === 'granted' ? WEB_POSITION_TIMEOUT_MS : WEB_HARD_TIMEOUT_MS - 1000;

  return new Promise<Coords>((resolve, reject) => {
    let settled = false;
    const hardTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new LocationError(
          'Lokasi tidak diterima. Pastikan anda menekan "Benarkan" pada dialog lokasi pelayar, kemudian cuba lagi.',
          'location_failed',
        ),
      );
    }, WEB_HARD_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimer);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        });
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimer);

        if (error.code === error.PERMISSION_DENIED) {
          reject(
            new LocationError(
              isIosBrowser()
                ? 'Lokasi disekat. Di iPhone: Tetapan > Privasi & Keselamatan > Perkhidmatan Lokasi > Safari (atau Chrome) > "Semasa Guna", kemudian muat semula halaman ini.'
                : 'Lokasi disekat oleh pelayar. Klik ikon gembok/tetapan laman di sebelah alamat, benarkan Lokasi, kemudian cuba lagi.',
              'location_denied',
            ),
          );
          return;
        }

        const stillAsking = error.code === error.TIMEOUT && permission !== 'granted';
        reject(
          new LocationError(
            stillAsking
              ? 'Lokasi tidak diterima. Pastikan anda menekan "Benarkan" pada dialog lokasi pelayar, kemudian cuba lagi.'
              : error.code === error.TIMEOUT
              ? 'Membaca lokasi mengambil masa terlalu lama. Pergi ke kawasan terbuka atau dekat tingkap, kemudian cuba lagi.'
              : 'Lokasi tidak dapat ditentukan. Hidupkan GPS / Perkhidmatan Lokasi peranti, kemudian cuba lagi.',
            'location_failed',
          ),
        );
      },
      { enableHighAccuracy: true, timeout: positionTimeout, maximumAge: 0 },
    );
  });
}

async function nativeCoords(): Promise<Coords> {
  let permission: Location.LocationPermissionResponse;
  try {
    permission = await Location.requestForegroundPermissionsAsync();
  } catch {
    throw new LocationError('Perkhidmatan lokasi tidak tersedia pada peranti ini.', 'location_unavailable');
  }

  if (!permission.granted) {
    throw new LocationError(
      'Kebenaran lokasi diperlukan. Benarkan capaian lokasi dalam tetapan peranti dan cuba lagi.',
      'location_denied',
    );
  }

  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? null,
    };
  } catch {
    throw new LocationError('Gagal membaca lokasi semasa. Pastikan GPS dihidupkan dan cuba lagi.', 'location_failed');
  }
}

export function readCurrentCoords(): Promise<Coords> {
  return Platform.OS === 'web' ? webCoords() : nativeCoords();
}
