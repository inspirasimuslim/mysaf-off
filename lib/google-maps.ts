import { Platform } from 'react-native';

/**
 * Konfigurasi & pembantu Google Maps.
 *
 * KUNCI WEB (`EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY`): Maps JavaScript API
 * (peta web) + Places API (New) (carian tempat, web DAN native — panggilan
 * REST terus). Kunci Android Maps SDK ialah kunci BERBEZA dan diletakkan di
 * `app.json` → `android.config.googleMaps.apiKey`.
 *
 * Carian tempat native tidak menghantar `Referer`; jika kunci web disekat
 * dengan "HTTP referrers", carian pada Android akan ditolak — sekat kunci
 * itu dengan "API restrictions" (Maps JavaScript + Places API (New)) sahaja.
 */

export const GOOGLE_MAPS_WEB_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '';

/** Kunci kosong atau masih placeholder `GANTI_DENGAN_...` = belum dikonfigurasi. */
export const googleMapsWebConfigured =
  GOOGLE_MAPS_WEB_API_KEY.trim() !== '' && !GOOGLE_MAPS_WEB_API_KEY.startsWith('GANTI_');

export type Coords = { latitude: number; longitude: number };

export type PlaceSuggestion = {
  placeId: string;
  /** Nama utama tempat (cth. "Masjid Negara"). */
  name: string;
  /** Teks penuh cadangan termasuk alamat. */
  description: string;
};

const PLACES_BASE = 'https://places.googleapis.com/v1';

export class PlacesError extends Error {}

/** Token sesi mengumpulkan satu sesi menaip + satu Place Details sebagai satu bil. */
export function newPlacesSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function assertConfigured() {
  if (!googleMapsWebConfigured) {
    throw new PlacesError('Kunci Google Maps belum dikonfigurasi.');
  }
}

export async function searchPlaces(
  input: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  assertConfigured();
  const response = await fetch(`${PLACES_BASE}/places:autocomplete`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_MAPS_WEB_API_KEY },
    body: JSON.stringify({ input, sessionToken, languageCode: 'ms', regionCode: 'MY' }),
  });
  if (!response.ok) throw new PlacesError('Carian tempat gagal (' + response.status + ').');

  const json = (await response.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId: string;
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string } };
      };
    }[];
  };

  return (json.suggestions ?? []).flatMap((s) => {
    const p = s.placePrediction;
    if (!p) return [];
    const description = p.text?.text ?? '';
    return [{ placeId: p.placeId, name: p.structuredFormat?.mainText?.text ?? description, description }];
  });
}

export async function fetchPlaceCoords(placeId: string, sessionToken: string): Promise<Coords> {
  assertConfigured();
  const response = await fetch(`${PLACES_BASE}/places/${encodeURIComponent(placeId)}?sessionToken=${sessionToken}`, {
    headers: { 'X-Goog-Api-Key': GOOGLE_MAPS_WEB_API_KEY, 'X-Goog-FieldMask': 'location' },
  });
  if (!response.ok) throw new PlacesError('Gagal mendapatkan lokasi tempat (' + response.status + ').');

  const json = (await response.json()) as { location?: { latitude?: number; longitude?: number } };
  const { latitude, longitude } = json.location ?? {};
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new PlacesError('Tempat ini tiada koordinat.');
  }
  return { latitude, longitude };
}

/**
 * URL navigasi ke koordinat. Android: `geo:` mencetuskan pemilih app
 * navigasi sistem (Google Maps, Waze, dll) tanpa API/kunci. Web: pautan
 * Google Maps biasa (dibuka dalam tab baharu oleh pemanggil).
 *
 * TODO(iOS): belum live. Cadangan — cuba `comgooglemaps://?daddr=lat,lng&directionsmode=driving`
 * (perlu `LSApplicationQueriesSchemes: comgooglemaps` di Info.plist) melalui
 * `Linking.canOpenURL`, sandaran `http://maps.apple.com/?daddr=lat,lng`.
 */
export function navigationUrl(latitude: number, longitude: number, label?: string | null): string {
  if (Platform.OS === 'android') {
    const q = label ? `(${encodeURIComponent(label)})` : '';
    return `geo:${latitude},${longitude}?q=${latitude},${longitude}${q}`;
  }
  if (Platform.OS === 'ios') {
    // TODO(iOS): lihat komen fungsi. Sementara ini Apple Maps.
    return `http://maps.apple.com/?daddr=${latitude},${longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
