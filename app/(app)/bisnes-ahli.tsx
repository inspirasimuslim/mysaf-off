import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import {
  businessAdError,
  fetchBusinessDirectory,
  type BusinessAdStatus,
  type DirectoryBusinessAd,
} from '@/lib/business-ads';
import { useGoBack } from '@/lib/navigation';

const STATUS_LABEL: Record<BusinessAdStatus, { label: string; tone: 'warn' | 'negative' | 'neutral' } | null> = {
  menunggu: { label: 'Pending', tone: 'warn' },
  ditolak: { label: 'Ditolak', tone: 'negative' },
  tamat_tempoh: { label: 'Tamat Tempoh', tone: 'neutral' },
  diluluskan: null,
};

/**
 * Senarai Semua Bisnes (Direktori Bisnes Ahli).
 *
 * `list_business_directory()` memulangkan iklan aktif semua ahli + SEMUA entri
 * milik pemanggil. Label status dan sebab tolak dipaparkan hanya untuk entri
 * milik sendiri — RPC sudah mengosongkan `sebab_tolak` untuk orang lain, dan
 * entri orang lain yang bukan aktif memang tidak dipulangkan.
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

  if (rows === null && !error) return <LoadingScreen />;

  return (
    <Screen padTop={false}>
      <ScreenHeader eyebrow="Direktori" title="Bisnes Ahli" subtitle="Bisnes yang dipromosikan oleh ahli" onBackPress={goBack} />

      <View className="gap-4 px-gutter pb-8 pt-5">
        <Button label="Upload Bisnes" onPress={() => router.push('/(app)/bisnes-upload')} />

        {error ? <Notice tone="negative" message={error} /> : null}

        {rows && rows.length === 0 ? (
          <EmptyState
            icon="storefront-outline"
            title="Belum ada bisnes"
            description="Jadilah yang pertama mempromosikan bisnes anda kepada ahli lain."
          />
        ) : null}

        {(rows ?? []).map((ad) => {
          const status = ad.is_mine ? STATUS_LABEL[ad.status_paparan] : null;
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
                  style={{ width: '100%', aspectRatio: 4 / 3 }}
                  contentFit="cover"
                  transition={150}
                  accessibilityLabel={'Poster ' + ad.nama_bisnes}
                />
                <View className="gap-1 p-card">
                  <View className="flex-row items-start justify-between gap-2">
                    <Text className="flex-1 text-base font-bold text-ink" numberOfLines={2}>
                      {ad.nama_bisnes}
                    </Text>
                    {status ? <Badge label={status.label} tone={status.tone} /> : null}
                  </View>
                  <Text className="text-sm text-ink-muted">{ad.is_mine ? 'Bisnes anda' : ad.nama_pemilik}</Text>
                  {ad.is_mine && ad.status_paparan === 'ditolak' && ad.sebab_tolak ? (
                    <Text className="mt-1 text-sm text-negative">Sebab: {ad.sebab_tolak}</Text>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}
