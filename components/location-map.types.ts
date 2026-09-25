import type { Coords } from '@/lib/google-maps';

/** Antara muka SAMA untuk `location-map.tsx` (native) dan `location-map.web.tsx`. */
export type LocationMapProps = {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  onPick: (coords: Coords) => void;
  disabled?: boolean;
};
