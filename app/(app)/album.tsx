import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { Notice } from '@/components/ui/notice';
import { Screen } from '@/components/ui/screen';
import { Colors } from '@/constants/theme';
import { toMalayError } from '@/lib/errors';
import { useGoBack } from '@/lib/navigation';
import { fetchAllEventsDirectory } from '@/lib/usrah-events';
import { EVENT_TYPE_LABEL, dateRangeLabel, type EventDirectoryRow } from '@/types/database';

/**
 * Senarai SEMUA acara (lampau + semasa + akan datang) — laluan akses KEKAL
 * kepada album gambar acara, tanpa tapisan tarikh tamat. Lihat nota
 * `event_directory_all()` dan `event-info.tsx` (yang menyekat butang Album
 * pada acara tamat dan mengarah ke sini sebagai gantinya).
 */
export default function AlbumScreen() {
  const router = useRouter();
  const goBack = useGoBack();

  const [events, setEvents] = useState<EventDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      setLoading(true);
      try {
        const rows = await fetchAllEventsDirectory();
        if (active) setEvents(rows);
      } catch (caught) {
        if (active) setError(toMalayError(caught, 'Gagal memuatkan senarai acara.'));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <Screen padTop={false}>
      <ScreenHeader title="Album" subtitle="Galeri gambar setiap acara" onBackPress={goBack} />
      <View className="gap-3 px-gutter pb-8 pt-2">
        {error ? <Notice tone="negative" message={error} /> : null}

        {events.length === 0 && !error ? (
          <EmptyState icon="images-outline" title="Tiada acara" description="Belum ada acara direkodkan lagi." />
        ) : (
          events.map((event) => (
            <Pressable
              key={event.id}
              accessibilityRole="button"
              accessibilityLabel={'Buka album ' + event.name}
              onPress={() => router.push({ pathname: '/(app)/event-album', params: { event_id: event.id } })}
              className="flex-row items-center gap-3 rounded-field bg-surface p-3 active:opacity-70">
              {event.poster_url ? (
                <Image
                  source={{ uri: event.poster_url }}
                  style={{ width: 48, height: 48, borderRadius: 8 }}
                  contentFit="cover"
                />
              ) : (
                <View className="h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Ionicons name="images-outline" size={20} color={Colors.primary} />
                </View>
              )}

              <View className="flex-1">
                <Text className="text-base font-semibold text-ink" numberOfLines={1}>
                  {event.name}
                </Text>
                <Text className="text-xs text-ink-muted">
                  {EVENT_TYPE_LABEL[event.event_type] + ' · ' + dateRangeLabel(event.start_date, event.end_date)}
                </Text>
              </View>

              <Text className="text-xs text-ink-muted">{event.photo_count + ' gambar'}</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.inkFaint} />
            </Pressable>
          ))
        )}
      </View>
    </Screen>
  );
}
