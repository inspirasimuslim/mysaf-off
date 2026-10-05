import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { LocationMap } from '@/components/location-map';
import { PlaceSearch } from '@/components/place-search';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { TextField } from '@/components/ui/text-field';
import { LocationError, readCurrentCoords } from '@/lib/geolocation';

/**
 * Pemilih lokasi program: carian tempat + peta Google Maps + koordinat manual.
 *
 * Peta ialah `LocationMap` — Metro memilih `location-map.tsx` (native,
 * react-native-maps + Google Maps SDK) atau `location-map.web.tsx`
 * (@react-google-maps/api) ikut platform, dengan props yang SAMA, jadi
 * pemanggil tidak perlu tahu platform. Carian tempat ialah Places API (New)
 * REST (`place-search.tsx`). Medan latitud/longitud (bawah peta) boleh ditaip atau
 * ditampal "3.1390, 101.6869" dari Google Maps. Butang "Guna Lokasi Semasa" berfungsi pada kedua-dua platform —
 * lihat `geolocation.ts`.
 */

type Props = {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  onChange: (coords: { latitude: number; longitude: number }) => void;
  /** Dipanggil bila admin memilih cadangan carian — untuk auto-isi nama tempat. */
  onPlaceSelected?: (name: string) => void;
  disabled?: boolean;
};

export function LocationPicker({ latitude, longitude, radiusMeters, onChange, onPlaceSelected, disabled = false }: Props) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPin = latitude !== null && longitude !== null;

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

  return (
    <View className="gap-3">
      <PlaceSearch
        disabled={disabled}
        onSelect={(coords, name) => {
          onChange(coords);
          onPlaceSelected?.(name);
        }}
      />

      <View className="h-64 overflow-hidden rounded-card border border-line">
        <LocationMap
          latitude={latitude}
          longitude={longitude}
          radiusMeters={radiusMeters}
          onPick={onChange}
          disabled={disabled}
        />
      </View>

      <>
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

      <Button
        label="Guna Lokasi Semasa"
        variant="secondary"
        loading={locating}
        disabled={locating || disabled}
        onPress={() => void useCurrentLocation()}
      />

      {error ? <Notice tone="negative" message={error} /> : null}

      {hasPin ? (
        <Text className="text-xs text-ink-muted">
          {'Pin: ' + latitude.toFixed(6) + ', ' + longitude.toFixed(6) + ' · radius ' + radiusMeters + 'm'}
        </Text>
      ) : null}
    </View>
  );
}
