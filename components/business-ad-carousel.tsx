import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Colors } from '@/constants/theme';
import type { ActiveBusinessAd } from '@/lib/business-ads';

/** Masa setiap poster dipaparkan sebelum bergerak ke yang seterusnya. */
const SLIDE_MS = 3000;
/** Selepas pengguna menyeret/menekan titik, auto-slide berhenti sebentar. */
const PAUSE_AFTER_TOUCH_MS = 6000;
/** Nisbah tinggi/lebar slaid 16:9 (poster landscape); poster penuh ada di skrin Detail. */
const ASPECT = 9 / 16;

type Props = {
  /**
   * `row` (lalai, telefon): tajuk + slaid 16:9 + titik, baris sendiri.
   * `band` (desktop): mengisi tinggi induk (band stretch); pautan dan titik
   * dilapiskan di atas poster supaya tinggi tidak bertambah.
   */
  variant?: 'row' | 'band';
  ads: ActiveBusinessAd[];
  onPress: (id: string) => void;
  onSeeAll: () => void;
};

/**
 * Carousel iklan perniagaan di skrin Utama — SATU poster sekali, auto-slide
 * bulat (round-robin), diseret/ditekan titik secara manual juga boleh.
 *
 * Tiada iklan aktif -> tidak wujud langsung dalam pokok komponen (bukan kotak
 * kosong), sama seperti `PosterCarousel`. Susunan datang daripada
 * `list_active_business_ads()` (paling lama dilulus dahulu).
 */
export function BusinessAdCarousel({ ads, onPress, onSeeAll, variant = 'row' }: Props) {
  const band = variant === 'band';
  const scrollRef = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [boxHeight, setBoxHeight] = useState(0);
  const [index, setIndex] = useState(0);
  const [pausedUntil, setPausedUntil] = useState(0);

  const count = ads.length;

  const goTo = useCallback(
    (next: number, animated = true) => {
      if (width <= 0 || count === 0) return;
      const target = ((next % count) + count) % count;
      scrollRef.current?.scrollTo({ x: target * width, animated });
      setIndex(target);
    },
    [width, count],
  );

  // Senarai berubah (iklan tamat/ditambah) — pastikan indeks masih sah.
  useEffect(() => {
    if (index >= count && count > 0) goTo(0, false);
  }, [index, count, goTo]);

  useEffect(() => {
    if (count < 2 || width <= 0) return;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntil) return;
      goTo(index + 1);
    }, SLIDE_MS);
    return () => clearInterval(timer);
  }, [count, width, index, pausedUntil, goTo]);

  const pause = () => setPausedUntil(Date.now() + PAUSE_AFTER_TOUCH_MS);

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next >= 0 && next < count) setIndex(next);
  };

  if (count === 0) return null;

  const slideHeight = band ? boxHeight : Math.round(width * ASPECT);

  const dots =
    count > 1 ? (
      <View
        className={`flex-row items-center justify-center gap-2 ${band ? '' : 'mt-3'}`}
        style={band ? { position: 'absolute', left: 0, right: 0, bottom: 44 } : undefined}
        pointerEvents="box-none">
        {ads.map((ad, i) => (
          <Pressable
            key={ad.id}
            accessibilityRole="button"
            accessibilityLabel={'Poster ' + (i + 1)}
            hitSlop={8}
            onPress={() => {
              pause();
              goTo(i);
            }}>
            <View
              style={{
                width: i === index ? 18 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === index ? Colors.primary : band ? 'rgba(255,255,255,0.8)' : Colors.line,
              }}
            />
          </Pressable>
        ))}
      </View>
    ) : null;

  return (
    <View style={band ? { flex: 1 } : undefined}>
      {band ? null : (
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-base font-bold text-ink">Bisnes Ahli</Text>
          <Pressable accessibilityRole="button" onPress={onSeeAll} hitSlop={8} className="active:opacity-60">
            <Text className="text-sm font-semibold text-primary">Lihat Semua Bisnes</Text>
          </Pressable>
        </View>
      )}

      <View
        onLayout={(event) => {
          setWidth(Math.round(event.nativeEvent.layout.width));
          setBoxHeight(Math.round(event.nativeEvent.layout.height));
        }}
        style={{ borderRadius: 20, overflow: 'hidden', ...(band ? { flex: 1 } : null) }}>
        {width > 0 && slideHeight > 0 ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScrollBeginDrag={pause}
            onMomentumScrollEnd={onScrollEnd}
            scrollEventThrottle={16}>
            {ads.map((ad) => (
              <Pressable
                key={ad.id}
                accessibilityRole="button"
                accessibilityLabel={ad.nama_bisnes}
                onPress={() => onPress(ad.id)}
                style={{ width, height: slideHeight }}
                className="active:opacity-80">
                <Image
                  source={{ uri: ad.url_poster }}
                  style={{ width, height: slideHeight }}
                  contentFit="cover"
                  transition={150}
                  accessibilityLabel={'Poster ' + ad.nama_bisnes}
                />
                <View
                  style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
                  className="px-3 py-2">
                  <Text className="text-sm font-semibold text-white" numberOfLines={1}>
                    {ad.nama_bisnes}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {band ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSeeAll}
            hitSlop={8}
            style={{ position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)' }}
            className="rounded-pill px-3 py-1 active:opacity-70">
            <Text className="text-xs font-semibold text-white">Lihat Semua Bisnes</Text>
          </Pressable>
        ) : null}
        {band ? dots : null}
      </View>

      {band ? null : dots}
    </View>
  );
}
