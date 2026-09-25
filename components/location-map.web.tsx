import { CircleF, GoogleMap, MarkerF, useJsApiLoader } from '@react-google-maps/api';
import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';

import type { LocationMapProps } from '@/components/location-map.types';
import { GOOGLE_MAPS_WEB_API_KEY, googleMapsWebConfigured } from '@/lib/google-maps';

const DEFAULT_CENTER = { lat: 3.139, lng: 101.6869 }; // Kuala Lumpur

/** Peta web — Maps JavaScript API melalui @react-google-maps/api. */
export function LocationMap(props: LocationMapProps) {
  if (!googleMapsWebConfigured) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="text-center text-sm text-ink-muted">
          Peta belum aktif — kunci Google Maps belum dimasukkan. Gunakan koordinat manual di bawah.
        </Text>
      </View>
    );
  }
  return <LoadedMap {...props} />;
}

function LoadedMap({ latitude, longitude, radiusMeters, onPick, disabled = false }: LocationMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'mysaff-google-maps',
    googleMapsApiKey: GOOGLE_MAPS_WEB_API_KEY,
  });
  const mapRef = useRef<google.maps.Map | null>(null);
  const hasPin = latitude !== null && longitude !== null;

  // Pin berubah dari luar (carian, lokasi semasa, medan manual) — kamera mengikut.
  useEffect(() => {
    if (latitude === null || longitude === null) return;
    mapRef.current?.panTo({ lat: latitude, lng: longitude });
    if ((mapRef.current?.getZoom() ?? 0) < 15) mapRef.current?.setZoom(16);
  }, [latitude, longitude]);

  if (loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text className="text-center text-sm text-negative">Peta gagal dimuatkan. Semak kunci Google Maps.</Text>
      </View>
    );
  }
  if (!isLoaded) return <View className="flex-1 bg-background" />;

  const pick = (event: google.maps.MapMouseEvent) => {
    if (disabled || !event.latLng) return;
    onPick({ latitude: event.latLng.lat(), longitude: event.latLng.lng() });
  };

  const center = hasPin ? { lat: latitude, lng: longitude } : DEFAULT_CENTER;

  return (
    <GoogleMap
      mapContainerStyle={{ width: '100%', height: '100%' }}
      center={center}
      zoom={hasPin ? 16 : 11}
      onLoad={(map) => {
        mapRef.current = map;
      }}
      onUnmount={() => {
        mapRef.current = null;
      }}
      onClick={pick}
      options={{ streetViewControl: false, mapTypeControl: false, fullscreenControl: false, clickableIcons: false }}
    >
      {hasPin ? (
        <>
          <MarkerF position={center} draggable={!disabled} onDragEnd={pick} />
          <CircleF
            center={center}
            radius={radiusMeters}
            options={{ strokeColor: '#0F5132', fillColor: '#0F5132', fillOpacity: 0.15, clickable: false }}
          />
        </>
      ) : null}
    </GoogleMap>
  );
}
