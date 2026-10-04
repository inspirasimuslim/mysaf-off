import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { BUSINESS_AD_STATUS_LABEL } from '@/components/business-ad-list-row';
import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { businessAdError, fetchBusinessDirectory, POSTER_ASPECT_RATIO, type DirectoryBusinessAd } from '@/lib/business-ads';
import { useGoBack } from '@/lib/navigation';

/**
 * Direktori Bisnes Ahli — SATU senarai kad poster (rombak 2026-10-04; dulu
 * dua bahagian berasingan "Iklan Saya"/"Semua Iklan" dengan reka bentuk
 * berbeza — baris padat utk sendiri, kad poster utk orang lain). Kini
 * digabung: SEMUA kad guna reka bentuk poster yang sama, kad SENDIRI
 * disusun PERMANENT di atas (tidak kira status — menunggu/ditolak/tamat
 * turut muncul, bukan hanya yang aktif) dengan tag "Bisnes Anda"; kad
 * ditolak/tamat tambah badge status di sebelah tag supaya sebab/keadaan
 * masih kelihatan tanpa perlu tajuk seksyen berasingan.
 *
 * `list_business_directory()` memulangkan kedua-dua kumpulan dalam satu
 * RPC; susunan sendiri-dahulu dibuat di sini melalui `is_mine`.
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

  // Sendiri dahulu (permanent di atas), kemudian ahli lain — urutan asal
  // setiap kumpulan daripada RPC dikekalkan.
  const sorted = useMemo(() => {
    const rowsOrEmpty = rows ?? [];
    return [...rowsOrEmpty.filter((ad) => ad.is_mine), ...rowsOrEmpty.filter((ad) => !ad.is_mine)];
  }, [rows]);

  if (rows === null && !error) return <LoadingScreen />;

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Direktori" title="Bisnes Ahli" subtitle="Bisnes yang dipromosikan oleh ahli" onBackPress={goBack} />

      <View className="gap-6 px-gutter pb-8 pt-5">
        <Button label="Upload Bisnes Anda" onPress={() => router.push('/(app)/bisnes-upload')} />

        {error ? <Notice tone="negative" message={error} /> : null}

        {rows && sorted.length === 0 ? (
          <EmptyState
            icon="storefront-outline"
            title="Belum ada bisnes"
            description="Jadilah yang pertama mempromosikan bisnes anda kepada ahli lain."
          />
        ) : null}

        <View className="gap-4">
          {sorted.map((ad) => {
            const statusInfo = ad.is_mine && ad.status_paparan !== 'diluluskan' ? BUSINESS_AD_STATUS_LABEL[ad.status_paparan] : null;
            return (
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
                    {ad.is_mine ? (
                      <View className="flex-row flex-wrap items-center gap-2 pt-1">
                        <Badge label="Bisnes Anda" tone="primary" />
                        {statusInfo ? <Badge label={statusInfo.label} tone={statusInfo.tone} /> : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}
