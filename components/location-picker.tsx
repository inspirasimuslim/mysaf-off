import * as Location from 'expo-location';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';

/**
 * Pemilih lokasi program.
 *
 * Peta dilukis oleh Leaflet di dalam `WebView` dengan jubin OpenStreetMap —
 * percuma dan tanpa kunci API, yang menjadikannya satu-satunya pilihan yang
 * sejajar dengan kekangan kos projek ini.
 *
 * `react-native-webview` tiada pelaksanaan untuk react-native-web, jadi web
 * mendapat medan koordinat manual dan bukan peta. Butang "Guna Lokasi Semasa"
 * berfungsi pada KEDUA-DUA platform (`expo-location` menggunakan geolokasi
 * pelayar di web), jadi laluan yang paling lazim tidak hilang di mana-mana.
 */

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
  <div class="hint">Ketuk pada peta untuk meletakkan pin lokasi</div>
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
      circle = L.circle([lat, lng], { radius: ${radius}, color: '#0F5132', fillColor: '#0F5132', fillOpacity: 0.15 }).addTo(map);
    }

    if (${hasPin ? 'true' : 'false'}) { place(${latitude}, ${longitude}); }

    map.on('click', function (event) {
      place(event.latlng.lat, event.latlng.lng);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng
      }));
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
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('Kebenaran lokasi diperlukan untuk menggunakan lokasi semasa.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      onChange({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch {
      setError('Gagal membaca lokasi semasa. Pastikan GPS dihidupkan dan cuba lagi.');
    } finally {
      setLocating(false);
    }
  }, [disabled, locating, onChange]);

  const setCoordinate = useCallback(
    (key: 'latitude' | 'longitude') => (value: string) => {
      const parsed = Number.parseFloat(value);
      if (!Number.isFinite(parsed)) return;
      onChange({
        latitude: key === 'latitude' ? parsed : (latitude ?? DEFAULT_CENTER.latitude),
        longitude: key === 'longitude' ? parsed : (longitude ?? DEFAULT_CENTER.longitude),
      });
    },
    [latitude, longitude, onChange],
  );

  return (
    <View className="gap-3">
      {Platform.OS === 'web' ? (
        <>
          <Notice
            tone="info"
            message="Peta interaktif hanya tersedia dalam app telefon. Di pelayar, gunakan butang lokasi semasa atau masukkan koordinat secara manual."
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <TextField
                label="Latitud"
                value={latitude === null ? '' : String(latitude)}
                onChangeText={setCoordinate('latitude')}
                editable={!disabled}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View className="flex-1">
              <TextField
                label="Longitud"
                value={longitude === null ? '' : String(longitude)}
                onChangeText={setCoordinate('longitude')}
                editable={!disabled}
                keyboardType="numbers-and-punctuation"
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
