import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BusinessAdListRow } from '@/components/business-ad-list-row';
import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { SectionTitle } from '@/components/ui/section-title';
import { businessAdError, fetchBusinessDirectory, POSTER_ASPECT_RATIO, type DirectoryBusinessAd } from '@/lib/business-ads';
import { useGoBack } from '@/lib/navigation';

/**
 * Direktori Bisnes Ahli — DUA bahagian:
 *
 * 1. "Iklan Saya" — SEMUA entri pemanggil (menunggu/diluluskan/ditolak/tamat),
 *    senarai RINGKAS (baris padat, bukan poster penuh) sebab ini untuk
 *    menjejaki status sendiri, bukan untuk ditonton. Tekan baris buka
 *    `bisnes-info` (detail penuh, termasuk butang sunting/padam di situ).
 * 2. "Semua Iklan" — iklan AKTIF ahli lain sahaja, kekal sebagai kad poster
 *    penuh sebab ini memang untuk ditonton/dipromosikan.
 *
 * `list_business_directory()` memulangkan kedua-dua kumpulan dalam satu RPC;
 * pembahagian "Iklan Saya"/"Semua Iklan" dibuat di sini melalui `is_mine`.
 */
export default function BisnesAhliScreen() {
  const router = useRouter();
  const goBack = useGoBack();

  const [rows, setRows] = useState<DirectoryBusinessAd[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        try {
          const data = await fetchBusinessDirectory();
          if (active) {
            setRows(data);
            setError(null);
          }
        } catch (caught) {
          if (active) setError(businessAdError(caught, 'Gagal memuatkan senarai bisnes.'));
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const mine = useMemo(() => (rows ?? []).filter((ad) => ad.is_mine), [rows]);
  const others = useMemo(() => (rows ?? []).filter((ad) => !ad.is_mine), [rows]);

  if (rows === null && !error) return <LoadingScreen />;

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Direktori" title="Bisnes Ahli" subtitle="Bisnes yang dipromosikan oleh ahli" onBackPress={goBack} />

      <View className="gap-6 px-gutter pb-8 pt-5">
        <Button label="Upload Bisnes" onPress={() => router.push('/(app)/bisnes-upload')} />

        {error ? <Notice tone="negative" message={error} /> : null}

        <View>
          <SectionTitle title="Iklan Saya" caption="Status iklan yang anda hantar — tekan untuk butiran." />

          {rows && mine.length === 0 ? (
            <EmptyState
              icon="storefront-outline"
              title="Belum ada iklan"
              description="Iklan yang anda hantar akan dipaparkan di sini bersama status semakan."
            />
          ) : null}

          <View className="gap-2">
            {mine.map((ad) => (
              <BusinessAdListRow
                key={ad.id}
                posterUrl={ad.url_poster}
                title={ad.nama_bisnes}
                subtitle={
                  ad.status_paparan === 'ditolak'
                    ? 'Tekan untuk sunting & hantar semula'
                    : 'Dihantar ' + new Date(ad.submitted_at).toLocaleDateString('ms-MY')
                }
                status={ad.status_paparan}
                onPress={() => router.push({ pathname: '/(app)/bisnes-info', params: { id: ad.id } })}
              />
            ))}
          </View>
        </View>

        <View>
          <SectionTitle title="Semua Iklan" caption="Bisnes aktif yang dipromosikan ahli lain." />

          {rows && others.length === 0 ? (
            <EmptyState
              icon="storefront-outline"
              title="Belum ada bisnes"
              description="Jadilah yang pertama mempromosikan bisnes anda kepada ahli lain."
            />
          ) : null}

          <View className="gap-4">
            {others.map((ad) => (
              <Pressable
                key={ad.id}
                accessibilityRole="button"
                accessibilityLabel={ad.nama_bisnes}
                onPress={() => router.push({ pathname: '/(app)/bisnes-info', params: { id: ad.id } })}
                className="active:opacity-70">
                <View className="overflow-hidden rounded-card border border-line bg-surface">
                  <Image
                    source={{ uri: ad.url_poster }}
                    style={{ width: '100%', aspectRatio: POSTER_ASPECT_RATIO }}
                    contentFit="cover"
                    transition={150}
                    accessibilityLabel={'Poster ' + ad.nama_bisnes}
                  />
                  <View className="gap-1 p-card">
                    <Text className="text-base font-bold text-ink" numberOfLines={2}>
                      {ad.nama_bisnes}
                    </Text>
                    <Text className="text-sm text-ink-muted">{ad.nama_pemilik}</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}
