import { Image } from 'expo-image';
import { View } from 'react-native';

import { staticMapSource } from '@/lib/google-maps';

/** Gambar peta kecil dengan pin (Google Maps Static API). Tiada apa-apa bila kunci belum ada. */
export function StaticMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const source = staticMapSource(latitude, longitude);
  if (!source) return null;

  return (
    <View className="overflow-hidden rounded-field border border-line bg-background" style={{ aspectRatio: 2 }}>
      <Image
        source={source}
        style={{ width: '100%', height: '100%' }}
        contentFit="cover"
        accessibilityLabel="Peta lokasi program"
      />
    </View>
  );
}
