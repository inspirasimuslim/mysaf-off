import { useEffect, useState } from 'react';
import { Animated, View, type DimensionValue } from 'react-native';

import { useReduceMotion } from '@/lib/use-reduce-motion';

/**
 * Blok kerangka (skeleton) — menggantikan pemuat berputar supaya skrin kelihatan
 * "sudah ada bentuk" sebaik dibuka. Berdenyut perlahan; BERHENTI (kelabu statik)
 * bila pengguna meminta kurangkan gerakan.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  circle = false,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  circle?: boolean;
}) {
  const reduce = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(0.55));

  useEffect(() => {
    if (reduce) {
      opacity.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, opacity]);

  return (
    <Animated.View
      className="bg-line"
      style={{ width: circle ? height : width, height, borderRadius: circle ? height / 2 : radius, opacity }}
    />
  );
}

/** Beberapa baris "avatar + dua baris teks" — untuk senarai ahli, sejarah, dsb. */
export function ListSkeleton({ rows = 7, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <View
      className="gap-4 px-gutter pt-4"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Memuatkan"
      accessibilityState={{ busy: true }}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} className="flex-row items-center gap-3">
          {avatar ? <Skeleton circle height={40} /> : null}
          <View className="flex-1 gap-2">
            <Skeleton width={index % 2 ? '55%' : '70%'} height={14} />
            <Skeleton width={index % 2 ? '35%' : '45%'} height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Kad bergambar (album / acara): gambar kecil + tajuk + sub-tajuk. */
export function CardListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View
      className="gap-3 px-gutter pt-4"
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Memuatkan"
      accessibilityState={{ busy: true }}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} className="gap-3 rounded-card border border-line bg-surface p-3">
          <Skeleton height={110} radius={10} />
          <Skeleton width="60%" height={15} />
          <Skeleton width="40%" height={11} />
        </View>
      ))}
    </View>
  );
}
