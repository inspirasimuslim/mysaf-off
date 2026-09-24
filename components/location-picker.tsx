import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import { LocationError, readCurrentCoords } from '@/lib/geolocation';

/**
 * Pemilih lokasi program.
 *
 * Peta dilukis oleh Leaflet di dalam `WebView` dengan jubin OpenStreetMap —
 * percuma dan tanpa kunci API, yang menjadikannya satu-satunya pilihan yang
 * sejajar dengan kekangan kos projek ini.
 *
 * `react-native-webview` tiada pelaksanaan untuk react-native-web, jadi web
 * melukis HTML peta yang SAMA dalam `<iframe srcdoc>`; pin dihantar balik
 * melalui `window.parent.postMessage`. Medan koordinat manual kekal di web
 * sebagai sandaran (jubin peta disekat, atau koordinat disalin dari Google
 * Maps). Butang "Guna Lokasi Semasa" berfungsi pada kedua-dua platform —
 * lihat `geolocation.ts`.
 */

/** Penanda mesej iframe peta — mesej `message` lain pada tetingkap diabaikan. */
const MAP_MESSAGE_SOURCE = 'mysaff-location-picker';

const DEFAULT_CENTER = { latitude: 3.139, longitude: 101.6869 }; // Kuala Lumpur

type Props = {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  onChange: (coords: { latitude: number; longitude: number }) => void;
  disabled?: boolean;
};

function mapHtml(latitude: number, longitude: number, radius: number, hasPin: boolean): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
    .hint {
      position: absolute; z-index: 500; left: 8px; right: 8px; top: 8px;
      background: rgba(255,255,255,0.92); border-radius: 8px; padding: 6px 10px;
      font: 12px -apple-system, system-ui, sans-serif; color: #1A1A1A; text-align: center;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <div class="hint">Ketuk/klik pada peta untuk meletakkan pin lokasi</div>
  <script>
    var map = L.map('map').setView([${latitude}, ${longitude}], ${hasPin ? 16 : 11});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    var marker = null;
    var circle = null;

    function place(lat, lng) {
      if (marker) { map.removeLayer(marker); }
      if (circle) { map.removeLayer(circle); }
      marker = L.marker([lat, lng]).addTo(map);
      circle = L.circle([lat, lng], { radius: ${radius}, color: '#3B9EDB', fillColor: '#3B9EDB', fillOpacity: 0.15 }).addTo(map);
    }

    if (${hasPin ? 'true' : 'false'}) { place(${latitude}, ${longitude}); }

    map.on('click', function (event) {
      place(event.latlng.lat, event.latlng.lng);
      var payload = { source: '${MAP_MESSAGE_SOURCE}', latitude: event.latlng.lat, longitude: event.latlng.lng };
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }
    });
  </script>
</body>
</html>`;
}

export function LocationPicker({ latitude, longitude, radiusMeters, onChange, disabled = false }: Props) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPin = latitude !== null && longitude !== null;
  const center = hasPin ? { latitude, longitude } : DEFAULT_CENTER;

  /*
    HTML dibina semula hanya bila pin atau radius berubah. Tanpa `useMemo`,
    setiap taipan pada borang akan memuatkan semula WebView dan menghantar
    permintaan jubin baharu ke OpenStreetMap.
  */
  const html = useMemo(
    () => mapHtml(center.latitude, center.longitude, radiusMeters, hasPin),
    [center.latitude, center.longitude, radiusMeters, hasPin],
  );

  const useCurrentLocation = useCallback(async () => {
    if (locating || disabled) return;

    setError(null);
    setLocating(true);
    try {
      const position = await readCurrentCoords();
      onChange({ latitude: position.latitude, longitude: position.longitude });
    } catch (caught) {
      setError(
        caught instanceof LocationError
          ? caught.message
          : 'Gagal membaca lokasi semasa. Pastikan GPS dihidupkan dan cuba lagi.',
      );
    } finally {
      setLocating(false);
    }
  }, [disabled, locating, onChange]);

  /*
    Teks medan manual dipegang secara tempatan. Medan terkawal yang terus
    memaparkan `String(latitude)` menelan titik perpuluhan semasa menaip
    ("3." → 3) dan tidak boleh dikosongkan — koordinat manual praktikalnya
    mustahil ditaip. Nilai dihantar ke atas hanya bila KEDUA-DUA medan sah.
  */
  const [latText, setLatText] = useState(latitude === null ? '' : String(latitude));
  const [lngText, setLngText] = useState(longitude === null ? '' : String(longitude));

  // Pin dari luar (peta, lokasi semasa, rekod dimuatkan) menulis semula medan.
  useEffect(() => {
    setLatText((current) => (latitude === null || Number(current.trim()) === latitude ? current : String(latitude)));
    setLngText((current) => (longitude === null || Number(current.trim()) === longitude ? current : String(longitude)));
  }, [latitude, longitude]);

  const latValue = Number(latText.trim());
  const lngValue = Number(lngText.trim());
  const latValid = latText.trim() !== '' && Number.isFinite(latValue) && Math.abs(latValue) <= 90;
  const lngValid = lngText.trim() !== '' && Number.isFinite(lngValue) && Math.abs(lngValue) <= 180;

  const setCoordinate = useCallback(
    (key: 'latitude' | 'longitude') => (raw: string) => {
      const value = raw.replace(/[^\d.,\-\s]/g, '').slice(0, 40);

      // Tampal "3.1390, 101.6869" dari Google Maps ke mana-mana medan.
      const pair = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
      if (pair) {
        setLatText(pair[1] ?? '');
        setLngText(pair[2] ?? '');
        const lat = Number(pair[1]);
        const lng = Number(pair[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) onChange({ latitude: lat, longitude: lng });
        return;
      }

      const nextLat = key === 'latitude' ? value : latText;
      const nextLng = key === 'longitude' ? value : lngText;
      if (key === 'latitude') setLatText(value);
      else setLngText(value);

      const lat = Number(nextLat.trim());
      const lng = Number(nextLng.trim());
      if (
        nextLat.trim() !== '' &&
        nextLng.trim() !== '' &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180 &&
        (lat !== latitude || lng !== longitude)
      ) {
        onChange({ latitude: lat, longitude: lng });
      }
    },
    [latText, lngText, latitude, longitude, onChange],
  );

  // Web: pin dari iframe peta.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const listener = (event: MessageEvent) => {
      const data = event.data as { source?: unknown; latitude?: unknown; longitude?: unknown } | null;
      if (!data || data.source !== MAP_MESSAGE_SOURCE || disabled) return;
      if (
        typeof data.latitude === 'number' &&
        typeof data.longitude === 'number' &&
        Number.isFinite(data.latitude) &&
        Number.isFinite(data.longitude)
      ) {
        onChange({ latitude: data.latitude, longitude: data.longitude });
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [disabled, onChange]);

  return (
    <View className="gap-3">
      {Platform.OS === 'web' ? (
        <>
          <View className="h-64 overflow-hidden rounded-card border border-line">
            {createElement('iframe', {
              title: 'Peta lokasi program',
              srcDoc: html,
              style: { border: 0, width: '100%', height: '100%', pointerEvents: disabled ? 'none' : 'auto' },
            })}
          </View>
          <Text className="text-xs text-ink-muted">
            Atau masukkan koordinat secara manual (boleh tampal terus dari Google Maps, cth. 3.139, 101.6869):
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <TextField
                label="Latitud"
                value={latText}
                onChangeText={setCoordinate('latitude')}
                editable={!disabled}
                keyboardType="numbers-and-punctuation"
                error={latText.trim() !== '' && !latValid ? 'Antara -90 dan 90.' : null}
              />
            </View>
            <View className="flex-1">
              <TextField
                label="Longitud"
                value={lngText}
                onChangeText={setCoordinate('longitude')}
                editable={!disabled}
                keyboardType="numbers-and-punctuation"
                error={lngText.trim() !== '' && !lngValid ? 'Antara -180 dan 180.' : null}
              />
            </View>
          </View>
        </>
      ) : (
        <View className="h-64 overflow-hidden rounded-card border border-line">
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            javaScriptEnabled
            domStorageEnabled
            onMessage={(event) => {
              try {
                const payload = JSON.parse(event.nativeEvent.data) as { latitude: number; longitude: number };
                if (Number.isFinite(payload.latitude) && Number.isFinite(payload.longitude)) onChange(payload);
              } catch {
                // Mesej yang tidak difahami diabaikan — peta tidak menghantar apa-apa lagi.
              }
            }}
          />
        </View>
      )}

      <Button
        label="Guna Lokasi Semasa"
        variant="secondary"
        loading={locating}
        disabled={locating || disabled}
        onPress={() => void useCurrentLocation()}
      />

      {error ? <Notice tone="negative" message={error} /> : null}

      <Text className="text-xs text-ink-muted">
        {hasPin
          ? 'Pin: ' + latitude.toFixed(6) + ', ' + longitude.toFixed(6) + ' · radius ' + radiusMeters + 'm'
          : 'Belum ada pin lokasi. Kehadiran tanpa pin tidak boleh disemak jaraknya.'}
      </Text>
    </View>
  );
}
