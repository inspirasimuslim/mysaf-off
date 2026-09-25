import { useEffect, useRef } from 'react';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type MapPressEvent, type MarkerDragStartEndEvent } from 'react-native-maps';

import type { LocationMapProps } from '@/components/location-map.types';

/** Peta native (Android) — Google Maps SDK melalui react-native-maps. */
export function LocationMap({ latitude, longitude, radiusMeters, onPick, disabled = false }: LocationMapProps) {
  const ref = useRef<MapView>(null);
  const hasPin = latitude !== null && longitude !== null;

  // Pin berubah dari luar (carian, lokasi semasa, medan manual) — kamera mengikut.
  useEffect(() => {
    if (latitude === null || longitude === null) return;
    ref.current?.animateToRegion({ latitude, longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 }, 350);
  }, [latitude, longitude]);

  const pick = (event: MapPressEvent | MarkerDragStartEndEvent) => {
    const { latitude: lat, longitude: lng } = event.nativeEvent.coordinate;
    onPick({ latitude: lat, longitude: lng });
  };

  return (
    <MapView
      ref={ref}
      style={{ flex: 1 }}
      provider={PROVIDER_GOOGLE}
      initialRegion={{
        latitude: latitude ?? 3.139,
        longitude: longitude ?? 101.6869,
        latitudeDelta: hasPin ? 0.005 : 0.3,
        longitudeDelta: hasPin ? 0.005 : 0.3,
      }}
      onPress={disabled ? undefined : pick}
      scrollEnabled={!disabled}
    >
      {hasPin ? (
        <>
          <Marker coordinate={{ latitude, longitude }} draggable={!disabled} onDragEnd={pick} />
          <Circle
            center={{ latitude, longitude }}
            radius={radiusMeters}
            strokeColor="#0F5132"
            fillColor="rgba(15,81,50,0.15)"
          />
        </>
      ) : null}
    </MapView>
  );
}
